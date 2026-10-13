import type { Sql } from "@/lib/db";
import { RANK_SEEDS, type RankKey } from "@/lib/organizations/domain";

export type DashboardBrief = {
  organization: { id: string; name: string; rank: string } | null;
  employment: { business: string; wage: number } | null;
  party: { name: string; role: string; iso2: string } | null;
  offices: Array<{ name: string; iso2: string; country: string }>;
  businesses: number;
  unreadNotices: Array<{ id: string; detail: string; createdAt: string }>;
  pendingApplications: number;
  politics: Array<{ id: string; detail: string; createdAt: string }>;
};

function stamp(value: string | Date): string {
  return new Date(value).toISOString();
}

function rankLabel(name: string | null, key: string): string {
  if (name) return name;
  return RANK_SEEDS.find((seed) => seed.key === (key as RankKey))?.name ?? key;
}

export async function loadDashboardBrief(sql: Sql, characterId: string): Promise<DashboardBrief> {
  const [organization, employment, party, offices, businesses, notices, applications, politics] = await Promise.all([
    sql.query<{ id: string; name: string; rank: string | null; rankKey: string }>(
      `select o.id, o.name, r.name as rank, m.rank_key as "rankKey"
       from organization_members m
       join organizations o on o.id = m.organization_id
       left join organization_ranks r on r.organization_id = o.id and r.rank_key = m.rank_key
       where m.character_id = $1 and m.status = 'active'`,
      [characterId],
    ),
    sql.query<{ business: string; wage: number | string }>(
      `select b.name as business, e.wage
       from employments e
       join businesses b on b.id = e.business_id
       where e.character_id = $1 and e.status = 'active'
       limit 1`,
      [characterId],
    ),
    sql.query<{ name: string; role: string; iso2: string }>(
      `select p.name, m.role, c.iso2
       from party_members m
       join parties p on p.id = m.party_id
       join countries c on c.id = p.country_id
       where m.character_id = $1 and m.status = 'active'`,
      [characterId],
    ),
    sql.query<{ name: string; iso2: string; country: string }>(
      `select o.name, c.iso2, c.name as country
       from officeholders h
       join government_offices o on o.id = h.office_id
       join constitutions k on k.id = o.constitution_id
       join countries c on c.id = k.country_id
       where h.character_id = $1 and h.status = 'active'
       order by o.name`,
      [characterId],
    ),
    sql.query<{ count: number }>(
      "select count(*)::int as count from businesses where owner_character_id = $1 and status = 'active'",
      [characterId],
    ),
    sql.query<{ id: string; detail: string; createdAt: string | Date }>(
      `select id, detail, created_at as "createdAt"
       from organization_notices
       where character_id = $1 and read_at is null
       order by created_at desc
       limit 5`,
      [characterId],
    ),
    sql.query<{ count: number }>(
      `select count(*)::int as count
       from job_applications a
       join job_postings p on p.id = a.posting_id
       join businesses b on b.id = p.business_id
       where a.status = 'pending' and b.owner_character_id = $1`,
      [characterId],
    ),
    sql.query<{ id: string; detail: string; createdAt: string | Date }>(
      `select e.id, e.detail, e.created_at as "createdAt"
       from political_events e
       join characters c on c.country_id = e.country_id
       where c.id = $1
       order by e.created_at desc
       limit 5`,
      [characterId],
    ),
  ]);

  const org = organization[0];
  const job = employment[0];
  const membership = party[0];
  return {
    organization: org ? { id: org.id, name: org.name, rank: rankLabel(org.rank, org.rankKey) } : null,
    employment: job ? { business: job.business, wage: Number(job.wage) } : null,
    party: membership ?? null,
    offices,
    businesses: Number(businesses[0]?.count ?? 0),
    unreadNotices: notices.map((notice) => ({ id: notice.id, detail: notice.detail, createdAt: stamp(notice.createdAt) })),
    pendingApplications: Number(applications[0]?.count ?? 0),
    politics: politics.map((event) => ({ id: event.id, detail: event.detail, createdAt: stamp(event.createdAt) })),
  };
}
