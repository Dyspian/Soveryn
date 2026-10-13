import type { Sql } from "@/lib/db";
import { ORG_TYPES, type OrgType } from "@/lib/organizations/domain";

export async function listOrganizations(sql: Sql, characterId: string | null) {
  return sql.query<{
    id: string;
    name: string;
    tag: string;
    orgType: string;
    recruitment: string;
    visibility: string;
    members: number;
    city: string;
    mine: boolean;
  }>(
    `select o.id, o.name, o.tag, o.org_type as "orgType", o.recruitment, o.visibility,
            (select count(*)::int from organization_members m where m.organization_id = o.id and m.status = 'active') as members,
            p.name as city,
            exists (
              select 1 from organization_members m
              where m.organization_id = o.id and m.character_id = $1 and m.status = 'active'
            ) as mine
     from organizations o
     join places p on p.id = o.headquarters_place_id
     where o.status = 'active' and (o.visibility = 'public' or o.id in (
       select organization_id from organization_members where character_id = $1 and status = 'active'
     ))
     order by o.name`,
    [characterId],
  );
}

export async function organizationDesk(sql: Sql, organizationId: string, characterId: string | null) {
  const orgs = await sql.query<{
    id: string;
    name: string;
    tag: string;
    description: string;
    emblemKey: string | null;
    orgType: OrgType;
    leader: string;
    city: string;
    country: string;
    balance: number | string;
    reputation: number;
    influence: number;
    memberLimit: number;
    recruitment: string;
    visibility: string;
    status: string;
    createdAt: string | Date;
  }>(
    `select o.id, o.name, o.tag, o.description, o.emblem_key as "emblemKey", o.org_type as "orgType",
            ch.username as leader, p.name as city, c.name as country, o.balance, o.reputation, o.influence,
            o.member_limit as "memberLimit", o.recruitment, o.visibility, o.status, o.created_at as "createdAt"
     from organizations o
     join characters ch on ch.id = o.leader_character_id
     join places p on p.id = o.headquarters_place_id
     join countries c on c.id = o.country_id
     where o.id = $1`,
    [organizationId],
  );
  const org = orgs[0];
  if (!org) return null;
  const membership = characterId
    ? await sql.query<{
        rankKey: string;
        isFounder: boolean;
        reports: boolean;
        withdraw: boolean;
        settings: boolean;
        startOperations: boolean;
        invite: boolean;
        approve: boolean;
        promote: boolean;
        remove: boolean;
        treaties: boolean;
        rivalries: boolean;
        market: boolean;
        locations: boolean;
        dissolve: boolean;
      }>(
        `select m.rank_key as "rankKey", m.is_founder as "isFounder", r.reports, r.withdraw, r.settings,
                r.start_operations as "startOperations", r.invite, r.approve, r.promote, r.remove, r.treaties, r.rivalries, r.market, r.locations, r.dissolve
         from organization_members m
         join organization_ranks r on r.organization_id = m.organization_id and r.rank_key = m.rank_key
         where m.organization_id = $1 and m.character_id = $2 and m.status = 'active'`,
        [organizationId, characterId],
      )
    : [];
  const member = membership[0] ?? null;
  if (org.visibility === "private" && !member && org.status === "active") return null;
  const members = member
    ? await sql.query<{ username: string; rankKey: string; rankName: string; founder: boolean; joinedAt: string | Date }>(
        `select ch.username, m.rank_key as "rankKey", r.name as "rankName", m.is_founder as founder, m.joined_at as "joinedAt"
         from organization_members m
         join characters ch on ch.id = m.character_id
         join organization_ranks r on r.organization_id = m.organization_id and r.rank_key = m.rank_key
         where m.organization_id = $1 and m.status = 'active'
         order by r.sort_order desc, ch.username`,
        [organizationId],
      )
    : [];
  const events = await sql.query<{ kind: string; detail: string; visibility: string; createdAt: string | Date }>(
    `select kind, detail, visibility, created_at as "createdAt" from organization_events
     where organization_id = $1 and ($2::boolean or visibility = 'public')
     order by created_at desc limit 12`,
    [organizationId, Boolean(member)],
  );
  const visibleEvents = events.filter((event) => event.visibility !== "officers" || member?.reports);
  const operations = member
    ? await sql.query<{
        id: string;
        definitionKey: string;
        status: string;
        summary: string | null;
        completesAt: string | Date | null;
        openedBy: boolean;
        joined: boolean;
        recorded: number;
        credited: boolean;
      }>(
        `select id, definition_key as "definitionKey", status, result_summary as summary, completes_at as "completesAt",
                opened_by = $2 as "openedBy",
                exists (select 1 from operation_participants p where p.operation_id = operations.id and p.character_id = $2) as joined,
                (select count(*)::int from operation_contributions c where c.operation_id = operations.id) as recorded,
                exists (select 1 from operation_contributions c where c.operation_id = operations.id and c.character_id = $2) as credited
         from operations where organization_id = $1 order by created_at desc limit 8`,
        [organizationId, characterId],
      )
    : [];
  const influence = await sql.query<{ city: string; score: number }>(
    `select p.name as city, i.score
     from organization_influence i join places p on p.id = i.place_id
     where i.organization_id = $1 order by i.score desc limit 8`,
    [organizationId],
  );
  const relations = await sql.query<{ otherId: string; other: string; status: string; proposal: string | null }>(
    `select o.id as "otherId", o.name as other, r.status,
            case when $2::boolean then r.proposal else null end as proposal
     from organization_relations r
     join organizations o on o.id = case when r.organization_a = $1 then r.organization_b else r.organization_a end
     where r.organization_a = $1 or r.organization_b = $1`,
    [organizationId, Boolean(member)],
  );
  const ledger = member?.reports
    ? await sql.query<{ reason: string; amount: number | string; direction: string; createdAt: string | Date }>(
        `select reason, amount, case when to_kind = 'organization' and to_id = $1 then 'in' else 'out' end as direction,
                created_at as "createdAt"
         from ledger_entries
         where (to_kind = 'organization' and to_id = $1) or (from_kind = 'organization' and from_id = $1)
         order by created_at desc limit 12`,
        [organizationId],
      )
    : [];
  const locations = await sql.query<{ name: string }>(
    `select p.name from organization_locations l join places p on p.id = l.place_id
     where l.organization_id = $1 order by p.name`,
    [organizationId],
  );
  const contests = await sql.query<{
    id: string;
    status: string;
    outcome: string;
    stake: number;
    city: string;
    challenger: string;
    defender: string;
    challengerId: string;
    defenderId: string;
    resolvesAt: string | Date | null;
    support: number;
  }>(
    `select c.id, c.status, c.outcome, c.stake, p.name as city,
            ch.name as challenger, df.name as defender,
            c.challenger_organization_id as "challengerId", c.defender_organization_id as "defenderId",
            c.resolves_at as "resolvesAt",
            (select count(*)::int from city_contest_support s where s.contest_id = c.id and s.organization_id = $1) as support
     from city_contests c
     join places p on p.id = c.place_id
     join organizations ch on ch.id = c.challenger_organization_id
     join organizations df on df.id = c.defender_organization_id
     where c.challenger_organization_id = $1 or c.defender_organization_id = $1
     order by c.created_at desc limit 8`,
    [organizationId],
  );
  const applications = member
    ? await sql.query<{ id: string; username: string }>(
        `select a.id, ch.username
         from organization_applications a join characters ch on ch.id = a.character_id
         where a.organization_id = $1 and a.status = 'pending'`,
        [organizationId],
      )
    : [];
  return {
    org: { ...org, typeLabel: ORG_TYPES[org.orgType].legal ? `${ORG_TYPES[org.orgType].label} · lawful` : ORG_TYPES[org.orgType].label, balance: Number(org.balance) },
    member,
    members,
    events: visibleEvents,
    operations,
    influence,
    relations,
    ledger,
    locations,
    contests,
    applications,
  };
}

