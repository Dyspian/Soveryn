import { randomInt } from "node:crypto";
import type { Sql } from "@/lib/db";
import { distanceKm, simulatedTransit } from "@/lib/economy/distance";
import { shiftClaimedOn } from "@/lib/economy/shift-claims";
import { changeStock, transfer } from "@/lib/economy/service";
import {
  activeMember,
  addHeat,
  addInfluence,
  countriesSanctioned,
  ensureProfile,
  limitOrgAction,
  lockCharacter,
  lockOrg,
  notify,
  placeRecord,
  recordEvent,
  requirePermission,
  rule,
} from "@/lib/organizations/access";
import { assertKey, isOperationKey, OPERATIONS, OrgError } from "@/lib/organizations/domain";
import { legalType } from "@/lib/organizations/service";

export async function openOperation(sql: Sql, input: { userId: string; definitionKey: string; placeId: string }): Promise<string> {
  if (!isOperationKey(input.definitionKey)) throw new OrgError("That contract is not available.");
  const definition = OPERATIONS[input.definitionKey];
  const character = await lockCharacter(sql, input.userId);
  const membership = await activeMember(sql, character.id);
  let organizationId: string | null = null;
  if (definition.criminal) {
    if (!membership) throw new OrgError("That contract requires an organization that can take it.");
    const org = await lockOrg(sql, membership.organization_id);
    if (legalType(org.org_type)) throw new OrgError("This organization cannot take a criminal contract.");
    await requirePermission(sql, character.id, org.id, "start_operations");
    organizationId = org.id;
  } else if (membership) {
    await requirePermission(sql, character.id, membership.organization_id, "start_operations");
    organizationId = membership.organization_id;
  }
  if (character.level < (await rule(sql, "org_min_level")) && definition.criminal) throw new OrgError("You do not meet the level requirement.");
  if (input.definitionKey === "joint" && !organizationId) throw new OrgError("A joint shift requires an organization and permission to prepare contracts.");
  const place = await placeRecord(sql, input.placeId);
  const created = await sql.query<{ id: string }>(
    `insert into operations (definition_key, organization_id, place_id, opened_by, status)
     values ($1, $2, $3, $4, 'preparation') returning id`,
    [input.definitionKey, organizationId, place.id, character.id],
  );
  const operationId = created[0]?.id;
  if (!operationId) throw new OrgError("The contract could not be opened.");
  await sql.query("insert into operation_participants (operation_id, character_id) values ($1, $2)", [operationId, character.id]);
  if (organizationId) await recordEvent(sql, organizationId, "operation", `${definition.label} is being prepared.`, "members");
  return operationId;
}

export async function joinOperation(sql: Sql, input: { userId: string; operationId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; organization_id: string | null; status: string }>(
    "select id, organization_id, status from operations where id = $1 for update",
    [input.operationId],
  );
  const operation = rows[0];
  if (!operation || (operation.status !== "preparation" && operation.status !== "recruiting")) throw new OrgError("That contract is not recruiting.");
  if (operation.organization_id) {
    const membership = await activeMember(sql, character.id);
    if (membership?.organization_id !== operation.organization_id) throw new OrgError("Only a member of that organization can join.");
  }
  const joined = await sql.query<{ operation_id: string }>(
    "insert into operation_participants (operation_id, character_id) values ($1, $2) on conflict do nothing returning operation_id",
    [operation.id, character.id],
  );
  if (joined.length === 0) throw new OrgError("You have already joined this contract.");
  await sql.query("update operations set status = 'recruiting' where id = $1 and status = 'preparation'", [operation.id]);
}

export async function launchOperation(sql: Sql, input: { userId: string; operationId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; definition_key: string; organization_id: string | null; opened_by: string; status: string }>(
    "select id, definition_key, organization_id, opened_by, status from operations where id = $1 for update",
    [input.operationId],
  );
  const operation = rows[0];
  if (!operation || (operation.status !== "preparation" && operation.status !== "recruiting")) throw new OrgError("That contract cannot be launched.");
  if (operation.opened_by !== character.id) throw new OrgError("The character who opened the contract launches it.");
  if (operation.organization_id) await requirePermission(sql, character.id, operation.organization_id, "start_operations");
  const stake = await rule(sql, "org_operation_stake");
  const seconds = await rule(sql, "org_operation_seconds");
  const from = operation.organization_id
    ? { kind: "organization" as const, id: operation.organization_id }
    : { kind: "character" as const, id: character.id };
  await transfer(sql, {
    from,
    to: { kind: "system", id: null },
    amount: stake,
    reason: "operation_stake",
    idempotencyKey: `op:${operation.id}:stake`,
    actorUserId: input.userId,
  });
  await sql.query(
    "update operations set status = 'in_progress', stake = $2, completes_at = now() + ($3 * interval '1 second') where id = $1",
    [operation.id, stake, seconds],
  );
}

