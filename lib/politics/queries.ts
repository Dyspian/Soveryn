import type { Sql } from "@/lib/db";

export async function listTemplates(sql: Sql) {
  return sql.query<{ id: string; name: string; summary: string }>("select id, name, summary from government_templates order by name");
}

export async function countryPolitics(sql: Sql, iso2: string) {
  const countries = await sql.query<{ id: string; name: string; iso2: string }>("select id, name, iso2 from countries where iso2 = $1", [iso2]);
  const country = countries[0];
  if (!country) return null;
  const constitutions = await sql.query<{ id: string; templateName: string; summary: string; restricted: boolean; version: number; note: string }>(
    `select c.id, t.name as "templateName", t.summary, c.opposition_restricted as restricted, c.version, c.note
     from constitutions c join government_templates t on t.id = c.template_id
     where c.country_id = $1`,
    [country.id],
  );
  const constitution = constitutions[0] ?? null;
  const [offices, parties, elections, bills, events, seats, treasury, policies, investigations] = await Promise.all([
    sql.query<{ officeKey: string; name: string; holder: string | null }>(
      `select o.office_key as "officeKey", o.name, ch.username as holder
       from government_offices o
       left join officeholders h on h.office_id = o.id and h.status = 'active'
       left join characters ch on ch.id = h.character_id
       where o.constitution_id = $1
       order by o.name`,
      [constitution?.id ?? null],
    ),
    sql.query<{ id: string; name: string; abbreviation: string; platform: string; members: number; balance: number }>(
      `select p.id, p.name, p.abbreviation, p.platform, p.balance,
              (select count(*)::int from party_members m where m.party_id = p.id and m.status = 'active') as members
       from parties p where p.country_id = $1 and p.status = 'active' order by p.name`,
      [country.id],
    ),
    sql.query<{ id: string; kind: string; status: string; officeKey: string | null; registering: boolean; voting: boolean }>(
      `select id, kind, status, office_key as "officeKey", registration_ends > now() as registering, voting_ends > now() as voting
       from elections where country_id = $1 and status <> 'closed' order by created_at desc`,
      [country.id],
    ),
    sql.query<{ id: string; title: string; status: string; effectKey: string; effectValue: number; voting: boolean; votingEnds: string | Date; yes: number; no: number }>(
      `select b.id, b.title, b.status, b.effect_key as "effectKey", b.effect_value as "effectValue",
              b.voting_ends > now() as voting, b.voting_ends as "votingEnds",
              (select count(*)::int from bill_votes v where v.bill_id = b.id and v.vote = 'yes') as yes,
              (select count(*)::int from bill_votes v where v.bill_id = b.id and v.vote = 'no') as no
       from bills b where b.country_id = $1 order by b.created_at desc limit 8`,
      [country.id],
    ),
    sql.query<{ kind: string; detail: string; createdAt: string | Date }>(
      `select kind, detail, created_at as "createdAt"
       from political_events where country_id = $1 order by created_at desc limit 8`,
      [country.id],
    ),
    sql.query<{ username: string; party: string | null }>(
      `select ch.username, p.name as party
       from parliamentary_seats s
       left join characters ch on ch.id = s.character_id
       left join parties p on p.id = s.party_id
       where s.constitution_id = $1 and s.status = 'active'`,
      [constitution?.id ?? null],
    ),
    sql.query<{ balance: number | string }>("select balance from government_accounts where country_id = $1", [country.id]),
    sql.query<{ effectKey: string; effectValue: number }>(
      `select distinct on (effect_key) effect_key as "effectKey", effect_value as "effectValue" from policy_versions
       where country_id = $1 and effective_at <= now()
       order by effect_key, effective_at desc`,
      [country.id],
    ),
    sql.query<{ id: string; username: string; reason: string }>(
      `select i.id, ch.username, i.reason
       from investigations i join characters ch on ch.id = i.subject_character_id
       where i.country_id = $1 and i.status = 'open'
       order by i.created_at desc`,
      [country.id],
    ),
  ]);
  const salesTax = policies.find((row) => row.effectKey === "sales_tax_percent")?.effectValue ?? 0;
  const [relations, treaties, coalition, partners] = await Promise.all([
    sql.query<{ iso2: string; name: string; status: string; note: string; updatedAt: string | Date }>(
      `select other.iso2, other.name, r.status, r.note, r.updated_at as "updatedAt"
       from diplomatic_relations r
       join countries other on other.id = case when r.country_a = $1 then r.country_b else r.country_a end
       where r.country_a = $1 or r.country_b = $1
       order by other.name`,
      [country.id],
    ),
    sql.query<{ title: string; status: string; iso2: string; name: string; createdAt: string | Date }>(
      `select t.title, t.status, other.iso2, other.name, t.created_at as "createdAt"
       from treaties t
       join countries other on other.id = case when t.country_a = $1 then t.country_b else t.country_a end
       where t.country_a = $1 or t.country_b = $1
       order by t.created_at desc`,
      [country.id],
    ),
    constitution
      ? sql.query<{ partyA: string; partyB: string }>(
          `select pa.name as "partyA", pb.name as "partyB"
           from coalition_agreements a
           join parties pa on pa.id = a.party_a
           join parties pb on pb.id = a.party_b
           where a.constitution_id = $1 and a.status = 'active'`,
          [constitution.id],
        )
      : Promise.resolve([]),
    sql.query<{ id: string; iso2: string; name: string }>("select id, iso2, name from countries where id <> $1 order by name", [country.id]),
  ]);
  return {
    country,
    constitution,
    offices,
    parties,
    elections,
    bills,
    events,
    seats,
    treasury: Number(treasury[0]?.balance ?? 0),
    salesTax,
    policies,
    investigations,
    relations,
    treaties,
    coalition: coalition[0] ?? null,
    countries: partners,
  };
}

export async function politicsIndex(sql: Sql) {
  return sql.query<{ iso2: string; name: string; templateName: string | null; leader: string | null }>(
    `select c.iso2, c.name, t.name as "templateName", ch.username as leader
     from countries c
     left join constitutions k on k.country_id = c.id
     left join government_templates t on t.id = k.template_id
     left join government_offices o on o.constitution_id = k.id and o.is_executive = true
     left join officeholders h on h.office_id = o.id and h.status = 'active'
     left join characters ch on ch.id = h.character_id
     order by c.name`,
  );
}
