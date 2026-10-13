import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import { consumeRateLimit, RateLimitError } from "@/lib/auth/rate-limit";
import type { Sql } from "@/lib/db";
import { provisionNewCharacter } from "@/lib/progression/service";
import {
  acceptConnection,
  blockConnection,
  declineConnection,
  discoverCharacters,
  publicStanding,
  listConnections,
  removeConnection,
  requestConnection,
  unblockConnection,
} from "@/lib/social/connections";

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

describe("character connections", () => {
  afterAll(async () => {
    await db.close();
  });

  it("keeps one relationship per pair and leaves reputation unchanged", async () => {
    const directory = path.join(process.cwd(), "db", "migrations");
    for (const file of ["0001_foundation.sql", "0003_progression.sql", "0004_economy.sql", "0007_organizations.sql", "0019_connections.sql"]) {
      await db.exec(readFileSync(path.join(directory, file), "utf8"));
    }
    const country = await db.query<{ id: string }>(
      `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
       values ('BE', 'BEL', 'Belgium', 'imported', 5, 5, 10) returning id`,
    );
    const countryId = country.rows[0]?.id ?? "";
    const place = await db.query<{ id: string }>(
      `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
       values (1, $1, 'Antwerp', 'Antwerp', 51.2, 4.4, 'P', 'PPLC', 'unreported') returning id`,
      [countryId],
    );
    const placeId = place.rows[0]?.id ?? "";
    await db.query("insert into starting_locations (place_id, status, selected_by_rule) values ($1, 'open', 'test')", [placeId]);

    async function person(email: string, username: string, specialization: "politician" | "trader") {
      const user = await db.query<{ id: string }>("insert into users (email, password_hash) values ($1, 'hash') returning id", [email]);
      const userId = user.rows[0]?.id ?? "";
      const characterId = await provisionNewCharacter(asSql(db), {
        userId,
        username,
        displayName: null,
        biography: null,
        portraitKey: "mark-1",
        countryId,
        placeId,
        specialization,
      });
      return { userId, characterId };
    }

    const ada = await person("ada@example.com", "ada_one", "politician");
    const bea = await person("bea@example.com", "bea_two", "politician");
    const cy = await person("cy@example.com", "cy_three", "trader");
    await db.query("update characters set reputation = 7 where id = $1", [ada.characterId]);

    await expect(tx((sql) => requestConnection(sql, { userId: ada.userId, username: "ada_one" }))).rejects.toThrow(/own character/);
    await tx((sql) => requestConnection(sql, { userId: ada.userId, username: "bea_two" }));
    await expect(tx((sql) => requestConnection(sql, { userId: ada.userId, username: "bea_two" }))).rejects.toThrow(/already waiting/);
    await expect(tx((sql) => requestConnection(sql, { userId: bea.userId, username: "ada_one" }))).rejects.toThrow(/already sent/);
    await expect(tx((sql) => acceptConnection(sql, { userId: ada.userId, username: "bea_two" }))).rejects.toThrow(/no request/);
    await tx((sql) => acceptConnection(sql, { userId: bea.userId, username: "ada_one" }));
    await expect(tx((sql) => acceptConnection(sql, { userId: bea.userId, username: "ada_one" }))).rejects.toThrow(/no request/);
    const accepted = await db.query<{ status: string; count: string }>(
      "select status, count(*)::text as count from character_connections group by status",
    );
    expect(accepted.rows).toEqual([{ status: "accepted", count: "1" }]);
    const reputation = await db.query<{ reputation: number }>("select reputation from characters where id = $1", [ada.characterId]);
    expect(Number(reputation.rows[0]?.reputation)).toBe(7);

    await tx((sql) => removeConnection(sql, { userId: ada.userId, username: "bea_two" }));
    await tx((sql) => requestConnection(sql, { userId: bea.userId, username: "ada_one" }));
    await tx((sql) => declineConnection(sql, { userId: ada.userId, username: "bea_two" }));
    await expect(tx((sql) => declineConnection(sql, { userId: ada.userId, username: "bea_two" }))).rejects.toThrow(/no request/);

    await tx((sql) => blockConnection(sql, { userId: ada.userId, username: "bea_two" }));
    await expect(tx((sql) => requestConnection(sql, { userId: bea.userId, username: "ada_one" }))).rejects.toThrow(/not available/);
    await expect(tx((sql) => unblockConnection(sql, { userId: bea.userId, username: "ada_one" }))).rejects.toThrow(/have not blocked/);
    await tx((sql) => unblockConnection(sql, { userId: ada.userId, username: "bea_two" }));
    await tx((sql) => requestConnection(sql, { userId: ada.userId, username: "bea_two" }));

    const raced = await Promise.allSettled([
      tx((sql) => acceptConnection(sql, { userId: bea.userId, username: "ada_one" })),
      tx((sql) => acceptConnection(sql, { userId: bea.userId, username: "ada_one" })),
    ]);
    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const afterRace = await db.query<{ status: string }>("select status from character_connections");
    expect(afterRace.rows).toEqual([{ status: "accepted" }]);
    const adaList = await listConnections(asSql(db), ada.characterId);
    expect(adaList).toEqual([expect.objectContaining({ username: "bea_two", status: "accepted", outgoing: true })]);
    expect(Number((await db.query<{ reputation: number }>("select reputation from characters where id = $1", [ada.characterId])).rows[0]?.reputation)).toBe(7);

    await tx((sql) => blockConnection(sql, { userId: cy.userId, username: "ada_one" }));
    const blockedView = await listConnections(asSql(db), cy.characterId);
    expect(blockedView).toEqual([expect.objectContaining({ username: "ada_one", status: "blocked", blockedByViewer: true })]);
    const hiddenFromAda = await listConnections(asSql(db), ada.characterId);
    expect(hiddenFromAda.map((row) => row.username)).not.toContain("cy_three");
    const found = await discoverCharacters(asSql(db), { viewerId: cy.characterId, username: "", specialization: "politician" });
    expect(found.map((row) => row.username)).toEqual(["bea_two"]);
    const named = await discoverCharacters(asSql(db), { viewerId: cy.characterId, username: "bea", specialization: "" });
    expect(named.map((row) => row.username)).toEqual(["bea_two"]);
    expect(named[0]?.organization).toBeNull();
    const nextPage = await discoverCharacters(asSql(db), { viewerId: cy.characterId, username: "", specialization: "politician", page: 1 });
    expect(nextPage).toEqual([]);
    await expect(discoverCharacters(asSql(db), { viewerId: cy.characterId, username: "", specialization: "wizard" })).rejects.toThrow(/specialization/);

    const org = await db.query<{ id: string }>(
      `insert into organizations (
         name, tag, org_type, founder_character_id, leader_character_id, headquarters_place_id, country_id, member_limit, recruitment, visibility
       ) values ('Open Desk', 'OPEN', 'trade_association', $1, $1, $2, $3, 12, 'closed', 'public') returning id`,
      [bea.characterId, placeId, countryId],
    );
    const secret = await db.query<{ id: string }>(
      `insert into organizations (
         name, tag, org_type, founder_character_id, leader_character_id, headquarters_place_id, country_id, member_limit, recruitment, visibility
       ) values ('Secret Desk', 'HIDE', 'trade_association', $1, $1, $2, $3, 12, 'closed', 'private') returning id`,
      [ada.characterId, placeId, countryId],
    );
    for (const id of [org.rows[0]?.id, secret.rows[0]?.id]) {
      await db.query(
        `insert into organization_ranks (organization_id, rank_key, name, sort_order) values ($1, 'member', 'Member', 1)`,
        [id],
      );
    }
    await db.query(
      `insert into organization_members (organization_id, character_id, rank_key, status) values ($1, $2, 'member', 'active')`,
      [org.rows[0]?.id, bea.characterId],
    );
    await db.query(
      `insert into organization_members (organization_id, character_id, rank_key, status) values ($1, $2, 'member', 'active')`,
      [secret.rows[0]?.id, ada.characterId],
    );
    await db.query(
      `insert into missions (id, name, description, category, difficulty, xp_reward, currency_reward, reputation_reward, reward_context)
       values ('civic-note', 'Civic note', 'A recorded note.', 'civic', 'easy', 1, 0, 1, 'introduction')`,
    );
    await db.query(
      `insert into mission_objectives (id, mission_id, sort_order, kind, description) values ('civic-note-1', 'civic-note', 1, 'mention_city', 'Name the city.')`,
    );
    await db.query(
      `insert into character_missions (character_id, mission_id, status, completed_at) values ($1, 'civic-note', 'completed', now())`,
      [bea.characterId],
    );
    await db.query(
      `insert into character_objectives (character_id, objective_id, progress, completed, note) values ($1, 'civic-note-1', 1, true, 'secret essay text')`,
      [bea.characterId],
    );
    await db.query(
      `insert into progression_events (character_id, kind, source_key, reputation_awarded, detail)
       values ($1, 'mission', 'mission:civic-note', 1, 'Completed Civic note.')`,
      [bea.characterId],
    );
    const standing = await publicStanding(asSql(db), bea.characterId);
    expect(standing.organizations.map((row) => row.name)).toEqual(["Open Desk"]);
    expect(standing.firstMission?.name).toBe("Civic note");
    expect(standing.events[0]?.detail).toBe("Completed Civic note.");
    expect(JSON.stringify(standing)).not.toContain("secret essay");
    const hidden = await publicStanding(asSql(db), ada.characterId);
    expect(hidden.organizations).toEqual([]);
    expect(JSON.stringify(hidden)).not.toContain("Secret Desk");

    await expect(
      tx(async (sql) => {
        await consumeRateLimit(sql, "social:test", 2, 60_000);
        await consumeRateLimit(sql, "social:test", 2, 60_000);
        await consumeRateLimit(sql, "social:test", 2, 60_000);
      }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });
});
