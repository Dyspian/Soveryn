import { createHash } from "node:crypto";
import type { Sql } from "@/lib/db";
import { nodeBonus, recordEconomyProgress } from "@/lib/progression/service";
import { distanceKm, simulatedTransit } from "@/lib/economy/distance";
import { asCount, EconomyError, wholeAmount } from "@/lib/economy/errors";
import { marketFee } from "@/lib/economy/fees";
import { claimRequest, finishRequest } from "@/lib/economy/idempotency";

type Party = { kind: "character" | "business" | "system" | "party" | "government" | "organization"; id: string | null };

type CharacterRow = { id: string; user_id: string; level: number; currency: number | string };
type BusinessRow = {
  id: string;
  owner_character_id: string;
  name: string;
  category: string;
  country_id: string;
  place_id: string;
  balance: number | string;
  status: string;
};

async function rule(sql: Sql, key: string): Promise<number> {
  const rows = await sql.query<{ amount: number | string }>("select amount from game_rules where key = $1", [key]);
  const amount = Number(rows[0]?.amount);
  if (!Number.isFinite(amount)) throw new EconomyError("A required game rule is missing.");
  return amount;
}

async function optionalRule(sql: Sql, key: string): Promise<number | null> {
  const rows = await sql.query<{ amount: number | string }>("select amount from game_rules where key = $1", [key]);
  if (!rows[0]) return null;
  const amount = Number(rows[0].amount);
  return Number.isFinite(amount) ? amount : null;
}

export const SERVICE_SHIFT_SKILL: Record<string, string> = {
  trade: "negotiation",
  logistics: "logistics",
  finance: "finance",
  construction: "management",
  hospitality: "public_speaking",
};

export function serviceSkillBonus(level: number, perLevel: number | null, cap: number | null): number {
  if (perLevel == null || cap == null || level <= 0 || perLevel <= 0 || cap <= 0) return 0;
  return Math.min(cap, level * perLevel);
}

export function productionOperatingCost(catalog: number, productionLevel: number, perLevel: number | null, extraReduction = 0): number {
  const extra = Math.max(0, extraReduction);
  if (catalog <= 1) return catalog;
  const skillReduction = perLevel == null || perLevel <= 0 || productionLevel <= 0 ? 0 : Math.min(catalog - 1, productionLevel * perLevel);
  return Math.max(1, catalog - skillReduction - extra);
}

export { marketFee };

export const WORK_SHIFT_COOLDOWN_FLOOR = 60;
export const WORK_SHIFT_COOLDOWN_CEILING = 86_400;

export function boundedWorkShiftCooldown(stored: number): number {
  if (!Number.isInteger(stored)) return WORK_SHIFT_COOLDOWN_FLOOR;
  return Math.min(WORK_SHIFT_COOLDOWN_CEILING, Math.max(WORK_SHIFT_COOLDOWN_FLOOR, stored));
}

async function audit(sql: Sql, actorUserId: string | null, action: string, entityId: string | null, payload: Record<string, unknown>) {
  await sql.query(
    `insert into audit_events (actor_user_id, action, entity_type, entity_id, payload)
     values ($1, $2, 'economy', $3, $4::jsonb)`,
    [actorUserId, action, entityId, JSON.stringify(payload)],
  );
}

export async function lockCharacter(sql: Sql, userId: string): Promise<CharacterRow> {
  const rows = await sql.query<CharacterRow>(
    "select id, user_id, level, currency from characters where user_id = $1 for update",
    [userId],
  );
  const row = rows[0];
  if (!row) throw new EconomyError("Create a character before using the economy.");
  return row;
}

async function lockCharacterById(sql: Sql, characterId: string): Promise<CharacterRow> {
  const rows = await sql.query<CharacterRow>(
    "select id, user_id, level, currency from characters where id = $1 for update",
    [characterId],
  );
  const row = rows[0];
  if (!row) throw new EconomyError("That character is not available.");
  return row;
}

async function lockBusiness(sql: Sql, businessId: string): Promise<BusinessRow> {
  const rows = await sql.query<BusinessRow>(
    `select id, owner_character_id, name, category, country_id, place_id, balance, status
     from businesses where id = $1 for update`,
    [businessId],
  );
  const row = rows[0];
  if (!row || row.status !== "active") throw new EconomyError("That business is not open.");
  return row;
}

async function lockOwnedBusiness(sql: Sql, businessId: string, ownerCharacterId: string): Promise<BusinessRow> {
  const row = await lockBusiness(sql, businessId);
  if (row.owner_character_id !== ownerCharacterId) throw new EconomyError("That business is not yours to manage.");
  return row;
}

async function activeEmployment(sql: Sql, businessId: string, characterId: string): Promise<{ id: string; wage: number } | null> {
  const rows = await sql.query<{ id: string; wage: number }>(
    "select id, wage from employments where business_id = $1 and character_id = $2 and status = 'active'",
    [businessId, characterId],
  );
  return rows[0] ?? null;
}

async function applyBalance(sql: Sql, party: Party, delta: number): Promise<void> {
  if (party.kind === "system") return;
  if (!party.id) throw new EconomyError("That account is incomplete.");
  if (party.kind === "character") {
    const rows = await sql.query<{ id: string }>(
      delta >= 0
        ? "update characters set currency = currency + $1 where id = $2 returning id"
        : "update characters set currency = currency - $1 where id = $2 and currency >= $1 returning id",
      [Math.abs(delta), party.id],
    );
    if (rows.length === 0) throw new EconomyError("The character does not have enough currency.");
    return;
  }
  if (party.kind === "business") {
    const rows = await sql.query<{ id: string }>(
      delta >= 0
        ? "update businesses set balance = balance + $1 where id = $2 and status = 'active' returning id"
        : "update businesses set balance = balance - $1 where id = $2 and status = 'active' and balance >= $1 returning id",
      [Math.abs(delta), party.id],
    );
    if (rows.length === 0) throw new EconomyError("The business does not have enough funds.");
    return;
  }
  if (party.kind === "party") {
    const rows = await sql.query<{ id: string }>(
      delta >= 0
        ? "update parties set balance = balance + $1 where id = $2 and status = 'active' returning id"
        : "update parties set balance = balance - $1 where id = $2 and status = 'active' and balance >= $1 returning id",
      [Math.abs(delta), party.id],
    );
    if (rows.length === 0) throw new EconomyError("The party treasury does not have enough funds.");
    return;
  }
  if (party.kind === "organization") {
    const rows = await sql.query<{ id: string }>(
      delta >= 0
        ? "update organizations set balance = balance + $1 where id = $2 and status = 'active' returning id"
        : "update organizations set balance = balance - $1 where id = $2 and status = 'active' and balance >= $1 returning id",
      [Math.abs(delta), party.id],
    );
    if (rows.length === 0) throw new EconomyError("The organization treasury does not have enough funds.");
    return;
  }
  await sql.query(
    "insert into government_accounts (country_id, balance) values ($1, 0) on conflict (country_id) do nothing",
    [party.id],
  );
  const rows = await sql.query<{ country_id: string }>(
    delta >= 0
      ? "update government_accounts set balance = balance + $1 where country_id = $2 returning country_id"
      : "update government_accounts set balance = balance - $1 where country_id = $2 and balance >= $1 returning country_id",
    [Math.abs(delta), party.id],
  );
  if (rows.length === 0) throw new EconomyError("The government treasury does not have enough funds.");
}

