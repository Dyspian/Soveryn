import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { EconomyError } from "@/lib/economy/errors";
import {
  buyListing,
  cancelProduction,
  completeProduction,
  foundBusiness,
  listGoods,
  moveFunds,
  openExtractionSite,
  payWages,
  postJob,
  referenceAmount,
  runExtraction,
  startProduction,
  acceptApplication,
  applyForJob,
  dispatchShipment,
  deliverShipment,
  dismissEmployee,
  performShift,
} from "@/lib/economy/service";
import { provisionNewCharacter } from "@/lib/progression/service";
import { cityTradeFacts, loadBusiness } from "@/lib/economy/queries";

const db = new PGlite();
const key = "11111111-1111-4111-8111-111111111111";

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

describe("economy", () => {
  afterAll(async () => {
    await db.close();
  });

  it("charges once, produces from inputs, sells once, extracts without changing the reference, and pays a wage once", async () => {
    const directory = path.join(process.cwd(), "db", "migrations");
    await db.exec(readFileSync(path.join(directory, "0001_foundation.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0003_progression.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0004_economy.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0005_politics.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0006_politics_gaps.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0010_work_shifts.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0012_progression_depth.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0015_skill_tree.sql"), "utf8"));
    const venezuela = await db.query<{ id: string }>(
      `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
       values ('VE', 'VEN', 'Venezuela', 'imported', 5, 5, 10) returning id`,
    );
    const belgium = await db.query<{ id: string }>(
      `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
       values ('BE', 'BEL', 'Belgium', 'imported', 5, 5, 10) returning id`,
    );
    const caracas = await db.query<{ id: string }>(
      `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
       values (1, $1, 'Caracas', 'Caracas', 10.5, -66.9, 'P', 'PPLC', 'unreported') returning id`,
      [venezuela.rows[0]?.id],
    );
    const brussels = await db.query<{ id: string }>(
      `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
       values (2, $1, 'Brussels', 'Brussels', 50.85, 4.35, 'P', 'PPLC', 'unreported') returning id`,
      [belgium.rows[0]?.id],
    );
    await db.query("insert into starting_locations (place_id, status, selected_by_rule) values ($1, 'open', 'test'), ($2, 'open', 'test')", [
      caracas.rows[0]?.id,
      brussels.rows[0]?.id,
    ]);
    const ownerUser = await db.query<{ id: string }>("insert into users (email, password_hash) values ('owner@example.com', 'hash') returning id");
    const buyerUser = await db.query<{ id: string }>("insert into users (email, password_hash) values ('buyer@example.com', 'hash') returning id");
    const ownerId = await provisionNewCharacter(asSql(db), {
      userId: ownerUser.rows[0]?.id ?? "",
      username: "owner_one",
      displayName: null,
      biography: null,
      portraitKey: "mark-1",
      countryId: venezuela.rows[0]?.id ?? "",
      placeId: caracas.rows[0]?.id ?? "",
      specialization: "industrialist",
    });
    const buyerId = await provisionNewCharacter(asSql(db), {
      userId: buyerUser.rows[0]?.id ?? "",
      username: "buyer_one",
      displayName: null,
      biography: null,
      portraitKey: "mark-2",
      countryId: belgium.rows[0]?.id ?? "",
      placeId: brussels.rows[0]?.id ?? "",
      specialization: "trader",
    });
    await db.query("update characters set currency = 1000, level = 2 where id in ($1, $2)", [ownerId, buyerId]);
    const source = await db.query<{ id: string }>(
      `insert into data_sources (slug, name, url, license, attribution) values ('test', 'Test', 'https://example.test', 'test', 'test') returning id`,
    );
    await db.query(
      `insert into resource_records (
         resource_type_id, country_id, geographic_level, metric, amount, amount_quality, unit, period_label, source_id, source_record, confidence, notes
       ) values
       ('crude_oil', $1, 'country', 'proved_reserves', 1000, 'reported', 'cubic meters', '2021', $3, 'test', 'secondary', 'fixture'),
       ('crude_oil', $2, 'country', 'proved_reserves', 0, 'reported_zero', 'cubic meters', '2021', $3, 'test', 'secondary', 'fixture')`,
      [venezuela.rows[0]?.id, belgium.rows[0]?.id, source.rows[0]?.id],
    );

    const businessId = await tx((sql) =>
      foundBusiness(sql, {
        userId: ownerUser.rows[0]?.id ?? "",
        name: "Orinoco Ledger",
        description: "A game company.",
        category: "energy",
        placeId: caracas.rows[0]?.id ?? "",
        idempotencyKey: key,
      }),
    );
    const again = await tx((sql) =>
      foundBusiness(sql, {
        userId: ownerUser.rows[0]?.id ?? "",
        name: "Orinoco Ledger",
        description: "A game company.",
        category: "energy",
        placeId: caracas.rows[0]?.id ?? "",
        idempotencyKey: key,
      }),
    );
    expect(again).toBe(businessId);
    const afterFound = await db.query<{ currency: string }>("select currency::text as currency from characters where id = $1", [ownerId]);
    expect(afterFound.rows[0]?.currency).toBe("910");
    await expect(
      tx((sql) => moveFunds(sql, { userId: buyerUser.rows[0]?.id ?? "", businessId, direction: "withdraw", amount: 10, idempotencyKey: "22222222-2222-4222-8222-222222222222" })),
    ).rejects.toBeInstanceOf(EconomyError);

    await tx((sql) => moveFunds(sql, { userId: ownerUser.rows[0]?.id ?? "", businessId, direction: "deposit", amount: 100, idempotencyKey: "33333333-3333-4333-8333-333333333333" }));
    await db.query(
      `insert into stock_holdings (holder_kind, holder_id, place_id, product_id, quantity) values ('business', $1, $2, 'crude_oil', 4)`,
      [businessId, caracas.rows[0]?.id],
    );
    const jobId = await tx((sql) => startProduction(sql, { userId: ownerUser.rows[0]?.id ?? "", businessId, recipeId: "refine_diesel" }));
    await expect(tx((sql) => completeProduction(sql, { userId: ownerUser.rows[0]?.id ?? "", jobId }))).rejects.toThrow(/still running/);
    await db.query("update production_jobs set completes_at = now() - interval '1 second' where id = $1", [jobId]);
    expect(await tx((sql) => completeProduction(sql, { userId: ownerUser.rows[0]?.id ?? "", jobId }))).toBe("completed");
    expect(await tx((sql) => completeProduction(sql, { userId: ownerUser.rows[0]?.id ?? "", jobId }))).toBe("already");
    const stock = await db.query<{ product_id: string; quantity: number }>(
      "select product_id, quantity from stock_holdings where holder_kind = 'business' and holder_id = $1 order by product_id",
      [businessId],
    );
    expect(stock.rows).toEqual([
      { product_id: "crude_oil", quantity: 2 },
      { product_id: "diesel", quantity: 1 },
    ]);
    const cancelledId = await tx((sql) => startProduction(sql, { userId: ownerUser.rows[0]?.id ?? "", businessId, recipeId: "refine_diesel" }));
    await tx((sql) => cancelProduction(sql, { userId: ownerUser.rows[0]?.id ?? "", jobId: cancelledId }));
    const restored = await db.query<{ product_id: string; quantity: number }>(
      "select product_id, quantity from stock_holdings where holder_kind = 'business' and holder_id = $1 order by product_id",
      [businessId],
    );
    expect(restored.rows).toEqual([
      { product_id: "crude_oil", quantity: 2 },
      { product_id: "diesel", quantity: 1 },
    ]);

    const listingId = await tx((sql) =>
      listGoods(sql, {
        userId: ownerUser.rows[0]?.id ?? "",
        holderKind: "business",
        holderId: businessId,
        placeId: caracas.rows[0]?.id ?? "",
        productId: "diesel",
        quantity: 1,
        unitPrice: 10,
        idempotencyKey: "44444444-4444-4444-8444-444444444444",
      }),
    );
    const bought = await Promise.allSettled([
      tx((sql) => buyListing(sql, { userId: buyerUser.rows[0]?.id ?? "", listingId })),
      tx((sql) => buyListing(sql, { userId: buyerUser.rows[0]?.id ?? "", listingId })),
    ]);
    const outcomes = bought.map((result) => (result.status === "fulfilled" ? result.value : "rejected"));
    expect(outcomes.filter((item) => item === "bought")).toHaveLength(1);
    const buyerStock = await db.query<{ quantity: number }>(
      "select quantity from stock_holdings where holder_kind = 'character' and holder_id = $1 and product_id = 'diesel'",
      [buyerId],
    );
    expect(buyerStock.rows[0]?.quantity).toBe(1);
    const businessBalance = await db.query<{ balance: string }>("select balance::text as balance from businesses where id = $1", [businessId]);
    expect(businessBalance.rows[0]?.balance).toBe("106");
    const facts = await cityTradeFacts(asSql(db), caracas.rows[0]?.id ?? "");
    expect(facts.sales.find((sale) => sale.productId === "diesel")?.unitPrice).toBe(10);
    expect(facts.supply.find((row) => row.productId === "diesel")).toBeUndefined();
    const desk = await loadBusiness(asSql(db), ownerUser.rows[0]?.id ?? "", businessId);
    const diesel = desk?.recipes.find((recipe) => recipe.id === "refine_diesel");
    expect(diesel?.outputName).toBe("Diesel");
    expect(diesel?.outputQuantity).toBe(1);
    expect(diesel?.inputLines).toEqual([{ productId: "crude_oil", name: "Crude oil", quantity: 2, held: 2 }]);

    const before = await referenceAmount(asSql(db), venezuela.rows[0]?.id ?? "", "crude_oil");
    const siteId = await tx((sql) => openExtractionSite(sql, { userId: ownerUser.rows[0]?.id ?? "", businessId, resourceTypeId: "crude_oil" }));
    expect(await tx((sql) => runExtraction(sql, { userId: ownerUser.rows[0]?.id ?? "", siteId }))).toBe(20);
    await expect(tx((sql) => runExtraction(sql, { userId: ownerUser.rows[0]?.id ?? "", siteId }))).rejects.toThrow(/needs time/);
    expect(await referenceAmount(asSql(db), venezuela.rows[0]?.id ?? "", "crude_oil")).toBe(before);
    const belgian = await tx((sql) =>
      foundBusiness(sql, {
        userId: buyerUser.rows[0]?.id ?? "",
        name: "Scheldt Power",
        description: "",
        category: "energy",
        placeId: brussels.rows[0]?.id ?? "",
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
      }),
    );
    await expect(tx((sql) => openExtractionSite(sql, { userId: buyerUser.rows[0]?.id ?? "", businessId: belgian, resourceTypeId: "crude_oil" }))).rejects.toThrow(/No positive sourced reserve/);

    const postingId = await tx((sql) => postJob(sql, { userId: ownerUser.rows[0]?.id ?? "", businessId, title: "Night clerk", wage: 12, skillId: null, minSkillLevel: 0 }));
    await tx((sql) => applyForJob(sql, { userId: buyerUser.rows[0]?.id ?? "", postingId }));
    const application = await db.query<{ id: string }>("select id from job_applications where posting_id = $1", [postingId]);
    await tx((sql) => acceptApplication(sql, { userId: ownerUser.rows[0]?.id ?? "", applicationId: application.rows[0]?.id ?? "" }));
    expect(await tx((sql) => payWages(sql, { userId: ownerUser.rows[0]?.id ?? "", businessId }))).toBe(1);
    await expect(tx((sql) => payWages(sql, { userId: ownerUser.rows[0]?.id ?? "", businessId }))).rejects.toThrow(/already paid/);

    await tx((sql) =>
      moveFunds(sql, {
        userId: ownerUser.rows[0]?.id ?? "",
        businessId,
        direction: "deposit",
        amount: 200,
        idempotencyKey: "77777777-7777-4777-8777-777777777777",
      }),
    );
    await db.query(
      `insert into stock_holdings (holder_kind, holder_id, place_id, product_id, quantity) values ('business', $1, $2, 'crude_oil', 3)
       on conflict (holder_kind, holder_id, place_id, product_id) do update set quantity = stock_holdings.quantity + 3`,
      [businessId, caracas.rows[0]?.id],
    );
    const shipmentId = await tx((sql) =>
      dispatchShipment(sql, {
        userId: ownerUser.rows[0]?.id ?? "",
        holderKind: "business",
        holderId: businessId,
        originPlaceId: caracas.rows[0]?.id ?? "",
        destinationPlaceId: brussels.rows[0]?.id ?? "",
        productId: "crude_oil",
        quantity: 1,
        idempotencyKey: "66666666-6666-4666-8666-666666666666",
      }),
    );
    expect(await tx((sql) => deliverShipment(sql, { userId: ownerUser.rows[0]?.id ?? "", shipmentId }))).toBe("waiting");
    await db.query("update shipments set arrives_at = now() - interval '1 second' where id = $1", [shipmentId]);
    expect(await tx((sql) => deliverShipment(sql, { userId: ownerUser.rows[0]?.id ?? "", shipmentId }))).toBe("delivered");
    const arrived = await db.query<{ quantity: number }>(
      "select quantity from stock_holdings where holder_kind = 'business' and holder_id = $1 and place_id = $2 and product_id = 'crude_oil'",
      [businessId, brussels.rows[0]?.id],
    );
    expect(arrived.rows[0]?.quantity).toBe(1);
    await expect(
      tx((sql) => deliverShipment(sql, { userId: buyerUser.rows[0]?.id ?? "", shipmentId })),
    ).rejects.toThrow(/not yours/);

    const financeId = await tx((sql) =>
      foundBusiness(sql, {
        userId: ownerUser.rows[0]?.id ?? "",
        name: "Ledger Office",
        description: "A finance firm.",
        category: "finance",
        placeId: caracas.rows[0]?.id ?? "",
        idempotencyKey: "88888888-8888-4888-8888-888888888888",
      }),
    );
    await expect(tx((sql) => openExtractionSite(sql, { userId: ownerUser.rows[0]?.id ?? "", businessId: financeId, resourceTypeId: "crude_oil" }))).rejects.toThrow(/Only mining/);
    const ownerShift = await tx((sql) => performShift(sql, { userId: ownerUser.rows[0]?.id ?? "", businessId: financeId }));
    expect(ownerShift.gross).toBe(20);
    expect(ownerShift.wageState).toBe("none");
    await expect(tx((sql) => performShift(sql, { userId: ownerUser.rows[0]?.id ?? "", businessId: financeId }))).rejects.toThrow(/cooldown/);
    await expect(tx((sql) => performShift(sql, { userId: buyerUser.rows[0]?.id ?? "", businessId: financeId }))).rejects.toThrow(/hires you/);

    const employed = await db.query<{ id: string }>("select id from employments where business_id = $1 and status = 'active'", [businessId]);
    await tx((sql) => dismissEmployee(sql, { userId: ownerUser.rows[0]?.id ?? "", employmentId: employed.rows[0]?.id ?? "" }));
    const financePosting = await tx((sql) => postJob(sql, { userId: ownerUser.rows[0]?.id ?? "", businessId: financeId, title: "Clerk", wage: 8, skillId: null, minSkillLevel: 0 }));
    await tx((sql) => applyForJob(sql, { userId: buyerUser.rows[0]?.id ?? "", postingId: financePosting }));
    const financeApplication = await db.query<{ id: string }>("select id from job_applications where posting_id = $1", [financePosting]);
    await tx((sql) => acceptApplication(sql, { userId: ownerUser.rows[0]?.id ?? "", applicationId: financeApplication.rows[0]?.id ?? "" }));
    const beforeWage = await db.query<{ currency: string }>("select currency::text as currency from characters where user_id = $1", [buyerUser.rows[0]?.id]);
    const beforeBalance = await db.query<{ balance: string }>("select balance::text as balance from businesses where id = $1", [financeId]);
    const workerShift = await tx((sql) => performShift(sql, { userId: buyerUser.rows[0]?.id ?? "", businessId: financeId }));
    expect(workerShift.wageState).toBe("paid");
    expect(workerShift.wagePaid).toBe(8);
    const afterWage = await db.query<{ currency: string }>("select currency::text as currency from characters where user_id = $1", [buyerUser.rows[0]?.id]);
    const afterBalance = await db.query<{ balance: string }>("select balance::text as balance from businesses where id = $1", [financeId]);
    expect(Number(afterWage.rows[0]?.currency)).toBe(Number(beforeWage.rows[0]?.currency) + 8);
    expect(Number(afterBalance.rows[0]?.balance)).toBe(Number(beforeBalance.rows[0]?.balance) + 20 - 8);
  });

  it("credits a skill-shaped service fee once and completes an economic contract once", async () => {
    const directory = path.join(process.cwd(), "db", "migrations");
    await db.exec(readFileSync(path.join(directory, "0013_economy_depth.sql"), "utf8"));
    const buyer = await db.query<{ id: string; character_id: string }>(
      "select u.id, c.id as character_id from users u join characters c on c.user_id = u.id where c.username = 'buyer_one'",
    );
    const owner = await db.query<{ id: string; character_id: string }>(
      "select u.id, c.id as character_id from users u join characters c on c.user_id = u.id where c.username = 'owner_one'",
    );
    const finance = await db.query<{ id: string }>("select id from businesses where name = 'Ledger Office'");
    await db.query("update character_skills set level = 2 where character_id = $1 and skill_id = 'finance'", [buyer.rows[0]?.character_id]);
    await db.query("update work_shifts set created_at = now() - interval '5 minutes'");
    const before = await db.query<{ balance: string }>("select balance::text as balance from businesses where id = $1", [finance.rows[0]?.id]);
    const shift = await tx((sql) => performShift(sql, { userId: buyer.rows[0]?.id ?? "", businessId: finance.rows[0]?.id ?? "" }));
    expect(shift.gross).toBe(22);
    const after = await db.query<{ balance: string }>("select balance::text as balance from businesses where id = $1", [finance.rows[0]?.id]);
    expect(Number(after.rows[0]?.balance)).toBe(Number(before.rows[0]?.balance) + 22);

    const energy = await db.query<{ id: string; place_id: string }>("select id, place_id from businesses where name = 'Orinoco Ledger'");
    const jobId = await tx((sql) =>
      startProduction(sql, { userId: owner.rows[0]?.id ?? "", businessId: energy.rows[0]?.id ?? "", recipeId: "refine_diesel" }),
    );
    const charged = await db.query<{ amount: string }>("select amount::text as amount from ledger_entries where idempotency_key = $1", [
      `produce:${jobId}:cost`,
    ]);
    expect(charged.rows[0]?.amount).toBe("3");
    await tx((sql) => cancelProduction(sql, { userId: owner.rows[0]?.id ?? "", jobId }));
    const refund = await db.query<{ amount: string }>("select amount::text as amount from ledger_entries where idempotency_key = $1", [
      `produce:${jobId}:refund:cost`,
    ]);
    expect(refund.rows[0]?.amount).toBe("3");

    const { acceptMission } = await import("@/lib/progression/service");
    await tx((sql) => acceptMission(sql, buyer.rows[0]?.id ?? "", "contract-sale"));
    const diesel = await db.query<{ place_id: string }>(
      "select place_id from stock_holdings where holder_kind = 'character' and holder_id = $1 and product_id = 'diesel'",
      [buyer.rows[0]?.character_id],
    );
    const listingId = await tx((sql) =>
      listGoods(sql, {
        userId: buyer.rows[0]?.id ?? "",
        holderKind: "character",
        holderId: buyer.rows[0]?.character_id ?? "",
        placeId: diesel.rows[0]?.place_id ?? "",
        productId: "diesel",
        quantity: 1,
        unitPrice: 9,
        idempotencyKey: "99999999-9999-4999-8999-999999999999",
      }),
    );
    expect(await tx((sql) => buyListing(sql, { userId: owner.rows[0]?.id ?? "", listingId }))).toBe("bought");
    const sale = await db.query<{ status: string; events: string }>(
      `select cm.status,
              (select count(*) from progression_events e where e.character_id = c.id and e.source_key = 'mission:contract-sale:1')::text as events
       from characters c
       join character_missions cm on cm.character_id = c.id
       where c.user_id = $1 and cm.mission_id = 'contract-sale'`,
      [buyer.rows[0]?.id],
    );
    expect(sale.rows[0]?.status).toBe("completed");
    expect(sale.rows[0]?.events).toBe("1");
    const { recordEconomyProgress } = await import("@/lib/progression/service");
    await tx((sql) => recordEconomyProgress(sql, buyer.rows[0]?.character_id ?? "", "market_sold"));
    const saleAgain = await db.query<{ events: string }>(
      `select count(*)::text as events from progression_events e
       join characters c on c.id = e.character_id
       where c.user_id = $1 and e.source_key like 'mission:contract-sale:%'`,
      [buyer.rows[0]?.id],
    );
    expect(saleAgain.rows[0]?.events).toBe("1");
  });
});
