import type { Sql } from "@/lib/db";
import { transfer } from "@/lib/economy/service";
import { activeMember, assertCanJoin, limitOrgAction, lockCharacter, lockOrg, notify, placeRecord, recordEvent, requirePermission, rule } from "@/lib/organizations/access";
import { assertKey, cleanName, cleanTag, isOrgType, isPermission, isRankKey, ORG_TYPES, RANK_SEEDS, type OrgType, type RankKey } from "@/lib/organizations/domain";
import { OrgError } from "@/lib/organizations/domain";

export async function createOrganization(
  sql: Sql,
  input: {
    userId: string;
    name: string;
    tag: string;
    description: string;
    orgType: string;
    placeId: string;
    recruitment: "open" | "application" | "closed";
    visibility: "public" | "private";
    emblemKey: string | null;
    idempotencyKey: string;
  },
): Promise<string> {
  assertKey(input.idempotencyKey);
  if (!isOrgType(input.orgType)) throw new OrgError("That organization type is not available.");
  if (input.recruitment !== "open" && input.recruitment !== "application" && input.recruitment !== "closed") {
    throw new OrgError("Choose open, application, or closed recruitment.");
  }
  if (input.visibility !== "public" && input.visibility !== "private") throw new OrgError("Choose public or private visibility.");
  const emblem = input.emblemKey || null;
  if (emblem && !/^mark-[1-6]$/.test(emblem)) throw new OrgError("Choose one of the built-in emblems.");
  const name = cleanName(input.name, "name", 3, 40);
  const tag = cleanTag(input.tag);
  const description = input.description.trim().slice(0, 400);
  await limitOrgAction(sql, input.userId, "create", 5);
  const character = await lockCharacter(sql, input.userId);
  if (character.level < (await rule(sql, "org_min_level"))) throw new OrgError("You do not meet the level requirement.");
  await assertCanJoin(sql, character.id);
  const place = await placeRecord(sql, input.placeId);
  if (place.country_id !== character.country_id) throw new OrgError("Choose a headquarters city in your starting country.");
  const cost = await rule(sql, "org_startup");
  const memberLimit = await rule(sql, "org_member_limit");
  const created = await sql.query<{ id: string }>(
    `insert into organizations (
       name, tag, description, emblem_key, org_type, founder_character_id, leader_character_id,
       headquarters_place_id, country_id, member_limit, recruitment, visibility
     ) values ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11)
     returning id`,
    [name, tag, description, emblem, input.orgType, character.id, place.id, place.country_id, memberLimit, input.recruitment, input.visibility],
  );
  const organizationId = created[0]?.id;
  if (!organizationId) throw new OrgError("The organization could not be created.");
  for (const rank of RANK_SEEDS) {
    const flags = Object.fromEntries(rank.permissions.map((permission) => [permission, true]));
    await sql.query(
      `insert into organization_ranks (
         organization_id, rank_key, name, sort_order, invite, approve, remove, promote, edit, withdraw,
         approve_spend, start_operations, locations, treaties, rivalries, market, reports, settings, dissolve
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
       )`,
      [
        organizationId,
        rank.key,
        rank.name,
        rank.sort,
        Boolean(flags.invite),
        Boolean(flags.approve),
        Boolean(flags.remove),
        Boolean(flags.promote),
        Boolean(flags.edit),
        Boolean(flags.withdraw),
        Boolean(flags.approve_spend),
        Boolean(flags.start_operations),
        Boolean(flags.locations),
        Boolean(flags.treaties),
        Boolean(flags.rivalries),
        Boolean(flags.market),
        Boolean(flags.reports),
        Boolean(flags.settings),
        Boolean(flags.dissolve),
      ],
    );
  }
  await sql.query(
    `insert into organization_members (organization_id, character_id, rank_key, is_founder, status)
     values ($1, $2, 'founder', true, 'active')`,
    [organizationId, character.id],
  );
  await transfer(sql, {
    from: { kind: "character", id: character.id },
    to: { kind: "system", id: null },
    amount: cost,
    reason: "organization_founding",
    idempotencyKey: `org-create:${input.idempotencyKey}`,
    actorUserId: input.userId,
  });
  await recordEvent(sql, organizationId, "founded", `${name} was founded. This is a player organization, not a real institution.`, "public");
  return organizationId;
}

