import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSql } from "@/lib/db";
import { latestReserveRows } from "@/lib/economy/reserves";
import { ensureDatabase } from "@/lib/ready";

const PRODUCTION = [
  {
    resourceTypeId: "coal",
    file: "coal-mine-production.csv",
    url: "https://ourworldindata.org/explorers/minerals.csv?Mineral=Coal&Metric=Production&v=1&csvType=full&useColumnShortNames=true",
    column: "production_coal_mine_tonnes",
    unit: "tonnes",
    source: "minerals",
  },
  {
    resourceTypeId: "iron_ore",
    file: "iron-ore-mine-production.csv",
    url: "https://ourworldindata.org/explorers/minerals.csv?Mineral=Iron+ore&Metric=Production&v=1&csvType=full&useColumnShortNames=true",
    column: "production_iron_ore_mine__crude_ore_tonnes",
    unit: "tonnes",
    source: "minerals",
  },
  {
    resourceTypeId: "copper",
    file: "copper-mine-production.csv",
    url: "https://ourworldindata.org/explorers/minerals.csv?Mineral=Copper&Metric=Production&v=1&csvType=full&useColumnShortNames=true",
    column: "production_copper_mine_tonnes",
    unit: "tonnes",
    source: "minerals",
  },
  {
    resourceTypeId: "gold",
    file: "gold-mine-production.csv",
    url: "https://ourworldindata.org/explorers/minerals.csv?Mineral=Gold&Metric=Production&v=1&csvType=full&useColumnShortNames=true",
    column: "production_gold_mine_tonnes",
    unit: "tonnes",
    source: "minerals",
  },
  {
    resourceTypeId: "bauxite",
    file: "bauxite-mine-production.csv",
    url: "https://ourworldindata.org/explorers/minerals.csv?Mineral=Bauxite&Metric=Production&v=1&csvType=full&useColumnShortNames=true",
    column: "production_bauxite_mine_tonnes",
    unit: "tonnes",
    source: "minerals",
  },
  {
    resourceTypeId: "lithium",
    file: "lithium-mine-production.csv",
    url: "https://ourworldindata.org/explorers/minerals.csv?Mineral=Lithium&Metric=Production&v=1&csvType=full&useColumnShortNames=true",
    column: "production_lithium_mine_tonnes",
    unit: "tonnes",
    source: "minerals",
  },
  {
    resourceTypeId: "cobalt",
    file: "cobalt-mine-production.csv",
    url: "https://ourworldindata.org/explorers/minerals.csv?Mineral=Cobalt&Metric=Production&v=1&csvType=full&useColumnShortNames=true",
    column: "production_cobalt_mine_tonnes",
    unit: "tonnes",
    source: "minerals",
  },
  {
    resourceTypeId: "uranium",
    file: "uranium-mine-production.csv",
    url: "https://ourworldindata.org/explorers/minerals.csv?Mineral=Uranium&Metric=Production&v=1&csvType=full&useColumnShortNames=true",
    column: "production_uranium_mine_tonnes",
    unit: "tonnes",
    source: "minerals",
  },
  {
    resourceTypeId: "wheat",
    file: "wheat-production.csv",
    url: "https://ourworldindata.org/grapher/wheat-production.csv?v=1&csvType=full&useColumnShortNames=true",
    column: "wheat__00000015__production__005510__tonnes",
    unit: "tonnes",
    source: "wheat",
  },
] as const;

const SERIES = [
  {
    resourceTypeId: "crude_oil",
    file: "oil-proved-reserves.csv",
    url: "https://ourworldindata.org/grapher/oil-proved-reserves.csv?v=1&csvType=full&useColumnShortNames=true",
    column: "oil_reserves_m3",
  },
  {
    resourceTypeId: "natural_gas",
    file: "gas-proved-reserves.csv",
    url: "https://ourworldindata.org/grapher/natural-gas-proved-reserves.csv?v=1&csvType=full&useColumnShortNames=true",
    column: "gas_reserves_m3",
  },
] as const;

function productionCsv(csv: string, column: string): boolean {
  const header = csv.trim().split(/\r?\n/)[0]?.split(",") ?? [];
  return header[1] === "code" && header[2] === "year" && header[3] === column;
}

async function readSeries(entry: (typeof SERIES)[number]): Promise<string> {
  const directory = path.join(process.cwd(), "data", "cache");
  const file = path.join(directory, entry.file);
  try {
    return await readFile(file, "utf8");
  } catch {
    const response = await fetch(entry.url);
    if (!response.ok) throw new Error(`Could not download ${entry.url} (${response.status}).`);
    const body = await response.text();
    if (!body.includes(entry.column)) throw new Error(`${entry.file} did not contain ${entry.column}.`);
    await mkdir(directory, { recursive: true });
    await writeFile(file, body, "utf8");
    return body;
  }
}

