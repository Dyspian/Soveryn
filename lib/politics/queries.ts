import type { Sql } from "@/lib/db";

export async function listTemplates(sql: Sql) {
  return sql.query<{ id: string; name: string; summary: string }>("select id, name, summary from government_templates order by name");
}

export async function countryPolitics(sql: Sql, iso2: string) {
  const countries = await sql.query<{ id: string; name: string; iso2: string }>("select id, name, iso2 from countries where iso2 = $1", [iso2]);
  const country = countries[0];
  if (!country) return null;
  const constitutions = await sql.query<{
    id: string;
    templateId: string;
    templateName: string;
    summary: string;
    restricted: boolean;
    version: number;
    note: string;
    parliamentSystem: string;
    parliamentSeats: number;
    executiveSelection: string;
  }>(
    `select c.id, c.template_id as "templateId", t.name as "templateName", t.summary, c.opposition_restricted as restricted, c.version, c.note,
            t.parliament_system as "parliamentSystem", t.parliament_seats as "parliamentSeats",
            t.executive_selection as "executiveSelection"
     from constitutions c join government_templates t on t.id = c.template_id
     where c.country_id = $1`,
    [country.id],
  );
  const constitution = constitutions[0] ?? null;
  const [offices, parties, elections, bills, events, seats, treasury, policies, investigations] = await Promise.all([
    sql.query<{
      officeKey: string;
      name: string;
      selection: string;
      isExecutive: boolean;
      mayAppoint: boolean;
      maySpend: boolean;
      mayPropose: boolean;
      mayDiplomacy: boolean;
      holder: string | null;
      holderParty: string | null;
    }>(
      `select o.office_key as "officeKey", o.name, o.selection, o.is_executive as "isExecutive",
              o.may_appoint as "mayAppoint", o.may_spend as "maySpend", o.may_propose_law as "mayPropose", o.may_diplomacy as "mayDiplomacy",
              ch.username as holder, hp.name as "holderParty"
       from government_offices o
       left join officeholders h on h.office_id = o.id and h.status = 'active'
       left join characters ch on ch.id = h.character_id
       left join parties hp on hp.id = h.party_id
       where o.constitution_id = $1
       order by o.name`,
      [constitution?.id ?? null],
    ),
    sql.query<{ id: string; name: string; abbreviation: string; platform: string; members: number; balance: number; leader: string | null }>(
      `select p.id, p.name, p.abbreviation, p.platform, p.balance, leader.username as leader,
              (select count(*)::int from party_members m where m.party_id = p.id and m.status = 'active') as members
       from parties p
       left join characters leader on leader.id = p.leader_id
       where p.country_id = $1 and p.status = 'active' order by p.name`,
      [country.id],
    ),
    sql.query<{
      id: string;
      kind: string;
      status: string;
      officeKey: string | null;
      officeName: string | null;
      round: number;
      seatCount: number;
      secret: boolean;
      partyName: string | null;
      registering: boolean;
      voting: boolean;
      registrationEnds: string | Date;
      votingEnds: string | Date;
    }>(
      `select e.id, e.kind, e.status, e.office_key as "officeKey", o.name as "officeName", e.round,
              e.seat_count as "seatCount", e.secret, p.name as "partyName",
              e.registration_ends > now() as registering, e.voting_ends > now() as voting,
              e.registration_ends as "registrationEnds", e.voting_ends as "votingEnds"
       from elections e
       left join government_offices o on o.constitution_id = e.constitution_id and o.office_key = e.office_key
       left join parties p on p.id = e.party_id
       where e.country_id = $1 and e.status <> 'closed'
       order by e.created_at desc`,
      [country.id],
    ),
    sql.query<{
      id: string;
      title: string;
      body: string;
      status: string;
      effectKey: string;
      effectValue: number;
      thresholdPercent: number;
      sponsor: string | null;
      voting: boolean;
      votingEnds: string | Date;
      yes: number;
      no: number;
    }>(
      `select b.id, b.title, b.body, b.status, b.effect_key as "effectKey", b.effect_value as "effectValue",
              b.threshold_percent as "thresholdPercent", ch.username as sponsor,
              b.voting_ends > now() as voting, b.voting_ends as "votingEnds",
              (select count(*)::int from bill_votes v where v.bill_id = b.id and v.vote = 'yes') as yes,
              (select count(*)::int from bill_votes v where v.bill_id = b.id and v.vote = 'no') as no
       from bills b
       left join characters ch on ch.id = b.sponsor_id
       where b.country_id = $1 order by b.created_at desc limit 8`,
      [country.id],
    ),
    sql.query<{ kind: string; detail: string; createdAt: string | Date }>(
      `select kind, detail, created_at as "createdAt"
       from political_events where country_id = $1 order by created_at desc limit 20`,
      [country.id],
    ),
    sql.query<{ id: string; username: string | null; partyId: string | null; party: string | null; abbreviation: string | null }>(
      `select s.id, ch.username, s.party_id as "partyId", p.name as party, p.abbreviation
       from parliamentary_seats s
       left join characters ch on ch.id = s.character_id
       left join parties p on p.id = s.party_id
       where s.constitution_id = $1 and s.status = 'active'
       order by p.name nulls last, ch.username, s.id`,
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
  const salesTaxRow = policies.find((row) => row.effectKey === "sales_tax_percent");
  const [relations, treaties, coalition, partners, diplomacyEvents, candidates, openTallies, countedRows, members] = await Promise.all([
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
      ? sql.query<{ partyA: string; partyB: string; partyAId: string; partyBId: string }>(
          `select pa.name as "partyA", pb.name as "partyB", a.party_a as "partyAId", a.party_b as "partyBId"
           from coalition_agreements a
           join parties pa on pa.id = a.party_a
           join parties pb on pb.id = a.party_b
           where a.constitution_id = $1 and a.status = 'active'`,
          [constitution.id],
        )
      : Promise.resolve([]),
    sql.query<{ id: string; iso2: string; name: string }>("select id, iso2, name from countries where id <> $1 order by name", [country.id]),
    sql.query<{ kind: string; detail: string; createdAt: string | Date }>(
      `select kind, detail, created_at as "createdAt"
       from political_events
       where country_id = $1 and kind in ('diplomacy', 'treaty')
       order by created_at desc
       limit 8`,
      [country.id],
    ),
    sql.query<{
      electionId: string;
      characterId: string;
      username: string;
      partyId: string | null;
      party: string | null;
      abbreviation: string | null;
      supportPoints: number;
    }>(
      `select c.election_id as "electionId", c.character_id as "characterId", ch.username,
              c.party_id as "partyId", p.name as party, p.abbreviation, c.support_points as "supportPoints"
       from candidates c
       join elections e on e.id = c.election_id and e.round = c.round
       join characters ch on ch.id = c.character_id
       left join parties p on p.id = c.party_id
       where e.country_id = $1 and e.status <> 'closed'
       order by p.name nulls last, ch.username`,
      [country.id],
    ),
    sql.query<{ electionId: string; choiceId: string | null; choiceValue: string | null; votes: number; label: string | null }>(
      `select b.election_id as "electionId", b.choice_id as "choiceId", b.choice_value as "choiceValue",
              count(*)::int as votes, coalesce(ch.username, p.name, b.choice_value) as label
       from ballot_choices b
       join elections e on e.id = b.election_id and e.round = b.round
       left join characters ch on ch.id = b.choice_id
       left join parties p on p.id = b.choice_id
       where e.country_id = $1 and e.status <> 'closed' and (e.secret = false or e.voting_ends <= now())
       group by b.election_id, b.choice_id, b.choice_value, ch.username, p.name
       order by votes desc`,
      [country.id],
    ),
    sql.query<{
      electionId: string;
      kind: string;
      officeKey: string | null;
      round: number;
      seatCount: number;
      votingEnds: string | Date;
      choiceId: string | null;
      choiceValue: string | null;
      votes: number;
      label: string | null;
    }>(
      `with recent as (
         select id, kind, office_key, round, seat_count, voting_ends
         from elections
         where country_id = $1 and status = 'closed'
         order by voting_ends desc
         limit 4
       )
       select r.id as "electionId", r.kind, r.office_key as "officeKey", r.round, r.seat_count as "seatCount",
              r.voting_ends as "votingEnds", b.choice_id as "choiceId", b.choice_value as "choiceValue",
              count(b.id)::int as votes, coalesce(ch.username, p.name, b.choice_value) as label
       from recent r
       left join ballot_choices b on b.election_id = r.id and b.round = r.round
       left join characters ch on ch.id = b.choice_id
       left join parties p on p.id = b.choice_id
       group by r.id, r.kind, r.office_key, r.round, r.seat_count, r.voting_ends, b.choice_id, b.choice_value, ch.username, p.name
       order by r.voting_ends desc, votes desc`,
      [country.id],
    ),
    sql.query<{ username: string; party: string }>(
      `select ch.username, p.name as party
       from party_members m
       join characters ch on ch.id = m.character_id
       join parties p on p.id = m.party_id
       where p.country_id = $1 and m.status = 'active' and p.status = 'active'
       order by ch.username`,
      [country.id],
    ),
  ]);
  const counted = new Map<string, { id: string; kind: string; officeKey: string | null; round: number; seatCount: number; votingEnds: string | Date; tallies: { label: string; votes: number }[] }>();
  for (const row of countedRows) {
    const current = counted.get(row.electionId) ?? {
      id: row.electionId,
      kind: row.kind,
      officeKey: row.officeKey,
      round: row.round,
      seatCount: row.seatCount,
      votingEnds: row.votingEnds,
      tallies: [],
    };
    if (row.choiceId || row.choiceValue) current.tallies.push({ label: row.label || "Unnamed choice", votes: Number(row.votes) });
    counted.set(row.electionId, current);
  }
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
    salesTax: salesTaxRow ? Number(salesTaxRow.effectValue) : null,
    candidates,
    openTallies,
    countedElections: [...counted.values()],
    members,
    policies,
    investigations,
    relations,
    treaties,
    diplomacyEvents,
    coalition: coalition[0] ?? null,
    countries: partners,
  };
}

export async function viewerMayDiplomacy(sql: Sql, userId: string, countryId: string): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(
    `select o.id
     from characters ch
     join officeholders h on h.character_id = ch.id and h.status = 'active'
     join government_offices o on o.id = h.office_id and o.may_diplomacy = true
     join constitutions c on c.id = o.constitution_id
     where ch.user_id = $1 and ch.country_id = $2 and c.country_id = $2
     limit 1`,
    [userId, countryId],
  );
  return rows.length > 0;
}

export async function politicsIndex(sql: Sql) {
  return sql.query<{ iso2: string; name: string; templateName: string | null; leader: string | null; relations: number }>(
    `select c.iso2, c.name, t.name as "templateName", ch.username as leader,
            (select count(*)::int from diplomatic_relations r where r.country_a = c.id or r.country_b = c.id) as relations
     from countries c
     left join constitutions k on k.country_id = c.id
     left join government_templates t on t.id = k.template_id
     left join government_offices o on o.constitution_id = k.id and o.is_executive = true
     left join officeholders h on h.office_id = o.id and h.status = 'active'
     left join characters ch on ch.id = h.character_id
     order by c.name`,
  );
}
