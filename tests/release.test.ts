import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import { acceptTerms, closeAccount, dismissGuide } from "@/lib/account/player";
import type { Sql } from "@/lib/db";
import { featureEnabled } from "@/lib/release/features";
import { loginSchema, registerSchema } from "@/lib/validation";

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

describe("release foundations", () => {
  afterAll(async () => {
    await db.close();
  });

  it("requires an explicit terms acceptance on registration only", () => {
    expect(registerSchema.safeParse({ email: "ada@example.com", password: "password1" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "ada@example.com", password: "password1", terms: "yes" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "ada@example.com", password: "password1" }).success).toBe(true);
  });

  it("keeps history when an account closes and leaves warfare disabled", async () => {
    const directory = path.join(process.cwd(), "db", "migrations");
    for (const file of ["0001_foundation.sql", "0003_progression.sql", "0009_release.sql"]) {
      await db.exec(readFileSync(path.join(directory, file), "utf8"));
    }
    expect(await featureEnabled(asSql(db), "feature_warfare")).toBe(false);

    const country = await db.query<{ id: string }>(
      `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
       values ('NG', 'NGA', 'Nigeria', 'imported', 5, 5, 10) returning id`,
    );
    const countryId = country.rows[0]?.id ?? "";
    const place = await db.query<{ id: string }>(
      `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
       values (1, $1, 'Lagos', 'Lagos', 6.45, 3.4, 'P', 'PPLC', 'unreported') returning id`,
      [countryId],
    );
    const placeId = place.rows[0]?.id ?? "";
    await db.query("insert into starting_locations (place_id, status, selected_by_rule) values ($1, 'open', 'test')", [placeId]);
    const user = await db.query<{ id: string }>(
      "insert into users (email, password_hash) values ('release@example.com', 'hash') returning id",
    );
    const userId = user.rows[0]?.id ?? "";
    await db.query(
      "insert into characters (user_id, username, portrait_key, country_id, place_id) values ($1, 'release_ada', 'mark-1', $2, $3)",
      [userId, countryId, placeId],
    );
    await db.query("insert into sessions (user_id, token_hash, expires_at) values ($1, 'token', now() + interval '1 day')", [userId]);
    await db.query(
      "insert into audit_events (actor_user_id, action, entity_type, entity_id) values ($1, 'character.create', 'character', $1)",
      [userId],
    );

    const sql = asSql(db);
    await acceptTerms(sql, userId);
    await dismissGuide(sql, userId);
    await closeAccount(sql, userId);

    const stored = await db.query<{ email: string; closed_at: string | null; terms_accepted_at: string | null }>(
      "select email, closed_at, terms_accepted_at from users where id = $1",
      [userId],
    );
    expect(stored.rows[0]?.email).toBe(`closed-${userId}@players.invalid`);
    expect(stored.rows[0]?.closed_at).toBeTruthy();
    expect(stored.rows[0]?.terms_accepted_at).toBeTruthy();
    const character = await db.query<{ guide_dismissed_at: string | null }>(
      "select guide_dismissed_at from characters where user_id = $1",
      [userId],
    );
    expect(character.rows[0]?.guide_dismissed_at).toBeTruthy();
    const sessions = await db.query<{ count: number }>("select count(*)::int as count from sessions where user_id = $1", [userId]);
    expect(sessions.rows[0]?.count).toBe(0);
    const history = await db.query<{ count: number }>(
      "select count(*)::int as count from audit_events where actor_user_id = $1 and action = 'character.create'",
      [userId],
    );
    expect(history.rows[0]?.count).toBe(1);
  });
});
