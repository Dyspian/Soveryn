import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import {
  acceptMission,
  deliverShipment,
  practiceSkill,
  ProgressionError,
  provisionNewCharacter,
  recordWorkShift,
  submitPopulation,
} from "@/lib/progression/service";

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

async function seed() {
  const directory = path.join(process.cwd(), "db", "migrations");
  await db.exec(readFileSync(path.join(directory, "0001_foundation.sql"), "utf8"));
  await db.exec(readFileSync(path.join(directory, "0003_progression.sql"), "utf8"));
  await db.exec(readFileSync(path.join(directory, "0012_progression_depth.sql"), "utf8"));
  await db.exec(readFileSync(path.join(directory, "0015_skill_tree.sql"), "utf8"));
  const country = await db.query<{ id: string }>(
    `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
     values ('BE', 'BEL', 'Belgium', 'imported', 5, 5, 10) returning id`,
  );
  const place = await db.query<{ id: string }>(
    `insert into places (
       geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code,
       population, population_quality
     ) values (1, $1, 'Brussels', 'Brussels', 50.85, 4.35, 'P', 'PPLC', 1019022, 'imported') returning id`,
    [country.rows[0]?.id],
  );
  await db.query(
    "insert into starting_locations (place_id, status, selected_by_rule) values ($1, 'open', 'test')",
    [place.rows[0]?.id],
  );
  const first = await db.query<{ id: string }>(
    "insert into users (email, password_hash) values ('one@example.com', 'hash') returning id",
  );
  const second = await db.query<{ id: string }>(
    "insert into users (email, password_hash) values ('two@example.com', 'hash') returning id",
  );
  return {
    countryId: country.rows[0]?.id ?? "",
    placeId: place.rows[0]?.id ?? "",
    firstId: first.rows[0]?.id ?? "",
    secondId: second.rows[0]?.id ?? "",
  };
}

