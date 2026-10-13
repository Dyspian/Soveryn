import type { Sql } from "@/lib/db";

export async function featureEnabled(sql: Sql, key: string): Promise<boolean> {
  const rows = await sql.query<{ amount: number | string }>("select amount from game_rules where key = $1", [key]);
  return Number(rows[0]?.amount) === 1;
}
