import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { createDelivery, listUnderground, openOperation, launchOperation } from "@/lib/organizations/play";
import { createOrganization } from "@/lib/organizations/service";
import { depositTreasury } from "@/lib/organizations/treasury";
import { provisionNewCharacter } from "@/lib/progression/service";
import { advanceWorld, currencyFlows } from "@/lib/world/tick";

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

describe("world tick", () => {
  afterAll(async () => {
    await db.close();
  });

  it("resolves due work once and bounds heat decay", async () => {
    const directory = path.join(process.cwd(), "db", "migrations");
    for (const file of ["0001_foundation.sql", "0003_progression.sql", "0004_economy.sql", "0005_politics.sql", "0006_politics_gaps.sql", "0007_organizations.sql", "0008_world.sql", "0014_travel.sql", "0016_world_events.sql", "0018_city_contests.sql"]) {
      await db.exec(readFileSync(path.join(directory, file), "utf8"));
    }
    const country = await db.query<{ id: string }>(
      `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
       values ('NG', 'NGA', 'Nigeria', 'imported', 5, 5, 10) returning id`,
    );
    const countryId = country.rows[0]?.id ?? "";
    const place = await db.query<{ id: string }>(
      `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
       values (1, $1, 'Lagos', 'Lagos', 6.45, 3.4, 'P', 'PPLC', 'unreported') returning id`,
      [countryId],
    );
    const placeId = place.rows[0]?.id ?? "";
    const other = await db.query<{ id: string }>(
      `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
       values (2, $1, 'Abuja', 'Abuja', 9.07, 7.4, 'P', 'PPLC', 'unreported') returning id`,
      [countryId],
    );
    const otherId = other.rows[0]?.id ?? "";
    await db.query("insert into starting_locations (place_id, status, selected_by_rule) values ($1, 'open', 'test'), ($2, 'open', 'test')", [placeId, otherId]);
    const user = await db.query<{ id: string }>("insert into users (email, password_hash) values ('world@example.com', 'hash') returning id");
    const userId = user.rows[0]?.id ?? "";
    const characterId = await provisionNewCharacter(asSql(db), {
      userId,
      username: "world_ada",
      displayName: null,
      biography: null,
      portraitKey: "mark-1",
      countryId,
      placeId,
      specialization: "generalist",
    });
    await db.query("update characters set currency = 800, level = 2 where id = $1", [characterId]);
    const organizationId = await tx((sql) =>
      createOrganization(sql, {
        userId,
        name: "World Desk",
        tag: "WD",
        description: "A test association.",
        orgType: "trade_association",
        placeId,
        recruitment: "closed",
        visibility: "private",
        emblemKey: null,
        idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      }),
    );
    await tx((sql) => depositTreasury(sql, { userId, organizationId, amount: 20, idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2" }));
    await db.query("insert into character_underworld (character_id, planning) values ($1, 10) on conflict (character_id) do update set planning = 10", [characterId]);
    const operationId = await tx((sql) => openOperation(sql, { userId, definitionKey: "survey", placeId }));
    await tx((sql) => launchOperation(sql, { userId, operationId }));
    await db.query("update operations set completes_at = now() - interval '1 minute' where id = $1", [operationId]);

    await db.query(
      "insert into stock_holdings (holder_kind, holder_id, place_id, product_id, quantity) values ('character', $1, $2, 'sealed_crate', 1)",
      [characterId, placeId],
    );
    const listingId = await tx((sql) =>
      listUnderground(sql, { userId, placeId, productId: "sealed_crate", quantity: 1, unitPrice: 5, idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3" }),
    );
    await db.query("update underground_listings set expires_at = now() - interval '1 minute' where id = $1", [listingId]);

    await db.query(
      "insert into stock_holdings (holder_kind, holder_id, place_id, product_id, quantity) values ('character', $1, $2, 'sealed_crate', 1) on conflict (holder_kind, holder_id, place_id, product_id) do update set quantity = stock_holdings.quantity + 1",
      [characterId, placeId],
    );
    const contractId = await tx((sql) =>
      createDelivery(sql, {
        userId,
        originPlaceId: placeId,
        destinationPlaceId: otherId,
        productId: "sealed_crate",
        quantity: 1,
        payment: 8,
        idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
      }),
    );
    await db.query("update delivery_contracts set deadline = now() - interval '1 minute' where id = $1", [contractId]);
    await db.query(
      "insert into character_underworld (character_id, heat, heat_decayed_at) values ($1, 20, now() - interval '10 hours') on conflict (character_id) do update set heat = 20, heat_decayed_at = now() - interval '10 hours'",
      [characterId],
    );

    const first = await Promise.all([tx((sql) => advanceWorld(sql)), tx((sql) => advanceWorld(sql))]);
    expect(first.filter((result) => !result.skipped).length).toBeGreaterThan(0);
    const second = await tx((sql) => advanceWorld(sql));
    expect(second.failed).toBe(0);

    const rewards = await db.query<{ count: number }>("select count(*)::int as count from ledger_entries where idempotency_key = $1", [`op:${operationId}:reward`]);
    const stakes = await db.query<{ count: number }>("select count(*)::int as count from ledger_entries where idempotency_key = $1", [`op:${operationId}:stake`]);
    expect(stakes.rows[0]?.count).toBe(1);
    expect((rewards.rows[0]?.count ?? 0) <= 1).toBe(true);
    const operation = await db.query<{ status: string }>("select status from operations where id = $1", [operationId]);
    expect(["completed", "failed"]).toContain(operation.rows[0]?.status);

    const listing = await db.query<{ status: string }>("select status from underground_listings where id = $1", [listingId]);
    expect(listing.rows[0]?.status).toBe("expired");
    const stock = await db.query<{ quantity: number }>(
      "select coalesce(sum(quantity), 0)::int as quantity from stock_holdings where holder_id = $1 and product_id = 'sealed_crate'",
      [characterId],
    );
    expect(stock.rows[0]?.quantity).toBe(2);

    const delivery = await db.query<{ status: string }>("select status from delivery_contracts where id = $1", [contractId]);
    expect(delivery.rows[0]?.status).toBe("expired");
    const refunds = await db.query<{ count: number }>("select count(*)::int as count from ledger_entries where idempotency_key = $1", [`delivery:${contractId}:expire-refund`]);
    expect(refunds.rows[0]?.count).toBe(1);

    const flows = await currencyFlows(asSql(db));
    expect(flows.length).toBeGreaterThan(0);
    const heat = await db.query<{ heat: number }>("select heat from character_underworld where character_id = $1", [characterId]);
    expect(Number(heat.rows[0]?.heat)).toBeLessThan(20);
    expect(Number(heat.rows[0]?.heat)).toBeGreaterThanOrEqual(0);
  });
});