export async function leaveOperation(sql: Sql, input: { userId: string; operationId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; opened_by: string; status: string }>(
    "select id, opened_by, status from operations where id = $1 for update",
    [input.operationId],
  );
  const operation = rows[0];
  if (!operation || (operation.status !== "preparation" && operation.status !== "recruiting")) throw new OrgError("That contract is not open for members to leave.");
  if (operation.opened_by === character.id) throw new OrgError("Cancel the contract instead of leaving it.");
  const removed = await sql.query<{ operation_id: string }>(
    "delete from operation_participants where operation_id = $1 and character_id = $2 returning operation_id",
    [operation.id, character.id],
  );
  if (removed.length === 0) throw new OrgError("You are not part of that contract.");
}

export async function recordJointShift(sql: Sql, input: { userId: string; operationId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; organization_id: string | null; definition_key: string; status: string; completes_at: string | null }>(
    "select id, organization_id, definition_key, status, completes_at from operations where id = $1 for update",
    [input.operationId],
  );
  const operation = rows[0];
  if (!operation || operation.definition_key !== "joint") throw new OrgError("That contract does not record company shifts.");
  if (operation.status !== "in_progress" || !operation.completes_at || new Date(operation.completes_at).getTime() <= Date.now()) {
    throw new OrgError("That contract is not open for a shift.");
  }
  const participant = await sql.query<{ character_id: string }>(
    "select character_id from operation_participants where operation_id = $1 and character_id = $2",
    [operation.id, character.id],
  );
  if (participant.length === 0) throw new OrgError("You are not part of that contract.");
  const seconds = await rule(sql, "org_operation_seconds");
  const shifts = await sql.query<{ id: string }>(
    `select s.id
     from work_shifts s
     where s.character_id = $1
       and s.created_at >= $2::timestamptz - ($3 * interval '1 second')
       and s.created_at <= $2::timestamptz
       and not exists (select 1 from operation_contributions c where c.source_key = 'shift:' || s.id::text)
     order by s.created_at
     limit 8`,
    [character.id, operation.completes_at, seconds],
  );
  let shiftId: string | undefined;
  let blockedByBulletin = false;
  for (const shift of shifts) {
    if (await shiftClaimedOn(sql, shift.id, "bulletin")) {
      blockedByBulletin = true;
      continue;
    }
    shiftId = shift.id;
    break;
  }
  if (!shiftId) {
    throw new OrgError(
      blockedByBulletin
        ? "That company shift is already recorded on a work bulletin."
        : "No company shift in this window is available to record.",
    );
  }
  const saved = await sql.query<{ operation_id: string }>(
    `insert into operation_contributions (operation_id, character_id, source_key)
     values ($1, $2, $3)
     on conflict do nothing
     returning operation_id`,
    [operation.id, character.id, `shift:${shiftId}`],
  );
  if (saved.length === 0) throw new OrgError("Your shift is already recorded on a contract.");
}