async function lockParty(sql: Sql, party: Party): Promise<void> {
  if (party.kind === "character" && party.id) await lockCharacterById(sql, party.id);
  if (party.kind === "business" && party.id) {
    const rows = await sql.query<{ id: string }>("select id from businesses where id = $1 and status = 'active' for update", [party.id]);
    if (rows.length === 0) throw new EconomyError("That business account is not active.");
  }
  if (party.kind === "party" && party.id) {
    const rows = await sql.query<{ id: string }>("select id from parties where id = $1 and status = 'active' for update", [party.id]);
    if (rows.length === 0) throw new EconomyError("That party treasury is not active.");
  }
  if (party.kind === "organization" && party.id) {
    const rows = await sql.query<{ id: string }>("select id from organizations where id = $1 and status = 'active' for update", [party.id]);
    if (rows.length === 0) throw new EconomyError("That organization treasury is not active.");
  }
  if (party.kind === "government" && party.id) {
    await sql.query("insert into government_accounts (country_id, balance) values ($1, 0) on conflict (country_id) do nothing", [party.id]);
    await sql.query("select balance from government_accounts where country_id = $1 for update", [party.id]);
  }
}

export async function transfer(
  sql: Sql,
  input: { from: Party; to: Party; amount: number; reason: string; idempotencyKey: string; actorUserId: string | null },
): Promise<"applied" | "replayed"> {
  const amount = wholeAmount(input.amount, "Amount");
  const existing = await sql.query<{ amount: number | string; from_kind: string; from_id: string | null; to_kind: string; to_id: string | null }>(
    "select amount, from_kind, from_id, to_kind, to_id from ledger_entries where idempotency_key = $1",
    [input.idempotencyKey],
  );
  if (existing[0]) {
    const row = existing[0];
    const same =
      asCount(row.amount) === amount &&
      row.from_kind === input.from.kind &&
      row.from_id === input.from.id &&
      row.to_kind === input.to.kind &&
      row.to_id === input.to.id;
    if (!same) throw new EconomyError("That payment key was already used for a different transfer.");
    return "replayed";
  }
  const parties = [input.from, input.to]
    .filter((party) => party.kind !== "system")
    .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  for (const party of parties) await lockParty(sql, party);
  const inserted = await sql.query<{ id: string }>(
    `insert into ledger_entries (idempotency_key, from_kind, from_id, to_kind, to_id, amount, reason, actor_user_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (idempotency_key) do nothing
     returning id`,
    [input.idempotencyKey, input.from.kind, input.from.id, input.to.kind, input.to.id, amount, input.reason, input.actorUserId],
  );
  if (inserted.length === 0) return "replayed";
  await applyBalance(sql, input.from, -amount);
  await applyBalance(sql, input.to, amount);
  const action = amount >= 10000 ? "economy.large_transfer" : "economy.transfer";
  await audit(sql, input.actorUserId, action, input.to.id ?? input.from.id, { amount, reason: input.reason, key: input.idempotencyKey });
  return "applied";
}

async function countryPolicy(sql: Sql, countryId: string, effectKey: string): Promise<number | null> {
  const rows = await sql.query<{ effect_value: number | null }>(
    `select effect_value from policy_versions
     where country_id = $1 and effect_key = $2 and effective_at <= now()
     order by effective_at desc limit 1`,
    [countryId, effectKey],
  );
  if (!rows[0] || rows[0].effect_value == null) return null;
  return Number(rows[0].effect_value);
}

export async function changeStock(
  sql: Sql,
  input: { holderKind: "character" | "business"; holderId: string; placeId: string; productId: string; delta: number; reason: string; key: string },
): Promise<void> {
  if (!Number.isSafeInteger(input.delta) || input.delta === 0) throw new EconomyError("A stock change must be a non-zero whole number.");
  const inserted = await sql.query<{ id: string }>(
    `insert into stock_movements (holder_kind, holder_id, place_id, product_id, delta, reason, idempotency_key)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (idempotency_key) do nothing
     returning id`,
    [input.holderKind, input.holderId, input.placeId, input.productId, input.delta, input.reason, input.key],
  );
  if (inserted.length === 0) return;
  if (input.delta > 0) {
    const current = await sql.query<{ quantity: number | string }>(
      `select quantity from stock_holdings
       where holder_kind = $1 and holder_id = $2 and place_id = $3 and product_id = $4
       for update`,
      [input.holderKind, input.holderId, input.placeId, input.productId],
    );
    const product = await sql.query<{ stack_limit: number }>("select stack_limit from products where id = $1", [input.productId]);
    const limit = product[0]?.stack_limit ?? 0;
    const next = (current[0] ? asCount(current[0].quantity) : 0) + input.delta;
    if (next > limit) throw new EconomyError("That stock would pass the stack limit.");
    await sql.query(
      `insert into stock_holdings (holder_kind, holder_id, place_id, product_id, quantity)
       values ($1, $2, $3, $4, $5)
       on conflict (holder_kind, holder_id, place_id, product_id)
       do update set quantity = stock_holdings.quantity + excluded.quantity`,
      [input.holderKind, input.holderId, input.placeId, input.productId, input.delta],
    );
    return;
  }
  const removed = Math.abs(input.delta);
  const deleted = await sql.query<{ holder_id: string }>(
    `delete from stock_holdings
     where holder_kind = $1 and holder_id = $2 and place_id = $3 and product_id = $4 and quantity = $5
     returning holder_id`,
    [input.holderKind, input.holderId, input.placeId, input.productId, removed],
  );
  if (deleted.length > 0) return;
  const rows = await sql.query<{ quantity: number | string }>(
    `update stock_holdings set quantity = quantity - $1
     where holder_kind = $2 and holder_id = $3 and place_id = $4 and product_id = $5 and quantity > $1
     returning quantity`,
    [removed, input.holderKind, input.holderId, input.placeId, input.productId],
  );
  if (rows.length === 0) throw new EconomyError("There is not enough stock in that city.");
}

async function openPlace(sql: Sql, placeId: string): Promise<{ id: string; country_id: string; latitude: number; longitude: number; name: string }> {
  const rows = await sql.query<{ id: string; country_id: string; latitude: number | string; longitude: number | string; name: string }>(
    `select p.id, p.country_id, p.latitude, p.longitude, p.name
     from places p
     join starting_locations s on s.place_id = p.id
     where p.id = $1 and s.status <> 'disabled'`,
    [placeId],
  );
  const row = rows[0];
  if (!row) throw new EconomyError("Choose an available starting city.");
  return { ...row, latitude: Number(row.latitude), longitude: Number(row.longitude) };
}