export async function viewerNotices(sql: Sql, characterId: string) {
  return sql.query<{ id: string; kind: string; detail: string; read: boolean }>(
    `select id, kind, detail, read_at is not null as read
     from organization_notices where character_id = $1 order by created_at desc limit 12`,
    [characterId],
  );
}

export async function underworldStatus(sql: Sql, characterId: string) {
  const rows = await sql.query<{ heat: number; reputation: number; experience: number; fines: number | string; planning: number; concealment: number }>(
    "select heat, reputation, experience, fines, planning, concealment from character_underworld where character_id = $1",
    [characterId],
  );
  const row = rows[0];
  if (!row) return null;
  const heat = Number(row.heat);
  const wanted = heat >= 40 ? "restricted" : heat >= 25 ? "investigated" : heat >= 10 ? "low" : "clear";
  return { ...row, fines: Number(row.fines), wanted };
}

export async function openUnderground(sql: Sql) {
  return sql.query<{ id: string; product: string; quantity: number; unitPrice: number; city: string; iso2: string }>(
    `select l.id, pr.name as product, l.quantity, l.unit_price as "unitPrice", p.name as city, c.iso2
     from underground_listings l
     join products pr on pr.id = l.product_id
     join places p on p.id = l.place_id
     join countries c on c.id = p.country_id
     where l.status = 'open' and l.expires_at > now()
     order by l.created_at desc limit 20`,
  );
}
