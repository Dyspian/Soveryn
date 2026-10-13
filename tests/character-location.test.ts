import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";

const db = new PGlite();

async function seed() {
  const migration = readFileSync(path.join(process.cwd(), "db", "migrations", "0001_foundation.sql"), "utf8");
  await db.exec(migration);
  const belgium = await db.query<{ id: string }>(
    `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
     values ('AA', 'AAA', 'Country A', 'population_absent', 5, 5, 10) returning id`,
  );
  const other = await db.query<{ id: string }>(
    `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
     values ('BB', 'BBB', 'Country B', 'population_absent', 5, 5, 10) returning id`,
  );
  const city = await db.query<{ id: string }>(
    `insert into places (
       geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality
     ) values (1, $1, 'Open City', 'Open City', 10, 20, 'P', 'PPL', 'population_absent') returning id`,
    [belgium.rows[0]?.id],
  );
  const closed = await db.query<{ id: string }>(
    `insert into places (
       geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality
     ) values (2, $1, 'Closed City', 'Closed City', 11, 21, 'P', 'PPL', 'population_source_zero') returning id`,
    [belgium.rows[0]?.id],
  );
  await db.query(
    `insert into starting_locations (place_id, status, selected_by_rule) values ($1, 'open', 'test'), ($2, 'disabled', 'test')`,
    [city.rows[0]?.id, closed.rows[0]?.id],
  );
  const user = await db.query<{ id: string }>(
    `insert into users (email, password_hash) values ('tester@example.com', 'x') returning id`,
  );
  return {
    belgiumId: belgium.rows[0]?.id ?? "",
    otherId: other.rows[0]?.id ?? "",
    cityId: city.rows[0]?.id ?? "",
    closedId: closed.rows[0]?.id ?? "",
    userId: user.rows[0]?.id ?? "",
  };
}

describe("character location rules", () => {
  const ready = seed();

  afterAll(async () => {
    await db.close();
  });

  it("rejects a city that belongs to another country", async () => {
    const ids = await ready;
    await expect(
      db.query(
        `insert into characters (user_id, username, portrait_key, country_id, place_id)
         values ($1, 'mismatch', 'mark-1', $2, $3)`,
        [ids.userId, ids.otherId, ids.cityId],
      ),
    ).rejects.toThrow(/city_country_mismatch/);
  });

  it("rejects a starting city that is not open", async () => {
    const ids = await ready;
    await expect(
      db.query(
        `insert into characters (user_id, username, portrait_key, country_id, place_id)
         values ($1, 'closed', 'mark-1', $2, $3)`,
        [ids.userId, ids.belgiumId, ids.closedId],
      ),
    ).rejects.toThrow(/city_not_selectable/);
  });

  it("lets more than one character start in the same open city", async () => {
    const ids = await ready;
    const second = await db.query<{ id: string }>(
      `insert into users (email, password_hash) values ('second@example.com', 'x') returning id`,
    );
    const third = await db.query<{ id: string }>(
      `insert into users (email, password_hash) values ('third@example.com', 'x') returning id`,
    );
    await db.query(
      `insert into characters (user_id, username, portrait_key, country_id, place_id)
       values ($1, 'first', 'mark-1', $2, $3)`,
      [second.rows[0]?.id, ids.belgiumId, ids.cityId],
    );
    await db.query(
      `insert into characters (user_id, username, portrait_key, country_id, place_id)
       values ($1, 'second', 'mark-1', $2, $3)`,
      [third.rows[0]?.id, ids.belgiumId, ids.cityId],
    );
    const count = await db.query<{ count: number }>(
      "select count(*)::int as count from characters where place_id = $1",
      [ids.cityId],
    );
    expect(Number(count.rows[0]?.count)).toBe(2);
  });
});