function assertKey(value: string): void {
  if (!/^[0-9a-f-]{16,80}$/i.test(value)) throw new EconomyError("Refresh the page and submit the action again.");
}

function requestHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function foundBusiness(
  sql: Sql,
  input: { userId: string; name: string; description: string; category: string; placeId: string; idempotencyKey: string },
): Promise<string> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z0-9][A-Za-z0-9 '&-]{1,38}[A-Za-z0-9]$/.test(name)) {
    throw new EconomyError("Use 3 to 40 letters, numbers, spaces, apostrophes, or hyphens.");
  }
  assertKey(input.idempotencyKey);
  const description = input.description.trim();
  if (description.length > 400) throw new EconomyError("The description is too long.");
  const character = await lockCharacter(sql, input.userId);
  const key = `${character.id}:found:${input.idempotencyKey}`;
  const claim = await claimRequest(sql, key, character.id, requestHash({ name, description, category: input.category, placeId: input.placeId }));
  if (claim.replay) return claim.result;
  const minimum = await rule(sql, "business_min_level");
  if (character.level < minimum) throw new EconomyError(`A business can be founded from level ${minimum}.`);
  const active = await sql.query<{ count: number | string }>(
    "select count(*)::int as count from businesses where owner_character_id = $1 and status = 'active'",
    [character.id],
  );
  if (asCount(active[0]?.count) >= (await rule(sql, "business_max_active"))) {
    throw new EconomyError("The active business limit has been reached.");
  }
  const category = await sql.query<{ startup_cost: number }>("select startup_cost from business_categories where id = $1", [input.category]);
  const cost = category[0]?.startup_cost;
  if (!cost) throw new EconomyError("That business category is not available.");
  const place = await openPlace(sql, input.placeId);
  const duplicate = await sql.query<{ id: string }>(
    "select id from businesses where owner_character_id = $1 and lower(name) = lower($2)",
    [character.id, name],
  );
  if (duplicate.length > 0) throw new EconomyError("You already have a business with that name.");
  const created = await sql.query<{ id: string }>(
    `insert into businesses (owner_character_id, name, description, category, country_id, place_id)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [character.id, name, description, input.category, place.country_id, place.id],
  );
  const businessId = created[0]?.id;
  if (!businessId) throw new EconomyError("The business could not be saved.");
  await transfer(sql, {
    from: { kind: "character", id: character.id },
    to: { kind: "system", id: null },
    amount: cost,
    reason: "business_startup",
    idempotencyKey: `${key}:startup`,
    actorUserId: input.userId,
  });
  await finishRequest(sql, key, businessId);
  await audit(sql, input.userId, "economy.business_create", businessId, { name, category: input.category, placeId: place.id });
  return businessId;
}

export async function moveFunds(
  sql: Sql,
  input: { userId: string; businessId: string; direction: "deposit" | "withdraw"; amount: number; idempotencyKey: string },
): Promise<void> {
  const amount = wholeAmount(input.amount, "Amount");
  assertKey(input.idempotencyKey);
  const character = await lockCharacter(sql, input.userId);
  const key = `${character.id}:move:${input.idempotencyKey}`;
  const claim = await claimRequest(sql, key, character.id, requestHash(input));
  if (claim.replay) return;
  await lockOwnedBusiness(sql, input.businessId, character.id);
  const from = input.direction === "deposit" ? { kind: "character" as const, id: character.id } : { kind: "business" as const, id: input.businessId };
  const to = input.direction === "deposit" ? { kind: "business" as const, id: input.businessId } : { kind: "character" as const, id: character.id };
  await transfer(sql, { from, to, amount, reason: input.direction, idempotencyKey: `${key}:funds`, actorUserId: input.userId });
  await finishRequest(sql, key, "ok");
}

export async function startProduction(sql: Sql, input: { userId: string; businessId: string; recipeId: string }): Promise<string> {
  const character = await lockCharacter(sql, input.userId);
  const business = await lockOwnedBusiness(sql, input.businessId, character.id);
  const running = await sql.query<{ count: number | string }>(
    "select count(*)::int as count from production_jobs where business_id = $1 and status = 'running'",
    [business.id],
  );
  if (asCount(running[0]?.count) >= (await rule(sql, "production_queue_limit"))) {
    throw new EconomyError("The production queue is full.");
  }
  const recipes = await sql.query<{ id: string; duration_seconds: number; operating_cost: number; allowed_categories: string }>(
    "select id, duration_seconds, operating_cost, allowed_categories from recipes where id = $1",
    [input.recipeId],
  );
  const recipe = recipes[0];
  if (!recipe || !recipe.allowed_categories.split(",").includes(business.category)) {
    throw new EconomyError("This business cannot run that recipe.");
  }
  const inputs = await sql.query<{ product_id: string; quantity: number }>(
    "select product_id, quantity from recipe_inputs where recipe_id = $1",
    [recipe.id],
  );
  const production = await sql.query<{ level: number }>(
    "select level from character_skills where character_id = $1 and skill_id = 'production'",
    [character.id],
  );
  const chargedCost = productionOperatingCost(
    Number(recipe.operating_cost),
    Number(production[0]?.level ?? 0),
    await optionalRule(sql, "production_cost_reduction_per_level"),
    await nodeBonus(sql, character.id, "production_cost_flat", { kind: "general" }),
  );
  const job = await sql.query<{ id: string }>(
    `insert into production_jobs (business_id, recipe_id, status, completes_at)
     values ($1, $2, 'running', now() + ($3 * interval '1 second'))
     returning id`,
    [business.id, recipe.id, recipe.duration_seconds],
  );
  const jobId = job[0]?.id;
  if (!jobId) throw new EconomyError("Production could not be queued.");
  if (chargedCost > 0) {
    await transfer(sql, {
      from: { kind: "business", id: business.id },
      to: { kind: "system", id: null },
      amount: chargedCost,
      reason: "production_cost",
      idempotencyKey: `produce:${jobId}:cost`,
      actorUserId: input.userId,
    });
  }
  for (const item of inputs) {
    await changeStock(sql, {
      holderKind: "business",
      holderId: business.id,
      placeId: business.place_id,
      productId: item.product_id,
      delta: -item.quantity,
      reason: "production_input",
      key: `produce:${jobId}:in:${item.product_id}`,
    });
  }
  return jobId;
}

export async function completeProduction(sql: Sql, input: { userId: string; jobId: string }): Promise<string> {
  const character = await lockCharacter(sql, input.userId);
  const jobs = await sql.query<{ id: string; business_id: string; recipe_id: string; status: string; ready: boolean }>(
    `select j.id, j.business_id, j.recipe_id, j.status, j.completes_at <= now() as ready
     from production_jobs j
     join businesses b on b.id = j.business_id
     where j.id = $1
       and (
         b.owner_character_id = $2
         or exists (
           select 1 from employments e
           where e.business_id = b.id and e.character_id = $2 and e.status = 'active'
         )
       )
     for update of j`,
    [input.jobId, character.id],
  );
  const job = jobs[0];
  if (!job) throw new EconomyError("That production job is not yours.");
  if (job.status === "completed") return "already";
  if (job.status !== "running") throw new EconomyError("That production job is not running.");
  if (!job.ready) throw new EconomyError("That production job is still running.");
  const business = await lockBusiness(sql, job.business_id);
  const recipe = await sql.query<{ output_product_id: string; output_quantity: number }>(
    "select output_product_id, output_quantity from recipes where id = $1",
    [job.recipe_id],
  );
  const output = recipe[0];
  if (!output) throw new EconomyError("That recipe is no longer available.");
  const updated = await sql.query<{ id: string }>(
    "update production_jobs set status = 'completed' where id = $1 and status = 'running' returning id",
    [job.id],
  );
  if (updated.length === 0) return "already";
  await changeStock(sql, {
    holderKind: "business",
    holderId: business.id,
    placeId: business.place_id,
    productId: output.output_product_id,
    delta: output.output_quantity,
    reason: "production_output",
    key: `produce:${job.id}:out`,
  });
  await recordEconomyProgress(sql, character.id, "production_finished");
  return "completed";
}

export async function cancelProduction(sql: Sql, input: { userId: string; jobId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const jobs = await sql.query<{ id: string; business_id: string; recipe_id: string; status: string }>(
    `select j.id, j.business_id, j.recipe_id, j.status
     from production_jobs j
     join businesses b on b.id = j.business_id
     where j.id = $1 and b.owner_character_id = $2
     for update of j`,
    [input.jobId, character.id],
  );
  const job = jobs[0];
  if (!job) throw new EconomyError("That production job is not yours.");
  if (job.status !== "running") throw new EconomyError("That production job is not running.");
  const business = await lockOwnedBusiness(sql, job.business_id, character.id);
  const updated = await sql.query<{ id: string }>("update production_jobs set status = 'cancelled' where id = $1 and status = 'running' returning id", [job.id]);
  if (updated.length === 0) throw new EconomyError("That production job is not running.");
  const charged = await sql.query<{ amount: number | string }>(
    "select amount from ledger_entries where idempotency_key = $1",
    [`produce:${job.id}:cost`],
  );
  const inputs = await sql.query<{ product_id: string; quantity: number }>("select product_id, quantity from recipe_inputs where recipe_id = $1", [job.recipe_id]);
  for (const item of inputs) {
    await changeStock(sql, {
      holderKind: "business",
      holderId: business.id,
      placeId: business.place_id,
      productId: item.product_id,
      delta: item.quantity,
      reason: "production_cancel",
      key: `produce:${job.id}:refund:${item.product_id}`,
    });
  }
  const cost = Number(charged[0]?.amount ?? 0);
  if (cost > 0) {
    await transfer(sql, {
      from: { kind: "system", id: null },
      to: { kind: "business", id: business.id },
      amount: cost,
      reason: "production_refund",
      idempotencyKey: `produce:${job.id}:refund:cost`,
      actorUserId: input.userId,
    });
  }
}

export async function openExtractionSite(sql: Sql, input: { userId: string; businessId: string; resourceTypeId: string }): Promise<string> {
  const character = await lockCharacter(sql, input.userId);
  const business = await lockOwnedBusiness(sql, input.businessId, character.id);
  const allowed = business.category === "mining" || business.category === "energy" || business.category === "agriculture";
  if (!allowed) throw new EconomyError("Only mining, energy, or agriculture businesses can extract.");
  const types = await sql.query<{ product_id: string | null }>("select product_id from resource_types where id = $1", [input.resourceTypeId]);
  if (!types[0]?.product_id) throw new EconomyError("That resource has no game product yet.");
  const records = await sql.query<{ id: string }>(
    `select id from resource_records
     where country_id = $1 and resource_type_id = $2 and metric = 'proved_reserves' and amount_quality = 'reported' and amount > 0
     limit 1`,
    [business.country_id, input.resourceTypeId],
  );
  if (records.length === 0) {
    throw new EconomyError("No positive sourced reserve is recorded for that resource in this country.");
  }
  const inserted = await sql.query<{ id: string }>(
    `insert into extraction_sites (business_id, resource_type_id, country_id, simulated_remaining, batch_size, operating_cost)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (business_id, resource_type_id) do nothing
     returning id`,
    [
      business.id,
      input.resourceTypeId,
      business.country_id,
      await rule(sql, "extraction_starting_units"),
      await rule(sql, "extraction_batch"),
      await rule(sql, "extraction_cost"),
    ],
  );
  if (inserted[0]?.id) return inserted[0].id;
  const existing = await sql.query<{ id: string }>(
    "select id from extraction_sites where business_id = $1 and resource_type_id = $2",
    [business.id, input.resourceTypeId],
  );
  if (!existing[0]) throw new EconomyError("The extraction site could not be opened.");
  return existing[0].id;
}

export async function runExtraction(sql: Sql, input: { userId: string; siteId: string }): Promise<number> {
  const character = await lockCharacter(sql, input.userId);
  const sites = await sql.query<{
    id: string;
    business_id: string;
    resource_type_id: string;
    simulated_remaining: number;
    batch_size: number;
    operating_cost: number;
    cooling: boolean;
    status: string;
    product_id: string | null;
    place_id: string;
    country_id: string;
    owner_character_id: string;
  }>(
    `select s.id, s.business_id, s.resource_type_id, s.simulated_remaining, s.batch_size, s.operating_cost,
            s.next_available_at > now() as cooling, s.status, t.product_id, b.place_id, b.country_id, b.owner_character_id
     from extraction_sites s
     join businesses b on b.id = s.business_id
     join resource_types t on t.id = s.resource_type_id
     where s.id = $1
     for update of s`,
    [input.siteId],
  );
  const site = sites[0];
  if (!site) throw new EconomyError("That extraction site is not yours.");
  const employed = await activeEmployment(sql, site.business_id, character.id);
  if (site.owner_character_id !== character.id && !employed) throw new EconomyError("That extraction site is not yours.");
  if (site.status !== "active") throw new EconomyError("That site is not producing.");
  if (site.cooling) throw new EconomyError("That site needs time before the next run.");
  if (!site.product_id) throw new EconomyError("That resource has no game product.");
  if (site.simulated_remaining <= 0) throw new EconomyError("The simulated deposit is depleted.");
  const quantity = Math.min(site.batch_size, site.simulated_remaining);
  const stamp = await sql.query<{ tick: string }>("select gen_random_uuid()::text as tick");
  const tick = stamp[0]?.tick;
  if (!tick) throw new EconomyError("The extraction run could not be identified.");
  const reference = await sql.query<{ amount: string }>(
    "select amount::text as amount from resource_records where country_id = (select country_id from businesses where id = $1) and resource_type_id = $2",
    [site.business_id, site.resource_type_id],
  );
  const before = reference[0]?.amount ?? null;
  const policyCost = await countryPolicy(sql, site.country_id, "extraction_cost");
  await transfer(sql, {
    from: { kind: "business", id: site.business_id },
    to: { kind: "system", id: null },
    amount: policyCost ?? site.operating_cost,
    reason: "extraction_cost",
    idempotencyKey: `extract:${site.id}:${tick}:cost`,
    actorUserId: input.userId,
  });
  await changeStock(sql, {
    holderKind: "business",
    holderId: site.business_id,
    placeId: site.place_id,
    productId: site.product_id,
    delta: quantity,
    reason: "extraction",
    key: `extract:${site.id}:${tick}`,
  });
  await sql.query(
    `insert into extraction_events (site_id, quantity, idempotency_key) values ($1, $2, $3)`,
    [site.id, quantity, `extract:${site.id}:${tick}`],
  );
  const cooldown = await rule(sql, "extraction_cooldown_seconds");
  await sql.query(
    `update extraction_sites
     set simulated_remaining = simulated_remaining - $2,
         status = case when simulated_remaining - $2 = 0 then 'depleted' else status end,
         next_available_at = now() + ($3 * interval '1 second')
     where id = $1`,
    [site.id, quantity, cooldown],
  );
  const after = await sql.query<{ amount: string }>(
    "select amount::text as amount from resource_records where country_id = (select country_id from businesses where id = $1) and resource_type_id = $2",
    [site.business_id, site.resource_type_id],
  );
  if ((after[0]?.amount ?? null) !== before) throw new EconomyError("Reference statistics must not change when the game extracts.");
  return quantity;
}

export async function listGoods(
  sql: Sql,
  input: { userId: string; holderKind: "character" | "business"; holderId: string; placeId: string; productId: string; quantity: number; unitPrice: number; idempotencyKey: string },
): Promise<string> {
  const quantity = wholeAmount(input.quantity, "Quantity");
  const unitPrice = wholeAmount(input.unitPrice, "Price");
  assertKey(input.idempotencyKey);
  if (quantity > (await rule(sql, "max_listing_quantity")) || unitPrice > (await rule(sql, "max_unit_price"))) {
    throw new EconomyError("That listing is outside the configured limits.");
  }
  const character = await lockCharacter(sql, input.userId);
  const key = `${character.id}:list:${input.idempotencyKey}`;
  const claim = await claimRequest(sql, key, character.id, requestHash(input));
  if (claim.replay) return claim.result;
  if (input.holderKind === "business") await lockOwnedBusiness(sql, input.holderId, character.id);
  else if (input.holderId !== character.id) throw new EconomyError("You can only sell your own stock.");
  await openPlace(sql, input.placeId);
  const listing = await sql.query<{ id: string }>(
    `insert into market_listings (seller_kind, seller_id, place_id, product_id, quantity, unit_price, idempotency_key)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [input.holderKind, input.holderId, input.placeId, input.productId, quantity, unitPrice, key],
  );
  const listingId = listing[0]?.id;
  if (!listingId) throw new EconomyError("The listing could not be saved.");
  await changeStock(sql, {
    holderKind: input.holderKind,
    holderId: input.holderId,
    placeId: input.placeId,
    productId: input.productId,
    delta: -quantity,
    reason: "market_escrow",
    key: `list:${listingId}`,
  });
  await finishRequest(sql, key, listingId);
  return listingId;
}