export async function inviteMember(sql: Sql, input: { userId: string; organizationId: string; username: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  await requirePermission(sql, character.id, org.id, "invite");
  const found = await sql.query<{ id: string }>("select id from characters where lower(username) = lower($1)", [input.username.trim()]);
  const target = found[0];
  if (!target) throw new OrgError("No character uses that username.");
  if (target.id === character.id) throw new OrgError("You are already in this organization.");
  await assertCanJoin(sql, target.id);
  const seconds = await rule(sql, "org_invite_seconds");
  const created = await sql.query<{ id: string }>(
    `insert into organization_invitations (organization_id, character_id, invited_by, status, expires_at)
     values ($1, $2, $3, 'pending', now() + ($4 * interval '1 second'))
     on conflict do nothing
     returning id`,
    [org.id, target.id, character.id, seconds],
  );
  if (created.length === 0) throw new OrgError("That character already has a pending invitation.");
  await notify(sql, target.id, org.id, "invitation", `${org.name} invited you.`, `invite:${created[0]?.id}`);
  await recordEvent(sql, org.id, "invite", "An invitation was sent.", "officers");
}

export async function respondInvitation(sql: Sql, input: { userId: string; invitationId: string; accept: boolean }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; organization_id: string; character_id: string; status: string; expires_at: string }>(
    "select id, organization_id, character_id, status, expires_at from organization_invitations where id = $1 for update",
    [input.invitationId],
  );
  const invite = rows[0];
  if (!invite || invite.character_id !== character.id || invite.status !== "pending") throw new OrgError("That invitation is not open.");
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    await sql.query("update organization_invitations set status = 'expired' where id = $1", [invite.id]);
    throw new OrgError("That invitation has expired.");
  }
  if (!input.accept) {
    await sql.query("update organization_invitations set status = 'declined' where id = $1", [invite.id]);
    return;
  }
  await assertCanJoin(sql, character.id);
  await seatRecruit(sql, invite.organization_id, character.id);
  await sql.query("update organization_invitations set status = 'accepted' where id = $1", [invite.id]);
  await recordEvent(sql, invite.organization_id, "join", "A character accepted an invitation.", "members");
}

export async function applyToOrganization(sql: Sql, input: { userId: string; organizationId: string }): Promise<"joined" | "pending"> {
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  const recruitment = await sql.query<{ recruitment: string; visibility: string }>("select recruitment, visibility from organizations where id = $1", [org.id]);
  const mode = recruitment[0];
  if (!mode || mode.recruitment === "closed") throw new OrgError("This organization is not recruiting.");
  if (mode.visibility === "private" && mode.recruitment !== "open" && mode.recruitment !== "application") {
    throw new OrgError("This organization is not recruiting.");
  }
  await assertCanJoin(sql, character.id);
  if (mode.recruitment === "open") {
    await seatRecruit(sql, org.id, character.id);
    await recordEvent(sql, org.id, "join", "A character joined.", "members");
    return "joined";
  }
  const created = await sql.query<{ id: string }>(
    `insert into organization_applications (organization_id, character_id, status)
     values ($1, $2, 'pending')
     on conflict do nothing
     returning id`,
    [org.id, character.id],
  );
  if (created.length === 0) throw new OrgError("Your application is already pending.");
  await notify(sql, org.leader_character_id, org.id, "application", "A membership application is waiting.", `apply:${created[0]?.id}`);
  return "pending";
}

export async function reviewApplication(sql: Sql, input: { userId: string; applicationId: string; approve: boolean }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; organization_id: string; character_id: string; status: string }>(
    "select id, organization_id, character_id, status from organization_applications where id = $1 for update",
    [input.applicationId],
  );
  const application = rows[0];
  if (!application || application.status !== "pending") throw new OrgError("That application is not pending.");
  await lockOrg(sql, application.organization_id);
  await requirePermission(sql, character.id, application.organization_id, "approve");
  if (!input.approve) {
    await sql.query("update organization_applications set status = 'rejected' where id = $1", [application.id]);
    await notify(sql, application.character_id, application.organization_id, "application", "Your application was declined.", `apply-result:${application.id}`);
    return;
  }
  await assertCanJoin(sql, application.character_id);
  await seatRecruit(sql, application.organization_id, application.character_id);
  await sql.query("update organization_applications set status = 'approved' where id = $1", [application.id]);
  await notify(sql, application.character_id, application.organization_id, "application", "Your application was approved.", `apply-result:${application.id}`);
  await recordEvent(sql, application.organization_id, "join", "An application was approved.", "members");
}

async function seatRecruit(sql: Sql, organizationId: string, characterId: string) {
  const org = await lockOrg(sql, organizationId);
  const count = await sql.query<{ count: number }>(
    "select count(*)::int as count from organization_members where organization_id = $1 and status = 'active'",
    [organizationId],
  );
  const limit = await sql.query<{ member_limit: number }>("select member_limit from organizations where id = $1", [organizationId]);
  if ((count[0]?.count ?? 0) >= (limit[0]?.member_limit ?? 0)) throw new OrgError("This organization is at its membership limit.");
  await sql.query(
    `insert into organization_members (organization_id, character_id, rank_key, is_founder, status)
     values ($1, $2, 'recruit', false, 'active')
     on conflict (organization_id, character_id) do update
       set rank_key = 'recruit', status = 'active', joined_at = now(), ended_at = null`,
    [organizationId, characterId],
  );
  await notify(sql, org.leader_character_id, organizationId, "member", "Membership changed.", `member:${organizationId}:${characterId}`);
}

