import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { foundBusiness, performShift } from "@/lib/economy/service";
import { acceptMission, provisionNewCharacter, recordWorkShift } from "@/lib/progression/service";
import { advanceWorld } from "@/lib/world/tick";
import { bulletinCopy, bulletinLimits, bulletinPlayerNote, countryWorldState, loadWorldBoard, recordShiftBulletin } from "@/lib/world/events";

const db = new PGlite();
const foundKey = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa16";

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

describe("work bulletins", () => {
  afterAll(async () => {
    await db.close();
  });

  it("rejects an invalid window and keeps bulletin copy inside the stored limits", async () => {
    expect(bulletinLimits({ windowSeconds: 10, cooldownSeconds: 86400, maxActive: 3, goal: 1, reward: 8 })).toBeNull();
    expect(bulletinLimits({ windowSeconds: 86400, cooldownSeconds: 86400, maxActive: 3, goal: 1, reward: 80 })).toBeNull();
    expect(bulletinLimits({ windowSeconds: 86400, cooldownSeconds: 86400, maxActive: 3, goal: 1, reward: 8 })?.reward).toBe(8);
    expect(bulletinCopy("Belgium", 8, 1)?.title).toBe("Belgium work bulletin");
    expect(bulletinCopy("", 8, 1)).toBeNull();
    expect(bulletinPlayerNote({ status: "active", outcome: "pending", home: false, joined: false, reward: 8, homeCountryName: "Belgium" }).eligible).toBe(false);
    expect(bulletinPlayerNote({ status: "active", outcome: "pending", home: true, joined: false, reward: 8, homeCountryName: "Belgium" }).playerNote).toContain("pays 8");
    expect(bulletinPlayerNote({ status: "ended", outcome: "unmet", home: true, joined: false, reward: 8, homeCountryName: "Belgium" }).playerNote).toContain("before the goal");
  });

  it("opens from real residents, pays one shift once, and catches up without replaying missed windows", async () => {
    const directory = path.join(process.cwd(), "db", "migrations");
    for (const file of [
      "0001_foundation.sql",
      "0003_progression.sql",
      "0004_economy.sql",
      "0005_politics.sql",
      "0006_politics_gaps.sql",
      "0007_organizations.sql",
      "0008_world.sql",
      "0010_work_shifts.sql",
      "0012_progression_depth.sql",
      "0013_economy_depth.sql",
      "0014_travel.sql",
      "0015_skill_tree.sql",
      "0016_world_events.sql",
      "0017_bulletin_contract.sql",
      "0018_city_contests.sql",
    ]) {
      await db.exec(readFileSync(path.join(directory, file), "utf8"));
    }
    await expect(
      db.exec(
        `insert into world_events (event_key, event_type, title, detail, starts_at, ends_at, status)
         values ('bad-window', 'work_bulletin', 'Bad window', 'This window is not long enough to store.', now(), now(), 'scheduled')`,
      ),
    ).rejects.toThrow(/world_event_window/);

    const home = await db.query<{ id: string }>(
      `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
       values ('BE', 'BEL', 'Belgium', 'imported', 5, 5, 10) returning id`,
    );
    const homeId = home.rows[0]?.id ?? "";
    const away = await db.query<{ id: string }>(
      `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
       values ('NG', 'NGA', 'Nigeria', 'imported', 5, 5, 10) returning id`,
    );
    const awayId = away.rows[0]?.id ?? "";
    const empty = await db.query<{ id: string }>(
      `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
       values ('FR', 'FRA', 'France', 'imported', 5, 5, 10) returning id`,
    );
    const emptyId = empty.rows[0]?.id ?? "";
    const place = await db.query<{ id: string }>(
      `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
       values (101, $1, 'Antwerp', 'Antwerp', 51.22, 4.4, 'P', 'PPLA', 'unreported') returning id`,
      [homeId],
    );
    const placeId = place.rows[0]?.id ?? "";
    const awayPlace = await db.query<{ id: string }>(
      `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
       values (102, $1, 'Lagos', 'Lagos', 6.45, 3.4, 'P', 'PPLC', 'unreported') returning id`,
      [awayId],
    );
    const awayPlaceId = awayPlace.rows[0]?.id ?? "";
    const emptyPlace = await db.query<{ id: string }>(
      `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
       values (103, $1, 'Paris', 'Paris', 48.85, 2.35, 'P', 'PPLC', 'unreported') returning id`,
      [emptyId],
    );
    await db.query(
      "insert into starting_locations (place_id, status, selected_by_rule) values ($1, 'open', 'test'), ($2, 'open', 'test'), ($3, 'open', 'test')",
      [placeId, awayPlaceId, emptyPlace.rows[0]?.id ?? ""],
    );
    const user = await db.query<{ id: string }>("insert into users (email, password_hash) values ('bulletin@example.com', 'hash') returning id");
    const userId = user.rows[0]?.id ?? "";
    const characterId = await provisionNewCharacter(asSql(db), {
      userId,
      username: "bulletin_ada",
      displayName: null,
      biography: null,
      portraitKey: "mark-1",
      countryId: homeId,
      placeId,
      specialization: "generalist",
    });
    await db.query("update characters set currency = 500, level = 2 where id = $1", [characterId]);
    const otherUser = await db.query<{ id: string }>("insert into users (email, password_hash) values ('bulletin-away@example.com', 'hash') returning id");
    const otherUserId = otherUser.rows[0]?.id ?? "";
    const otherCharacterId = await provisionNewCharacter(asSql(db), {
      userId: otherUserId,
      username: "bulletin_ng",
      displayName: null,
      biography: null,
      portraitKey: "mark-2",
      countryId: awayId,
      placeId: awayPlaceId,
      specialization: "trader",
    });
    await db.query("update starting_locations set status = 'disabled' where place_id = $1", [awayPlaceId]);
    await expect(tx((sql) => acceptMission(sql, userId, "bulletin-shift"))).rejects.toThrow(/No work bulletin/);

    const raced = await Promise.all([tx((sql) => advanceWorld(sql)), tx((sql) => advanceWorld(sql))]);
    expect(raced.filter((result) => !result.skipped).length).toBeGreaterThan(0);
    const opened = await db.query<{ id: string; country_id: string; status: string }>(
      "select id, country_id, status from world_events where event_type = 'work_bulletin' and status = 'active'",
    );
    expect(opened.rows).toHaveLength(1);
    expect(opened.rows[0]?.country_id).toBe(homeId);
    const again = await tx((sql) => advanceWorld(sql));
    expect(again.opened).toBe(0);
    const stillOne = await db.query<{ count: number }>("select count(*)::int as count from world_events where event_type = 'work_bulletin'");
    expect(stillOne.rows[0]?.count).toBe(1);

    await db.query("update game_rules set amount = 1 where key = 'sim_paused'");
    await db.query("delete from world_events where event_type = 'work_bulletin'");
    const paused = await tx((sql) => advanceWorld(sql));
    expect(paused.skipped).toBe(true);
    const whilePaused = await db.query<{ count: number }>("select count(*)::int as count from world_events");
    expect(whilePaused.rows[0]?.count).toBe(0);
    await db.query("update game_rules set amount = 0 where key = 'sim_paused'");

    const scheduled = await db.query<{ id: string }>(
      `insert into world_events (event_key, event_type, title, detail, starts_at, ends_at, status, country_id, goal, reward)
       values ('scheduled-be', 'work_bulletin', 'Belgium work bulletin', 'A scheduled bulletin for the activation check.', now() - interval '1 minute', now() + interval '2 hours', 'scheduled', $1, 1, 8)
       returning id`,
      [homeId],
    );
    const scheduledId = scheduled.rows[0]?.id ?? "";
    const activated = await tx((sql) => advanceWorld(sql));
    expect(activated.activated).toBe(1);
    const active = await db.query<{ status: string }>("select status from world_events where id = $1", [scheduledId]);
    expect(active.rows[0]?.status).toBe("active");
    const extras = await db.query<{ count: number }>(
      "select count(*)::int as count from world_events where status in ('scheduled', 'active') and country_id = $1",
      [homeId],
    );
    expect(extras.rows[0]?.count).toBe(1);
    await db.query(
      `insert into policy_versions (country_id, effect_key, effect_value, effective_at) values
       ($1, 'sales_tax_percent', 25, now()),
       ($1, 'sales_tax_percent', 99, now() + interval '1 day'),
       ($1, 'unknown_law', 3, now())`,
      [homeId],
    );
    const belgium = await countryWorldState(asSql(db), "be");
    expect(belgium?.countryName).toBe("Belgium");
    expect(belgium?.bulletin).toMatchObject({ status: "active", reward: 8, goal: 1, progress: 0 });
    expect(belgium?.policies).toEqual([
      expect.objectContaining({ effectKey: "sales_tax_percent", effectValue: 25, label: "Sales tax" }),
    ]);
    const france = await countryWorldState(asSql(db), "FR");
    expect(france?.bulletin).toBeNull();
    expect(france?.policies).toEqual([]);
    expect(await countryWorldState(asSql(db), "ZZ")).toBeNull();

    const businessId = await tx((sql) =>
      foundBusiness(sql, {
        userId,
        name: "Bulletin Desk",
        description: "A test company.",
        category: "finance",
        placeId,
        idempotencyKey: foundKey,
      }),
    );
    await tx((sql) => performShift(sql, { userId, businessId }));
    await db.query("update world_events set reward = 99 where id = $1", [scheduledId]);
    await expect(tx((sql) => recordShiftBulletin(sql, userId))).rejects.toThrow(/not valid/);
    const unpaid = await db.query<{ count: number }>("select count(*)::int as count from world_event_contributions");
    expect(unpaid.rows[0]?.count).toBe(0);
    await db.query("update world_events set reward = 8 where id = $1", [scheduledId]);

    await expect(
      tx(async (sql) => {
        await recordShiftBulletin(sql, userId);
        throw new Error("stop");
      }),
    ).rejects.toThrow(/stop/);
    const rolled = await db.query<{ currency: number }>("select currency from characters where id = $1", [characterId]);
    expect(Number(rolled.rows[0]?.currency)).toBe(420);

    const paid = await Promise.all([tx((sql) => recordShiftBulletin(sql, userId)), tx((sql) => recordShiftBulletin(sql, userId))]);
    expect(paid.filter((result) => result.state === "recorded")).toHaveLength(1);
    expect(paid.filter((result) => result.state === "already")).toHaveLength(1);
    const afterPay = await db.query<{ currency: number }>("select currency from characters where id = $1", [characterId]);
    expect(Number(afterPay.rows[0]?.currency)).toBe(428);
    const ledger = await db.query<{ count: number }>(
      "select count(*)::int as count from ledger_entries where idempotency_key = $1",
      [`bulletin:${scheduledId}:${characterId}`],
    );
    expect(ledger.rows[0]?.count).toBe(1);
    const repeat = await tx((sql) => recordShiftBulletin(sql, userId));
    expect(repeat.state).toBe("already");
    await expect(tx((sql) => acceptMission(sql, userId, "bulletin-shift"))).rejects.toThrow(/already has your shift/);
    const stillPaid = await db.query<{ currency: number }>("select currency from characters where id = $1", [characterId]);
    expect(Number(stillPaid.rows[0]?.currency)).toBe(428);

    await db.query(
      `insert into work_shifts (business_id, character_id, kind, gross, detail)
       values ($1, $2, 'service', 20, 'A shift outside the bulletin country.')`,
      [businessId, otherCharacterId],
    );
    const outsider = await tx((sql) => recordShiftBulletin(sql, otherUserId));
    expect(outsider.state).toBe("none");
    const outsiderCurrency = await db.query<{ currency: number }>("select currency from characters where id = $1", [otherCharacterId]);
    expect(Number(outsiderCurrency.rows[0]?.currency)).toBe(100);

    const board = await loadWorldBoard(asSql(db), userId);
    expect(board.events.some((event) => event.id === scheduledId && event.eligible === false && event.playerNote.includes("already recorded"))).toBe(true);
    const awayBoard = await loadWorldBoard(asSql(db), otherUserId);
    expect(awayBoard.events.some((event) => event.id === scheduledId && event.playerNote.includes("Nigeria"))).toBe(true);

    await db.query("update world_events set ends_at = now() - interval '1 minute' where id = $1", [scheduledId]);
    const closed = await tx((sql) => advanceWorld(sql));
    expect(closed.resolved).toBe(1);
    const outcome = await db.query<{ status: string; outcome: string; progress: number }>("select status, outcome, progress from world_events where id = $1", [scheduledId]);
    expect(outcome.rows[0]?.status).toBe("ended");
    expect(outcome.rows[0]?.outcome).toBe("met");
    expect(Number(outcome.rows[0]?.progress)).toBe(1);
    const closedAgain = await tx((sql) => advanceWorld(sql));
    expect(closedAgain.resolved).toBe(0);
    expect(closedAgain.opened).toBe(0);
    const ledgerAfterClose = await db.query<{ count: number }>(
      "select count(*)::int as count from ledger_entries where reason = 'work_bulletin'",
    );
    expect(ledgerAfterClose.rows[0]?.count).toBe(1);
    const afterClose = await tx((sql) => recordShiftBulletin(sql, userId));
    expect(afterClose.state).toBe("none");

    await db.query(
      "update world_events set starts_at = now() - interval '4 days', ends_at = now() - interval '3 days' where id = $1",
      [scheduledId],
    );
    const caughtUp = await tx((sql) => advanceWorld(sql));
    expect(caughtUp.opened).toBe(1);
    const openNow = await db.query<{ count: number }>(
      "select count(*)::int as count from world_events where event_type = 'work_bulletin' and status = 'active'",
    );
    expect(openNow.rows[0]?.count).toBe(1);
    const notFrance = await db.query<{ count: number }>("select count(*)::int as count from world_events where country_id = $1", [emptyId]);
    expect(notFrance.rows[0]?.count).toBe(0);

    await expect(tx((sql) => acceptMission(sql, otherUserId, "bulletin-shift"))).rejects.toThrow(/No work bulletin/);
    await tx((sql) => acceptMission(sql, userId, "bulletin-shift"));
    const accepted = await loadWorldBoard(asSql(db), userId);
    expect(accepted.events.some((event) => event.status === "active" && event.contractAccepted)).toBe(true);
    await db.query(
      `insert into work_shifts (business_id, character_id, kind, gross, detail)
       values ($1, $2, 'service', 20, 'A shift for the open bulletin contract.')`,
      [businessId, characterId],
    );
    await tx(async (sql) => {
      await recordWorkShift(sql, userId);
      await recordShiftBulletin(sql, userId);
    });
    const contract = await db.query<{ status: string }>(
      "select status from character_missions where character_id = $1 and mission_id = 'bulletin-shift'",
      [characterId],
    );
    expect(contract.rows[0]?.status).toBe("completed");
    const missionPay = await db.query<{ currency: number }>(
      "select currency_awarded as currency from progression_events where character_id = $1 and source_key like 'mission:bulletin-shift:%'",
      [characterId],
    );
    expect(Number(missionPay.rows[0]?.currency ?? 0)).toBe(0);
    const afterContract = await db.query<{ currency: number }>("select currency from characters where id = $1", [characterId]);
    expect(Number(afterContract.rows[0]?.currency)).toBe(436);
    const bulletinPays = await db.query<{ count: number }>("select count(*)::int as count from ledger_entries where reason = 'work_bulletin'");
    expect(bulletinPays.rows[0]?.count).toBe(2);
    await expect(tx((sql) => acceptMission(sql, userId, "bulletin-shift"))).rejects.toThrow(/already has your shift/);

    await db.query(
      `update world_events
       set status = 'ended', outcome = 'met', resolved_at = now() - interval '3 days',
           starts_at = now() - interval '4 days', ends_at = now() - interval '3 days'
       where event_type = 'work_bulletin' and status = 'active'`,
    );
    const held = await db.query<{ id: string }>(
      `insert into world_events (event_key, event_type, title, detail, starts_at, ends_at, status, country_id, goal, reward)
       values ('release-be', 'work_bulletin', 'Belgium work bulletin', 'A bulletin used to release an unfinished contract.', now() - interval '1 minute', now() + interval '1 hour', 'active', $1, 1, 8)
       returning id`,
      [homeId],
    );
    await tx((sql) => acceptMission(sql, userId, "bulletin-shift"));
    await db.query(
      "update world_events set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 minute' where id = $1",
      [held.rows[0]?.id ?? ""],
    );
    await tx((sql) => advanceWorld(sql));
    const released = await db.query<{ count: number }>(
      "select count(*)::int as count from character_missions where character_id = $1 and mission_id = 'bulletin-shift' and status = 'active'",
      [characterId],
    );
    expect(released.rows[0]?.count).toBe(0);
    const unchanged = await db.query<{ currency: number }>("select currency from characters where id = $1", [characterId]);
    expect(Number(unchanged.rows[0]?.currency)).toBe(436);

    const unmet = await db.query<{ id: string }>(
      `insert into world_events (event_key, event_type, title, detail, starts_at, ends_at, status, country_id, goal, reward, progress)
       values ('unmet-ng', 'work_bulletin', 'Nigeria work bulletin', 'A closed window with no qualifying shift.', now() - interval '2 hours', now() - interval '1 minute', 'active', $1, 2, 8, 0)
       returning id`,
      [awayId],
    );
    await tx((sql) => advanceWorld(sql));
    const unmetRow = await db.query<{ outcome: string }>("select outcome from world_events where id = $1", [unmet.rows[0]?.id ?? ""]);
    expect(unmetRow.rows[0]?.outcome).toBe("unmet");

    await db.query(
      `insert into world_events (event_key, event_type, title, detail, starts_at, ends_at, status, country_id, outcome)
       values ('cancelled-be', 'note', 'Cancelled note', 'This cancelled row must stay cancelled.', now() - interval '2 hours', now() - interval '1 minute', 'cancelled', $1, 'pending')`,
      [homeId],
    );
    await tx((sql) => advanceWorld(sql));
    const cancelled = await db.query<{ status: string }>("select status from world_events where event_key = 'cancelled-be'");
    expect(cancelled.rows[0]?.status).toBe("cancelled");
  });
});