export async function cancelListing(sql: Sql, input: { userId: string; listingId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; seller_kind: "character" | "business"; seller_id: string; place_id: string; product_id: string; quantity: number; status: string }>(
    "select id, seller_kind, seller_id, place_id, product_id, quantity, status from market_listings where id = $1 for update",
    [input.listingId],
  );
  const listing = rows[0];
  if (!listing) throw new EconomyError("That listing does not exist.");
  if (listing.seller_kind === "character" && listing.seller_id !== character.id) throw new EconomyError("That listing is not yours.");
  if (listing.seller_kind === "business") await lockOwnedBusiness(sql, listing.seller_id, character.id);
  if (listing.status !== "open") throw new EconomyError("That listing is no longer open.");
  const updated = await sql.query<{ id: string }>("update market_listings set status = 'cancelled' where id = $1 and status = 'open' returning id", [listing.id]);
  if (updated.length === 0) throw new EconomyError("That listing is no longer open.");
  await changeStock(sql, {
    holderKind: listing.seller_kind,
    holderId: listing.seller_id,
    placeId: listing.place_id,
    productId: listing.product_id,
    delta: listing.quantity,
    reason: "market_cancel",
    key: `cancel:${listing.id}`,
  });
}

export async function buyListing(sql: Sql, input: { userId: string; listingId: string }): Promise<"bought" | "replayed"> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{
    id: string;
    seller_kind: "character" | "business";
    seller_id: string;
    place_id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    status: string;
    buyer_character_id: string | null;
  }>(
    `select id, seller_kind, seller_id, place_id, product_id, quantity, unit_price, status, buyer_character_id
     from market_listings where id = $1 for update`,
    [input.listingId],
  );
  const listing = rows[0];
  if (!listing) throw new EconomyError("That listing does not exist.");
  if (listing.status === "sold" && listing.buyer_character_id === character.id) return "replayed";
  if (listing.status !== "open") throw new EconomyError("That listing is no longer available.");
  if (listing.seller_kind === "character" && listing.seller_id === character.id) throw new EconomyError("You cannot buy your own listing.");
  if (listing.seller_kind === "business") {
    const owned = await sql.query<{ id: string }>("select id from businesses where id = $1 and owner_character_id = $2", [listing.seller_id, character.id]);
    if (owned.length > 0) throw new EconomyError("You cannot buy your own listing.");
  }
  const gross = listing.quantity * listing.unit_price;
  const feePercent = await rule(sql, "market_fee_percent");
  const skills = await sql.query<{ level: number; effect_per_level: number }>(
    `select cs.level, sd.effect_per_level
     from character_skills cs
     join skill_definitions sd on sd.id = cs.skill_id
     where cs.character_id = $1 and sd.effect_key = 'currency_percent'`,
    [character.id],
  );
  const discount = skills[0] ? skills[0].level * skills[0].effect_per_level : 0;
  const focusDiscount = await nodeBonus(sql, character.id, "market_fee_flat", { kind: "general" });
  const baseFee = Math.floor((gross * feePercent) / 100);
  const fee = marketFee(baseFee, discount + focusDiscount);
  const updated = await sql.query<{ id: string }>(
    `update market_listings set status = 'sold', buyer_character_id = $2, sold_at = now()
     where id = $1 and status = 'open' returning id`,
    [listing.id, character.id],
  );
  if (updated.length === 0) throw new EconomyError("That listing is no longer available.");
  await transfer(sql, {
    from: { kind: "character", id: character.id },
    to: { kind: listing.seller_kind, id: listing.seller_id },
    amount: gross,
    reason: "market_sale",
    idempotencyKey: `buy:${listing.id}:pay`,
    actorUserId: input.userId,
  });
  if (fee > 0) {
    await transfer(sql, {
      from: { kind: "character", id: character.id },
      to: { kind: "system", id: null },
      amount: fee,
      reason: "market_fee",
      idempotencyKey: `buy:${listing.id}:fee`,
      actorUserId: input.userId,
    });
  }
  const taxRows = await sql.query<{ country_id: string; percent: number | null }>(
    `select p.country_id,
            (select v.effect_value from policy_versions v
             where v.country_id = p.country_id and v.effect_key = 'sales_tax_percent' and v.effective_at <= now()
             order by v.effective_at desc limit 1) as percent
     from places p where p.id = $1`,
    [listing.place_id],
  );
  const taxPercent = Number(taxRows[0]?.percent ?? 0);
  const tax = Number.isInteger(taxPercent) && taxPercent > 0 ? Math.floor((gross * taxPercent) / 100) : 0;
  if (tax > 0 && taxRows[0]?.country_id) {
    await transfer(sql, {
      from: { kind: "character", id: character.id },
      to: { kind: "government", id: taxRows[0].country_id },
      amount: tax,
      reason: "sales_tax",
      idempotencyKey: `buy:${listing.id}:tax`,
      actorUserId: input.userId,
    });
  }
  await changeStock(sql, {
    holderKind: "character",
    holderId: character.id,
    placeId: listing.place_id,
    productId: listing.product_id,
    delta: listing.quantity,
    reason: "market_purchase",
    key: `buy:${listing.id}:stock`,
  });
  const sellerCharacterId =
    listing.seller_kind === "character"
      ? listing.seller_id
      : (
          await sql.query<{ owner_character_id: string }>("select owner_character_id from businesses where id = $1", [listing.seller_id])
        )[0]?.owner_character_id;
  if (sellerCharacterId) await recordEconomyProgress(sql, sellerCharacterId, "market_sold");
  return "bought";
}

