import type { Sql } from "@/lib/db";
import { formatCount } from "@/lib/game/format";

export type ShellStatus = {
  cityName: string;
  countryName: string;
  iso2: string;
  level: number;
  xpInto: number;
  xpSpan: number;
  currencyLabel: string;
  portraitKey: string;
  activeMission: string | null;
  activeMissionCount: number;
};

export function shellProgress(level: number, xp: number, bands: { level: number; xpRequired: number }[]): { into: number; span: number } {
  const current = bands.find((band) => band.level === level);
  const next = bands.find((band) => band.level === level + 1);
  if (!current || !next || !Number.isFinite(xp)) return { into: 0, span: 0 };
  const span = next.xpRequired - current.xpRequired;
  if (span <= 0) return { into: 0, span: 0 };
  return { into: Math.max(0, xp - current.xpRequired), span };
}

export async function loadShellStatus(sql: Sql, userId: string): Promise<ShellStatus | null> {
  const [rows, bands, missions] = await Promise.all([
    sql.query<{
      cityName: string;
      countryName: string;
      iso2: string;
      level: number;
      xp: number | string;
      currency: number | string;
      portraitKey: string;
    }>(
      `select p.name as "cityName", co.name as "countryName", co.iso2,
              ch.level, ch.xp, ch.currency, ch.portrait_key as "portraitKey"
       from characters ch
       join places p on p.id = ch.place_id
       join countries co on co.id = p.country_id
       where ch.user_id = $1 and ch.status = 'active'`,
      [userId],
    ),
    sql.query<{ level: number; xpRequired: number }>("select level, xp_required as \"xpRequired\" from level_bands order by level"),
    sql.query<{ name: string; count: number }>(
      `select m.name, count(*) over ()::int as count
       from character_missions cm
       join characters c on c.id = cm.character_id
       join missions m on m.id = cm.mission_id
       where c.user_id = $1 and cm.status = 'active'
       order by cm.started_at
       limit 1`,
      [userId],
    ),
  ]);
  const row = rows[0];
  if (!row || !Number.isInteger(row.level)) return null;
  const progress = shellProgress(
    row.level,
    Number(row.xp),
    bands.map((band) => ({ level: Number(band.level), xpRequired: Number(band.xpRequired) })),
  );
  const mission = missions[0];
  return {
    cityName: row.cityName,
    countryName: row.countryName,
    iso2: row.iso2,
    level: row.level,
    xpInto: progress.into,
    xpSpan: progress.span,
    currencyLabel: formatCount(row.currency),
    portraitKey: row.portraitKey,
    activeMission: mission?.name ?? null,
    activeMissionCount: Number(mission?.count ?? 0),
  };
}