async function resolveJoint(
  sql: Sql,
  userId: string,
  operation: { id: string; organization_id: string | null; place_id: string },
): Promise<string> {
  const goal = 2;
  const contributions = await sql.query<{ character_id: string }>(
    "select character_id from operation_contributions where operation_id = $1",
    [operation.id],
  );
  const success = contributions.length >= goal;
  const summary = success
    ? `The joint shift recorded ${contributions.length} company shifts. The organization received the stake and margin once.`
    : `The joint shift closed with ${contributions.length} of ${goal} recorded shifts. The stake is not returned.`;
  if (success && operation.organization_id) {
    const stakeRow = await sql.query<{ stake: number | string }>("select stake from operations where id = $1", [operation.id]);
    const stake = Number(stakeRow[0]?.stake ?? 0);
    const margin = await rule(sql, "org_operation_margin");
    await transfer(sql, {
      from: { kind: "system", id: null },
      to: { kind: "organization", id: operation.organization_id },
      amount: stake + margin,
      reason: "operation_reward",
      idempotencyKey: `op:${operation.id}:reward`,
      actorUserId: userId,
    });
    for (const person of contributions) {
      const paid = await sql.query<{ id: string }>(
        `insert into progression_events (character_id, kind, source_key, xp_awarded, currency_awarded, reputation_awarded, detail)
         values ($1, 'joint', $2, 0, 0, 1, 'Recorded a joint shift.')
         on conflict (character_id, source_key) do nothing
         returning id`,
        [person.character_id, `joint:${operation.id}`],
      );
      if (paid[0]) await sql.query("update characters set reputation = reputation + 1 where id = $1", [person.character_id]);
    }
    await addInfluence(sql, operation.organization_id, operation.place_id);
  }
  const updated = await sql.query<{ id: string }>(
    "update operations set status = $2, result_summary = $3 where id = $1 and status = 'in_progress' returning id",
    [operation.id, success ? "completed" : "failed", summary],
  );
  if (updated.length === 0) {
    const current = await sql.query<{ status: string }>("select status from operations where id = $1", [operation.id]);
    return current[0]?.status ?? "completed";
  }
  if (operation.organization_id) {
    await recordEvent(sql, operation.organization_id, "operation", summary, "members");
    const people = await sql.query<{ character_id: string }>("select character_id from operation_participants where operation_id = $1", [operation.id]);
    for (const person of people) await notify(sql, person.character_id, operation.organization_id, "operation", summary, `op-result:${operation.id}`);
  }
  return success ? "completed" : "failed";
}

export async function resolveOperation(sql: Sql, input: { userId: string; operationId: string }): Promise<string> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{
    id: string;
    definition_key: "survey" | "protection" | "recovery" | "joint";
    organization_id: string | null;
    place_id: string;
    status: string;
    stake: number | string;
    completes_at: string | null;
  }>("select id, definition_key, organization_id, place_id, status, stake, completes_at from operations where id = $1 for update", [input.operationId]);
  const operation = rows[0];
  if (!operation) throw new OrgError("That contract does not exist.");
  if (operation.status === "completed" || operation.status === "failed") return operation.status;
  if (operation.status !== "in_progress") throw new OrgError("That contract is not in progress.");
  if (!operation.completes_at || new Date(operation.completes_at).getTime() > Date.now()) throw new OrgError("That contract is still in progress.");
  const participant = await sql.query<{ character_id: string }>(
    "select character_id from operation_participants where operation_id = $1 and character_id = $2",
    [operation.id, character.id],
  );
  if (participant.length === 0) throw new OrgError("You are not part of that contract.");
  if (operation.definition_key === "joint") return resolveJoint(sql, input.userId, operation);
  const people = await sql.query<{ character_id: string }>("select character_id from operation_participants where operation_id = $1", [operation.id]);
  const profile = await ensureProfile(sql, character.id);
  const definition = OPERATIONS[operation.definition_key];
  const roll = randomInt(0, 20);
  const score = roll + Number(profile?.planning ?? 0) + character.level + people.length - Math.floor(Number(profile?.heat ?? 0) / 10);
  const success = score >= (definition.risk === "high" ? 18 : 10);
  const summary = report(success, Number(profile?.planning ?? 0), Number(profile?.heat ?? 0), people.length);
  const updated = await sql.query<{ id: string }>(
    "update operations set status = $2, result_summary = $3 where id = $1 and status = 'in_progress' returning id",
    [operation.id, success ? "completed" : "failed", summary],
  );
  if (updated.length === 0) return "completed";
  const stake = Number(operation.stake);
  if (success) {
    const margin = await rule(sql, "org_operation_margin");
    const payee = operation.organization_id ? { kind: "organization" as const, id: operation.organization_id } : { kind: "character" as const, id: character.id };
    await transfer(sql, {
      from: { kind: "system", id: null },
      to: payee,
      amount: stake + margin,
      reason: "operation_reward",
      idempotencyKey: `op:${operation.id}:reward`,
      actorUserId: input.userId,
    });
    if (operation.definition_key === "recovery") {
      await changeStock(sql, {
        holderKind: "character",
        holderId: character.id,
        placeId: operation.place_id,
        productId: "sealed_crate",
        delta: 1,
        reason: "operation_crate",
        key: `op:${operation.id}:crate`,
      });
    }
    if (operation.organization_id) await addInfluence(sql, operation.organization_id, operation.place_id);
    await sql.query(
      "update character_underworld set experience = experience + 1, planning = least(10, planning + 1), reputation = reputation + 1, updated_at = now() where character_id = $1",
      [character.id],
    );
  }
  if (definition.criminal) {
    for (const person of people) await addHeat(sql, person.character_id, success ? 8 : 12, operation.definition_key);
    await maybeOpenCase(sql, character.id, operation.organization_id);
  }
  if (operation.organization_id) {
    await recordEvent(sql, operation.organization_id, "operation", summary, "members");
    for (const person of people) await notify(sql, person.character_id, operation.organization_id, "operation", summary, `op-result:${operation.id}`);
  }
  return success ? "completed" : "failed";
}

