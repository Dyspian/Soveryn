import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";

export type SqlRow = Record<string, unknown>;

export type Sql = {
  query<T = SqlRow>(text: string, params?: readonly unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
};

type Database = {
  sql: Sql;
  transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

const globalDb = globalThis as unknown as { soverynDb?: Database };

function wrapPglite(db: PGlite): Database {
  const sql: Sql = {
    async query<T>(text: string, params: readonly unknown[] = []) {
      const result = await db.query<T>(text, [...params]);
      return result.rows;
    },
    async exec(text: string) {
      await db.exec(text);
    },
  };

  return {
    sql,
    async transaction(fn) {
      return db.transaction(async (tx) => {
        const txSql: Sql = {
          async query<T>(text: string, params: readonly unknown[] = []) {
            const result = await tx.query<T>(text, [...params]);
            return result.rows;
          },
          async exec(text: string) {
            await tx.exec(text);
          },
        };
        return fn(txSql);
      });
    },
    close: () => db.close(),
  };
}

function wrapPostgres(url: string): Database {
  const client = postgres(url, { max: 8, idle_timeout: 20 });
  const toSql = (tx: { unsafe: (text: string, params?: readonly unknown[]) => Promise<unknown> }): Sql => ({
    async query<T>(text: string, params: readonly unknown[] = []) {
      const rows = await tx.unsafe(text, params);
      return rows as T[];
    },
    async exec(text: string) {
      await tx.unsafe(text);
    },
  });

  return {
    sql: toSql(client as never),
    async transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
      return client.begin(async (tx) => fn(toSql(tx as never))) as Promise<T>;
    },
    close: () => client.end(),
  };
}

export function devSessionSecretPath(): string {
  return path.join(process.cwd(), "data", "dev-session-secret");
}

export function resolveSessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && configured.length >= 32 && !configured.startsWith("replace-with")) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be a random string of at least 32 characters.");
  }
  const file = devSessionSecretPath();
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  mkdirSync(path.dirname(file), { recursive: true });
  const secret = randomBytes(32).toString("hex");
  writeFileSync(file, secret, { encoding: "utf8", mode: 0o600 });
  return secret;
}

export async function openDatabase(): Promise<Database> {
  if (globalDb.soverynDb) return globalDb.soverynDb;
  const url = process.env.DATABASE_URL?.trim();
  const database = url
    ? wrapPostgres(url)
    : wrapPglite(new PGlite(path.join(process.cwd(), "data", "pglite")));
  globalDb.soverynDb = database;
  return database;
}

export async function getSql(): Promise<Sql> {
  const database = await openDatabase();
  return database.sql;
}

export async function withTransaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const database = await openDatabase();
  return database.transaction(fn);
}

export async function closeDatabase(): Promise<void> {
  if (!globalDb.soverynDb) return;
  await globalDb.soverynDb.close();
  globalDb.soverynDb = undefined;
}
