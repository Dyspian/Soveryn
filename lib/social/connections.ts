import type { Sql } from "@/lib/db";

export class SocialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialError";
  }
}

type Pair = {
  character_a: string;
  character_b: string;
  requester_id: string;
  status: string;
  blocker_id: string | null;
};

function ordered(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

async function viewer(sql: Sql, userId: string): Promise<{ id: string; username: string }> {
  const rows = await sql.query<{ id: string; username: string }>(
    "select id, username from characters where user_id = $1 for update",
    [userId],
  );
  const row = rows[0];
  if (!row) throw new SocialError("Create a character before using connections.");
  return row;
}

async function byUsername(sql: Sql, username: string): Promise<{ id: string; username: string }> {
  const name = username.trim();
  const rows = await sql.query<{ id: string; username: string }>(
    "select id, username from characters where lower(username) = lower($1) and status = 'active'",
    [name],
  );
  const row = rows[0];
  if (!row) throw new SocialError("That character was not found.");
  return row;
}

async function lockPair(sql: Sql, left: string, right: string): Promise<Pair | null> {
  const [characterA, characterB] = ordered(left, right);
  const rows = await sql.query<Pair>(
    `select character_a, character_b, requester_id, status, blocker_id
     from character_connections where character_a = $1 and character_b = $2 for update`,
    [characterA, characterB],
  );
  return rows[0] ?? null;
}

export async function requestConnection(sql: Sql, input: { userId: string; username: string }): Promise<void> {
  const me = await viewer(sql, input.userId);
  const them = await byUsername(sql, input.username);
  if (me.id === them.id) throw new SocialError("You cannot connect to your own character.");
  const [characterA, characterB] = ordered(me.id, them.id);
  const existing = await lockPair(sql, me.id, them.id);
  if (existing?.status === "blocked") throw new SocialError("Contact is not available.");
  if (existing?.status === "accepted") throw new SocialError("You are already connected.");
  if (existing?.status === "pending") {
    throw new SocialError(existing.requester_id === me.id ? "That request is already waiting." : "That character already sent you a request.");
  }
  const saved = await sql.query<{ character_a: string }>(
    `insert into character_connections (character_a, character_b, requester_id, status)
     values ($1, $2, $3, 'pending')
     on conflict (character_a, character_b) do update
       set requester_id = excluded.requester_id, status = 'pending', blocker_id = null, updated_at = now()
       where character_connections.status in ('declined', 'removed')
     returning character_a`,
    [characterA, characterB, me.id],
  );
  if (saved.length === 0) throw new SocialError("That connection cannot be requested.");
}

export async function acceptConnection(sql: Sql, input: { userId: string; username: string }): Promise<void> {
  const me = await viewer(sql, input.userId);
  const them = await byUsername(sql, input.username);
  const existing = await lockPair(sql, me.id, them.id);
  if (!existing || existing.status !== "pending" || existing.requester_id === me.id) {
    throw new SocialError("There is no request for you to accept.");
  }
  await sql.query(
    `update character_connections set status = 'accepted', updated_at = now()
     where character_a = $1 and character_b = $2 and status = 'pending'`,
    [existing.character_a, existing.character_b],
  );
}

export async function declineConnection(sql: Sql, input: { userId: string; username: string }): Promise<void> {
  const me = await viewer(sql, input.userId);
  const them = await byUsername(sql, input.username);
  const existing = await lockPair(sql, me.id, them.id);
  if (!existing || existing.status !== "pending" || existing.requester_id === me.id) {
    throw new SocialError("There is no request for you to decline.");
  }
  await sql.query(
    `update character_connections set status = 'declined', updated_at = now()
     where character_a = $1 and character_b = $2 and status = 'pending'`,
    [existing.character_a, existing.character_b],
  );
}

export async function removeConnection(sql: Sql, input: { userId: string; username: string }): Promise<void> {
  const me = await viewer(sql, input.userId);
  const them = await byUsername(sql, input.username);
  const existing = await lockPair(sql, me.id, them.id);
  if (!existing) throw new SocialError("There is no connection to remove.");
  if (existing.status === "blocked") throw new SocialError("Contact is not available.");
  if (existing.status === "pending" && existing.requester_id !== me.id) throw new SocialError("Decline the request instead of removing it.");
  if (existing.status !== "pending" && existing.status !== "accepted") throw new SocialError("There is no connection to remove.");
  await sql.query(
    `update character_connections set status = 'removed', blocker_id = null, updated_at = now()
     where character_a = $1 and character_b = $2 and status = $3`,
    [existing.character_a, existing.character_b, existing.status],
  );
}

export async function blockConnection(sql: Sql, input: { userId: string; username: string }): Promise<void> {
  const me = await viewer(sql, input.userId);
  const them = await byUsername(sql, input.username);
  if (me.id === them.id) throw new SocialError("You cannot block your own character.");
  const [characterA, characterB] = ordered(me.id, them.id);
  await lockPair(sql, me.id, them.id);
  await sql.query(
    `insert into character_connections (character_a, character_b, requester_id, status, blocker_id)
     values ($1, $2, $3, 'blocked', $3)
     on conflict (character_a, character_b) do update
       set status = 'blocked', blocker_id = $3, updated_at = now()`,
    [characterA, characterB, me.id],
  );
}

export async function unblockConnection(sql: Sql, input: { userId: string; username: string }): Promise<void> {
  const me = await viewer(sql, input.userId);
  const them = await byUsername(sql, input.username);
  const existing = await lockPair(sql, me.id, them.id);
  if (!existing || existing.status !== "blocked" || existing.blocker_id !== me.id) {
    throw new SocialError("You have not blocked that character.");
  }
  await sql.query(
    `update character_connections set status = 'removed', blocker_id = null, updated_at = now()
     where character_a = $1 and character_b = $2 and status = 'blocked' and blocker_id = $3`,
    [existing.character_a, existing.character_b, me.id],
  );
}

export async function connectionWith(sql: Sql, viewerId: string, otherId: string) {
  const [characterA, characterB] = ordered(viewerId, otherId);
  const rows = await sql.query<Pair>(
    `select character_a, character_b, requester_id, status, blocker_id
     from character_connections where character_a = $1 and character_b = $2`,
    [characterA, characterB],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    status: row.status,
    outgoing: row.requester_id === viewerId,
    blockedByViewer: row.status === "blocked" && row.blocker_id === viewerId,
  };
}

export async function listConnections(sql: Sql, characterId: string) {
  return sql.query<{ username: string; status: string; outgoing: boolean; blockedByViewer: boolean }>(
    `select other.username, c.status, c.requester_id = $1 as outgoing, c.blocker_id = $1 as "blockedByViewer"
     from character_connections c
     join characters other on other.id = case when c.character_a = $1 then c.character_b else c.character_a end
     where (c.character_a = $1 or c.character_b = $1)
       and (c.status in ('pending', 'accepted') or (c.status = 'blocked' and c.blocker_id = $1))
     order by other.username
     limit 40`,
    [characterId],
  );
}

export async function publicStanding(sql: Sql, characterId: string) {
  const [orgs, events, missions] = await Promise.all([
    sql.query<{ name: string; tag: string }>(
      `select o.name, o.tag
       from organization_members m
       join organizations o on o.id = m.organization_id
       where m.character_id = $1 and m.status = 'active' and o.status = 'active' and o.visibility = 'public'
       order by o.name
       limit 3`,
      [characterId],
    ),
    sql.query<{ kind: string; detail: string; reputation: number; createdAt: string | Date }>(
      `select kind, detail, reputation_awarded as reputation, created_at as "createdAt"
       from progression_events
       where character_id = $1 and kind in ('mission', 'level_up')
       order by created_at desc
       limit 8`,
      [characterId],
    ),
    sql.query<{ name: string; completedAt: string | Date }>(
      `select m.name, cm.completed_at as "completedAt"
       from character_missions cm
       join missions m on m.id = cm.mission_id
       where cm.character_id = $1 and cm.status = 'completed' and cm.completed_at is not null
       order by cm.completed_at
       limit 1`,
      [characterId],
    ),
  ]);
  const reputation = await sql.query<{ reputation: number }>("select reputation from characters where id = $1", [characterId]);
  return {
    reputation: Number(reputation[0]?.reputation ?? 0),
    organizations: orgs,
    events,
    firstMission: missions[0] ?? null,
  };
}

export async function discoverCharacters(sql: Sql, input: { viewerId: string; username: string; specialization: string; page?: number }) {
  const prefix = input.username.trim().slice(0, 20);
  const specialization = input.specialization.trim();
  const page = Math.max(0, Math.min(9, Math.floor(input.page ?? 0)));
  if (prefix.length < 2 && specialization.length === 0) return [];
  const allowed = ["", "entrepreneur", "politician", "industrialist", "trader", "criminal", "security", "explorer", "generalist"];
  if (!allowed.includes(specialization)) throw new SocialError("That specialization is not available.");
  return sql.query<{ username: string; level: number; specialization: string; organization: string | null }>(
    `select c.username, c.level, c.specialization,
            (select o.name from organization_members m
             join organizations o on o.id = m.organization_id
             where m.character_id = c.id and m.status = 'active' and o.status = 'active' and o.visibility = 'public'
             order by o.name limit 1) as organization
     from characters c
     where c.status = 'active'
       and c.id <> $1
       and ($2 = '' or c.username ilike $2 || '%')
       and ($3 = '' or c.specialization = $3)
       and not exists (
         select 1 from character_connections block
         where block.status = 'blocked'
           and ((block.character_a = $1 and block.character_b = c.id) or (block.character_b = $1 and block.character_a = c.id))
       )
     order by c.username
     limit 20 offset $4`,
    [input.viewerId, prefix, specialization, page * 20],
  );
}