async function main() {
  await ensureDatabase();
  const sql = await getSql();
  const source = await sql.query<{ id: string }>(
    `insert into data_sources (slug, name, url, license, attribution, version_label)
     values (
       'energy-institute-statistical-review-2025',
       'Energy Institute Statistical Review of World Energy (2025), via Our World in Data',
       'https://www.energyinst.org/statistical-review',
       'Our World in Data compilation is CC BY 4.0. The underlying Energy Institute review is free to access and must be cited; it is not marked public domain.',
       'Energy Institute – Statistical Review of World Energy (2025); Our World in Data.',
       'OWID extract processed 2025-06-27; reserve series in this file run through 2020 or 2021'
     )
     on conflict (slug) do update set imported_at = now()
     returning id`,
  );
  const sourceId = source[0]?.id;
  if (!sourceId) throw new Error("The resource source could not be saved.");
  let written = 0;
  for (const entry of SERIES) {
    const rows = latestReserveRows(await readSeries(entry));
    for (const row of rows) {
      const countries = await sql.query<{ id: string }>("select id from countries where iso3 = $1", [row.iso3]);
      const countryId = countries[0]?.id;
      if (!countryId) continue;
      await sql.query(
        `insert into resource_records (
           resource_type_id, country_id, region_key, geographic_level, metric, amount, amount_quality,
           unit, period_label, source_id, source_record, published_on, confidence, notes
         ) values (
           $1, $2, '', 'country', 'proved_reserves', $3, $4,
           'cubic meters', $5, $6, $7, '2025-06-27', 'secondary',
           'Country total. This is not a field coordinate and it is not a game stockpile. The publication date is the Our World in Data processing date for the 2025 review, not a survey date.'
         )
         on conflict (resource_type_id, country_id, geographic_level, metric, period_label, source_id, region_key)
         do update set amount = excluded.amount, amount_quality = excluded.amount_quality, imported_at = now()`,
        [entry.resourceTypeId, countryId, row.amount, row.quality, String(row.year), sourceId, entry.column],
      );
      written += 1;
    }
  }
  console.log(`Imported ${written} country reserve rows. No coordinates were stored.`);

  const productionSources = await sql.query<{ id: string; slug: string }>(
    `insert into data_sources (slug, name, url, license, attribution, version_label)
     values
       (
         'owid-minerals-explorer',
         'Our World in Data minerals explorer, mine production',
         'https://ourworldindata.org/explorers/minerals',
         'Our World in Data compilation is CC BY 4.0. Underlying mineral statistics are compiled by OWID from public sources and must be cited.',
         'Our World in Data minerals explorer. Mine production, measured in tonnes.',
         'OWID minerals explorer extract checked 2026-10-11'
       ),
       (
         'owid-wheat-production',
         'Food and Agriculture Organization of the United Nations (2025), via Our World in Data',
         'https://ourworldindata.org/grapher/wheat-production',
         'Our World in Data compilation is CC BY 4.0. FAO statistics must be cited.',
         'Food and Agriculture Organization of the United Nations (2025); Our World in Data.',
         'OWID wheat production extract checked 2026-10-11'
       )
     on conflict (slug) do update set imported_at = now()
     returning id, slug`,
  );
  const sourceBySlug = new Map(productionSources.map((row) => [row.slug, row.id]));
  console.log("Skipped timber: no confirmed country production chart. The minerals explorer has no timber series.");
  let productionWritten = 0;
  for (const entry of PRODUCTION) {
    const csv = await readProduction(entry);
    if (!csv) continue;
    const sourceId = sourceBySlug.get(entry.source === "wheat" ? "owid-wheat-production" : "owid-minerals-explorer");
    if (!sourceId) throw new Error("The production source could not be saved.");
    for (const row of latestReserveRows(csv)) {
      const countries = await sql.query<{ id: string }>("select id from countries where iso3 = $1", [row.iso3]);
      const countryId = countries[0]?.id;
      if (!countryId) continue;
      await sql.query(
        `insert into resource_records (
           resource_type_id, country_id, region_key, geographic_level, metric, amount, amount_quality,
           unit, period_label, source_id, source_record, published_on, confidence, notes
         ) values (
           $1, $2, '', 'country', 'production', $3, $4,
           $5, $6, $7, $8, null, 'secondary',
           'Country production total. This is not a proved reserve, not a field coordinate, and not a game stockpile.'
         )
         on conflict (resource_type_id, country_id, geographic_level, metric, period_label, source_id, region_key)
         do update set amount = excluded.amount, amount_quality = excluded.amount_quality, unit = excluded.unit, imported_at = now()`,
        [entry.resourceTypeId, countryId, row.amount, row.quality, entry.unit, String(row.year), sourceId, entry.column],
      );
      productionWritten += 1;
    }
  }
  console.log(`Imported ${productionWritten} country production rows. No proved reserves or coordinates were stored.`);
}

async function readProduction(entry: (typeof PRODUCTION)[number]): Promise<string | null> {
  const directory = path.join(process.cwd(), "data", "cache");
  const file = path.join(directory, entry.file);
  try {
    const cached = await readFile(file, "utf8");
    if (productionCsv(cached, entry.column)) return cached;
  } catch {
    // A missing cache is downloaded below. A cache with the wrong column is not reused.
  }
  const response = await fetch(entry.url);
  if (!response.ok) {
    console.log(`Skipped ${entry.resourceTypeId}: download returned ${response.status}.`);
    return null;
  }
  const body = await response.text();
  if (!productionCsv(body, entry.column)) {
    console.log(`Skipped ${entry.resourceTypeId}: file did not contain ${entry.column}.`);
    return null;
  }
  await mkdir(directory, { recursive: true });
  await writeFile(file, body, "utf8");
  return body;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
