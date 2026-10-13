import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "@/lib/db";

export async function applyMigrations(sql: Sql): Promise<string[]> {
  await sql.exec(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const directory = path.join(process.cwd(), "db", "migrations");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  const applied: string[] = [];

  for (const file of files) {
    const existing = await sql.query<{ id: string }>("select id from schema_migrations where id = $1", [file]);
    if (existing.length > 0) continue;

    const body = await readFile(path.join(directory, file), "utf8");
    if (file.startsWith("0002_postgis")) {
      const available = await postgisAvailable(sql);
      if (!available) {
        console.log(`Skipping ${file}: PostGIS is not installed on this database.`);
        continue;
      }
    }

    await sql.exec(body);
    await sql.query("insert into schema_migrations (id) values ($1)", [file]);
    applied.push(file);
  }

  return applied;
}

async function postgisAvailable(sql: Sql): Promise<boolean> {
  try {
    await sql.exec("create extension if not exists postgis");
    const rows = await sql.query<{ ok: string }>("select postgis_version() as ok");
    return rows.length > 0 && Boolean(rows[0]?.ok);
  } catch {
    return false;
  }
}
