import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { provisionNewCharacter } from "@/lib/progression/service";
import { recordCivicTerm, settleCivicTerm, utcWeek } from "@/lib/progression/terms";

const db = new PGlite();

function asSql(queryable: { query: PGlite["query"]; exec: PGlite["exec"] }): Sql {
  return {
    async query<T>(text: string, params: readonly unknown[] = []) {
      const result = await queryable.query<T>(text, [...params]);
      return result.rows;
    },
    async exec(text: string) {
      await queryable.exec(text);
    },
  };
}

async function tx<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return db.transaction(async (transaction) => fn(asSql(transaction)));
}

describe("civic terms", () => {
  afterAll(async () => {
    await db.close();
  });

  it("pays one reputation for one mission in the UTC week and keeps a missed week", async () => {
    expect(utcWeek(new Date("2026-10-11T23:00:00.000Z")).termKey).toBe("2026-10-05");
    expect(utcWeek(new Date("2026-10-12T00:00:00.000Z")).termKey).toBe("2026-10-12");
    const during = utcWeek(new Date("2026-10-14T12:00:00.000Z"));
    expect(during.startsAt.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(during.endsAt.toISOString()).toBe("2026-10-19T00:00:00.000Z");

    const directory = path.join(process.cwd(), "db", "migrations");
    for (const file of ["0001_foundation.sql", "0003_progression.sql", "0020_civic_terms.sql"]) {
      await db.exec(readFileSync(path.join(directory, file), "utf8"));
    }
    const country = await db.query<{ id: string }>(
      `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
       values ('BE', 'BEL', 'Belgium', 'imported', 5, 5, 10) returning id`,
    );
    const countryId = country.rows[0]?.id ?? "";
    const otherCountry = await db.query<{ id: string }>(
      `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
       values ('NG', 'NGA', 'Nigeria', 'imported', 5, 5, 10) returning id`,
    );
    const nigeriaId = otherCountry.rows[0]?.id ?? "";
    async function place(geonameId: number, ownerId: string, name: string) {
      const created = await db.query<{ id: string }>(
        `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
         values ($1, $2, $3, $3, 50, 4, 'P', 'PPLC', 'unreported') returning id`,
        [geonameId, ownerId, name],
      );
      const id = created.rows[0]?.id ?? "";
      await db.query("insert into starting_locations (place_id, status, selected_by_rule) values ($1, 'open', 'test')", [id]);
      return id;
    }
    const antwerp = await place(1, countryId, "Antwerp");
    const lagos = await place(2, nigeriaId, "Lagos");

    async function person(email: string, username: string, homeId: string, placeId: string) {
      const user = await db.query<{ id: string }>("insert into users (email, password_hash) values ($1, 'hash') returning id", [email]);
      const characterId = await provisionNewCharacter(asSql(db), {
        userId: user.rows[0]?.id ?? "",
        username,
        displayName: null,
        biography: null,
        portraitKey: "mark-1",
        countryId: homeId,
        placeId,
        specialization: "politician",
      });
      return characterId;
    }
    const ada = await person("ada-term@example.com", "ada_term", countryId, antwerp);
    const ngo = await person("ngo-term@example.com", "ngo_term", nigeriaId, lagos);
    const before = await db.query<{ currency: string; reputation: number; level: number }>(
      "select currency::text as currency, reputation, level from characters where id = $1",
      [ada],
    );

    const closed = await tx((sql) => settleCivicTerm(sql, ada, new Date("2026-10-07T12:00:00.000Z")));
    expect(closed.status).toBe("open");
    expect(closed.termKey).toBe("2026-10-05");
    await db.query(
      `insert into progression_events (character_id, kind, source_key, reputation_awarded, detail, created_at)
       values ($1, 'mission', 'mission:old-note', 2, 'Completed an earlier note.', '2026-10-07T15:00:00.000Z')`,
      [ada],
    );
    await tx((sql) => settleCivicTerm(sql, ada, new Date("2026-10-14T12:00:00.000Z")));
    const missed = await db.query<{ status: string }>("select status from character_terms where character_id = $1 and term_key = '2026-10-05'", [ada]);
    expect(missed.rows[0]?.status).toBe("missed");
    expect(Number((await db.query<{ reputation: number }>("select reputation from characters where id = $1", [ada])).rows[0]?.reputation)).toBe(0);

    await db.query(
      `insert into progression_events (character_id, kind, source_key, detail, created_at)
       values ($1, 'level_up', 'level:2', 'Reached level 2.', '2026-10-14T08:00:00.000Z')`,
      [ada],
    );
    const stillOpen = await tx((sql) => settleCivicTerm(sql, ada, new Date("2026-10-14T12:00:00.000Z")));
    expect(stillOpen.status).toBe("open");
    expect(stillOpen.countryRecorded).toBe(0);

    await db.query(
      `insert into progression_events (character_id, kind, source_key, reputation_awarded, detail, created_at)
       values ($1, 'mission', 'mission:civic-note', 1, 'Completed Civic note.', '2026-10-14T09:00:00.000Z')`,
      [ada],
    );
    const raced = await Promise.all([
      tx((sql) => settleCivicTerm(sql, ada, new Date("2026-10-14T12:00:00.000Z"))),
      tx((sql) => recordCivicTerm(sql, ada, new Date("2026-10-14T12:00:00.000Z"))),
    ]);
    expect(raced[0]?.status).toBe("recorded");
    const after = await db.query<{ currency: string; reputation: number; level: number }>(
      "select currency::text as currency, reputation, level from characters where id = $1",
      [ada],
    );
    expect(after.rows[0]?.currency).toBe(before.rows[0]?.currency);
    expect(Number(after.rows[0]?.reputation)).toBe(1);
    expect(Number(after.rows[0]?.level)).toBe(Number(before.rows[0]?.level));
    const payments = await db.query<{ count: string }>(
      "select count(*)::text as count from progression_events where character_id = $1 and kind = 'term'",
      [ada],
    );
    expect(payments.rows[0]?.count).toBe("1");
    await tx((sql) => settleCivicTerm(sql, ada, new Date("2026-10-14T18:00:00.000Z")));
    expect(Number((await db.query<{ reputation: number }>("select reputation from characters where id = $1", [ada])).rows[0]?.reputation)).toBe(1);

    await db.query(
      `insert into progression_events (character_id, kind, source_key, detail, created_at)
       values ($1, 'mission', 'mission:lagos-note', 'Completed a Lagos note.', '2026-10-14T10:00:00.000Z')`,
      [ngo],
    );
    const nigeria = await tx((sql) => settleCivicTerm(sql, ngo, new Date("2026-10-14T12:00:00.000Z")));
    expect(nigeria.countryRecorded).toBe(1);
    expect(nigeria.countryName).toBe("Nigeria");
    const belgium = await tx((sql) => settleCivicTerm(sql, ada, new Date("2026-10-18T12:00:00.000Z")));
    expect(belgium.countryRecorded).toBe(1);
    expect(belgium.countryName).toBe("Belgium");
    expect(belgium.history.map((item) => item.termKey)).toEqual(["2026-10-05"]);
    expect(belgium.history[0]?.status).toBe("missed");
    expect(belgium.sourceDetail).toBe("Completed Civic note.");

    const kept = await tx((sql) => settleCivicTerm(sql, ada, new Date("2026-10-20T12:00:00.000Z")));
    expect(kept.termKey).toBe("2026-10-19");
    expect(kept.status).toBe("open");
    const recorded = await db.query<{ status: string }>("select status from character_terms where character_id = $1 and term_key = '2026-10-12'", [ada]);
    expect(recorded.rows[0]?.status).toBe("recorded");
    expect(Number((await db.query<{ reputation: number }>("select reputation from characters where id = $1", [ada])).rows[0]?.reputation)).toBe(1);
  });
});
