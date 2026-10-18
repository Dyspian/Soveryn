import type { Sql } from "@/lib/db";
import { publicActivityItem, type PublicActivity } from "@/lib/site/activity-view";

const ACTIVITY = `
  select e.id::text as id, e.kind, e.detail, e.created_at as "occurredAt", c.name as "countryName"
    from political_events e
    join countries c on c.id = e.country_id
   where e.kind in (
     'election', 'result', 'confidence', 'runoff', 'government', 'appointment',
     'claim', 'challenge', 'emergency', 'diplomacy', 'coalition', 'succession'
   )
   order by e.created_at desc
   limit 40
`;

export async function loadPublicActivity(sql: Sql): Promise<PublicActivity[]> {
  const rows = await sql.query<Record<string, unknown>>(ACTIVITY);
  const items: PublicActivity[] = [];
  for (const row of rows) {
    const item = publicActivityItem({
      id: row.id,
      kind: row.kind,
      detail: row.detail,
      countryName: row.countryName,
      occurredAt: row.occurredAt,
    });
    if (!item) continue;
    items.push(item);
    if (items.length === 6) break;
  }
  return items;
}