export async function postJob(
  sql: Sql,
  input: { userId: string; businessId: string; title: string; wage: number; skillId: string | null; minSkillLevel: number },
): Promise<string> {
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title.length < 3 || title.length > 60) throw new EconomyError("Use a job title between 3 and 60 characters.");
  const wage = wholeAmount(input.wage, "Wage");
  const character = await lockCharacter(sql, input.userId);
  const business = await lockOwnedBusiness(sql, input.businessId, character.id);
  const floor = (await countryPolicy(sql, business.country_id, "wage_floor")) ?? (await rule(sql, "wage_min"));
  if (wage < floor || wage > (await rule(sql, "wage_max"))) {
    throw new EconomyError("That wage is outside the configured range.");
  }
  if (input.skillId) {
    const skill = await sql.query<{ id: string }>("select id from skill_definitions where id = $1", [input.skillId]);
    if (skill.length === 0) throw new EconomyError("That skill requirement is not recognized.");
  }
  const created = await sql.query<{ id: string }>(
    `insert into job_postings (business_id, title, wage, skill_id, min_skill_level)
     values ($1, $2, $3, $4, $5) returning id`,
    [input.businessId, title, wage, input.skillId, Math.max(0, input.minSkillLevel)],
  );
  return created[0]?.id ?? "";
}

