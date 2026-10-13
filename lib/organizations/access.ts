import type { Sql } from "@/lib/db";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { OrgError, type Permission } from "@/lib/organizations/domain";

export type CharacterRow = { id: string; user_id: string; username: string; level: number; currency: number | string; country_id: string };
export type OrgRow = {
  id: string;
  name: string;
  tag: string;
  org_type: string;
  leader_character_id: string;
  headquarters_place_id: string;
  country_id: string;
  balance: number | string;
  status: string;
};

export async function rule(sql: Sql, key: string): Promise<number> {
  const rows = await sql.query<{ amount: number | string }>("select amount from game_rules where key = $1", [key]);
  const amount = Number(rows[0]?.amount);
  if (!Number.isFinite(amount)) throw new OrgError("A required game rule is missing.");
  return amount;
}

export async function limitOrgAction(sql: Sql, userId: string, action: string, limit = 20): Promise<void> {
  await consumeRateLimit(sql, `org:${action}:${userId}`, limit, 10 * 60 * 1000);
}

export async function lockCharacter(sql: Sql, userId: string): Promise<CharacterRow> {
  const rows = await sql.query<CharacterRow>(
    "select id, user_id, username, level, currency, country_id from characters where user_id = $1 for update",
    [userId],
  );
  const row = rows[0];
  if (!row) throw new OrgError("Create a character first.");
  return row;
}

export async function lockOrg(sql: Sql, organizationId: string): Promise<OrgRow> {
  const rows = await sql.query<OrgRow>(
    `select id, name, tag, org_type, leader_character_id, headquarters_place_id, country_id, balance, status
     from organizations where id = $1 for update`,
    [organizationId],
  );
  const row = rows[0];
  if (!row || row.status !== "active") throw new OrgError("That organization is not active.");
  return row;
}

export async function requirePermission(sql: Sql, characterId: string, organizationId: string, permission: Permission) {
  const rows = await sql.query<{ rank_key: string; is_founder: boolean; allowed: boolean; sort_order: number }>(
    `select m.rank_key, m.is_founder, r.${permission} as allowed, r.sort_order
     from organization_members m
     join organization_ranks r on r.organization_id = m.organization_id and r.rank_key = m.rank_key
     where m.organization_id = $1 and m.character_id = $2 and m.status = 'active'
     for update of m`,
    [organizationId, characterId],
  );
  const row = rows[0];
  if (!row?.allowed) throw new OrgError("You do not have permission for that.");
  return row;
}

export async function activeMember(sql: Sql, characterId: string) {
  const rows = await sql.query<{ organization_id: string; rank_key: string }>(
    "select organization_id, rank_key from organization_members where character_id = $1 and status = 'active'",
    [characterId],
  );
  return rows[0] ?? null;
}

export async function assertCanJoin(sql: Sql, characterId: string): Promise<void> {
  const current = await activeMember(sql, characterId);
  if (current) throw new OrgError("Leave your current organization first.");
  const cooldown = await rule(sql, "org_switch_cooldown_seconds");
  const recent = await sql.query<{ character_id: string }>(
    `select character_id from organization_members
     where character_id = $1 and status <> 'active' and ended_at is not null
       and ended_at + ($2 * interval '1 second') > now()`,
    [characterId, cooldown],
  );
  if (recent.length > 0) throw new OrgError("Wait before joining another organization.");
}

export async function placeRecord(sql: Sql, placeId: string) {
  const rows = await sql.query<{ id: string; country_id: string; name: string; latitude: number; longitude: number }>(
    "select id, country_id, name, latitude, longitude from places where id = $1",
    [placeId],
  );
  const row = rows[0];
  if (!row) throw new OrgError("That city is not in the game.");
  return row;
}

export async function recordEvent(sql: Sql, organizationId: string, kind: string, detail: string, visibility: "public" | "members" | "officers") {
  await sql.query(
    "insert into organization_events (organization_id, kind, detail, visibility) values ($1, $2, $3, $4)",
    [organizationId, kind, detail, visibility],
  );
}

export async function notify(sql: Sql, characterId: string, organizationId: string | null, kind: string, detail: string, dedupeKey: string) {
  await sql.query(
    `insert into organization_notices (character_id, organization_id, kind, detail, dedupe_key)
     values ($1, $2, $3, $4, $5)
     on conflict (character_id, dedupe_key) do nothing`,
    [characterId, organizationId, kind, detail, dedupeKey],
  );
}

export async function ensureProfile(sql: Sql, characterId: string) {
  await sql.query("insert into character_underworld (character_id) values ($1) on conflict (character_id) do nothing", [characterId]);
  const rows = await sql.query<{
    heat: number;
    planning: number;
    concealment: number;
    fines: number | string;
    market_restricted_until: string | null;
    lay_low_until: string | null;
    reputation: number;
    experience: number;
  }>("select heat, planning, concealment, fines, market_restricted_until, lay_low_until, reputation, experience from character_underworld where character_id = $1 for update", [characterId]);
  return rows[0];
}

export async function addHeat(sql: Sql, characterId: string, delta: number, reason: string) {
  await ensureProfile(sql, characterId);
  await sql.query(
    "update character_underworld set heat = greatest(0, heat + $2), updated_at = now() where character_id = $1",
    [characterId, delta],
  );
  await sql.query("insert into heat_events (character_id, delta, reason) values ($1, $2, $3)", [characterId, delta, reason]);
}

export async function addInfluence(sql: Sql, organizationId: string, placeId: string) {
  const cap = await rule(sql, "org_influence_cap");
  const gain = await rule(sql, "org_influence_gain");
  const current = await sql.query<{ score: number }>(
    "select score from organization_influence where organization_id = $1 and place_id = $2 for update",
    [organizationId, placeId],
  );
  const score = current[0]?.score ?? 0;
  const next = Math.min(cap, score + Math.max(1, Math.floor((gain * (cap - score)) / cap)));
  await sql.query(
    `insert into organization_influence (organization_id, place_id, score)
     values ($1, $2, $3)
     on conflict (organization_id, place_id) do update set score = excluded.score, updated_at = now()`,
    [organizationId, placeId, next],
  );
}

export async function countriesSanctioned(sql: Sql, left: string, right: string): Promise<boolean> {
  if (left === right) return false;
  const [countryA, countryB] = [left, right].sort();
  const rows = await sql.query<{ status: string }>(
    "select status from diplomatic_relations where country_a = $1 and country_b = $2",
    [countryA, countryB],
  );
  return rows[0]?.status === "sanctioned";
}