function report(success: boolean, planning: number, heat: number, people: number): string {
  const factors = [
    planning > 0 ? "Planning helped." : "There was little preparation.",
    people > 1 ? "The crew size was a factor." : "It was attempted alone.",
    heat >= 10 ? "Heat worked against the attempt." : "Heat was still low.",
  ];
  return `${success ? "The contract succeeded." : "The contract failed."} ${factors.join(" ")} This is a game result.`;
}

async function maybeOpenCase(sql: Sql, characterId: string, organizationId: string | null) {
  const profile = await ensureProfile(sql, characterId);
  const threshold = await rule(sql, "org_heat_investigation");
  if (Number(profile?.heat ?? 0) < threshold) return;
  const character = await sql.query<{ country_id: string }>("select country_id from characters where id = $1", [characterId]);
  if (!character[0]) return;
  const created = await sql.query<{ id: string }>(
    `insert into enforcement_cases (character_id, organization_id, country_id, status, evidence)
     values ($1, $2, $3, 'active', $4)
     on conflict do nothing
     returning id`,
    [characterId, organizationId, character[0].country_id, profile?.heat ?? 0],
  );
  if (created[0]) await notify(sql, characterId, organizationId, "investigation", "A fictional investigation is active.", `case:${created[0].id}`);
}

export async function cancelOperation(sql: Sql, input: { userId: string; operationId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; opened_by: string; status: string; organization_id: string | null }>(
    "select id, opened_by, status, organization_id from operations where id = $1 for update",
    [input.operationId],
  );
  const operation = rows[0];
  if (!operation || operation.opened_by !== character.id) throw new OrgError("You cannot cancel that contract.");
  if (operation.status === "in_progress" || operation.status === "completed" || operation.status === "failed") {
    throw new OrgError("That contract can no longer be cancelled.");
  }
  await sql.query("update operations set status = 'cancelled' where id = $1", [operation.id]);
}

