import type { Sql } from "@/lib/db";
import { EconomyError } from "@/lib/economy/errors";

export async function claimRequest(
  sql: Sql,
  key: string,
  characterId: string,
  hash: string,
): Promise<{ replay: false } | { replay: true; result: string }> {
  const inserted = await sql.query<{ idempotency_key: string }>(
    `insert into economy_requests (idempotency_key, character_id, request_hash)
     values ($1, $2, $3)
     on conflict (idempotency_key) do nothing
     returning idempotency_key`,
    [key, characterId, hash],
  );
  if (inserted.length > 0) return { replay: false };
  const rows = await sql.query<{ request_hash: string; result_text: string | null; character_id: string }>(
    "select request_hash, result_text, character_id from economy_requests where idempotency_key = $1",
    [key],
  );
  const row = rows[0];
  if (!row || row.character_id !== characterId || row.request_hash !== hash || !row.result_text) {
    throw new EconomyError("That confirmation was already used for a different action.");
  }
  return { replay: true, result: row.result_text };
}

export async function finishRequest(sql: Sql, key: string, result: string): Promise<void> {
  await sql.query("update economy_requests set result_text = $2 where idempotency_key = $1", [key, result]);
}
