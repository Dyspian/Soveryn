import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { distanceKm, simulatedTransit } from "@/lib/economy/distance";
import { acceptMission } from "@/lib/progression/service";
import { provisionNewCharacter } from "@/lib/progression/service";
import { departJourney, quoteJourney, settleJourney, TravelError } from "@/lib/travel/service";
import { advanceWorld } from "@/lib/world/tick";

const db = new PGlite();
const firstKey = "11111111-1111-4111-8111-111111111111";
const replayKey = "11111111-1111-4111-8111-111111111111";
const secondKey = "22222222-2222-4222-8222-222222222222";
const raceA = "33333333-3333-4333-8333-333333333333";
const raceB = "44444444-4444-4444-8444-444444444444";

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

describe("travel", () => {
  afterAll(async () => {
    await db.close();
  });

  it("charges once, keeps the political home, and arrives only after the stored time", async () => {
    const directory = path.join(process.cwd(), "db", "migrations");
    for (const file of [
      "0001_foundation.sql",
      "0003_progression.sql",
      "0004_economy.sql",
      "0005_politics.sql",
      "0006_politics_gaps.sql",
      "0007_organizations.sql",
      "0008_world.sql",
      "0012_progression_depth.sql",
      "0014_travel.sql",
      "0015_skill_tree.sql",
      "0016_world_events.sql",
      "0018_city_contests.sql",
    ]) {
      await db.exec(readFileSync(path.join(directory, file), "utf8"));
    }

    const belgium = await db.query<{ id: string }>(
      `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
       values ('BE', 'BEL', 'Belgium', 'imported', 5, 5, 10) returning id`,
    );
    const nigeria = await db.query<{ id: string }>(
      `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
       values ('NG', 'NGA', 'Nigeria', 'imported', 5, 5, 10) returning id`,
    );
    const belgiumId = belgium.rows[0]?.id ?? "";
    const nigeriaId = nigeria.rows[0]?.id ?? "";
    const antwerp = await db.query<{ id: string }>(
      `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
       values (1, $1, 'Antwerp', 'Antwerp', 51.22, 4.4, 'P', 'PPLA', 'unreported') returning id`,
      [belgiumId],
    );
    const lagos = await db.query<{ id: string }>(
      `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
       values (2, $1, 'Lagos', 'Lagos', 6.45, 3.4, 'P', 'PPLC', 'unreported') returning id`,
      [nigeriaId],
    );
    const closed = await db.query<{ id: string }>(
      `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
       values (3, $1, 'Closed', 'Closed', 50, 4, 'P', 'PPL', 'unreported') returning id`,
      [belgiumId],
    );
    const plain = await db.query<{ id: string }>(
      `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
       values (4, $1, 'Plain', 'Plain', 51, 4, 'P', 'PPL', 'unreported') returning id`,
      [belgiumId],
    );
    const antwerpId = antwerp.rows[0]?.id ?? "";
    const lagosId = lagos.rows[0]?.id ?? "";
    await db.query(
      `insert into starting_locations (place_id, status, selected_by_rule)
       values ($1, 'open', 'test'), ($2, 'open', 'test'), ($3, 'disabled', 'test')`,
      [antwerpId, lagosId, closed.rows[0]?.id],
    );

    const user = await db.query<{ id: string }>(
      "insert into users (email, password_hash) values ('traveler@example.com', 'x') returning id",
    );
    const userId = user.rows[0]?.id ?? "";
    await tx((sql) =>
      provisionNewCharacter(sql, {
        userId,
        username: "traveler",
        displayName: null,
        biography: null,
        portraitKey: "mark-1",
        countryId: belgiumId,
        placeId: antwerpId,
        specialization: "explorer",
      }),
    );
    const character = await db.query<{ id: string }>("select id from characters where user_id = $1", [userId]);
    const characterId = character.rows[0]?.id ?? "";
    await db.query("update character_skills set level = 1 where character_id = $1 and skill_id = 'logistics'", [characterId]);

    const km = Math.max(1, Math.round(distanceKm({ latitude: 51.22, longitude: 4.4 }, { latitude: 6.45, longitude: 3.4 })));
    const cost = Math.max(1, simulatedTransit(km, { per100km: 2, minimum: 5 }) - 5);
    const seconds = simulatedTransit(km, { per100km: 20, minimum: 15 });

    const quote = await tx((sql) => quoteJourney(sql, userId, lagosId));
    expect(quote.cost).toBe(cost);
    expect(quote.seconds).toBe(seconds);
    expect(quote.distanceKm).toBe(km);
    const afterQuote = await db.query<{ place_id: string; currency: string | number; journeys: number }>(
      `select c.place_id, c.currency, (select count(*)::int from journeys) as journeys from characters c where c.id = $1`,
      [characterId],
    );
    expect(afterQuote.rows[0]?.place_id).toBe(antwerpId);
    expect(Number(afterQuote.rows[0]?.currency)).toBe(100);
    expect(Number(afterQuote.rows[0]?.journeys)).toBe(0);

    await expect(tx((sql) => departJourney(sql, userId, closed.rows[0]?.id ?? "", firstKey))).rejects.toThrow(TravelError);
    await expect(tx((sql) => departJourney(sql, userId, plain.rows[0]?.id ?? "", firstKey))).rejects.toThrow(/open starting city/);
    await expect(tx((sql) => departJourney(sql, userId, antwerpId, firstKey))).rejects.toThrow(/already in that city/);
    await expect(tx((sql) => departJourney(sql, userId, "00000000-0000-4000-8000-000000000000", firstKey))).rejects.toThrow(/not a stored city/);

    const [countryA, countryB] = [belgiumId, nigeriaId].sort();
    await db.query(
      "insert into diplomatic_relations (country_a, country_b, status) values ($1, $2, 'sanctioned')",
      [countryA, countryB],
    );
    await expect(tx((sql) => departJourney(sql, userId, lagosId, firstKey))).rejects.toThrow(/sanction/);
    await db.query("delete from diplomatic_relations");

    const broke = await db.query<{ id: string }>(
      "insert into users (email, password_hash) values ('broke@example.com', 'x') returning id",
    );
    await tx((sql) =>
      provisionNewCharacter(sql, {
        userId: broke.rows[0]?.id ?? "",
        username: "broke",
        displayName: null,
        biography: null,
        portraitKey: "mark-1",
        countryId: belgiumId,
        placeId: antwerpId,
        specialization: "generalist",
      }),
    );
    await db.query("update characters set currency = 0 where user_id = $1", [broke.rows[0]?.id]);
    await expect(tx((sql) => departJourney(sql, broke.rows[0]?.id ?? "", lagosId, secondKey))).rejects.toThrow(/enough currency/);

    await tx((sql) => acceptMission(sql, userId, "contract-journey"));
    const journeyId = await tx((sql) => departJourney(sql, userId, lagosId, firstKey));
    const started = await db.query<{
      place_id: string;
      country_id: string;
      currency: string | number;
      status: string;
      charges: number;
      span: string | number;
      mission: string;
    }>(
      `select c.place_id, c.country_id, c.currency, j.status,
              (select count(*)::int from ledger_entries where reason = 'travel' and from_id = c.id) as charges,
              extract(epoch from (j.arrives_at - j.departed_at)) as span,
              cm.status as mission
       from characters c
       join journeys j on j.id = $2
       join character_missions cm on cm.character_id = c.id and cm.mission_id = 'contract-journey'
       where c.id = $1`,
      [characterId, journeyId],
    );
    expect(started.rows[0]?.place_id).toBe(antwerpId);
    expect(started.rows[0]?.country_id).toBe(belgiumId);
    expect(started.rows[0]?.status).toBe("in_transit");
    expect(Number(started.rows[0]?.currency)).toBe(100 - cost);
    expect(Number(started.rows[0]?.charges)).toBe(1);
    expect(Number(started.rows[0]?.span)).toBe(seconds);
    expect(started.rows[0]?.mission).toBe("active");

    await expect(tx((sql) => departJourney(sql, userId, lagosId, secondKey))).rejects.toThrow(/already in transit/);
    const replayed = await tx((sql) => departJourney(sql, userId, lagosId, replayKey));
    expect(replayed).toBe(journeyId);
    const stillCharged = await db.query<{ currency: string | number; charges: number }>(
      `select currency, (select count(*)::int from ledger_entries where reason = 'travel' and from_id = $1) as charges
       from characters where id = $1`,
      [characterId],
    );
    expect(Number(stillCharged.rows[0]?.currency)).toBe(100 - cost);
    expect(Number(stillCharged.rows[0]?.charges)).toBe(1);

    expect(await tx((sql) => settleJourney(sql, journeyId))).toBe("waiting");
    const waiting = await db.query<{ place_id: string }>("select place_id from characters where id = $1", [characterId]);
    expect(waiting.rows[0]?.place_id).toBe(antwerpId);

    await db.query("update journeys set arrives_at = now() - interval '1 second' where id = $1", [journeyId]);
    expect(await tx((sql) => settleJourney(sql, journeyId))).toBe("arrived");
    expect(await tx((sql) => settleJourney(sql, journeyId))).toBe("arrived");
    const arrived = await db.query<{
      place_id: string;
      country_id: string;
      currency: string | number;
      mission: string;
      completions: number;
      rewards: number;
    }>(
      `select c.place_id, c.country_id, c.currency, cm.status as mission, cm.completions,
              (select count(*)::int from progression_events where character_id = c.id and source_key = 'mission:contract-journey:1') as rewards
       from characters c
       join character_missions cm on cm.character_id = c.id and cm.mission_id = 'contract-journey'
       where c.id = $1`,
      [characterId],
    );
    expect(arrived.rows[0]?.place_id).toBe(lagosId);
    expect(arrived.rows[0]?.country_id).toBe(belgiumId);
    expect(arrived.rows[0]?.mission).toBe("completed");
    expect(Number(arrived.rows[0]?.completions)).toBe(1);
    expect(Number(arrived.rows[0]?.rewards)).toBe(1);
    expect(Number(arrived.rows[0]?.currency)).toBe(100 - cost + 8);

    const racer = await db.query<{ id: string }>(
      "insert into users (email, password_hash) values ('racer@example.com', 'x') returning id",
    );
    const racerId = racer.rows[0]?.id ?? "";
    await tx((sql) =>
      provisionNewCharacter(sql, {
        userId: racerId,
        username: "racer",
        displayName: null,
        biography: null,
        portraitKey: "mark-1",
        countryId: belgiumId,
        placeId: antwerpId,
        specialization: "generalist",
      }),
    );
    const raced = await Promise.allSettled([
      tx((sql) => departJourney(sql, racerId, lagosId, raceA)),
      tx((sql) => departJourney(sql, racerId, lagosId, raceB)),
    ]);
    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const raceRows = await db.query<{ journeys: number; charges: number }>(
      `select (select count(*)::int from journeys j join characters c on c.id = j.character_id where c.user_id = $1) as journeys,
              (select count(*)::int from ledger_entries e join characters c on c.id = e.from_id where c.user_id = $1 and e.reason = 'travel') as charges`,
      [racerId],
    );
    expect(Number(raceRows.rows[0]?.journeys)).toBe(1);
    expect(Number(raceRows.rows[0]?.charges)).toBe(1);

    const offline = await db.query<{ id: string }>(
      "insert into users (email, password_hash) values ('offline@example.com', 'x') returning id",
    );
    const offlineId = offline.rows[0]?.id ?? "";
    await tx((sql) =>
      provisionNewCharacter(sql, {
        userId: offlineId,
        username: "offline",
        displayName: null,
        biography: null,
        portraitKey: "mark-1",
        countryId: belgiumId,
        placeId: antwerpId,
        specialization: "generalist",
      }),
    );
    const offlineJourney = await tx((sql) => departJourney(sql, offlineId, lagosId, "55555555-5555-4555-8555-555555555555"));
    await db.query("update journeys set arrives_at = now() - interval '1 second' where id = $1", [offlineJourney]);
    const tick = await tx((sql) => advanceWorld(sql));
    expect(tick.skipped).toBe(false);
    const moved = await db.query<{ place_id: string; status: string }>(
      `select c.place_id, j.status
       from characters c
       join journeys j on j.character_id = c.id
       where c.user_id = $1`,
      [offlineId],
    );
    expect(moved.rows[0]?.place_id).toBe(lagosId);
    expect(moved.rows[0]?.status).toBe("arrived");
    await tx((sql) => advanceWorld(sql));
    const once = await db.query<{ charges: number }>(
      `select count(*)::int as charges from ledger_entries e
       join characters c on c.id = e.from_id
       where c.user_id = $1 and e.reason = 'travel'`,
      [offlineId],
    );
    expect(Number(once.rows[0]?.charges)).toBe(1);
  });
});