export async function layLow(sql: Sql, input: { userId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const profile = await ensureProfile(sql, character.id);
  if (profile?.lay_low_until && new Date(profile.lay_low_until).getTime() > Date.now()) throw new OrgError("You are already laying low.");
  const running = await sql.query<{ id: string }>(
    `select o.id from operations o
     join operation_participants p on p.operation_id = o.id
     where p.character_id = $1 and o.status = 'in_progress'`,
    [character.id],
  );
  if (running.length > 0) throw new OrgError("Finish the contract in progress first.");
  const decay = await rule(sql, "org_heat_decay");
  const seconds = await rule(sql, "org_lay_low_seconds");
  await sql.query(
    `update character_underworld
     set heat = greatest(0, heat - $2), concealment = least(10, concealment + 1), lay_low_until = now() + ($3 * interval '1 second'), updated_at = now()
     where character_id = $1`,
    [character.id, decay, seconds],
  );
  await sql.query("insert into heat_events (character_id, delta, reason) values ($1, $2, 'lay_low')", [character.id, -decay]);
}

export async function payFine(sql: Sql, input: { userId: string; idempotencyKey: string }): Promise<void> {
  assertKey(input.idempotencyKey);
  const character = await lockCharacter(sql, input.userId);
  const profile = await ensureProfile(sql, character.id);
  const fine = Number(profile?.fines ?? 0);
  if (fine <= 0) throw new OrgError("You do not have an outstanding fine.");
  await transfer(sql, {
    from: { kind: "character", id: character.id },
    to: { kind: "government", id: character.country_id },
    amount: fine,
    reason: "enforcement_fine",
    idempotencyKey: `fine:${input.idempotencyKey}`,
    actorUserId: input.userId,
  });
  await sql.query("update character_underworld set fines = 0, updated_at = now() where character_id = $1", [character.id]);
}

export async function reviewCase(sql: Sql, input: { userId: string }): Promise<string> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; status: string; organization_id: string | null }>(
    "select id, status, organization_id from enforcement_cases where character_id = $1 and status in ('preliminary', 'active', 'review') for update",
    [character.id],
  );
  const current = rows[0];
  if (!current) throw new OrgError("You have no open investigation.");
  const profile = await ensureProfile(sql, character.id);
  const severe = await rule(sql, "org_heat_severe");
  if (Number(profile?.heat ?? 0) >= severe) {
    const fine = await rule(sql, "org_fine");
    const seconds = await rule(sql, "org_restriction_seconds");
    await sql.query(
      `update character_underworld
       set fines = fines + $2, heat = greatest(0, heat - $3), market_restricted_until = now() + ($4 * interval '1 second'), updated_at = now()
       where character_id = $1`,
      [character.id, fine, await rule(sql, "org_heat_decay"), seconds],
    );
    await sql.query("update enforcement_cases set status = 'resolved', fine_amount = $2, outcome = 'A fine and a temporary market restriction were applied.' where id = $1", [
      current.id,
      fine,
    ]);
    await notify(sql, character.id, current.organization_id, "investigation", "An investigation applied a fine and a temporary market restriction.", `case-result:${current.id}`);
    return "restricted";
  }
  await sql.query(
    "update character_underworld set heat = greatest(0, heat - $2), updated_at = now() where character_id = $1",
    [character.id, await rule(sql, "org_heat_decay")],
  );
  await sql.query("update enforcement_cases set status = 'closed', outcome = 'The investigation closed without a penalty.' where id = $1", [current.id]);
  return "closed";
}

export async function listUnderground(
  sql: Sql,
  input: { userId: string; placeId: string; productId: string; quantity: number; unitPrice: number; idempotencyKey: string },
): Promise<string> {
  assertKey(input.idempotencyKey);
  await limitOrgAction(sql, input.userId, "list", 20);
  const character = await lockCharacter(sql, input.userId);
  await assertMarketAccess(sql, character.id, character.level);
  if (!Number.isInteger(input.quantity) || input.quantity <= 0 || input.quantity > 20) throw new OrgError("Choose a quantity from 1 to 20.");
  if (!Number.isInteger(input.unitPrice) || input.unitPrice <= 0 || input.unitPrice > 500) throw new OrgError("Choose a unit price from 1 to 500.");
  const place = await placeRecord(sql, input.placeId);
  const limit = await rule(sql, "org_listing_limit");
  const open = await sql.query<{ count: number }>(
    "select count(*)::int as count from underground_listings where seller_character_id = $1 and status = 'open' and expires_at > now()",
    [character.id],
  );
  if ((open[0]?.count ?? 0) >= limit) throw new OrgError("You already have the maximum number of open listings.");
  const seconds = await rule(sql, "org_listing_seconds");
  const created = await sql.query<{ id: string }>(
    `insert into underground_listings (seller_character_id, place_id, product_id, quantity, unit_price, status, expires_at, idempotency_key)
     values ($1, $2, $3, $4, $5, 'open', now() + ($6 * interval '1 second'), $7)
     on conflict (idempotency_key) do nothing
     returning id`,
    [character.id, place.id, input.productId, input.quantity, input.unitPrice, seconds, input.idempotencyKey],
  );
  const listingId = created[0]?.id;
  if (!listingId) {
    const prior = await sql.query<{ id: string }>("select id from underground_listings where idempotency_key = $1", [input.idempotencyKey]);
    if (!prior[0]) throw new OrgError("That listing could not be saved.");
    return prior[0].id;
  }
  await changeStock(sql, {
    holderKind: "character",
    holderId: character.id,
    placeId: place.id,
    productId: input.productId,
    delta: -input.quantity,
    reason: "underground_list",
    key: `underground:${listingId}:reserve`,
  });
  return listingId;
}