export async function applyForJob(sql: Sql, input: { userId: string; postingId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const postings = await sql.query<{ id: string; owner_character_id: string; status: string }>(
    `select p.id, b.owner_character_id, p.status
     from job_postings p join businesses b on b.id = p.business_id
     where p.id = $1`,
    [input.postingId],
  );
  const posting = postings[0];
  if (!posting || posting.status !== "open") throw new EconomyError("That job is not open.");
  if (posting.owner_character_id === character.id) throw new EconomyError("You cannot apply to your own business.");
  await sql.query(
    `insert into job_applications (posting_id, character_id, status) values ($1, $2, 'pending')
     on conflict (posting_id, character_id) do nothing`,
    [posting.id, character.id],
  );
}

export async function acceptApplication(sql: Sql, input: { userId: string; applicationId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; posting_id: string; character_id: string; status: string; business_id: string; wage: number; skill_id: string | null; min_skill_level: number; owner_character_id: string }>(
    `select a.id, a.posting_id, a.character_id, a.status, p.business_id, p.wage, p.skill_id, p.min_skill_level, b.owner_character_id
     from job_applications a
     join job_postings p on p.id = a.posting_id
     join businesses b on b.id = p.business_id
     where a.id = $1
     for update of a`,
    [input.applicationId],
  );
  const application = rows[0];
  if (!application || application.owner_character_id !== character.id) throw new EconomyError("That application is not yours to accept.");
  if (application.status !== "pending") throw new EconomyError("That application is no longer pending.");
  const busy = await sql.query<{ id: string }>(
    "select id from employments where character_id = $1 and status = 'active'",
    [application.character_id],
  );
  if (busy.length > 0) throw new EconomyError("That character already has a job.");
  if (application.skill_id) {
    const skill = await sql.query<{ level: number }>(
      "select level from character_skills where character_id = $1 and skill_id = $2",
      [application.character_id, application.skill_id],
    );
    if ((skill[0]?.level ?? 0) < application.min_skill_level) throw new EconomyError("That applicant does not meet the skill requirement.");
  }
  const hired = await sql.query<{ id: string }>(
    `update job_applications set status = 'accepted' where id = $1 and status = 'pending' returning id`,
    [application.id],
  );
  if (hired.length === 0) throw new EconomyError("That application is no longer pending.");
  await sql.query(
    `insert into employments (business_id, character_id, posting_id, wage, status) values ($1, $2, $3, $4, 'active')`,
    [application.business_id, application.character_id, application.posting_id, application.wage],
  );
  await sql.query("update job_postings set status = 'closed' where id = $1", [application.posting_id]);
  await sql.query("update job_applications set status = 'rejected' where posting_id = $1 and status = 'pending'", [application.posting_id]);
}

export async function dismissEmployee(sql: Sql, input: { userId: string; employmentId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string }>(
    `update employments e set status = 'dismissed', dismissed_at = now()
     from businesses b
     where e.id = $1 and e.business_id = b.id and b.owner_character_id = $2 and e.status = 'active'
     returning e.id`,
    [input.employmentId, character.id],
  );
  if (rows.length === 0) throw new EconomyError("That employee is not on your payroll.");
}

export async function payWages(sql: Sql, input: { userId: string; businessId: string }): Promise<number> {
  const character = await lockCharacter(sql, input.userId);
  const business = await lockOwnedBusiness(sql, input.businessId, character.id);
  const employees = await sql.query<{ id: string; character_id: string; wage: number }>(
    `select id, character_id, wage from employments
     where business_id = $1 and status = 'active'
     order by id
     for update`,
    [business.id],
  );
  if (employees.length === 0) throw new EconomyError("There are no active employees.");
  const today = await sql.query<{ period: string }>("select (now() at time zone 'utc')::date::text as period");
  const period = today[0]?.period;
  if (!period) throw new EconomyError("The pay period could not be determined.");
  let paid = 0;
  for (const employee of employees) {
    const claimed = await sql.query<{ id: string }>(
      `insert into wage_payments (employment_id, period_date, amount, ledger_key)
       values ($1, $2, $3, $4)
       on conflict (employment_id, period_date) do nothing
       returning id`,
      [employee.id, period, employee.wage, `wage:${employee.id}:${period}`],
    );
    if (!claimed[0]) continue;
    await transfer(sql, {
      from: { kind: "business", id: business.id },
      to: { kind: "character", id: employee.character_id },
      amount: employee.wage,
      reason: "wage",
      idempotencyKey: `wage:${employee.id}:${period}`,
      actorUserId: input.userId,
    });
    paid += 1;
  }
  if (paid === 0) throw new EconomyError("Wages for this UTC day were already paid.");
  return paid;
}

export async function dispatchShipment(
  sql: Sql,
  input: { userId: string; holderKind: "character" | "business"; holderId: string; originPlaceId: string; destinationPlaceId: string; productId: string; quantity: number; idempotencyKey: string },
): Promise<string> {
  const quantity = wholeAmount(input.quantity, "Quantity");
  assertKey(input.idempotencyKey);
  const character = await lockCharacter(sql, input.userId);
  const key = `${character.id}:ship:${input.idempotencyKey}`;
  const claim = await claimRequest(sql, key, character.id, requestHash(input));
  if (claim.replay) return claim.result;
  if (input.holderKind === "business") await lockOwnedBusiness(sql, input.holderId, character.id);
  else if (input.holderId !== character.id) throw new EconomyError("You can only ship your own stock.");
  const origin = await openPlace(sql, input.originPlaceId);
  const destination = await openPlace(sql, input.destinationPlaceId);
  if (origin.id === destination.id) throw new EconomyError("Choose a different destination city.");
  const km = distanceKm(origin, destination);
  const shipping = simulatedTransit(km, { per100km: await rule(sql, "shipment_cost_per_100km"), minimum: await rule(sql, "shipment_base_cost") });
  const skills = await sql.query<{ level: number; effect_per_level: number }>(
    `select cs.level, sd.effect_per_level
     from character_skills cs join skill_definitions sd on sd.id = cs.skill_id
     where cs.character_id = $1 and sd.effect_key = 'delivery_currency_flat'`,
    [character.id],
  );
  const discount = skills[0] ? skills[0].level * skills[0].effect_per_level : 0;
  const focusDiscount = await nodeBonus(sql, character.id, "shipment_cost_flat", { kind: "general" });
  const shippingCost = Math.max(1, shipping - discount - focusDiscount);
  const tariffPolicy = origin.country_id === destination.country_id ? null : await countryPolicy(sql, destination.country_id, "tariff_percent");
  const tariff = origin.country_id === destination.country_id ? 0 : (tariffPolicy ?? (await rule(sql, "international_tariff")));
  const seconds = simulatedTransit(km, { per100km: await rule(sql, "shipment_seconds_per_100km"), minimum: await rule(sql, "shipment_min_seconds") });
  const payer = input.holderKind === "business" ? { kind: "business" as const, id: input.holderId } : { kind: "character" as const, id: character.id };
  const created = await sql.query<{ id: string }>(
    `insert into shipments (
       holder_kind, holder_id, origin_place_id, destination_place_id, product_id, quantity,
       shipping_cost, tariff, status, arrives_at, simulation_note, payer_kind, payer_id
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, 'in_transit', now() + ($9 * interval '1 second'),
       'Duration and cost use a simulated great-circle distance, not a measured transport route.',
       $10, $11
     ) returning id`,
    [input.holderKind, input.holderId, origin.id, destination.id, input.productId, quantity, shippingCost, tariff, seconds, payer.kind, payer.id],
  );
  const shipmentId = created[0]?.id;
  if (!shipmentId) throw new EconomyError("The shipment could not be created.");
  await changeStock(sql, {
    holderKind: input.holderKind,
    holderId: input.holderId,
    placeId: origin.id,
    productId: input.productId,
    delta: -quantity,
    reason: "shipment_dispatch",
    key: `ship:${shipmentId}:out`,
  });
  await transfer(sql, {
    from: payer,
    to: { kind: "system", id: null },
    amount: shippingCost + tariff,
    reason: "shipment_cost",
    idempotencyKey: `ship:${shipmentId}:cost`,
    actorUserId: input.userId,
  });
  await finishRequest(sql, key, shipmentId);
  return shipmentId;
}

export async function deliverShipment(sql: Sql, input: { userId: string; shipmentId: string }): Promise<"delivered" | "waiting"> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{
    id: string;
    holder_kind: "character" | "business";
    holder_id: string;
    destination_place_id: string;
    product_id: string;
    quantity: number;
    status: string;
    ready: boolean;
    owner_character_id: string | null;
  }>(
    `select s.id, s.holder_kind, s.holder_id, s.destination_place_id, s.product_id, s.quantity, s.status,
            s.arrives_at <= now() as ready, b.owner_character_id
     from shipments s
     left join businesses b on s.holder_kind = 'business' and b.id = s.holder_id
     where s.id = $1
     for update of s`,
    [input.shipmentId],
  );
  const shipment = rows[0];
  if (!shipment) throw new EconomyError("That shipment does not exist.");
  const allowed = shipment.holder_kind === "character" ? shipment.holder_id === character.id : shipment.owner_character_id === character.id;
  if (!allowed) throw new EconomyError("That shipment is not yours.");
  if (shipment.status === "delivered") return "delivered";
  if (!shipment.ready) return "waiting";
  const updated = await sql.query<{ id: string }>("update shipments set status = 'delivered' where id = $1 and status = 'in_transit' returning id", [shipment.id]);
  if (updated.length === 0) return "delivered";
  await changeStock(sql, {
    holderKind: shipment.holder_kind,
    holderId: shipment.holder_id,
    placeId: shipment.destination_place_id,
    productId: shipment.product_id,
    delta: shipment.quantity,
    reason: "shipment_delivery",
    key: `ship:${shipment.id}:in`,
  });
  await recordEconomyProgress(sql, character.id, "shipment_delivered");
  return "delivered";
}

