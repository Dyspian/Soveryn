import type { Sql } from "@/lib/db";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type CivicTermView = {
  termKey: string;
  startsAt: string;
  endsAt: string;
  status: "open" | "recorded" | "missed";
  rewardReputation: number;
  sourceDetail: string | null;
  countryName: string;
  countryIso2: string;
  countryRecorded: number;
  history: Array<{ termKey: string; status: "open" | "recorded" | "missed"; recordedAt: string | null; sourceDetail: string | null }>;
};

export function utcWeek(now: Date): { termKey: string; startsAt: Date; endsAt: Date } {
  const day = now.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  startsAt.setUTCDate(startsAt.getUTCDate() - daysSinceMonday);
  const endsAt = new Date(startsAt.getTime() + WEEK_MS);
  return { termKey: startsAt.toISOString().slice(0, 10), startsAt, endsAt };
}

async function termsReady(sql: Sql): Promise<boolean> {
  const rows = await sql.query<{ name: string | null }>("select to_regclass('character_terms')::text as name");
  return Boolean(rows[0]?.name);
}

async function rewardAmount(sql: Sql): Promise<number> {
  const rows = await sql.query<{ amount: number }>("select amount from game_rules where key = 'term_reputation'");
  const amount = Math.trunc(Number(rows[0]?.amount ?? 1));
  if (!Number.isFinite(amount) || amount < 1) return 0;
  return Math.min(1, amount);
}

async function payTerm(sql: Sql, characterId: string, termKey: string, reputation: number): Promise<void> {
  if (reputation < 1) return;
  const sourceKey = `term:${termKey}`;
  const inserted = await sql.query<{ id: string }>(
    `insert into progression_events (character_id, kind, source_key, xp_awarded, currency_awarded, reputation_awarded, detail)
     values ($1, 'term', $2, 0, 0, $3, $4)
     on conflict (character_id, source_key) do nothing
     returning id`,
    [characterId, sourceKey, reputation, `Recorded the civic term beginning ${termKey}.`],
  );
  if (!inserted[0]) return;
  await sql.query("update characters set reputation = reputation + $2 where id = $1", [characterId, reputation]);
}

async function recordOpenTerm(sql: Sql, characterId: string, week: { termKey: string; startsAt: Date; endsAt: Date }, reputation: number): Promise<void> {
  const evidence = await sql.query<{ source_key: string }>(
    `select source_key
     from progression_events
     where character_id = $1 and kind = 'mission' and created_at >= $2 and created_at < $3
     order by created_at
     limit 1`,
    [characterId, week.startsAt.toISOString(), week.endsAt.toISOString()],
  );
  const sourceKey = evidence[0]?.source_key;
  if (!sourceKey) return;
  const saved = await sql.query<{ term_key: string }>(
    `update character_terms
     set status = 'recorded', source_key = $3, recorded_at = now()
     where character_id = $1 and term_key = $2 and status = 'open'
     returning term_key`,
    [characterId, week.termKey, sourceKey],
  );
  if (!saved[0]) return;
  await payTerm(sql, characterId, week.termKey, reputation);
}

export async function recordCivicTerm(sql: Sql, characterId: string, now = new Date()): Promise<void> {
  if (!(await termsReady(sql))) return;
  await settleCivicTerm(sql, characterId, now);
}

export async function settleCivicTerm(sql: Sql, characterId: string, now = new Date()): Promise<CivicTermView> {
  const week = utcWeek(now);
  const reputation = await rewardAmount(sql);
  await sql.query(
    `update character_terms
     set status = 'missed'
     where character_id = $1 and status = 'open' and ends_at <= $2`,
    [characterId, now.toISOString()],
  );
  await sql.query(
    `insert into character_terms (character_id, term_key, starts_at, ends_at, status)
     values ($1, $2, $3, $4, 'open')
     on conflict (character_id, term_key) do nothing`,
    [characterId, week.termKey, week.startsAt.toISOString(), week.endsAt.toISOString()],
  );
  await recordOpenTerm(sql, characterId, week, reputation);
  return loadCivicTerm(sql, characterId, week.termKey);
}

async function loadCivicTerm(sql: Sql, characterId: string, termKey: string): Promise<CivicTermView> {
  const current = await sql.query<{
    termKey: string;
    startsAt: string | Date;
    endsAt: string | Date;
    status: "open" | "recorded" | "missed";
    sourceDetail: string | null;
    countryName: string;
    countryIso2: string;
    countryRecorded: number;
  }>(
    `select t.term_key as "termKey", t.starts_at as "startsAt", t.ends_at as "endsAt", t.status,
            event.detail as "sourceDetail", country.name as "countryName", country.iso2 as "countryIso2",
            (select count(*)::int
             from character_terms recorded
             join characters resident on resident.id = recorded.character_id
             where recorded.term_key = t.term_key and recorded.status = 'recorded' and resident.country_id = character.country_id) as "countryRecorded"
     from character_terms t
     join characters character on character.id = t.character_id
     join countries country on country.id = character.country_id
     left join progression_events event on event.character_id = t.character_id and event.source_key = t.source_key
     where t.character_id = $1 and t.term_key = $2`,
    [characterId, termKey],
  );
  const row = current[0];
  if (!row) throw new Error("The civic term could not be read.");
  const history = await sql.query<{ termKey: string; status: "open" | "recorded" | "missed"; recordedAt: string | Date | null; sourceDetail: string | null }>(
    `select t.term_key as "termKey", t.status, t.recorded_at as "recordedAt", event.detail as "sourceDetail"
     from character_terms t
     left join progression_events event on event.character_id = t.character_id and event.source_key = t.source_key
     where t.character_id = $1 and t.term_key <> $2
     order by t.starts_at desc
     limit 8`,
    [characterId, termKey],
  );
  const reward = await rewardAmount(sql);
  return {
    termKey: row.termKey,
    startsAt: new Date(row.startsAt).toISOString(),
    endsAt: new Date(row.endsAt).toISOString(),
    status: row.status,
    rewardReputation: reward,
    sourceDetail: row.sourceDetail,
    countryName: row.countryName,
    countryIso2: row.countryIso2,
    countryRecorded: Number(row.countryRecorded),
    history: history.map((item) => ({
      termKey: item.termKey,
      status: item.status,
      recordedAt: item.recordedAt ? new Date(item.recordedAt).toISOString() : null,
      sourceDetail: item.sourceDetail,
    })),
  };
}