export async function buyUnderground(sql: Sql, input: { userId: string; listingId: string }): Promise<"bought" | "replayed"> {
  await limitOrgAction(sql, input.userId, "buy", 30);
  const character = await lockCharacter(sql, input.userId);
  await expireDueListings(sql);
  const rows = await sql.query<{
    id: string;
    seller_character_id: string;
    place_id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    status: string;
    buyer_character_id: string | null;
    expires_at: string;
  }>("select id, seller_character_id, place_id, product_id, quantity, unit_price, status, buyer_character_id, expires_at from underground_listings where id = $1 for update", [
    input.listingId,
  ]);
  const listing = rows[0];
  if (!listing) throw new OrgError("That listing does not exist.");
  if (listing.status === "sold" && listing.buyer_character_id === character.id) return "replayed";
  if (listing.status !== "open" || new Date(listing.expires_at).getTime() <= Date.now()) throw new OrgError("That listing is not open.");
  if (listing.seller_character_id === character.id) throw new OrgError("You cannot buy your own listing.");
  await assertMarketAccess(sql, character.id, character.level);
  const place = await placeRecord(sql, listing.place_id);
  if (await countriesSanctioned(sql, character.country_id, place.country_id)) throw new OrgError("A sanction blocks this market route.");
  const sold = await sql.query<{ id: string }>(
    "update underground_listings set status = 'sold', buyer_character_id = $2 where id = $1 and status = 'open' returning id",
    [listing.id, character.id],
  );
  if (sold.length === 0) throw new OrgError("That listing is no longer available.");
  const gross = listing.quantity * listing.unit_price;
  const feePercent = await rule(sql, "org_market_fee_percent");
  const fee = Math.floor((gross * feePercent) / 100);
  await transfer(sql, {
    from: { kind: "character", id: character.id },
    to: { kind: "character", id: listing.seller_character_id },
    amount: gross,
    reason: "underground_sale",
    idempotencyKey: `underground:${listing.id}:pay`,
    actorUserId: input.userId,
  });
  if (fee > 0) {
    await transfer(sql, {
      from: { kind: "character", id: character.id },
      to: { kind: "government", id: place.country_id },
      amount: fee,
      reason: "underground_fee",
      idempotencyKey: `underground:${listing.id}:fee`,
      actorUserId: input.userId,
    });
  }
  await changeStock(sql, {
    holderKind: "character",
    holderId: character.id,
    placeId: listing.place_id,
    productId: listing.product_id,
    delta: listing.quantity,
    reason: "underground_purchase",
    key: `underground:${listing.id}:stock`,
  });
  return "bought";
}

export async function expireDueListings(sql: Sql) {
  const rows = await sql.query<{ id: string; seller_character_id: string; place_id: string; product_id: string; quantity: number }>(
    `update underground_listings set status = 'expired'
     where status = 'open' and expires_at <= now()
     returning id, seller_character_id, place_id, product_id, quantity`,
  );
  for (const row of rows) {
    await changeStock(sql, {
      holderKind: "character",
      holderId: row.seller_character_id,
      placeId: row.place_id,
      productId: row.product_id,
      delta: row.quantity,
      reason: "underground_expire",
      key: `underground:${row.id}:return`,
    });
  }
}

async function assertMarketAccess(sql: Sql, characterId: string, level: number) {
  if (level < (await rule(sql, "org_min_level"))) throw new OrgError("You do not meet the level requirement.");
  const profile = await ensureProfile(sql, characterId);
  if (profile?.market_restricted_until && new Date(profile.market_restricted_until).getTime() > Date.now()) {
    throw new OrgError("Market access is temporarily restricted.");
  }
  if (Number(profile?.heat ?? 0) >= (await rule(sql, "org_heat_severe"))) throw new OrgError("Heat is too high for this market.");
}