describe("character progression", () => {
  const ready = seed();

  afterAll(async () => {
    await db.close();
  });

  it("creates one character, rejects a duplicate account and username, and pays a mission once", async () => {
    const ids = await ready;
    const characterId = await provisionNewCharacter(asSql(db), {
      userId: ids.firstId,
      username: "Ada",
      displayName: null,
      biography: null,
      portraitKey: "mark-1",
      countryId: ids.countryId,
      placeId: ids.placeId,
      specialization: "generalist",
    });
    expect(characterId).toBeTruthy();
    const skills = await db.query<{ level: number }>(
      "select level from character_skills where character_id = $1 and skill_id = 'management'",
      [characterId],
    );
    expect(Number(skills.rows[0]?.level)).toBe(1);

    await expect(
      provisionNewCharacter(asSql(db), {
        userId: ids.firstId,
        username: "Other",
        displayName: null,
        biography: null,
        portraitKey: "mark-1",
        countryId: ids.countryId,
        placeId: ids.placeId,
        specialization: "trader",
      }),
    ).rejects.toThrow(/already has a character/);

    await expect(
      provisionNewCharacter(asSql(db), {
        userId: ids.secondId,
        username: "ada",
        displayName: null,
        biography: null,
        portraitKey: "mark-1",
        countryId: ids.countryId,
        placeId: ids.placeId,
        specialization: "trader",
      }),
    ).rejects.toThrow(/characters_username_lower_idx/);

    await acceptMission(asSql(db), ids.firstId, "city-research");
    await expect(submitPopulation(asSql(db), ids.firstId, "city-research", "10")).rejects.toThrow(/does not match/);
    await submitPopulation(asSql(db), ids.firstId, "city-research", "1,019,022");
    const paid = await db.query<{ currency: string | number; status: string }>(
      `select c.currency, cm.status
       from characters c
       join character_missions cm on cm.character_id = c.id
       where c.user_id = $1 and cm.mission_id = 'city-research'`,
      [ids.firstId],
    );
    const currency = Number(paid.rows[0]?.currency);
    expect(paid.rows[0]?.status).toBe("completed");
    expect(currency).toBeGreaterThan(100);
    await submitPopulation(asSql(db), ids.firstId, "city-research", "1019022");
    const again = await db.query<{ currency: string | number }>("select currency from characters where user_id = $1", [ids.firstId]);
    expect(Number(again.rows[0]?.currency)).toBe(currency);

    await expect(submitPopulation(asSql(db), ids.secondId, "city-research", "1019022")).rejects.toBeInstanceOf(ProgressionError);
    const untouched = await db.query<{ currency: string | number }>("select currency from characters where user_id = $1", [ids.firstId]);
    expect(Number(untouched.rows[0]?.currency)).toBe(currency);
  });

  it("issues a shipment once and rejects a second delivery reward", async () => {
    const ids = await ready;
    await provisionNewCharacter(asSql(db), {
      userId: ids.secondId,
      username: "porter",
      displayName: null,
      biography: null,
      portraitKey: "mark-2",
      countryId: ids.countryId,
      placeId: ids.placeId,
      specialization: "trader",
    });
    await expect(deliverShipment(asSql(db), ids.secondId, "local-delivery")).rejects.toThrow(/Accept the delivery/);
    await acceptMission(asSql(db), ids.secondId, "local-delivery");
    const held = await db.query<{ quantity: number }>(
      `select quantity from inventory_entries e
       join characters c on c.id = e.character_id
       where c.user_id = $1 and e.item_id = 'local_shipment'`,
      [ids.secondId],
    );
    expect(Number(held.rows[0]?.quantity)).toBe(1);
    await deliverShipment(asSql(db), ids.secondId, "local-delivery");
    const after = await db.query<{ currency: string | number }>("select currency from characters where user_id = $1", [ids.secondId]);
    await deliverShipment(asSql(db), ids.secondId, "local-delivery");
    const twice = await db.query<{ currency: string | number }>("select currency from characters where user_id = $1", [ids.secondId]);
    expect(Number(twice.rows[0]?.currency)).toBe(Number(after.rows[0]?.currency));
    await expect(practiceSkill(asSql(db), ids.secondId, "negotiation")).resolves.toMatch(/Negotiation/);
    await expect(practiceSkill(asSql(db), ids.secondId, "negotiation")).rejects.toThrow(/cooldown/);
    await expect(practiceSkill(asSql(db), ids.secondId, "logistics")).rejects.toThrow(/cooldown/);
  });

  it("pays a repeatable contract once per completion and keeps the daily practice lock", async () => {
    const ids = await ready;
    await expect(acceptMission(asSql(db), ids.secondId, "contract-plan")).rejects.toThrow(/specialization/);
    await expect(acceptMission(asSql(db), ids.secondId, "contract-steady")).rejects.toThrow(/higher level/);
    await expect(practiceSkill(asSql(db), ids.secondId, "missing-skill")).rejects.toThrow(/not in the catalog/);

    await db.exec("update action_cooldowns set available_at = now() - interval '1 second' where action_key = 'practice:session'");
    const raced = await Promise.allSettled([
      db.transaction((tx) => practiceSkill(asSql(tx), ids.secondId, "finance")),
      db.transaction((tx) => practiceSkill(asSql(tx), ids.secondId, "logistics")),
    ]);
    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);

    await acceptMission(asSql(db), ids.secondId, "contract-trade");
    await db.exec("update action_cooldowns set available_at = now() - interval '1 second' where action_key = 'practice:session'");
    const before = await db.query<{ currency: string | number }>("select currency from characters where user_id = $1", [ids.secondId]);
    await practiceSkill(asSql(db), ids.secondId, "negotiation");
    const after = await db.query<{ currency: string | number; status: string }>(
      `select c.currency, cm.status
       from characters c
       join character_missions cm on cm.character_id = c.id
       where c.user_id = $1 and cm.mission_id = 'contract-trade'`,
      [ids.secondId],
    );
    expect(after.rows[0]?.status).toBe("completed");
    const firstGain = Number(after.rows[0]?.currency) - Number(before.rows[0]?.currency);
    expect(firstGain).toBeGreaterThan(0);
    await expect(acceptMission(asSql(db), ids.secondId, "contract-trade")).rejects.toThrow(/not available again/);

    await db.exec(
      `update character_missions set available_at = now() - interval '1 second'
       where mission_id = 'contract-trade'`,
    );
    await db.exec("update action_cooldowns set available_at = now() - interval '1 second' where action_key = 'practice:session'");
    await acceptMission(asSql(db), ids.secondId, "contract-trade");
    await practiceSkill(asSql(db), ids.secondId, "negotiation");
    const twice = await db.query<{ currency: string | number; completions: number }>(
      `select c.currency, cm.completions
       from characters c
       join character_missions cm on cm.character_id = c.id
       where c.user_id = $1 and cm.mission_id = 'contract-trade'`,
      [ids.secondId],
    );
    expect(Number(twice.rows[0]?.completions)).toBe(2);
    expect(Number(twice.rows[0]?.currency) - Number(after.rows[0]?.currency)).toBe(firstGain);
    const payments = await db.query<{ source_key: string }>(
      `select e.source_key
       from progression_events e
       join characters c on c.id = e.character_id
       where c.user_id = $1 and e.source_key like 'mission:contract-trade:%'`,
      [ids.secondId],
    );
    expect(payments.rows).toHaveLength(2);

    await db.query("update characters set level = 4 where user_id = $1", [ids.secondId]);
    await acceptMission(asSql(db), ids.secondId, "contract-steady");
    await recordWorkShift(asSql(db), ids.secondId);
    const shift = await db.query<{ status: string; events: string | number }>(
      `select cm.status,
              (select count(*) from progression_events e where e.character_id = c.id and e.source_key = 'mission:contract-steady:1') as events
       from characters c
       join character_missions cm on cm.character_id = c.id
       where c.user_id = $1 and cm.mission_id = 'contract-steady'`,
      [ids.secondId],
    );
    expect(shift.rows[0]?.status).toBe("completed");
    expect(Number(shift.rows[0]?.events)).toBe(1);
    await recordWorkShift(asSql(db), ids.secondId);
    const shiftAgain = await db.query<{ events: string | number }>(
      `select count(*) as events
       from progression_events e
       join characters c on c.id = e.character_id
       where c.user_id = $1 and e.source_key like 'mission:contract-steady:%'`,
      [ids.secondId],
    );
    expect(Number(shiftAgain.rows[0]?.events)).toBe(1);

    const research = await db.query<{ events: string | number }>(
      `select count(*) as events
       from progression_events e
       join characters c on c.id = e.character_id
       where c.user_id = $1 and e.source_key = 'mission:city-research'`,
      [ids.firstId],
    );
    expect(Number(research.rows[0]?.events)).toBe(1);
    await expect(acceptMission(asSql(db), ids.firstId, "city-research")).rejects.toThrow(/already been accepted/);
  });
});
