import type { Sql } from "@/lib/db";
import { countValue, readBulletin, type WorldBulletin, type WorldIntelligence } from "@/lib/site/intelligence-view";

const METRICS = `
  select
    (select count(*)::int
       from characters c
       join users u on u.id = c.user_id
      where c.status = 'active' and u.status = 'active' and u.closed_at is null) as characters,
    (select count(distinct c.country_id)::int
       from characters c
       join users u on u.id = c.user_id
      where c.status = 'active' and u.status = 'active' and u.closed_at is null) as "politicalHomes",
    (select count(*)::int
       from organizations
      where status = 'active' and visibility = 'public') as "publicOrganizations",
    (select count(*)::int from constitutions) as "gameConstitutions",
    now() as "calculatedAt"
`;

const BULLETINS = `
  select e.title, e.status, e.outcome, e.ends_at as "endsAt", c.name as "countryName"
    from world_events e
    left join countries c on c.id = e.country_id
   where e.event_type = 'work_bulletin' and e.status <> 'cancelled'
   order by e.ends_at desc
   limit 4
`;

function stamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(new Date(value).getTime())) return new Date(value).toISOString();
  return new Date().toISOString();
}

export async function loadWorldIntelligence(sql: Sql): Promise<WorldIntelligence> {
  const totals = await sql.query<{
    characters: unknown;
    politicalHomes: unknown;
    publicOrganizations: unknown;
    gameConstitutions: unknown;
    calculatedAt: unknown;
  }>(METRICS);
  const row = totals[0];
  let bulletins: WorldBulletin[] | null = null;
  try {
    const events = await sql.query<Record<string, unknown>>(BULLETINS);
    bulletins = events.flatMap((event) => {
      const item = readBulletin({
        ...event,
        endsAt: event.endsAt instanceof Date ? event.endsAt.toISOString() : event.endsAt,
      });
      return item ? [item] : [];
    });
  } catch {
    bulletins = null;
  }
  return {
    calculatedAt: stamp(row?.calculatedAt),
    characters: countValue(row?.characters),
    politicalHomes: countValue(row?.politicalHomes),
    publicOrganizations: countValue(row?.publicOrganizations),
    gameConstitutions: countValue(row?.gameConstitutions),
    bulletins,
  };
}