export async function createDelivery(
  sql: Sql,
  input: { userId: string; originPlaceId: string; destinationPlaceId: string; productId: string; quantity: number; payment: number; idempotencyKey: string },
): Promise<string> {
  assertKey(input.idempotencyKey);
  const character = await lockCharacter(sql, input.userId);
  if (input.originPlaceId === input.destinationPlaceId) throw new OrgError("Choose a different destination.");
  if (!Number.isInteger(input.quantity) || input.quantity <= 0 || input.quantity > 20) throw new OrgError("Choose a quantity from 1 to 20.");
  if (!Number.isInteger(input.payment) || input.payment <= 0 || input.payment > 200) throw new OrgError("Choose a payment from 1 to 200.");
  const origin = await placeRecord(sql, input.originPlaceId);
  const destination = await placeRecord(sql, input.destinationPlaceId);
  if (await countriesSanctioned(sql, origin.country_id, destination.country_id)) throw new OrgError("A sanction blocks this route.");
  const membership = await activeMember(sql, character.id);
  const deposit = Math.max(1, Math.floor(input.payment / 2));
  const created = await sql.query<{ id: string }>(
    `insert into delivery_contracts (
       poster_character_id, organization_id, origin_place_id, destination_place_id, product_id, quantity, payment, deposit, status, deadline, idempotency_key
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'available', now() + interval '1 day', $9)
     on conflict (idempotency_key) do nothing
     returning id`,
    [character.id, membership?.organization_id ?? null, origin.id, destination.id, input.productId, input.quantity, input.payment, deposit, input.idempotencyKey],
  );
  const contractId = created[0]?.id;
  if (!contractId) {
    const prior = await sql.query<{ id: string }>("select id from delivery_contracts where idempotency_key = $1", [input.idempotencyKey]);
    if (!prior[0]) throw new OrgError("That contract could not be saved.");
    return prior[0].id;
  }
  await changeStock(sql, {
    holderKind: "character",
    holderId: character.id,
    placeId: origin.id,
    productId: input.productId,
    delta: -input.quantity,
    reason: "delivery_reserve",
    key: `delivery:${contractId}:reserve`,
  });
  await transfer(sql, {
    from: { kind: "character", id: character.id },
    to: { kind: "system", id: null },
    amount: input.payment,
    reason: "delivery_escrow",
    idempotencyKey: `delivery:${contractId}:escrow`,
    actorUserId: input.userId,
  });
  return contractId;
}

export async function acceptDelivery(sql: Sql, input: { userId: string; contractId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; poster_character_id: string; deposit: number | string; status: string; deadline: string }>(
    "select id, poster_character_id, deposit, status, deadline from delivery_contracts where id = $1 for update",
    [input.contractId],
  );
  const contract = rows[0];
  if (!contract || contract.status !== "available") throw new OrgError("That contract is not available.");
  if (contract.poster_character_id === character.id) throw new OrgError("Someone else must carry this contract.");
  if (new Date(contract.deadline).getTime() <= Date.now()) throw new OrgError("That contract has expired.");
  const claimed = await sql.query<{ id: string }>(
    "update delivery_contracts set status = 'accepted', carrier_character_id = $2 where id = $1 and status = 'available' returning id",
    [contract.id, character.id],
  );
  if (claimed.length === 0) throw new OrgError("That contract is no longer available.");
  await transfer(sql, {
    from: { kind: "character", id: character.id },
    to: { kind: "system", id: null },
    amount: Number(contract.deposit),
    reason: "delivery_deposit",
    idempotencyKey: `delivery:${contract.id}:deposit`,
    actorUserId: input.userId,
  });
}

export async function departDelivery(sql: Sql, input: { userId: string; contractId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; carrier_character_id: string | null; origin_place_id: string; destination_place_id: string; status: string }>(
    "select id, carrier_character_id, origin_place_id, destination_place_id, status from delivery_contracts where id = $1 for update",
    [input.contractId],
  );
  const contract = rows[0];
  if (!contract || contract.status !== "accepted" || contract.carrier_character_id !== character.id) throw new OrgError("You are not carrying that contract.");
  const origin = await placeRecord(sql, contract.origin_place_id);
  const destination = await placeRecord(sql, contract.destination_place_id);
  const seconds = simulatedTransit(distanceKm(origin, destination), { per100km: 15, minimum: 30 });
  await sql.query(
    "update delivery_contracts set status = 'in_transit', arrives_at = now() + ($2 * interval '1 second') where id = $1",
    [contract.id, seconds],
  );
}

