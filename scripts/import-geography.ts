import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { LAUNCH_COUNTRIES } from "../data/launch-countries";
import gameDesignProfiles from "../data/game-design-profiles.json";
import { closeDatabase, openDatabase } from "../lib/db";
import { applyMigrations } from "../lib/db/migrate";
import { parseCountryInfoLine, parseGeonameLine, type ParsedPlace } from "../lib/geo/geonames";
import { selectStartingPlaces } from "../lib/geo/select-starting-cities";
import { assertLaunchCoverage } from "../lib/geo/coverage";

const CACHE = path.join(process.cwd(), "data", "cache");
const CITIES_URL = "https://download.geonames.org/export/dump/cities15000.zip";
const COUNTRY_URL = "https://download.geonames.org/export/dump/countryInfo.txt";
const BOUNDARY_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";

type DesignProfile = {
  iso2: string;
  asciiName: string;
  logistics: number;
  industry: number;
  commerce: number;
  government: number;
  energy: number;
  strategic: number;
  designNote: string;
};

async function download(url: string, destination: string): Promise<void> {
  await mkdir(CACHE, { recursive: true });
  try {
    await readFile(destination);
    console.log(`Using cached ${path.basename(destination)}`);
    return;
  } catch {
    // Download when the cache is empty.
  }
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, bytes);
}

function isoFromProperties(properties: Record<string, unknown>): string | null {
  for (const key of ["ISO_A2_EH", "ISO_A2", "WB_A2"]) {
    const value = String(properties[key] ?? "")
      .trim()
      .toUpperCase();
    if (/^[A-Z]{2}$/.test(value)) return value;
  }
  return null;
}

async function upsertPlaces(
  tx: { query<T>(text: string, params?: readonly unknown[]): Promise<T[]> },
  places: ParsedPlace[],
  countryId: string,
  sourceId: string,
): Promise<Map<number, string>> {
  const ids = new Map<number, string>();
  const width = 18;
  const batchSize = 40;

  for (let index = 0; index < places.length; index += batchSize) {
    const chunk = places.slice(index, index + batchSize);
    const params: unknown[] = [];
    const tuples = chunk.map((place) => {
      const start = params.length;
      params.push(
        place.geonameId,
        countryId,
        place.name,
        place.asciiName,
        place.alternateNames,
        place.alternateNamesTruncated,
        place.latitude,
        place.longitude,
        place.featureClass,
        place.featureCode,
        place.admin1Code,
        place.population,
        place.populationSourceToken,
        place.populationQuality,
        place.elevationM,
        place.timezone,
        place.sourceModifiedOn,
        sourceId,
      );
      return `(${Array.from({ length: width }, (_, column) => `$${start + column + 1}`).join(", ")})`;
    });

    const rows = await tx.query<{ id: string; geoname_id: number | string }>(
      `insert into places (
         geoname_id, country_id, name, ascii_name, alternate_names, alternate_names_truncated,
         latitude, longitude, feature_class, feature_code, admin1_code,
         population, population_source_token, population_quality, elevation_m, timezone,
         source_modified_on, source_id
       ) values ${tuples.join(", ")}
       on conflict (geoname_id) do update set
         name = excluded.name,
         ascii_name = excluded.ascii_name,
         alternate_names = excluded.alternate_names,
         alternate_names_truncated = excluded.alternate_names_truncated,
         latitude = excluded.latitude,
         longitude = excluded.longitude,
         feature_class = excluded.feature_class,
         feature_code = excluded.feature_code,
         admin1_code = excluded.admin1_code,
         population = excluded.population,
         population_source_token = excluded.population_source_token,
         population_quality = excluded.population_quality,
         elevation_m = excluded.elevation_m,
         timezone = excluded.timezone,
         source_modified_on = excluded.source_modified_on,
         source_id = excluded.source_id
       returning id, geoname_id`,
      params,
    );

    for (const row of rows) {
      ids.set(Number(row.geoname_id), row.id);
    }
  }

  return ids;
}

