import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { getPlace, searchPlaces } from "@/lib/geo/queries";

const db = new PGlite();

function sql(): Sql {
  return {
    async query<T>(text: string, params: readonly unknown[] = []) {
      const result = await db.query<T>(text, [...params]);
      return result.rows;
    },
    async exec(text: string) {
      await db.exec(text);
    },
  };
}

async function seed() {
  const migration = readFileSync(path.join(process.cwd(), "db", "migrations", "0001_foundation.sql"), "utf8");
  await db.exec(migration);
  const country = await db.query<{ id: string }>(
    `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
     values ('BE', 'BEL', 'Belgium', 'population_absent', 5, 5, 10) returning id`,
  );
  const countryId = country.rows[0]?.id ?? "";
  const brussels = await db.query<{ id: string }>(
    `insert into places (
       geoname_id, country_id, name, ascii_name, alternate_names, latitude, longitude,
       feature_class, feature_code, population, population_quality
     ) values (1, $1, 'Brussels', 'Brussels', 'Bruxelles', 50.85, 4.35, 'P', 'PPLC', 1019022, 'imported') returning id`,
    [countryId],
  );
  const percent = await db.query<{ id: string }>(
    `insert into places (
       geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population, population_quality
     ) values (2, $1, '100%', '100%', 51, 4, 'P', 'PPL', 20000, 'imported') returning id`,
    [countryId],
  );
  const hidden = await db.query<{ id: string }>(
    `insert into places (
       geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population, population_quality
     ) values (3, $1, 'Hidden Town', 'Hidden Town', 52, 5, 'P', 'PPL', 900000, 'imported') returning id`,
    [countryId],
  );
  const smaller = await db.query<{ id: string }>(
    `insert into places (
       geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population, population_quality
     ) values (4, $1, 'Brussels Port', 'Brussels Port', 51.2, 4.4, 'P', 'PPL', 30000, 'imported') returning id`,
    [countryId],
  );
  await db.query(
    `insert into starting_locations (place_id, status, selected_by_rule)
     values ($1, 'open', 'test'), ($2, 'open', 'test'), ($3, 'open', 'test')`,
    [brussels.rows[0]?.id, percent.rows[0]?.id, smaller.rows[0]?.id],
  );
  return {
    countryId,
    brusselsId: brussels.rows[0]?.id ?? "",
    hiddenId: hidden.rows[0]?.id ?? "",
  };
}

describe("geographic queries", () => {
  const ready = seed();

  afterAll(async () => {
    await db.close();
  });

  it("finds a country, a starting city, and an alternate name", async () => {
    await ready;
    const byCountry = await searchPlaces(sql(), "belg");
    expect(byCountry.countries.map((country) => country.iso2)).toEqual(["BE"]);
    const byCity = await searchPlaces(sql(), "brussel");
    expect(byCity.cities.map((city) => city.name)).toEqual(["Brussels", "Brussels Port"]);
    const byAlternate = await searchPlaces(sql(), "Bruxelles");
    expect(byAlternate.cities.map((city) => city.geonameId)).toEqual([1]);
  });

  it("does not treat a percent sign as a wildcard", async () => {
    await ready;
    const wildcard = await searchPlaces(sql(), "%r");
    expect(wildcard.cities).toEqual([]);
    expect(wildcard.countries).toEqual([]);
    const named = await searchPlaces(sql(), "100%");
    expect(named.cities.map((city) => city.name)).toEqual(["100%"]);
  });

  it("pages starting cities and skips places that are not starting cities", async () => {
    await ready;
    const first = await searchPlaces(sql(), "brussel", 0, 1);
    expect(first.cities.map((city) => city.name)).toEqual(["Brussels"]);
    expect(first.nextOffset).toBe(1);
    const second = await searchPlaces(sql(), "brussel", first.nextOffset ?? 0, 1);
    expect(second.cities.map((city) => city.name)).toEqual(["Brussels Port"]);
    expect(second.nextOffset).toBeNull();
    const hidden = await searchPlaces(sql(), "Hidden Town");
    expect(hidden.cities).toEqual([]);
  });

  it("loads one place and rejects an impossible latitude", async () => {
    const ids = await ready;
    const place = await getPlace(sql(), ids.brusselsId);
    expect(place?.countryIso2).toBe("BE");
    expect(place?.latitude).toBeCloseTo(50.85);
    await expect(
      db.query(
        `insert into places (
           geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality
         ) values (9, $1, 'Bad', 'Bad', 120, 4, 'P', 'PPL', 'population_absent')`,
        [ids.countryId],
      ),
    ).rejects.toThrow(/places_latitude/);
  });

  it("updates an existing GeoNames record instead of inserting a duplicate", async () => {
    const ids = await ready;
    await db.query(
      `insert into places (
         geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality
       ) values (1, $1, 'Bruxelles', 'Bruxelles', 50.85, 4.35, 'P', 'PPLC', 'imported')
       on conflict (geoname_id) do update set name = excluded.name`,
      [ids.countryId],
    );
    const rows = await db.query<{ count: number; name: string }>(
      "select count(*)::int as count, max(name) as name from places where geoname_id = 1",
    );
    expect(Number(rows.rows[0]?.count)).toBe(1);
    expect(rows.rows[0]?.name).toBe("Bruxelles");
  });
});