const SERVICE_CATEGORIES = new Set(["trade", "logistics", "construction", "finance", "hospitality"]);
const EXTRACTION_CATEGORIES = new Set(["mining", "energy", "agriculture"]);

export type ShiftResult = {
  gross: number;
  wagePaid: number;
  wageDue: number;
  wageState: "none" | "paid" | "already" | "short";
  detail: string;
};

export async function performShift(sql: Sql, input: { userId: string; businessId: string }): Promise<ShiftResult> {
  const character = await lockCharacter(sql, input.userId);
  const business = await lockBusiness(sql, input.businessId);
  const employment = await activeEmployment(sql, business.id, character.id);
  const isOwner = business.owner_character_id === character.id;
  if (!isOwner && !employment) throw new EconomyError("You can work here only after the owner hires you.");
  const cooldown = boundedWorkShiftCooldown(await rule(sql, "work_shift_cooldown_seconds"));
  const recent = await sql.query<{ id: string }>(
    `select id from work_shifts
     where character_id = $1 and created_at > now() - ($2 * interval '1 second')`,
    [character.id, cooldown],
  );
  if (recent.length > 0) throw new EconomyError("Your last shift is still on cooldown.");

  let kind: "service" | "extraction" | "production" = "service";
  let gross = 0;
  let detail = "";
  if (SERVICE_CATEGORIES.has(business.category)) {
    const base = await rule(sql, "service_shift_revenue");
    const skillId = SERVICE_SHIFT_SKILL[business.category];
    const skill = skillId
      ? await sql.query<{ level: number; name: string }>(
          `select cs.level, d.name
           from character_skills cs
           join skill_definitions d on d.id = cs.skill_id
           where cs.character_id = $1 and cs.skill_id = $2`,
          [character.id, skillId],
        )
      : [];
    const bonus = serviceSkillBonus(
      Number(skill[0]?.level ?? 0),
      await optionalRule(sql, "service_skill_bonus_per_level"),
      await optionalRule(sql, "service_skill_bonus_cap"),
    );
    const focus = skillId ? await nodeBonus(sql, character.id, "service_shift_flat", { kind: "skill", skillId }) : 0;
    gross = base + bonus + focus;
    detail = bonus + focus > 0
      ? `Service fee credited to the business, including ${bonus} from the matching skill and ${focus} from a focus.`
      : "Service fee credited to the business.";
  } else if (EXTRACTION_CATEGORIES.has(business.category)) {
    kind = "extraction";
    const sites = await sql.query<{ id: string }>(
      `select id from extraction_sites
       where business_id = $1 and status = 'active' and simulated_remaining > 0
         and (next_available_at is null or next_available_at <= now())
       order by created_at
       limit 1`,
      [business.id],
    );
    const siteId = sites[0]?.id;
    if (!siteId) {
      throw new EconomyError("No extraction site is ready. The owner can open one only when this country has a positive sourced reserve. A shift does not create goods by itself.");
    }
    const quantity = await runExtraction(sql, { userId: input.userId, siteId });
    detail = `Extracted ${quantity} simulated units into the business stock. The reference reserve was not changed.`;
  } else if (business.category === "manufacturing") {
    kind = "production";
    const ready = await sql.query<{ id: string }>(
      `select id from production_jobs
       where business_id = $1 and status = 'running' and completes_at <= now()
       order by completes_at
       limit 1`,
      [business.id],
    );
    const jobId = ready[0]?.id;
    if (!jobId) {
      throw new EconomyError("No finished recipe is ready to collect. The owner starts production after the inputs are in stock. A shift does not create goods by itself.");
    }
    const result = await completeProduction(sql, { userId: input.userId, jobId });
    if (result !== "completed") throw new EconomyError("That production was already collected.");
    detail = "Collected finished production into the business stock.";
  } else {
    throw new EconomyError("This business has no work shift.");
  }

  const inserted = await sql.query<{ id: string }>(
    `insert into work_shifts (business_id, character_id, employment_id, kind, gross, wage_paid, detail)
     select $1, $2, $3, $4, $5, 0, $6
     where not exists (
       select 1 from work_shifts
       where character_id = $2 and created_at > now() - ($7 * interval '1 second')
     )
     returning id`,
    [business.id, character.id, employment?.id ?? null, kind, gross, detail, cooldown],
  );
  const shiftId = inserted[0]?.id;
  if (!shiftId) throw new EconomyError("The shift could not be saved.");
  if (gross > 0) {
    await transfer(sql, {
      from: { kind: "system", id: null },
      to: { kind: "business", id: business.id },
      amount: gross,
      reason: "service_shift",
      idempotencyKey: `shift:${shiftId}:gross`,
      actorUserId: input.userId,
    });
  }

  let wagePaid = 0;
  const wageDue = employment?.wage ?? 0;
  let wageState: ShiftResult["wageState"] = employment ? "short" : "none";
  if (employment) {
    const today = await sql.query<{ period: string }>("select (now() at time zone 'utc')::date::text as period");
    const period = today[0]?.period;
    if (!period) throw new EconomyError("The pay period could not be determined.");
    const existing = await sql.query<{ id: string }>(
      "select id from wage_payments where employment_id = $1 and period_date = $2",
      [employment.id, period],
    );
    const balances = await sql.query<{ balance: number | string }>("select balance from businesses where id = $1", [business.id]);
    if (existing.length > 0) {
      wageState = "already";
    } else if (Number(balances[0]?.balance ?? 0) < employment.wage) {
      wageState = "short";
    } else {
      const claimed = await sql.query<{ id: string }>(
        `insert into wage_payments (employment_id, period_date, amount, ledger_key)
         values ($1, $2, $3, $4)
         on conflict (employment_id, period_date) do nothing
         returning id`,
        [employment.id, period, employment.wage, `wage:${employment.id}:${period}`],
      );
      if (!claimed[0]) {
        wageState = "already";
      } else {
        await transfer(sql, {
          from: { kind: "business", id: business.id },
          to: { kind: "character", id: character.id },
          amount: employment.wage,
          reason: "wage",
          idempotencyKey: `wage:${employment.id}:${period}`,
          actorUserId: input.userId,
        });
        wagePaid = employment.wage;
        wageState = "paid";
        await sql.query("update work_shifts set wage_paid = $2 where id = $1", [shiftId, wagePaid]);
      }
    }
  }
  return { gross, wagePaid, wageDue, wageState, detail };
}

export async function referenceAmount(sql: Sql, countryId: string, resourceTypeId: string): Promise<string | null> {
  const rows = await sql.query<{ amount: string | null }>(
    "select amount::text as amount from resource_records where country_id = $1 and resource_type_id = $2 order by period_label desc limit 1",
    [countryId, resourceTypeId],
  );
  return rows[0]?.amount ?? null;
}
