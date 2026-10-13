import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { acceptCityContest, cancelCityContest, proposeCityContest, settleCityContest, supportCityContest } from "@/lib/organizations/contests";
import { declareRivalry } from "@/lib/organizations/relations";
import { createOrganization } from "@/lib/organizations/service";
import { depositTreasury } from "@/lib/organizations/treasury";
import { provisionNewCharacter } from "@/lib/progression/service";
import { advanceWorld } from "@/lib/world/tick";

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

describe("city contests", () => {
  afterAll(async () => {
    await db.close();
  });

  it("charges both treasuries once and raises influence only for the higher score", async () => {
    const directory = path.join(process.cwd(), "db", "migrations");
    for (const file of [
      "0001_foundation.sql",
      "0003_progression.sql",
      "0004_economy.sql",
      "0005_politics.sql",
      "0006_politics_gaps.sql",
      "0007_organizations.sql",
      "0008_world.sql",
      "0014_travel.sql",
      "0016_world_events.sql",
      "0018_city_contests.sql",
    ]) {
      await db.exec(readFileSync(path.join(directory, file), "utf8"));
    }

    async function country(iso2: string, iso3: string, name: string) {
      const rows = await db.query<{ id: string }>(
        `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
         values ($1, $2, $3, 'imported', 5, 5, 10) returning id`,
        [iso2, iso3, name],
      );
      return rows.rows[0]?.id ?? "";
    }
    const belgium = await country("BE", "BEL", "Belgium");
    const nigeria = await country("NG", "NGA", "Nigeria");
    async function place(geonameId: number, countryId: string, name: string) {
      const rows = await db.query<{ id: string }>(
        `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
         values ($1, $2, $3, $3, 50, 4, 'P', 'PPLC', 'unreported') returning id`,
        [geonameId, countryId, name],
      );
      const id = rows.rows[0]?.id ?? "";
      await db.query("insert into starting_locations (place_id, status, selected_by_rule) values ($1, 'open', 'test')", [id]);
      return id;
    }
    const antwerp = await place(1, belgium, "Antwerp");
    const lagos = await place(2, nigeria, "Lagos");

    let portrait = 0;
    async function person(email: string, username: string, countryId: string, placeId: string) {
      portrait += 1;
      const user = await db.query<{ id: string }>("insert into users (email, password_hash) values ($1, 'hash') returning id", [email]);
      const userId = user.rows[0]?.id ?? "";
      const characterId = await provisionNewCharacter(asSql(db), {
        userId,
        username,
        displayName: null,
        biography: null,
        portraitKey: `mark-${portrait}`,
        countryId,
        placeId,
        specialization: "generalist",
      });
      await db.query("update characters set currency = 200, level = 2 where id = $1", [characterId]);
      return { userId, characterId };
    }
    const left = await person("left@example.com", "left_org", belgium, antwerp);
    const right = await person("right@example.com", "right_org", nigeria, lagos);
    const outsider = await person("out@example.com", "out_org", belgium, antwerp);
    const west = await tx((sql) =>
      createOrganization(sql, {
        userId: left.userId,
        name: "West Desk",
        tag: "WEST",
        description: "",
        orgType: "trade_association",
        placeId: antwerp,
        recruitment: "open",
        visibility: "public",
        emblemKey: "mark-1",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      }),
    );
    const east = await tx((sql) =>
      createOrganization(sql, {
        userId: right.userId,
        name: "East Desk",
        tag: "EAST",
        description: "",
        orgType: "trade_association",
        placeId: lagos,
        recruitment: "open",
        visibility: "public",
        emblemKey: "mark-2",
        idempotencyKey: "22222222-2222-4222-8222-222222222222",
      }),
    );
    await tx((sql) => depositTreasury(sql, { userId: left.userId, organizationId: west, amount: 30, idempotencyKey: "33333333-3333-4333-8333-333333333333" }));
    await tx((sql) => depositTreasury(sql, { userId: right.userId, organizationId: east, amount: 30, idempotencyKey: "44444444-4444-4444-8444-444444444444" }));

    await expect(tx((sql) => proposeCityContest(sql, { userId: left.userId, organizationId: west, otherOrganizationId: east, placeId: antwerp }))).rejects.toThrow(/rivalry/);
    await tx((sql) => declareRivalry(sql, { userId: left.userId, organizationId: west, otherOrganizationId: east }));
    const contestId = await tx((sql) => proposeCityContest(sql, { userId: left.userId, organizationId: west, otherOrganizationId: east, placeId: antwerp }));
    await expect(tx((sql) => proposeCityContest(sql, { userId: left.userId, organizationId: west, otherOrganizationId: east, placeId: antwerp }))).rejects.toThrow(/already open/);
    const beforeAccept = await db.query<{ balance: string }>("select balance::text as balance from organizations where id = $1", [west]);
    await tx((sql) => acceptCityContest(sql, { userId: right.userId, contestId }));
    const afterAccept = await db.query<{ id: string; balance: string }>("select id, balance::text as balance from organizations where id in ($1, $2)", [west, east]);
    expect(afterAccept.rows.every((row) => row.balance === String(Number(beforeAccept.rows[0]?.balance) - 10))).toBe(true);
    await tx((sql) => supportCityContest(sql, { userId: left.userId, contestId }));
    await expect(tx((sql) => supportCityContest(sql, { userId: left.userId, contestId }))).rejects.toThrow(/already recorded/);
    await expect(tx((sql) => supportCityContest(sql, { userId: outsider.userId, contestId }))).rejects.toThrow(/participating/);
    await tx((sql) => advanceWorld(sql));
    const stillActive = await db.query<{ status: string }>("select status from city_contests where id = $1", [contestId]);
    expect(stillActive.rows[0]?.status).toBe("active");
    await db.query("update city_contests set resolves_at = now() - interval '1 second' where id = $1", [contestId]);
    let status = "active";
    for (let attempt = 0; attempt < 6 && status === "active"; attempt += 1) {
      await tx((sql) => advanceWorld(sql));
      const row = await db.query<{ status: string }>("select status from city_contests where id = $1", [contestId]);
      status = row.rows[0]?.status ?? "";
    }
    expect(status).toBe("resolved");
    const outcome = await db.query<{ outcome: string }>("select outcome from city_contests where id = $1", [contestId]);
    expect(outcome.rows[0]?.outcome).toBe("challenger");
    const score = await db.query<{ score: number }>("select score from organization_influence where organization_id = $1 and place_id = $2", [west, antwerp]);
    expect(score.rows[0]?.score).toBe(4);
    await tx((sql) => advanceWorld(sql));
    const scoreAgain = await db.query<{ score: number }>("select score from organization_influence where organization_id = $1 and place_id = $2", [west, antwerp]);
    expect(scoreAgain.rows[0]?.score).toBe(4);

    await db.query("update organization_relations set status = 'ceasefire'");
    await expect(tx((sql) => proposeCityContest(sql, { userId: left.userId, organizationId: west, otherOrganizationId: east, placeId: lagos }))).rejects.toThrow(/ceasefire|rivalry/);
    await db.query("update organization_relations set status = 'rival'");
    const drawId = await tx((sql) => proposeCityContest(sql, { userId: left.userId, organizationId: west, otherOrganizationId: east, placeId: lagos }));
    await tx((sql) => acceptCityContest(sql, { userId: right.userId, contestId: drawId }));
    await db.query("update city_contests set resolves_at = now() - interval '1 second' where id = $1", [drawId]);
    expect(await tx((sql) => settleCityContest(sql, drawId))).toBe("resolved");
    const draw = await db.query<{ outcome: string }>("select outcome from city_contests where id = $1", [drawId]);
    expect(draw.rows[0]?.outcome).toBe("draw");
    const lagosScore = await db.query<{ count: number }>("select count(*)::int as count from organization_influence where place_id = $1", [lagos]);
    expect(lagosScore.rows[0]?.count).toBe(0);

    const [countryA, countryB] = belgium < nigeria ? [belgium, nigeria] : [nigeria, belgium];
    await db.query(
      "insert into diplomatic_relations (country_a, country_b, status, note) values ($1, $2, 'sanctioned', 'test')",
      [countryA, countryB],
    );
    await expect(tx((sql) => proposeCityContest(sql, { userId: left.userId, organizationId: west, otherOrganizationId: east, placeId: antwerp }))).rejects.toThrow(/sanction/);
    await db.query("delete from diplomatic_relations");

    const cancelled = await tx((sql) => proposeCityContest(sql, { userId: left.userId, organizationId: west, otherOrganizationId: east, placeId: antwerp }));
    const balanceBeforeCancel = await db.query<{ balance: string }>("select balance::text as balance from organizations where id = $1", [west]);
    await tx((sql) => cancelCityContest(sql, { userId: left.userId, contestId: cancelled }));
    const balanceAfterCancel = await db.query<{ balance: string }>("select balance::text as balance from organizations where id = $1", [west]);
    expect(balanceAfterCancel.rows[0]?.balance).toBe(balanceBeforeCancel.rows[0]?.balance);

    await db.query("update organizations set balance = 0 where id = $1", [east]);
    const short = await tx((sql) => proposeCityContest(sql, { userId: left.userId, organizationId: west, otherOrganizationId: east, placeId: antwerp }));
    const westBefore = await db.query<{ balance: string }>("select balance::text as balance from organizations where id = $1", [west]);
    await expect(tx((sql) => acceptCityContest(sql, { userId: right.userId, contestId: short }))).rejects.toThrow();
    const westAfter = await db.query<{ balance: string }>("select balance::text as balance from organizations where id = $1", [west]);
    expect(westAfter.rows[0]?.balance).toBe(westBefore.rows[0]?.balance);
    const shortStatus = await db.query<{ status: string }>("select status from city_contests where id = $1", [short]);
    expect(shortStatus.rows[0]?.status).toBe("proposed");
    await tx((sql) => cancelCityContest(sql, { userId: left.userId, contestId: short }));

    await db.query("update organizations set balance = 30 where id = $1", [east]);
    const race = await tx((sql) => proposeCityContest(sql, { userId: left.userId, organizationId: west, otherOrganizationId: east, placeId: antwerp }));
    await tx((sql) => acceptCityContest(sql, { userId: right.userId, contestId: race }));
    await tx((sql) => supportCityContest(sql, { userId: left.userId, contestId: race }));
    await db.query("update city_contests set resolves_at = now() - interval '1 second' where id = $1", [race]);
    const raced = await Promise.all([tx((sql) => settleCityContest(sql, race)), tx((sql) => settleCityContest(sql, race))]);
    expect(raced.filter((result) => result === "resolved")).toHaveLength(1);
    const racedScore = await db.query<{ score: number }>("select score from organization_influence where organization_id = $1 and place_id = $2", [west, antwerp]);
    expect(racedScore.rows[0]?.score).toBe(7);
    const versions = await db.query<{ count: number }>("select count(*)::int as count from city_contests where id = $1 and status = 'resolved'", [race]);
    expect(versions.rows[0]?.count).toBe(1);
  });
});
