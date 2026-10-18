import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { loadWorldIntelligence } from "@/lib/site/intelligence";
import { countValue, isWorldIntelligence } from "@/lib/site/intelligence-view";

const schema = `
  create table users (
    id uuid primary key default gen_random_uuid(),
    status text not null,
    closed_at timestamptz
  );
  create table characters (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    country_id uuid not null,
    status text not null
  );
  create table organizations (
    id uuid primary key default gen_random_uuid(),
    status text not null,
    visibility text not null
  );
  create table constitutions (id uuid primary key default gen_random_uuid());
  create table countries (
    id uuid primary key default gen_random_uuid(),
    name text not null
  );
  create table world_events (
    id uuid primary key default gen_random_uuid(),
    event_type text not null,
    title text not null,
    status text not null,
    outcome text not null,
    ends_at timestamptz not null,
    country_id uuid
  );
`;

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

describe("world intelligence", () => {
  const db = new PGlite();
  afterAll(async () => {
    await db.close();
  });

  it("rejects a non-count and accepts zero", () => {
    expect(countValue("nope")).toBeNull();
    expect(countValue(-1)).toBeNull();
    expect(countValue(0)).toBe(0);
  });

  it("counts open characters, public organizations, and bulletins without private rows", async () => {
    await db.exec(schema);
    const sql = asSql(db);
    const empty = await loadWorldIntelligence(sql);
    expect(empty.characters).toBe(0);
    expect(empty.politicalHomes).toBe(0);
    expect(empty.publicOrganizations).toBe(0);
    expect(empty.gameConstitutions).toBe(0);
    expect(empty.bulletins).toEqual([]);
    expect(isWorldIntelligence(empty)).toBe(true);

    const belgium = await db.query<{ id: string }>("insert into countries (name) values ('Belgium') returning id");
    const nigeria = await db.query<{ id: string }>("insert into countries (name) values ('Nigeria') returning id");
    const open = await db.query<{ id: string }>("insert into users (status) values ('active') returning id");
    const closed = await db.query<{ id: string }>("insert into users (status, closed_at) values ('active', now()) returning id");
    const suspended = await db.query<{ id: string }>("insert into users (status) values ('suspended') returning id");
    const belgiumId = belgium.rows[0]?.id ?? "";
    const nigeriaId = nigeria.rows[0]?.id ?? "";
    await db.query("insert into characters (user_id, country_id, status) values ($1, $2, 'active'), ($1, $3, 'active')", [
      open.rows[0]?.id,
      belgiumId,
      nigeriaId,
    ]);
    await db.query("insert into characters (user_id, country_id, status) values ($1, $2, 'active')", [closed.rows[0]?.id, belgiumId]);
    await db.query("insert into characters (user_id, country_id, status) values ($1, $2, 'active')", [suspended.rows[0]?.id, nigeriaId]);
    await db.query("insert into characters (user_id, country_id, status) values ($1, $2, 'retired')", [open.rows[0]?.id, belgiumId]);
    await db.exec(`
      insert into organizations (status, visibility) values
        ('active', 'public'),
        ('active', 'private'),
        ('dissolved', 'public'),
        ('suspended', 'public');
      insert into constitutions (id) values (gen_random_uuid()), (gen_random_uuid());
    `);
    await db.query(
      `insert into world_events (event_type, title, status, outcome, ends_at, country_id) values
        ('work_bulletin', 'Belgium work bulletin', 'active', 'pending', now() + interval '1 day', $1),
        ('work_bulletin', 'Nigeria work bulletin', 'ended', 'unmet', now() - interval '1 day', $2),
        ('work_bulletin', 'Cancelled bulletin', 'cancelled', 'pending', now(), $1)`,
      [belgiumId, nigeriaId],
    );

    const snapshot = await loadWorldIntelligence(sql);
    expect(snapshot.characters).toBe(2);
    expect(snapshot.politicalHomes).toBe(2);
    expect(snapshot.publicOrganizations).toBe(1);
    expect(snapshot.gameConstitutions).toBe(2);
    expect(snapshot.bulletins?.map((item) => item.title)).toEqual(["Belgium work bulletin", "Nigeria work bulletin"]);
    expect(JSON.stringify(snapshot)).not.toContain("private");
    expect(Object.keys(snapshot).sort()).toEqual([
      "bulletins",
      "calculatedAt",
      "characters",
      "gameConstitutions",
      "politicalHomes",
      "publicOrganizations",
    ]);
  });
});
