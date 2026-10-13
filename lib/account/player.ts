import type { Sql } from "@/lib/db";

export class AccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountError";
  }
}

export async function acceptTerms(sql: Sql, userId: string): Promise<void> {
  await sql.query("update users set terms_accepted_at = coalesce(terms_accepted_at, now()) where id = $1", [userId]);
}

export async function dismissGuide(sql: Sql, userId: string): Promise<void> {
  await sql.query(
    "update characters set guide_dismissed_at = coalesce(guide_dismissed_at, now()) where user_id = $1",
    [userId],
  );
}

export async function closeAccount(sql: Sql, userId: string): Promise<void> {
  const closed = await sql.query<{ id: string }>(
    `update users
     set email = 'closed-' || id::text || '@players.invalid',
         password_hash = 'closed',
         closed_at = now()
     where id = $1 and closed_at is null
     returning id`,
    [userId],
  );
  if (!closed[0]) throw new AccountError("This account is already closed.");
  await sql.query("delete from sessions where user_id = $1", [userId]);
  await sql.query(
    "insert into audit_events (actor_user_id, action, entity_type, entity_id, payload) values ($1, 'account.close', 'user', $1, '{}'::jsonb)",
    [userId],
  );
}

export async function loadAttention(sql: Sql, characterId: string): Promise<{ production: number; invites: number }> {
  const [production, invites] = await Promise.all([
    sql.query<{ count: number }>(
      `select count(*)::int as count
       from production_jobs job
       join businesses business on business.id = job.business_id
       where business.owner_character_id = $1 and job.status = 'running'`,
      [characterId],
    ),
    sql.query<{ count: number }>(
      `select count(*)::int as count
       from organization_invitations
       where character_id = $1 and status = 'pending' and expires_at > now()`,
      [characterId],
    ),
  ]);
  return {
    production: Number(production[0]?.count ?? 0),
    invites: Number(invites[0]?.count ?? 0),
  };
}
