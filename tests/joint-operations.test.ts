import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { boundedWorkShiftCooldown } from "@/lib/economy/service";
import { joinOperation, launchOperation, leaveOperation, openOperation, recordJointShift, resolveOperation } from "@/lib/organizations/play";
import { recordShiftBulletin } from "@/lib/world/events";
import { createOrganization } from "@/lib/organizations/service";
import { depositTreasury } from "@/lib/organizations/treasury";
import { provisionNewCharacter } from "@/lib/progression/service";

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

describe("shift cooldown bounds", () => {
  it("keeps the stored 60 second shift cooldown and rejects a zero rule", () => {
    expect(boundedWorkShiftCooldown(60)).toBe(60);
    expect(boundedWorkShiftCooldown(0)).toBe(60);
    expect(boundedWorkShiftCooldown(86_400)).toBe(86_400);
    expect(boundedWorkShiftCooldown(200_000)).toBe(86_400);
  });
});

describe("joint shifts", () => {
  afterAll(async () => {
    await db.close();
  });

  it("records two company shifts once and pays the organization once", async () => {
    const directory = path.join(process.cwd(), "db", "migrations");
    for (const file of ["0001_foundation.sql", "0003_progression.sql", "0004_economy.sql", "0007_organizations.sql", "0008_world.sql", "0010_work_shifts.sql", "0016_world_events.sql", "0021_joint_operations.sql"]) {
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

    async function person(email: string, username: string) {
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
        specialization: "generalist",
      });
      await db.query("update characters set currency = 800, level = 2 where id = $1", [characterId]);
      return { userId, characterId };
    }
    const ada = await person("ada-joint@example.com", "ada_joint");
    const bea = await person("bea-joint@example.com", "bea_joint");
    const cy = await person("cy-joint@example.com", "cy_joint");
    const organizationId = await tx((sql) =>
      createOrganization(sql, {
        userId: ada.userId,
        name: "Joint Desk",
        tag: "JNT",
        description: "",
        orgType: "corporate_group",
        placeId,
        recruitment: "open",
        visibility: "public",
        emblemKey: "mark-1",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      }),
    );
    await db.query(
      "insert into organization_members (organization_id, character_id, rank_key, status) values ($1, $2, 'member', 'active')",
      [organizationId, bea.characterId],
    );
    await tx((sql) => depositTreasury(sql, { userId: ada.userId, organizationId, amount: 50, idempotencyKey: "22222222-2222-4222-8222-222222222222" }));
    await expect(tx((sql) => openOperation(sql, { userId: bea.userId, definitionKey: "joint", placeId }))).rejects.toThrow(/permission/);
    await expect(tx((sql) => openOperation(sql, { userId: cy.userId, definitionKey: "joint", placeId }))).rejects.toThrow(/organization/);

    const operationId = await tx((sql) => openOperation(sql, { userId: ada.userId, definitionKey: "joint", placeId }));
    await expect(tx((sql) => joinOperation(sql, { userId: cy.userId, operationId }))).rejects.toThrow(/member/);
    await tx((sql) => joinOperation(sql, { userId: bea.userId, operationId }));
    await expect(tx((sql) => joinOperation(sql, { userId: bea.userId, operationId }))).rejects.toThrow(/already joined/);
    await tx((sql) => leaveOperation(sql, { userId: bea.userId, operationId }));
    await tx((sql) => joinOperation(sql, { userId: bea.userId, operationId }));
    await expect(tx((sql) => leaveOperation(sql, { userId: ada.userId, operationId }))).rejects.toThrow(/Cancel/);

    await tx((sql) => launchOperation(sql, { userId: ada.userId, operationId }));
    await expect(tx((sql) => recordJointShift(sql, { userId: ada.userId, operationId }))).rejects.toThrow(/No company shift/);
    const business = await db.query<{ id: string }>(
      `insert into businesses (owner_character_id, name, category, country_id, place_id) values ($1, 'Shift Desk', 'finance', $2, $3) returning id`,
      [ada.characterId, countryId, placeId],
    );
    const businessId = business.rows[0]?.id ?? "";
    async function shift(characterId: string, when: string) {
      const created = await db.query<{ id: string }>(
        `insert into work_shifts (business_id, character_id, kind, gross, detail, created_at)
         values ($1, $2, 'service', 20, 'A recorded company shift.', $3) returning id`,
        [businessId, characterId, when],
      );
      return created.rows[0]?.id ?? "";
    }
    await shift(ada.characterId, "2020-01-01T00:00:00.000Z");
    await expect(tx((sql) => recordJointShift(sql, { userId: ada.userId, operationId }))).rejects.toThrow(/No company shift/);
    await shift(ada.characterId, new Date().toISOString());
    await shift(bea.characterId, new Date().toISOString());
    const bulletin = await db.query<{ id: string }>(
      `insert into world_events (event_key, event_type, title, detail, starts_at, ends_at, status, country_id, goal, reward)
       values ('joint-be', 'work_bulletin', 'Belgium work bulletin', 'A bulletin used to check that one shift is claimed once.', now() - interval '1 minute', now() + interval '2 hours', 'active', $1, 2, 8)
       returning id`,
      [countryId],
    );
    const bulletinId = bulletin.rows[0]?.id ?? "";
    const adaPaid = await tx((sql) => recordShiftBulletin(sql, ada.userId));
    expect(adaPaid).toMatchObject({ state: "recorded", eventId: bulletinId, amount: 8 });
    await expect(tx((sql) => recordJointShift(sql, { userId: ada.userId, operationId }))).rejects.toThrow(/work bulletin/);
    await shift(ada.characterId, new Date().toISOString());
    await tx((sql) => recordJointShift(sql, { userId: ada.userId, operationId }));
    await tx((sql) => recordJointShift(sql, { userId: bea.userId, operationId }));
    const beaBlocked = await tx((sql) => recordShiftBulletin(sql, bea.userId));
    expect(beaBlocked).toMatchObject({ state: "used", eventId: bulletinId });
    await shift(bea.characterId, new Date().toISOString());
    const beaPaid = await tx((sql) => recordShiftBulletin(sql, bea.userId));
    expect(beaPaid).toMatchObject({ state: "recorded", eventId: bulletinId, amount: 8 });
    await shift(ada.characterId, new Date().toISOString());
    await expect(tx((sql) => recordJointShift(sql, { userId: ada.userId, operationId }))).rejects.toThrow(/already recorded/);
    await expect(tx((sql) => resolveOperation(sql, { userId: ada.userId, operationId }))).rejects.toThrow(/still in progress/);

    await db.query("update operations set completes_at = now() - interval '1 minute' where id = $1", [operationId]);
    const raced = await Promise.all([
      tx((sql) => resolveOperation(sql, { userId: ada.userId, operationId })),
      tx((sql) => resolveOperation(sql, { userId: bea.userId, operationId })),
    ]);
    expect(raced.filter((result) => result === "completed")).toHaveLength(2);
    const balance = await db.query<{ balance: string }>("select balance::text as balance from organizations where id = $1", [organizationId]);
    expect(balance.rows[0]?.balance).toBe("54");
    const rewards = await db.query<{ count: string }>("select count(*)::text as count from ledger_entries where reason = 'operation_reward'");
    expect(rewards.rows[0]?.count).toBe("1");
    const reputation = await db.query<{ reputation: number }>("select reputation from characters where id = $1 or id = $2 order by username", [ada.characterId, bea.characterId]);
    expect(reputation.rows.map((row) => Number(row.reputation))).toEqual([1, 1]);
    expect(await tx((sql) => resolveOperation(sql, { userId: ada.userId, operationId }))).toBe("completed");
    expect(Number((await db.query<{ reputation: number }>("select reputation from characters where id = $1", [ada.characterId])).rows[0]?.reputation)).toBe(1);

    const shortId = await tx((sql) => openOperation(sql, { userId: ada.userId, definitionKey: "joint", placeId }));
    await tx((sql) => joinOperation(sql, { userId: bea.userId, operationId: shortId }));
    await tx((sql) => launchOperation(sql, { userId: ada.userId, operationId: shortId }));
    await shift(ada.characterId, new Date().toISOString());
    await tx((sql) => recordJointShift(sql, { userId: ada.userId, operationId: shortId }));
    await db.query("update operations set completes_at = now() - interval '1 minute' where id = $1", [shortId]);
    expect(await tx((sql) => resolveOperation(sql, { userId: ada.userId, operationId: shortId }))).toBe("failed");
    const afterFail = await db.query<{ balance: string }>("select balance::text as balance from organizations where id = $1", [organizationId]);
    expect(afterFail.rows[0]?.balance).toBe("44");
    expect(Number((await db.query<{ reputation: number }>("select reputation from characters where id = $1", [ada.characterId])).rows[0]?.reputation)).toBe(1);
  });
});
