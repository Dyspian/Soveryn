import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import { consumeRateLimit, RateLimitError } from "@/lib/auth/rate-limit";
import { checkLoginPassword, hashPassword } from "@/lib/auth/password";
import { accountRole } from "@/lib/auth/session";
import type { Sql } from "@/lib/db";

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

async function tx<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return db.transaction(async (transaction) => fn(asSql(transaction)));
}

describe("session role and login checks", () => {
  const previous = process.env.ADMIN_EMAILS;

  afterAll(() => {
    if (previous == null) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previous;
  });

  it("grants admin only while the email is listed", () => {
    process.env.ADMIN_EMAILS = "keeper@example.com";
    expect(accountRole("keeper@example.com")).toBe("admin");
    expect(accountRole("Keeper@Example.com")).toBe("admin");
    expect(accountRole("former@example.com")).toBe("player");
    process.env.ADMIN_EMAILS = "";
    expect(accountRole("keeper@example.com")).toBe("player");
  });

  it("rejects an unknown account without accepting the supplied password", async () => {
    const stored = await hashPassword("correct-password");
    expect(await checkLoginPassword("correct-password", stored)).toBe(true);
    expect(await checkLoginPassword("correct-password", null)).toBe(false);
    expect(await checkLoginPassword("other-password", stored)).toBe(false);
  });
});

describe("rate limits", () => {
  afterAll(async () => {
    await db.close();
  });

  it("counts parallel attempts once each and stops at the limit", async () => {
    await db.exec(readFileSync(path.join(process.cwd(), "db", "migrations", "0001_foundation.sql"), "utf8"));
    await expect(
      tx(async (sql) => {
        await consumeRateLimit(sql, "security:serial", 2, 60_000);
        await consumeRateLimit(sql, "security:serial", 2, 60_000);
        await consumeRateLimit(sql, "security:serial", 2, 60_000);
      }),
    ).rejects.toBeInstanceOf(RateLimitError);

    const raced = await Promise.allSettled([
      tx((sql) => consumeRateLimit(sql, "security:race", 1, 60_000)),
      tx((sql) => consumeRateLimit(sql, "security:race", 1, 60_000)),
    ]);
    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(raced.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
});
