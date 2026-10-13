import type { Sql } from "@/lib/db";

const SHIFT_CLAIM_TABLES = {
  bulletin: "world_event_contributions",
  joint: "operation_contributions",
} as const;

export type ShiftClaim = keyof typeof SHIFT_CLAIM_TABLES;

export async function shiftClaimedOn(sql: Sql, shiftId: string, claim: ShiftClaim): Promise<boolean> {
  const table = SHIFT_CLAIM_TABLES[claim];
  const present = await sql.query<{ name: string | null }>("select to_regclass($1)::text as name", [table]);
  if (!present[0]?.name) return false;
  const rows = await sql.query<{ ok: number }>(`select 1 as ok from ${table} where source_key = $1 limit 1`, [`shift:${shiftId}`]);
  return rows.length > 0;
}