export async function leaveOrganization(sql: Sql, input: { userId: string; organizationId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  if (org.leader_character_id === character.id) throw new OrgError("Transfer leadership before leaving.");
  const updated = await sql.query<{ character_id: string }>(
    `update organization_members set status = 'left', ended_at = now()
     where organization_id = $1 and character_id = $2 and status = 'active'
     returning character_id`,
    [org.id, character.id],
  );
  if (updated.length === 0) throw new OrgError("You are not an active member.");
  await recordEvent(sql, org.id, "leave", "A member left.", "members");
}

export async function removeMember(sql: Sql, input: { userId: string; organizationId: string; username: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  const actor = await requirePermission(sql, character.id, org.id, "remove");
  const found = await sql.query<{ id: string }>("select id from characters where lower(username) = lower($1)", [input.username.trim()]);
  if (!found[0] || found[0].id === character.id) throw new OrgError("Choose another member.");
  const target = await sql.query<{ rank_key: string; is_founder: boolean; sort_order: number }>(
    `select m.rank_key, m.is_founder, r.sort_order
     from organization_members m
     join organization_ranks r on r.organization_id = m.organization_id and r.rank_key = m.rank_key
     where m.organization_id = $1 and m.character_id = $2 and m.status = 'active'`,
    [org.id, found[0].id],
  );
  if (!target[0] || target[0].is_founder || target[0].sort_order >= actor.sort_order) throw new OrgError("You cannot remove that member.");
  await sql.query(
    "update organization_members set status = 'removed', ended_at = now() where organization_id = $1 and character_id = $2",
    [org.id, found[0].id],
  );
  await notify(sql, found[0].id, org.id, "removal", `You were removed from ${org.name}.`, `remove:${org.id}:${found[0].id}:${Date.now()}`);
  await recordEvent(sql, org.id, "removal", "A member was removed.", "officers");
}

export async function setRank(sql: Sql, input: { userId: string; organizationId: string; username: string; rankKey: string }): Promise<void> {
  if (!isRankKey(input.rankKey) || input.rankKey === "founder") throw new OrgError("That rank cannot be assigned.");
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  const actor = await requirePermission(sql, character.id, org.id, "promote");
  const found = await sql.query<{ id: string }>("select id from characters where lower(username) = lower($1)", [input.username.trim()]);
  if (!found[0] || found[0].id === character.id) throw new OrgError("Choose another member.");
  const rank = await sql.query<{ sort_order: number }>(
    "select sort_order from organization_ranks where organization_id = $1 and rank_key = $2",
    [org.id, input.rankKey],
  );
  if (!rank[0] || rank[0].sort_order >= actor.sort_order) throw new OrgError("You cannot assign a rank at or above your own.");
  const updated = await sql.query<{ character_id: string }>(
    `update organization_members set rank_key = $3
     where organization_id = $1 and character_id = $2 and status = 'active' and is_founder = false
     returning character_id`,
    [org.id, found[0].id, input.rankKey],
  );
  if (updated.length === 0) throw new OrgError("That member cannot be reassigned.");
  await notify(sql, found[0].id, org.id, "rank", "Your organization rank changed.", `rank:${org.id}:${found[0].id}:${input.rankKey}`);
  await recordEvent(sql, org.id, "rank", "A member's rank changed.", "members");
}

export async function transferLeadership(sql: Sql, input: { userId: string; organizationId: string; username: string; idempotencyKey: string }): Promise<void> {
  assertKey(input.idempotencyKey);
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  if (org.leader_character_id !== character.id) throw new OrgError("Only the current leader can transfer leadership.");
  const found = await sql.query<{ id: string }>("select id from characters where lower(username) = lower($1)", [input.username.trim()]);
  if (!found[0] || found[0].id === character.id) throw new OrgError("Choose another member.");
  const member = await sql.query<{ character_id: string }>(
    "select character_id from organization_members where organization_id = $1 and character_id = $2 and status = 'active'",
    [org.id, found[0].id],
  );
  if (member.length === 0) throw new OrgError("Choose an active member.");
  const prior = await sql.query<{ rank_key: string }>(
    "select rank_key from organization_members where organization_id = $1 and character_id = $2",
    [org.id, character.id],
  );
  await sql.query("update organizations set leader_character_id = $2 where id = $1", [org.id, found[0].id]);
  await sql.query("update organization_members set rank_key = 'leader' where organization_id = $1 and character_id = $2", [org.id, found[0].id]);
  if (prior[0]?.rank_key === "leader" || prior[0]?.rank_key === "founder") {
    await sql.query("update organization_members set rank_key = 'deputy' where organization_id = $1 and character_id = $2", [org.id, character.id]);
  }
  await sql.query(
    `insert into audit_events (actor_user_id, action, entity_type, entity_id, payload)
     values ($1, 'organization.leadership_transfer', 'organization', $2, $3::jsonb)`,
    [input.userId, org.id, JSON.stringify({ to: found[0].id, key: input.idempotencyKey })],
  );
  await notify(sql, found[0].id, org.id, "leadership", `You now lead ${org.name}.`, `lead:${input.idempotencyKey}`);
  await recordEvent(sql, org.id, "leadership", "Leadership was transferred.", "members");
}

export async function dissolveOrganization(sql: Sql, input: { userId: string; organizationId: string; idempotencyKey: string }): Promise<void> {
  assertKey(input.idempotencyKey);
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  await requirePermission(sql, character.id, org.id, "dissolve");
  const running = await sql.query<{ id: string }>(
    "select id from operations where organization_id = $1 and status in ('preparation', 'recruiting', 'ready', 'in_progress')",
    [org.id],
  );
  if (running.length > 0) throw new OrgError("Finish or cancel open operations before dissolving.");
  const balance = Number(org.balance);
  if (balance > 0) {
    await transfer(sql, {
      from: { kind: "organization", id: org.id },
      to: { kind: "character", id: character.id },
      amount: balance,
      reason: "organization_dissolution",
      idempotencyKey: `org-dissolve:${input.idempotencyKey}`,
      actorUserId: input.userId,
    });
  }
  await sql.query("update organizations set status = 'dissolved' where id = $1", [org.id]);
  await sql.query(
    "update organization_members set status = 'left', ended_at = now() where organization_id = $1 and status = 'active'",
    [org.id],
  );
  await recordEvent(sql, org.id, "dissolved", "The organization was dissolved. The remaining treasury was paid to the dissolving leader.", "public");
}

export async function renameRank(sql: Sql, input: { userId: string; organizationId: string; rankKey: string; name: string }): Promise<void> {
  if (!isRankKey(input.rankKey)) throw new OrgError("That rank is not recognized.");
  const name = cleanName(input.name, "rank name", 3, 24);
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  await requirePermission(sql, character.id, org.id, "settings");
  await sql.query("update organization_ranks set name = $3 where organization_id = $1 and rank_key = $2", [org.id, input.rankKey, name]);
}

export async function setPermission(sql: Sql, input: { userId: string; organizationId: string; rankKey: string; permission: string; enabled: boolean }): Promise<void> {
  if (!isRankKey(input.rankKey) || input.rankKey === "founder") throw new OrgError("The founder rank keeps its permissions.");
  if (!isPermission(input.permission) || input.permission === "dissolve") throw new OrgError("That permission cannot be changed.");
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  await requirePermission(sql, character.id, org.id, "settings");
  await sql.query(`update organization_ranks set ${input.permission} = $3 where organization_id = $1 and rank_key = $2`, [
    org.id,
    input.rankKey,
    input.enabled,
  ]);
  await recordEvent(sql, org.id, "settings", "A rank permission was changed.", "officers");
}

export async function addLocation(sql: Sql, input: { userId: string; organizationId: string; placeId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  await requirePermission(sql, character.id, org.id, "locations");
  const place = await placeRecord(sql, input.placeId);
  if (place.country_id !== org.country_id) throw new OrgError("Operational locations stay in the headquarters country.");
  const count = await sql.query<{ count: number }>("select count(*)::int as count from organization_locations where organization_id = $1", [org.id]);
  if ((count[0]?.count ?? 0) >= 5) throw new OrgError("This organization already has five operational locations.");
  await sql.query(
    "insert into organization_locations (organization_id, place_id) values ($1, $2) on conflict do nothing",
    [org.id, place.id],
  );
}

export async function markNoticeRead(sql: Sql, input: { userId: string; noticeId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  await sql.query("update organization_notices set read_at = now() where id = $1 and character_id = $2 and read_at is null", [input.noticeId, character.id]);
}

export async function markAllNoticesRead(sql: Sql, input: { userId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  await sql.query("update organization_notices set read_at = now() where character_id = $1 and read_at is null", [character.id]);
}

export function legalType(orgType: string): boolean {
  return isOrgType(orgType) ? ORG_TYPES[orgType as OrgType].legal : false;
}

export async function viewerMembership(sql: Sql, userId: string) {
  const rows = await sql.query<{ id: string }>("select id from characters where user_id = $1", [userId]);
  if (!rows[0]) return null;
  return activeMember(sql, rows[0].id);
}

export type { RankKey };
