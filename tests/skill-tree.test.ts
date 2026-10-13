import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { acceptMission, nodeBonus, practiceSkill, provisionNewCharacter, unlockSkillNode } from "@/lib/progression/service";
import { quoteJourney } from "@/lib/travel/service";

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

async function character(username: string, specialization: "entrepreneur" | "politician" | "industrialist" | "explorer", placeId: string, countryId: string) {
  const user = await db.query<{ id: string }>(
    "insert into users (email, password_hash) values ($1, 'x') returning id",
    [`${username}@example.com`],
  );
  const userId = user.rows[0]?.id ?? "";
  await tx((sql) =>
    provisionNewCharacter(sql, {
      userId,
      username,
      displayName: null,
      biography: null,
      portraitKey: "mark-1",
      countryId,
      placeId,
      specialization,
    }),
  );
  return userId;
}

describe("skill focuses", () => {
  afterAll(async () => {
    await db.close();
  });

  it("spends one point, rejects the other choice, and changes only owned effects", async () => {
    const directory = path.join(process.cwd(), "db", "migrations");
    for (const file of [
      "0001_foundation.sql",
      "0003_progression.sql",
      "0004_economy.sql",
      "0005_politics.sql",
      "0012_progression_depth.sql",
      "0013_economy_depth.sql",
      "0014_travel.sql",
      "0015_skill_tree.sql",
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
    const antwerp = await db.query<{ id: string }>(
      `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
       values (1, $1, 'Antwerp', 'Antwerp', 51.22, 4.4, 'P', 'PPLA', 'unreported') returning id`,
      [belgium.rows[0]?.id],
    );
    const lagos = await db.query<{ id: string }>(
      `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
       values (2, $1, 'Lagos', 'Lagos', 6.45, 3.4, 'P', 'PPLC', 'unreported') returning id`,
      [nigeria.rows[0]?.id],
    );
    await db.query(
      "insert into starting_locations (place_id, status, selected_by_rule) values ($1, 'open', 'test'), ($2, 'open', 'test')",
      [antwerp.rows[0]?.id, lagos.rows[0]?.id],
    );
    const placeId = antwerp.rows[0]?.id ?? "";
    const countryId = belgium.rows[0]?.id ?? "";

    const founder = await character("founder", "entrepreneur", placeId, countryId);
    const founderId = (await db.query<{ id: string }>("select id from characters where user_id = $1", [founder])).rows[0]?.id ?? "";
    await db.query("update characters set skill_points = 1 where id = $1", [founderId]);
    await expect(tx((sql) => unlockSkillNode(sql, founder, "ent-books"))).rejects.toThrow(/level 3/);
    const unspent = await db.query<{ skill_points: number }>("select skill_points from characters where id = $1", [founderId]);
    expect(Number(unspent.rows[0]?.skill_points)).toBe(1);
    expect(await tx((sql) => nodeBonus(sql, founderId, "service_shift_flat", { kind: "skill", skillId: "finance" }))).toBe(0);

    await db.query("update characters set level = 3 where id = $1", [founderId]);
    await expect(tx((sql) => unlockSkillNode(sql, founder, "pol-desk"))).rejects.toThrow(/outside this specialization/);
    expect(Number((await db.query<{ skill_points: number }>("select skill_points from characters where id = $1", [founderId])).rows[0]?.skill_points)).toBe(1);
    await expect(tx((sql) => unlockSkillNode(sql, founder, "ent-books"))).resolves.toMatch(/Closer books/);
    await expect(tx((sql) => unlockSkillNode(sql, founder, "ent-books"))).rejects.toThrow(/already acquired/);
    await expect(tx((sql) => unlockSkillNode(sql, founder, "ent-terms"))).rejects.toThrow(/already acquired/);
    expect(Number((await db.query<{ skill_points: number }>("select skill_points from characters where id = $1", [founderId])).rows[0]?.skill_points)).toBe(0);
    expect(await tx((sql) => nodeBonus(sql, founderId, "service_shift_flat", { kind: "skill", skillId: "finance" }))).toBe(2);
    expect(await tx((sql) => nodeBonus(sql, founderId, "market_fee_flat", { kind: "general" }))).toBe(0);
    await db.query("update characters set level = 4, skill_points = 1 where id = $1", [founderId]);
    await db.query("update character_skills set level = 1 where character_id = $1 and skill_id = 'negotiation'", [founderId]);
    await expect(tx((sql) => unlockSkillNode(sql, founder, "cap-entrepreneur"))).rejects.toThrow(/Negotiation level 2/);
    expect(Number((await db.query<{ skill_points: number }>("select skill_points from characters where id = $1", [founderId])).rows[0]?.skill_points)).toBe(1);

    const speaker = await character("speaker", "politician", placeId, countryId);
    const speakerId = (await db.query<{ id: string }>("select id from characters where user_id = $1", [speaker])).rows[0]?.id ?? "";
    await db.query("update characters set level = 3, skill_points = 1 where id = $1", [speakerId]);
    await expect(tx((sql) => acceptMission(sql, speaker, "contract-node-chamber"))).rejects.toThrow(/Chamber practice/);
    await tx((sql) => unlockSkillNode(sql, speaker, "pol-chamber"));
    await expect(tx((sql) => acceptMission(sql, speaker, "contract-node-chamber"))).resolves.toMatch(/Speak in the chamber/);

    const maker = await character("maker", "industrialist", placeId, countryId);
    const makerId = (await db.query<{ id: string }>("select id from characters where user_id = $1", [maker])).rows[0]?.id ?? "";
    await db.query("update characters set level = 3, skill_points = 1 where id = $1", [makerId]);
    await tx((sql) => unlockSkillNode(sql, maker, "ind-runs"));
    expect(await tx((sql) => nodeBonus(sql, makerId, "production_cost_flat", { kind: "general" }))).toBe(1);

    const walker = await character("walker", "explorer", placeId, countryId);
    const before = await tx((sql) => quoteJourney(sql, walker, lagos.rows[0]?.id ?? ""));
    const walkerId = (await db.query<{ id: string }>("select id from characters where user_id = $1", [walker])).rows[0]?.id ?? "";
    await db.query("update characters set level = 3, skill_points = 1 where id = $1", [walkerId]);
    await tx((sql) => unlockSkillNode(sql, walker, "exp-road"));
    const after = await tx((sql) => quoteJourney(sql, walker, lagos.rows[0]?.id ?? ""));
    expect(before.cost - after.cost).toBe(2);

    const student = await character("student", "entrepreneur", placeId, countryId);
    const studentId = (await db.query<{ id: string }>("select id from characters where user_id = $1", [student])).rows[0]?.id ?? "";
    await db.query("update characters set level = 2, skill_points = 1 where id = $1", [studentId]);
    await tx((sql) => unlockSkillNode(sql, student, "node-habit"));
    await tx((sql) => practiceSkill(sql, student, "negotiation"));
    const trained = await db.query<{ xp: number }>(
      "select xp from character_skills where character_id = $1 and skill_id = 'negotiation'",
      [studentId],
    );
    expect(Number(trained.rows[0]?.xp)).toBe(32);
    await expect(tx((sql) => practiceSkill(sql, student, "finance"))).rejects.toThrow(/cooldown/);

    const racer = await character("racer", "entrepreneur", placeId, countryId);
    const racerId = (await db.query<{ id: string }>("select id from characters where user_id = $1", [racer])).rows[0]?.id ?? "";
    await db.query("update characters set level = 3, skill_points = 1 where id = $1", [racerId]);
    const raced = await Promise.allSettled([
      tx((sql) => unlockSkillNode(sql, racer, "ent-books")),
      tx((sql) => unlockSkillNode(sql, racer, "ent-terms")),
    ]);
    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const spent = await db.query<{ skill_points: number; focuses: number }>(
      `select c.skill_points, (select count(*)::int from character_skill_nodes n where n.character_id = c.id) as focuses
       from characters c where c.id = $1`,
      [racerId],
    );
    expect(Number(spent.rows[0]?.skill_points)).toBe(0);
    expect(Number(spent.rows[0]?.focuses)).toBe(1);
  });
});
