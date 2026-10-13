import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { ensureWebsiteBackground, websiteAssetBytes, websiteBackgroundPath, WEBSITE_BACKGROUND_ID } from "@/lib/site/background";

const db = new PGlite();

function asSql(queryable: { query: PGlite["query"]; exec: PGlite["exec"] }): Sql {
  return {
    async query<T>(text: string, params: readonly unknown[] = []) {
      const result = await queryable.query<T>(text, [...params]);
      return result.rows;
    },
    async exec(text: string) {
      await queryable.exec(text);
    },
  };
}

describe("website background", () => {
  afterAll(async () => {
    await db.close();
  });

  it("stores the public homepage image once", async () => {
    await db.exec(readFileSync(path.join(process.cwd(), "db", "migrations", "0024_website_background.sql"), "utf8"));
    const sql = asSql(db);
    await ensureWebsiteBackground(sql);
    await ensureWebsiteBackground(sql);
    const rows = await sql.query<{ id: string; content_type: string; bytes: unknown }>(
      "select id, content_type, bytes from website_assets",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(WEBSITE_BACKGROUND_ID);
    expect(rows[0]?.content_type).toBe("image/jpeg");
    const stored = websiteAssetBytes(rows[0]?.bytes);
    const source = readFileSync(websiteBackgroundPath());
    expect(stored).toEqual(new Uint8Array(source));
  });
});
