import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { loadPublicActivity } from "@/lib/site/activity";
import { publicActivityCopy, publicActivityItem } from "@/lib/site/activity-view";
import { loadDeveloperUpdates, readDeveloperUpdate } from "@/lib/site/updates";

const schema = `
  create table countries (
    id uuid primary key default gen_random_uuid(),
    name text not null
  );
  create table political_events (
    id uuid primary key default gen_random_uuid(),
    country_id uuid not null,
    kind text not null,
    detail text not null,
    created_at timestamptz not null
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

describe("public record", () => {
  const db = new PGlite();
  const sql = asSql(db);

  afterAll(async () => {
    await db.close();
  });

  it("publishes only server-written political outcomes", async () => {
    await db.exec(schema);
    const country = await db.query<{ id: string }>("insert into countries (name) values ('France') returning id");
    const id = country.rows[0]?.id ?? "";
    const rows = [
      ["diplomacy", "A game diplomatic status was set to friendly.", "2026-10-11T18:49:14.000Z"],
      ["claim", "A party leader claimed the vacant ruler office.", "2026-10-11T18:47:07.000Z"],
      ["bill", "Bill proposed: Tax raise", "2026-10-11T18:48:07.000Z"],
      ["party", "NiBel Proxy State was founded.", "2026-10-11T18:46:59.000Z"],
      ["investigation", "An investigation was upheld and the subject left office.", "2026-10-12T00:00:00.000Z"],
      ["diplomacy", "A game diplomatic status was set to friendly. Player Ada.", "2026-10-12T01:00:00.000Z"],
    ] as const;
    for (const [kind, detail, created] of rows) {
      await db.query("insert into political_events (country_id, kind, detail, created_at) values ($1, $2, $3, $4)", [
        id,
        kind,
        detail,
        created,
      ]);
    }
    const activity = await loadPublicActivity(sql);
    expect(activity.map((item) => item.summary)).toEqual([
      "A game diplomatic status was set to friendly.",
      "A party leader claimed the vacant ruler office.",
    ]);
    expect(JSON.stringify(activity)).not.toMatch(/Tax raise|NiBel|investigation|Ada|not-a-date/i);
    expect(publicActivityCopy("spending", "Public funds of 20 were paid out.")).toBeNull();
    expect(
      publicActivityItem({
        id: "x",
        kind: "result",
        detail: "An office was filled from the recorded ballots.",
        countryName: "France",
        occurredAt: "not-a-date",
      }),
    ).toBeNull();
  });

  it("reads published developer updates and skips drafts", () => {
    expect(readDeveloperUpdate("draft", "---\nstatus: draft\ntitle: Hidden\ncategory: Update\nsummary: Secret\npublished: 2026-10-01T00:00:00Z\n---\n")).toBeNull();
    expect(readDeveloperUpdate("bad", "---\nstatus: published\ntitle: <b>No</b>\ncategory: Update\nsummary: Plain\npublished: 2026-10-01T00:00:00Z\n---\n")).toBeNull();
    const directory = mkdtempSync(path.join(tmpdir(), "soveryn-updates-"));
    writeFileSync(
      path.join(directory, "older.md"),
      "---\nstatus: published\ntitle: Older note\ncategory: Maintenance\nsummary: A stored notice.\npublished: 2026-10-01T00:00:00Z\n---\n",
    );
    writeFileSync(
      path.join(directory, "newer.md"),
      "---\nstatus: published\ntitle: Newer note\ncategory: Patch notes\nsummary: A later notice.\npublished: 2026-10-02T00:00:00Z\n---\n",
    );
    writeFileSync(
      path.join(directory, "draft.md"),
      "---\nstatus: draft\ntitle: Hidden\ncategory: Devlog\nsummary: Not public.\npublished: 2026-10-03T00:00:00Z\n---\n",
    );
    const updates = loadDeveloperUpdates(directory);
    expect(updates.map((item) => item.title)).toEqual(["Newer note", "Older note"]);
    expect(updates[0]?.publishedAt).toBe("2026-10-02T00:00:00.000Z");
  });
});