export async function resolveDelivery(sql: Sql, input: { userId: string; contractId: string }): Promise<"completed" | "failed"> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{
    id: string;
    poster_character_id: string;
    carrier_character_id: string | null;
    organization_id: string | null;
    destination_place_id: string;
    product_id: string;
    quantity: number;
    payment: number | string;
    deposit: number | string;
    status: string;
    arrives_at: string | null;
  }>(
    `select id, poster_character_id, carrier_character_id, organization_id, destination_place_id, product_id, quantity, payment, deposit, status, arrives_at
     from delivery_contracts where id = $1 for update`,
    [input.contractId],
  );
  const contract = rows[0];
  if (!contract || contract.carrier_character_id !== character.id) throw new OrgError("You are not carrying that contract.");
  if (contract.status === "completed") return "completed";
  if (contract.status === "failed") return "failed";
  if (contract.status !== "in_transit" || !contract.arrives_at || new Date(contract.arrives_at).getTime() > Date.now()) {
    throw new OrgError("That delivery is still in transit.");
  }
  const profile = await ensureProfile(sql, character.id);
  const success = randomInt(0, 20) + character.level + Number(profile?.concealment ?? 0) >= 8;
  const next = success ? "completed" : "failed";
  const updated = await sql.query<{ id: string }>("update delivery_contracts set status = $2 where id = $1 and status = 'in_transit' returning id", [contract.id, next]);
  if (updated.length === 0) return next;
  if (success) {
    await changeStock(sql, {
      holderKind: "character",
      holderId: contract.poster_character_id,
      placeId: contract.destination_place_id,
      productId: contract.product_id,
      delta: contract.quantity,
      reason: "delivery_arrival",
      key: `delivery:${contract.id}:arrive`,
    });
    await transfer(sql, {
      from: { kind: "system", id: null },
      to: { kind: "character", id: character.id },
      amount: Number(contract.payment) + Number(contract.deposit),
      reason: "delivery_payout",
      idempotencyKey: `delivery:${contract.id}:payout`,
      actorUserId: input.userId,
    });
    const membership = await activeMember(sql, character.id);
    if (membership) await addInfluence(sql, membership.organization_id, contract.destination_place_id);
  } else {
    await transfer(sql, {
      from: { kind: "system", id: null },
      to: { kind: "character", id: contract.poster_character_id },
      amount: Number(contract.payment),
      reason: "delivery_refund",
      idempotencyKey: `delivery:${contract.id}:refund`,
      actorUserId: input.userId,
    });
    await addHeat(sql, character.id, 6, "delivery_loss");
  }
  await notify(sql, contract.poster_character_id, contract.organization_id, "delivery", success ? "A delivery was completed." : "A delivery failed and the cargo was lost.", `delivery:${contract.id}`);
  return next;
}

export async function expireAvailableDelivery(sql: Sql, contractId: string): Promise<void> {
  const rows = await sql.query<{
    id: string;
    poster_character_id: string;
    origin_place_id: string;
    product_id: string;
    quantity: number;
    payment: number | string;
    status: string;
    deadline: string;
  }>(
    `select id, poster_character_id, origin_place_id, product_id, quantity, payment, status, deadline
     from delivery_contracts where id = $1 for update`,
    [contractId],
  );
  const contract = rows[0];
  if (!contract || contract.status !== "available" || new Date(contract.deadline).getTime() > Date.now()) return;
  const updated = await sql.query<{ id: string }>("update delivery_contracts set status = 'expired' where id = $1 and status = 'available' returning id", [contract.id]);
  if (updated.length === 0) return;
  const poster = await sql.query<{ user_id: string }>("select user_id from characters where id = $1", [contract.poster_character_id]);
  await changeStock(sql, {
    holderKind: "character",
    holderId: contract.poster_character_id,
    placeId: contract.origin_place_id,
    productId: contract.product_id,
    delta: contract.quantity,
    reason: "delivery_expire",
    key: `delivery:${contract.id}:expire`,
  });
  await transfer(sql, {
    from: { kind: "system", id: null },
    to: { kind: "character", id: contract.poster_character_id },
    amount: Number(contract.payment),
    reason: "delivery_expire_refund",
    idempotencyKey: `delivery:${contract.id}:expire-refund`,
    actorUserId: poster[0]?.user_id ?? null,
  });
}

export async function endorseCandidate(sql: Sql, input: { userId: string; organizationId: string; username: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  if (!legalType(org.org_type)) throw new OrgError("A lawful organization records endorsements.");
  if (org.leader_character_id !== character.id) throw new OrgError("Only the leader can record an endorsement.");
  const found = await sql.query<{ id: string; country_id: string }>("select id, country_id from characters where lower(username) = lower($1)", [input.username.trim()]);
  if (!found[0] || found[0].country_id !== org.country_id) throw new OrgError("Endorse a character in the headquarters country.");
  await recordEvent(sql, org.id, "endorsement", "The organization endorsed a character in this game. The endorsement does not add votes.", "public");
}