async function main(): Promise<void> {
  const citiesZip = path.join(CACHE, "cities15000.zip");
  const countryFile = path.join(CACHE, "countryInfo.txt");
  const boundaryFile = path.join(CACHE, "ne_50m_admin_0_countries.geojson");
  await download(CITIES_URL, citiesZip);
  await download(COUNTRY_URL, countryFile);
  await download(BOUNDARY_URL, boundaryFile);

  const zip = new Uint8Array(await readFile(citiesZip));
  const unzipped = unzipSync(zip);
  const cityEntry = Object.entries(unzipped).find(([name]) => name.endsWith(".txt"));
  if (!cityEntry) throw new Error("cities15000.zip did not contain a text file.");
  const cityText = new TextDecoder().decode(cityEntry[1]);
  const countryText = await readFile(countryFile, "utf8");
  const boundaryJson = JSON.parse(await readFile(boundaryFile, "utf8")) as {
    features: Array<{ properties: Record<string, unknown>; geometry: unknown }>;
  };

  const launch = new Map(LAUNCH_COUNTRIES.map((country) => [country.iso2, country]));
  const parsedCountries = new Map(
    countryText
      .split(/\r?\n/)
      .map(parseCountryInfoLine)
      .filter((row): row is NonNullable<typeof row> => row != null && launch.has(row.iso2))
      .map((row) => [row.iso2, row]),
  );

  for (const country of LAUNCH_COUNTRIES) {
    if (!parsedCountries.has(country.iso2)) {
      throw new Error(`GeoNames countryInfo.txt has no row for ${country.iso2}.`);
    }
  }

  const boundaries = new Map<string, string>();
  for (const feature of boundaryJson.features) {
    const iso2 = isoFromProperties(feature.properties);
    if (!iso2 || !launch.has(iso2) || boundaries.has(iso2)) continue;
    boundaries.set(iso2, JSON.stringify(feature.geometry));
  }
  const missingBoundaries = LAUNCH_COUNTRIES.filter((country) => !boundaries.has(country.iso2)).map(
    (country) => country.iso2,
  );
  if (missingBoundaries.length > 0) {
    throw new Error(`Natural Earth has no boundary for: ${missingBoundaries.join(", ")}`);
  }

  const placesByCountry = new Map<string, ParsedPlace[]>();
  let rejected = 0;
  for (const line of cityText.split(/\r?\n/)) {
    const place = parseGeonameLine(line);
    if (!place) {
      if (line.trim()) rejected += 1;
      continue;
    }
    if (!launch.has(place.countryCode)) continue;
    const list = placesByCountry.get(place.countryCode) ?? [];
    list.push(place);
    placesByCountry.set(place.countryCode, list);
  }

  const database = await openDatabase();
  await applyMigrations(database.sql);
  const sql = database.sql;

  await database.transaction(async (tx) => {
    const geonames = await tx.query<{ id: string }>(
      `insert into data_sources (slug, name, url, license, attribution, version_label)
       values (
         'geonames-cities15000',
         'GeoNames',
         $1,
         'CC BY 4.0',
         'GeoNames, https://www.geonames.org/ — Creative Commons Attribution 4.0',
         'cities15000 and countryInfo dump'
       )
       on conflict (slug) do update set imported_at = now()
       returning id`,
      [CITIES_URL],
    );
    const naturalEarth = await tx.query<{ id: string }>(
      `insert into data_sources (slug, name, url, license, attribution, version_label)
       values (
         'natural-earth-50m-admin0',
         'Natural Earth',
         $1,
         'Public domain',
         'Made with Natural Earth. Free vector and raster map data at naturalearthdata.com.',
         'ne_50m_admin_0_countries'
       )
       on conflict (slug) do update set imported_at = now()
       returning id`,
      [BOUNDARY_URL],
    );
    const geonamesId = geonames[0]?.id;
    const boundarySourceId = naturalEarth[0]?.id;
    if (!geonamesId || !boundarySourceId) throw new Error("Could not record data sources.");

    const countryIds = new Map<string, string>();
    for (const config of LAUNCH_COUNTRIES) {
      const row = parsedCountries.get(config.iso2);
      if (!row) throw new Error(`Missing country ${config.iso2}`);
      const saved = await tx.query<{ id: string }>(
        `insert into countries (
           iso2, iso3, geoname_id, name, capital_name, continent,
           area_sq_km, area_source_token, population, population_source_token, population_quality,
           boundary_geojson, boundary_source, starting_city_target, starting_city_min, starting_city_max, source_id
         ) values (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11,
           $12, 'Natural Earth 1:50m admin-0, unmodified geometry', $13, $14, $15, $16
         )
         on conflict (iso2) do update set
           iso3 = excluded.iso3,
           geoname_id = excluded.geoname_id,
           name = excluded.name,
           capital_name = excluded.capital_name,
           continent = excluded.continent,
           area_sq_km = excluded.area_sq_km,
           area_source_token = excluded.area_source_token,
           population = excluded.population,
           population_source_token = excluded.population_source_token,
           population_quality = excluded.population_quality,
           boundary_geojson = excluded.boundary_geojson,
           boundary_source = excluded.boundary_source,
           starting_city_target = excluded.starting_city_target,
           starting_city_min = excluded.starting_city_min,
           starting_city_max = excluded.starting_city_max,
           source_id = excluded.source_id
         returning id`,
        [
          row.iso2,
          row.iso3,
          row.geonameId,
          row.name,
          row.capitalName,
          row.continent,
          row.areaSqKm,
          row.areaSourceToken,
          row.population,
          row.populationSourceToken,
          row.populationQuality,
          boundaries.get(row.iso2),
          config.target,
          config.min,
          config.max,
          geonamesId,
        ],
      );
      const id = saved[0]?.id;
      if (!id) throw new Error(`Could not save ${config.iso2}`);
      countryIds.set(config.iso2, id);
    }

    const selectedIds: string[] = [];
    for (const config of LAUNCH_COUNTRIES) {
      const places = placesByCountry.get(config.iso2) ?? [];
      const { selected, shortfall } = selectStartingPlaces(places, config.target);
      if (shortfall > 0) {
        throw new Error(
          `${config.iso2} has ${places.length} GeoNames cities15000 records, short of the ${config.target} starting-city target.`,
        );
      }

      const countryId = countryIds.get(config.iso2);
      if (!countryId) throw new Error(`Missing country id for ${config.iso2}`);
      const placeIds = await upsertPlaces(tx, places, countryId, geonamesId);

      for (const place of selected) {
        const id = placeIds.get(place.geonameId);
        if (!id) throw new Error(`Missing id for ${place.geonameId}`);
        selectedIds.push(id);
        await tx.query(
          `insert into starting_locations (place_id, status, selected_by_rule)
           values ($1, 'open', 'capital and largest places, suburbs within 15 km skipped, then geographic spread, v3')
           on conflict (place_id) do update set
             selected_by_rule = excluded.selected_by_rule,
             updated_at = case
               when starting_locations.selected_by_rule = excluded.selected_by_rule then starting_locations.updated_at
               else now()
             end`,
          [id],
        );
      }
      console.log(`${config.iso2}: ${places.length} recorded places, ${selected.length} starting cities`);
    }

    await tx.query(
      `delete from starting_locations
       where not (place_id = any($1::uuid[]))`,
      [selectedIds],
    );

    const profiles = gameDesignProfiles as DesignProfile[];
    for (const profile of profiles) {
      const matches = await tx.query<{ id: string }>(
        `select p.id
         from places p
         join countries c on c.id = p.country_id
         where c.iso2 = $1 and lower(p.ascii_name) = lower($2)`,
        [profile.iso2, profile.asciiName],
      );
      if (matches.length !== 1) {
        console.warn(
          `Game-design profile for ${profile.asciiName}, ${profile.iso2} matched ${matches.length} places and was not applied.`,
        );
        continue;
      }
      await tx.query(
        `insert into city_game_attributes (
           place_id, logistics, industry, commerce, government, energy, strategic, design_note
         ) values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (place_id) do update set
           logistics = excluded.logistics,
           industry = excluded.industry,
           commerce = excluded.commerce,
           government = excluded.government,
           energy = excluded.energy,
           strategic = excluded.strategic,
           design_note = excluded.design_note`,
        [
          matches[0]?.id,
          profile.logistics,
          profile.industry,
          profile.commerce,
          profile.government,
          profile.energy,
          profile.strategic,
          profile.designNote,
        ],
      );
    }
  });

  const coverage = await assertLaunchCoverage(sql);
  console.log(
    `Imported ${coverage.countries} countries, ${coverage.places} places, ${coverage.startingCities} starting cities. Rejected malformed city rows: ${rejected}.`,
  );
  await closeDatabase();
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await closeDatabase().catch(() => undefined);
  process.exit(1);
});
