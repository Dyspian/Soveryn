import { createHash } from "node:crypto";
import type { Sql } from "@/lib/db";

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export async function consumeRateLimit(
  sql: Sql,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs < 1000) {
    throw new RateLimitError("Too many attempts. Wait a while and try again.");
  }
  const key = createHash("sha256").update(bucket).digest("hex");
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const rows = await sql.query<{ hits: number }>(
    `insert into rate_limits (bucket, hits, window_started_at)
     values ($1, 1, now())
     on conflict (bucket) do update
       set hits = case
             when rate_limits.window_started_at <= now() - ($3 * interval '1 second') then 1
             else rate_limits.hits + 1
           end,
           window_started_at = case
             when rate_limits.window_started_at <= now() - ($3 * interval '1 second') then now()
             else rate_limits.window_started_at
           end
     where rate_limits.window_started_at <= now() - ($3 * interval '1 second')
        or rate_limits.hits < $2
     returning hits`,
    [key, limit, windowSeconds],
  );
  if (rows.length === 0) throw new RateLimitError("Too many attempts. Wait a while and try again.");
}
