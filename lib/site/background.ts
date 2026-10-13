import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "@/lib/db";

export const WEBSITE_BACKGROUND_ID = "background";

export function websiteBackgroundPath(): string {
  return path.join(process.cwd(), "assets", "website-background.jpg");
}

export function websiteAssetBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string" && value.startsWith("\\x")) {
    const hex = value.slice(2);
    if (hex.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(hex)) return Uint8Array.from(Buffer.from(hex, "hex"));
  }
  return null;
}

export async function ensureWebsiteBackground(sql: Sql): Promise<void> {
  const existing = await sql.query<{ id: string }>("select id from website_assets where id = $1", [WEBSITE_BACKGROUND_ID]);
  if (existing.length > 0) return;
  const bytes = await readFile(websiteBackgroundPath());
  await sql.query(
    "insert into website_assets (id, content_type, bytes) values ($1, 'image/jpeg', $2) on conflict (id) do nothing",
    [WEBSITE_BACKGROUND_ID, bytes],
  );
}
