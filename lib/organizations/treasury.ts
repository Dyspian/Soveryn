import type { Sql } from "@/lib/db";
import { transfer } from "@/lib/economy/service";
import { lockCharacter, lockOrg, recordEvent, requirePermission, rule } from "@/lib/organizations/access";
import { assertKey, OrgError } from "@/lib/organizations/domain";

export async function depositTreasury(sql: Sql, input: { userId: string; organizationId: string; amount: number; idempotencyKey: string }): Promise<"applied" | "replayed"> {
  assertKey(input.idempotencyKey);
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  const member = await sql.query<{ character_id: string }>(
    "select character_id from organization_members where organization_id = $1 and character_id = $2 and status = 'active'",
    [org.id, character.id],
  );
  if (member.length === 0) throw new OrgError("Only a member can contribute.");
  const paid = await transfer(sql, {
    from: { kind: "character", id: character.id },
    to: { kind: "organization", id: org.id },
    amount: input.amount,
    reason: "organization_deposit",
    idempotencyKey: `org-deposit:${input.idempotencyKey}`,
    actorUserId: input.userId,
  });
  if (paid === "applied") await recordEvent(sql, org.id, "treasury", "A member contributed to the treasury.", "members");
  return paid;
}

export async function withdrawTreasury(
  sql: Sql,
  input: { userId: string; organizationId: string; username: string; amount: number; idempotencyKey: string },
): Promise<"applied" | "replayed" | "pending"> {
  assertKey(input.idempotencyKey);
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  const existing = await sql.query<{ id: string; status: string; actor_character_id: string; amount: number | string; payee_character_id: string }>(
    "select id, status, actor_character_id, amount, payee_character_id from organization_withdrawals where idempotency_key = $1 for update",
    [input.idempotencyKey],
  );
  const pending = existing[0];
  if (pending?.status === "pending" && pending.actor_character_id !== character.id) {
    await requirePermission(sql, character.id, org.id, "approve_spend");
    if (Number(pending.amount) !== input.amount || pending.payee_character_id !== (await payeeId(sql, input.username))) {
      throw new OrgError("That confirmation was already used for a different withdrawal.");
    }
    const paid = await transfer(sql, {
      from: { kind: "organization", id: org.id },
      to: { kind: "character", id: pending.payee_character_id },
      amount: Number(pending.amount),
      reason: "organization_withdrawal",
      idempotencyKey: `org-withdraw:${input.idempotencyKey}`,
      actorUserId: input.userId,
    });
    await sql.query("update organization_withdrawals set status = 'applied', approver_character_id = $2 where id = $1", [pending.id, character.id]);
    if (paid === "applied") await recordEvent(sql, org.id, "treasury", "A second officer approved a withdrawal.", "officers");
    return paid === "applied" ? "applied" : "replayed";
  }
  await requirePermission(sql, character.id, org.id, "withdraw");
  const limit = await rule(sql, "org_withdraw_limit");
  if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > limit) {
    throw new OrgError("That amount is outside the configured withdrawal limit.");
  }
  const found = await sql.query<{ id: string }>("select id from characters where lower(username) = lower($1)", [input.username.trim()]);
  const payee = found[0];
  if (!payee) throw new OrgError("No character uses that username.");
  const member = await sql.query<{ character_id: string }>(
    "select character_id from organization_members where organization_id = $1 and character_id = $2 and status = 'active'",
    [org.id, payee.id],
  );
  if (member.length === 0) throw new OrgError("Pay an active member.");
  const threshold = await rule(sql, "org_approval_threshold");
  if (input.amount < threshold) {
    const paid = await transfer(sql, {
      from: { kind: "organization", id: org.id },
      to: { kind: "character", id: payee.id },
      amount: input.amount,
      reason: "organization_withdrawal",
      idempotencyKey: `org-withdraw:${input.idempotencyKey}`,
      actorUserId: input.userId,
    });
    if (paid === "applied") await recordEvent(sql, org.id, "treasury", "A withdrawal was paid from the treasury.", "officers");
    return paid;
  }
  if (pending?.status === "applied") return "replayed";
  if (pending?.status === "pending") return "pending";
  await sql.query(
    `insert into organization_withdrawals (organization_id, actor_character_id, payee_character_id, amount, idempotency_key, status)
     values ($1, $2, $3, $4, $5, 'pending')`,
    [org.id, character.id, payee.id, input.amount, input.idempotencyKey],
  );
  await recordEvent(sql, org.id, "treasury", "A large withdrawal is waiting for a second approval.", "officers");
  return "pending";
}

async function payeeId(sql: Sql, username: string): Promise<string> {
  const found = await sql.query<{ id: string }>("select id from characters where lower(username) = lower($1)", [username.trim()]);
  if (!found[0]) throw new OrgError("No character uses that username.");
  return found[0].id;
}
