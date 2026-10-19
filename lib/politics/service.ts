import type { Sql } from "@/lib/db";
import { transfer } from "@/lib/economy/service";
import { PoliticsError } from "@/lib/politics/errors";
import { dhondt } from "@/lib/politics/seats";

type Character = { id: string; user_id: string; country_id: string; level: number };

async function rule(sql: Sql, key: string): Promise<number> {
  const rows = await sql.query<{ amount: number | string }>("select amount from game_rules where key = $1", [key]);
  const amount = Number(rows[0]?.amount);
  if (!Number.isFinite(amount)) throw new PoliticsError("A required game rule is missing.");
  return amount;
}

async function lockCharacter(sql: Sql, userId: string): Promise<Character> {
  const rows = await sql.query<Character>(
    "select id, user_id, country_id, level from characters where user_id = $1 for update",
    [userId],
  );
  const row = rows[0];
  if (!row) throw new PoliticsError("Create a character before taking part in politics.");
  return row;
}

async function event(sql: Sql, countryId: string, kind: string, detail: string): Promise<void> {
  await sql.query("insert into political_events (country_id, kind, detail) values ($1, $2, $3)", [countryId, kind, detail]);
}

async function constitutionFor(sql: Sql, countryId: string) {
  const rows = await sql.query<{
    id: string;
    template_id: string;
    opposition_restricted: boolean;
    version: number;
    parliament_system: string;
    parliament_seats: number;
    executive_selection: string;
  }>(
    `select c.id, c.template_id, c.opposition_restricted, c.version, t.parliament_system, t.parliament_seats, t.executive_selection
     from constitutions c join government_templates t on t.id = c.template_id
     where c.country_id = $1`,
    [countryId],
  );
  return rows[0] ?? null;
}

async function holdsPower(sql: Sql, characterId: string, countryId: string, flag: "may_appoint" | "may_spend" | "may_propose_law" | "may_diplomacy" | "is_executive") {
  const rows = await sql.query<{ id: string }>(
    `select o.id from officeholders h
     join government_offices o on o.id = h.office_id
     join constitutions c on c.id = o.constitution_id
     where h.character_id = $1 and h.status = 'active' and c.country_id = $2 and o.${flag} = true
     limit 1`,
    [characterId, countryId],
  );
  return rows.length > 0;
}

export async function adoptConstitution(sql: Sql, input: { userId: string; countryId: string; templateId: string }): Promise<string> {
  const character = await lockCharacter(sql, input.userId);
  if (character.country_id !== input.countryId) throw new PoliticsError("You can adopt a game constitution only for your starting country.");
  const existing = await constitutionFor(sql, input.countryId);
  if (existing) throw new PoliticsError("This country already has a game constitution.");
  const templates = await sql.query<{ id: string; restrict_opposition_on_adopt: boolean; summary: string }>(
    "select id, restrict_opposition_on_adopt, summary from government_templates where id = $1",
    [input.templateId],
  );
  const template = templates[0];
  if (!template) throw new PoliticsError("That government template does not exist.");
  const created = await sql.query<{ id: string }>(
    `insert into constitutions (country_id, template_id, opposition_restricted, adopted_by, note)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      input.countryId,
      template.id,
      template.restrict_opposition_on_adopt,
      character.id,
      "Game constitution chosen by a player. It is not a description of the real-world government, and no real officeholder is imported.",
    ],
  );
  const constitutionId = created[0]?.id;
  if (!constitutionId) throw new PoliticsError("The constitution could not be saved.");
  await sql.query(
    `insert into government_offices (
       constitution_id, office_key, name, selection, is_executive, is_legislative,
       may_appoint, may_spend, may_propose_law, may_diplomacy, seat_count
     )
     select $1, office_key, name, selection, is_executive, is_legislative,
            may_appoint, may_spend, may_propose_law, may_diplomacy, seat_count
     from template_offices where template_id = $2`,
    [constitutionId, template.id],
  );
  await sql.query("insert into government_accounts (country_id, balance) values ($1, 0) on conflict (country_id) do nothing", [input.countryId]);
  await sql.query(
    "insert into constitution_changes (constitution_id, version, change, actor_id) values ($1, 1, 'adopted', $2)",
    [constitutionId, character.id],
  );
  await event(sql, input.countryId, "constitution", `A game constitution was adopted: ${template.summary}`);
  return constitutionId;
}

export async function createParty(sql: Sql, input: { userId: string; name: string; abbreviation: string; platform: string }): Promise<string> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const abbreviation = input.abbreviation.trim().toUpperCase();
  const platform = input.platform.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 '&-]{1,38}[A-Za-z0-9]$/.test(name)) throw new PoliticsError("Use a party name of 3 to 40 characters.");
  if (!/^[A-Z0-9]{2,8}$/.test(abbreviation)) throw new PoliticsError("Use an abbreviation of 2 to 8 letters or numbers.");
  if (platform.length > 500) throw new PoliticsError("The platform is too long.");
  const character = await lockCharacter(sql, input.userId);
  if (character.level < (await rule(sql, "party_min_level"))) throw new PoliticsError("Your character has not reached the level required to found a party.");
  const constitution = await constitutionFor(sql, character.country_id);
  if (constitution?.opposition_restricted) {
    const existing = await sql.query<{ id: string }>("select id from parties where country_id = $1 and status = 'active' limit 1", [character.country_id]);
    if (existing.length > 0) throw new PoliticsError("This game constitution does not allow another party.");
  }
  const membership = await sql.query<{ party_id: string }>("select party_id from party_members where character_id = $1 and status = 'active'", [character.id]);
  if (membership.length > 0) throw new PoliticsError("Leave your current party first.");
  const duplicate = await sql.query<{ id: string }>("select id from parties where country_id = $1 and lower(name) = lower($2) and status = 'active'", [character.country_id, name]);
  if (duplicate.length > 0) throw new PoliticsError("A party in this country already uses that name.");
  await transfer(sql, {
    from: { kind: "character", id: character.id },
    to: { kind: "system", id: null },
    amount: await rule(sql, "party_startup"),
    reason: "party_startup",
    idempotencyKey: `party:${character.id}:${name.toLowerCase()}`,
    actorUserId: input.userId,
  });
  const created = await sql.query<{ id: string }>(
    `insert into parties (country_id, name, abbreviation, platform, founder_id, leader_id)
     values ($1, $2, $3, $4, $5, $5) returning id`,
    [character.country_id, name, abbreviation, platform, character.id],
  );
  const partyId = created[0]?.id;
  if (!partyId) throw new PoliticsError("The party could not be saved.");
  await sql.query("insert into party_members (party_id, character_id, role, status) values ($1, $2, 'leader', 'active')", [partyId, character.id]);
  await event(sql, character.country_id, "party", `${name} was founded.`);
  return partyId;
}

export async function joinParty(sql: Sql, input: { userId: string; partyId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const parties = await sql.query<{ id: string; country_id: string; status: string }>("select id, country_id, status from parties where id = $1", [input.partyId]);
  const party = parties[0];
  if (!party || party.status !== "active") throw new PoliticsError("That party is not open.");
  if (party.country_id !== character.country_id) throw new PoliticsError("That party operates in another country.");
  const membership = await sql.query<{ party_id: string }>("select party_id from party_members where character_id = $1 and status = 'active'", [character.id]);
  if (membership.length > 0) throw new PoliticsError("Leave your current party first.");
  await sql.query(
    `insert into party_members (party_id, character_id, role, status) values ($1, $2, 'member', 'active')
     on conflict (party_id, character_id) do update set status = 'active', role = 'member'`,
    [party.id, character.id],
  );
}

export async function leaveParty(sql: Sql, input: { userId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ party_id: string; role: string }>(
    "select party_id, role from party_members where character_id = $1 and status = 'active'",
    [character.id],
  );
  const membership = rows[0];
  if (!membership) throw new PoliticsError("You are not in a party.");
  if (membership.role === "leader") {
    const others = await sql.query<{ id: string }>(
      "select character_id as id from party_members where party_id = $1 and status = 'active' and character_id <> $2",
      [membership.party_id, character.id],
    );
    if (others.length > 0) throw new PoliticsError("Choose another leader before leaving.");
    await sql.query("update parties set status = 'dissolved' where id = $1", [membership.party_id]);
  }
  await sql.query("update party_members set status = 'left', role = 'member' where party_id = $1 and character_id = $2", [membership.party_id, character.id]);
}

async function leaderParty(sql: Sql, characterId: string, countryId: string) {
  const rows = await sql.query<{ id: string }>(
    `select p.id from parties p
     join party_members m on m.party_id = p.id
     where m.character_id = $1 and m.status = 'active' and m.role = 'leader' and p.country_id = $2 and p.status = 'active'`,
    [characterId, countryId],
  );
  return rows[0]?.id ?? null;
}

export async function scheduleElection(sql: Sql, input: { userId: string; countryId: string; kind: "fptp_office" | "pr_parliament" | "two_round" | "party_leadership" | "confidence"; officeKey?: string }): Promise<string> {
  const character = await lockCharacter(sql, input.userId);
  const constitution = await constitutionFor(sql, input.countryId);
  if (!constitution) throw new PoliticsError("Adopt a game constitution before scheduling an election.");
  const leader = await leaderParty(sql, character.id, input.countryId);
  const executive = await holdsPower(sql, character.id, input.countryId, "is_executive");
  const vacantHead = await sql.query<{ id: string }>(
    `select o.id from government_offices o
     where o.constitution_id = $1 and o.is_executive = true
       and not exists (select 1 from officeholders h where h.office_id = o.id and h.status = 'active')`,
    [constitution.id],
  );
  const seated = await sql.query<{ id: string }>(
    "select id from parliamentary_seats where constitution_id = $1 and character_id = $2 and status = 'active'",
    [constitution.id, character.id],
  );
  if (input.kind === "confidence") {
    if (!executive && seated.length === 0) throw new PoliticsError("Only a sitting member or the executive can open a confidence vote.");
  } else {
    if (!leader && !executive) throw new PoliticsError("Only a party leader or the current executive can schedule an election.");
    if (vacantHead.length === 0 && !executive) throw new PoliticsError("The current executive schedules elections after the first government is formed.");
  }
  if (input.kind === "pr_parliament" && constitution.parliament_system !== "pr") throw new PoliticsError("This constitution has no parliament to elect.");
  if ((input.kind === "fptp_office" || input.kind === "two_round") && !input.officeKey) throw new PoliticsError("Choose the office being elected.");
  if (input.kind === "fptp_office" || input.kind === "two_round") {
    const offices = await sql.query<{ selection: string }>(
      "select selection from government_offices where constitution_id = $1 and office_key = $2",
      [constitution.id, input.officeKey],
    );
    if (offices[0]?.selection !== "election_fptp") throw new PoliticsError("That office is not filled by a direct election.");
  }
  if (input.kind === "party_leadership" && !leader) throw new PoliticsError("Only a party leader can open a leadership vote.");
  const open = await sql.query<{ id: string }>("select id from elections where country_id = $1 and kind = $2 and status in ('open', 'runoff')", [input.countryId, input.kind]);
  if (open.length > 0) throw new PoliticsError("An election of that kind is already open.");
  const registration = await rule(sql, "election_registration_seconds");
  const voting = await rule(sql, "election_voting_seconds");
  const created = await sql.query<{ id: string }>(
    `insert into elections (
       country_id, constitution_id, kind, office_key, party_id, opened_by, status, seat_count, secret, registration_ends, voting_ends
     ) values (
       $1, $2, $3, $4, $5, $6, 'open', $7, $8, now() + ($9 * interval '1 second'), now() + (($9 + $10) * interval '1 second')
     ) returning id`,
    [
      input.countryId,
      constitution.id,
      input.kind,
      input.officeKey ?? null,
      input.kind === "party_leadership" ? leader : null,
      character.id,
      input.kind === "pr_parliament" ? constitution.parliament_seats : 1,
      input.kind !== "confidence",
      registration,
      voting,
    ],
  );
  const electionId = created[0]?.id;
  if (!electionId) throw new PoliticsError("The election could not be opened.");
  await event(sql, input.countryId, "election", "An election was scheduled.");
  return electionId;
}

export async function advanceElection(sql: Sql, input: { userId: string; electionId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; country_id: string; opened_by: string; registering: boolean; voting: boolean; status: string }>(
    `select id, country_id, opened_by, registration_ends > now() as registering, voting_ends > now() as voting, status
     from elections where id = $1 for update`,
    [input.electionId],
  );
  const election = rows[0];
  if (!election || election.status === "closed") throw new PoliticsError("That election is not open.");
  const leader = await leaderParty(sql, character.id, election.country_id);
  const executive = await holdsPower(sql, character.id, election.country_id, "is_executive");
  if (character.id !== election.opened_by && !leader && !executive) throw new PoliticsError("You cannot close this election period.");
  if (election.registering) {
    await sql.query("update elections set registration_ends = now() where id = $1", [election.id]);
    return;
  }
  if (election.voting) await sql.query("update elections set voting_ends = now() where id = $1", [election.id]);
}

export async function registerCandidate(sql: Sql, input: { userId: string; electionId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  if (character.level < (await rule(sql, "party_min_level"))) throw new PoliticsError("You do not meet the level requirement.");
  const rows = await sql.query<{ id: string; country_id: string; kind: string; round: number; registering: boolean; status: string; opposition_restricted: boolean }>(
    `select e.id, e.country_id, e.kind, e.round, e.registration_ends > now() as registering, e.status, c.opposition_restricted
     from elections e join constitutions c on c.id = e.constitution_id
     where e.id = $1`,
    [input.electionId],
  );
  const election = rows[0];
  if (!election || election.status === "closed" || !election.registering) throw new PoliticsError("Candidate registration is closed.");
  if (election.country_id !== character.country_id) throw new PoliticsError("You cannot stand in another country's election.");
  if (election.kind === "confidence") throw new PoliticsError("A confidence vote has no candidates.");
  const membership = await sql.query<{ party_id: string }>("select party_id from party_members where character_id = $1 and status = 'active'", [character.id]);
  if (election.opposition_restricted) {
    const first = await sql.query<{ id: string }>("select id from parties where country_id = $1 and status = 'active' order by created_at limit 1", [election.country_id]);
    if (!membership[0] || membership[0].party_id !== first[0]?.id) throw new PoliticsError("Only the permitted party can nominate candidates.");
  }
  await sql.query(
    `insert into candidates (election_id, character_id, party_id, round) values ($1, $2, $3, $4)
     on conflict (election_id, character_id, round) do nothing`,
    [election.id, character.id, membership[0]?.party_id ?? null, election.round],
  );
}

export async function campaignSpeech(sql: Sql, input: { userId: string; electionId: string }): Promise<"recorded" | "replayed"> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; round: number; voting: boolean; status: string }>(
    `select id, round, voting_ends > now() as voting, status from elections where id = $1 and registration_ends <= now()`,
    [input.electionId],
  );
  const election = rows[0];
  if (!election || election.status === "closed" || !election.voting) throw new PoliticsError("Campaigning is only open during the voting period.");
  const candidate = await sql.query<{ character_id: string }>(
    "select character_id from candidates where election_id = $1 and character_id = $2 and round = $3",
    [election.id, character.id, election.round],
  );
  if (candidate.length === 0) throw new PoliticsError("Only a registered candidate can campaign.");
  const paid = await transfer(sql, {
    from: { kind: "character", id: character.id },
    to: { kind: "system", id: null },
    amount: 5,
    reason: "campaign_speech",
    idempotencyKey: `speech:${election.id}:${character.id}:${election.round}`,
    actorUserId: input.userId,
  });
  if (paid === "replayed") return "replayed";
  await sql.query(
    "update candidates set support_points = support_points + 1 where election_id = $1 and character_id = $2 and round = $3",
    [election.id, character.id, election.round],
  );
  return "recorded";
}

export async function castVote(sql: Sql, input: { userId: string; electionId: string; choiceKind: "character" | "party" | "yesno"; choiceId?: string; choiceValue?: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; country_id: string; kind: string; round: number; constitution_id: string; registering: boolean; voting: boolean; status: string; secret: boolean }>(
    `select id, country_id, kind, round, constitution_id, registration_ends > now() as registering, voting_ends > now() as voting, status, secret
     from elections where id = $1 for update`,
    [input.electionId],
  );
  const election = rows[0];
  if (!election || election.status === "closed" || election.registering || !election.voting) throw new PoliticsError("Voting is not open.");
  if (election.kind === "confidence") {
    const seat = await sql.query<{ id: string }>(
      "select id from parliamentary_seats where constitution_id = $1 and character_id = $2 and status = 'active'",
      [election.constitution_id, character.id],
    );
    if (seat.length === 0) throw new PoliticsError("Only a sitting member can vote in a confidence motion.");
    if (input.choiceValue !== "yes" && input.choiceValue !== "no") throw new PoliticsError("Vote yes or no.");
  } else if (character.country_id !== election.country_id) {
    throw new PoliticsError("You are not eligible to vote in this country.");
  }
  if (election.kind === "party_leadership") {
    const member = await sql.query<{ party_id: string }>("select party_id from party_members where character_id = $1 and status = 'active'", [character.id]);
    const leaderElection = await sql.query<{ party_id: string }>("select party_id from elections where id = $1", [election.id]);
    if (!member[0] || member[0].party_id !== leaderElection[0]?.party_id) throw new PoliticsError("Only members of that party can vote.");
  }
  if (input.choiceKind === "character") {
    const candidate = await sql.query<{ character_id: string }>(
      "select character_id from candidates where election_id = $1 and character_id = $2 and round = $3",
      [election.id, input.choiceId, election.round],
    );
    if (candidate.length === 0) throw new PoliticsError("That candidate is not on the ballot.");
  }
  if (input.choiceKind === "party") {
    const list = await sql.query<{ party_id: string }>(
      "select party_id from candidates where election_id = $1 and party_id = $2 and round = $3 limit 1",
      [election.id, input.choiceId, election.round],
    );
    if (list.length === 0) throw new PoliticsError("That party has no list in this election.");
  }
  const receipt = await sql.query<{ voter_id: string }>(
    `insert into ballot_receipts (election_id, voter_id, round) values ($1, $2, $3)
     on conflict (election_id, voter_id, round) do nothing returning voter_id`,
    [election.id, character.id, election.round],
  );
  if (receipt.length === 0) throw new PoliticsError("You have already voted in this round.");
  await sql.query(
    "insert into ballot_choices (election_id, round, choice_kind, choice_id, choice_value) values ($1, $2, $3, $4, $5)",
    [election.id, election.round, input.choiceKind, input.choiceId ?? null, input.choiceValue ?? null],
  );
}

export async function electionTallies(sql: Sql, electionId: string, round: number) {
  return sql.query<{ choice_id: string | null; choice_value: string | null; votes: number }>(
    `select choice_id, choice_value, count(*)::int as votes
     from ballot_choices where election_id = $1 and round = $2
     group by choice_id, choice_value
     order by votes desc`,
    [electionId, round],
  );
}

async function seatHolder(sql: Sql, officeId: string, characterId: string, partyId: string | null) {
  await sql.query("update officeholders set status = 'removed', ended_at = now() where office_id = $1 and status = 'active'", [officeId]);
  await sql.query("insert into officeholders (office_id, character_id, party_id, status) values ($1, $2, $3, 'active')", [officeId, characterId, partyId]);
}

export type ElectionSettlement =
  | "allocated"
  | "removed"
  | "survived"
  | "empty"
  | "runoff"
  | "tie"
  | "elected"
  | "pending"
  | "unchanged";

export async function settleElection(sql: Sql, electionId: string): Promise<ElectionSettlement> {
  const rows = await sql.query<{
    id: string;
    country_id: string;
    constitution_id: string;
    kind: string;
    office_key: string | null;
    party_id: string | null;
    round: number;
    seat_count: number;
    voting: boolean;
    status: string;
  }>(
    `select id, country_id, constitution_id, kind, office_key, party_id, round, seat_count, voting_ends > now() as voting, status
     from elections where id = $1 for update`,
    [electionId],
  );
  const election = rows[0];
  if (!election || election.status === "closed") return "unchanged";
  if (election.voting) return "pending";
  const tallies = await electionTallies(sql, election.id, election.round);
  if (election.kind === "pr_parliament") {
    const lists = tallies.filter((row) => row.choice_id).map((row) => ({ id: row.choice_id as string, votes: Number(row.votes) }));
    const allocated = dhondt(lists, election.seat_count);
    await sql.query("update parliamentary_seats set status = 'vacated' where constitution_id = $1 and status = 'active'", [election.constitution_id]);
    for (const [partyId, seats] of allocated) {
      const people = await sql.query<{ character_id: string }>(
        `select character_id from candidates where election_id = $1 and party_id = $2 and round = $3
         order by support_points desc, character_id`,
        [election.id, partyId, election.round],
      );
      for (const person of people.slice(0, seats)) {
        await sql.query(
          "insert into parliamentary_seats (constitution_id, character_id, party_id, election_id, status) values ($1, $2, $3, $4, 'active')",
          [election.constitution_id, person.character_id, partyId, election.id],
        );
      }
    }
    await sql.query("update elections set status = 'closed' where id = $1", [election.id]);
    await event(sql, election.country_id, "result", "Parliamentary seats were allocated from the recorded ballots.");
    return "allocated";
  }
  if (election.kind === "confidence") {
    const yes = Number(tallies.find((row) => row.choice_value === "yes")?.votes ?? 0);
    const no = Number(tallies.find((row) => row.choice_value === "no")?.votes ?? 0);
    const seats = await sql.query<{ count: number }>("select count(*)::int as count from parliamentary_seats where constitution_id = $1 and status = 'active'", [election.constitution_id]);
    const seated = Number(seats[0]?.count ?? 0);
    await sql.query("update elections set status = 'closed' where id = $1", [election.id]);
    if (seated > 0 && yes + no >= Math.ceil(seated / 2) && no > yes) {
      await sql.query(
        `update officeholders h set status = 'removed', ended_at = now()
         from government_offices o
         where h.office_id = o.id and o.constitution_id = $1 and o.is_executive = true and h.status = 'active'`,
        [election.constitution_id],
      );
      await event(sql, election.country_id, "confidence", "The executive lost a confidence vote and left office.");
      return "removed";
    }
    await event(sql, election.country_id, "confidence", "The executive survived the confidence vote.");
    return "survived";
  }
  const ranked = tallies.filter((row) => row.choice_id);
  const top = ranked[0];
  const second = ranked[1];
  if (!top?.choice_id) {
    await sql.query("update elections set status = 'closed' where id = $1", [election.id]);
    return "empty";
  }
  const topVotes = Number(top.votes);
  const tied = second && Number(second.votes) === topVotes;
  if (election.kind === "two_round" && election.round === 1) {
    const total = ranked.reduce((sum, row) => sum + Number(row.votes), 0);
    if (topVotes * 2 <= total) {
      const voting = await rule(sql, "election_voting_seconds");
      await sql.query(
        `update elections set status = 'runoff', round = 2, registration_ends = now(), voting_ends = now() + ($2 * interval '1 second') where id = $1`,
        [election.id, voting],
      );
      for (const row of ranked.slice(0, 2)) {
        await sql.query(
          `insert into candidates (election_id, character_id, party_id, round)
           select election_id, character_id, party_id, 2 from candidates
           where election_id = $1 and character_id = $2 and round = 1
           on conflict (election_id, character_id, round) do nothing`,
          [election.id, row.choice_id],
        );
      }
      await event(sql, election.country_id, "runoff", "No candidate won a majority. A second round is open.");
      return "runoff";
    }
  }
  if (tied) {
    await sql.query("update elections set status = 'closed' where id = $1", [election.id]);
    await event(sql, election.country_id, "result", "The election tied. No officeholder was installed.");
    return "tie";
  }
  if (election.kind === "party_leadership" && election.party_id) {
    await sql.query("update parties set leader_id = $2 where id = $1", [election.party_id, top.choice_id]);
    await sql.query("update party_members set role = 'member' where party_id = $1 and status = 'active'", [election.party_id]);
    await sql.query("update party_members set role = 'leader' where party_id = $1 and character_id = $2", [election.party_id, top.choice_id]);
  }
  if (election.office_key) {
    const offices = await sql.query<{ id: string }>("select id from government_offices where constitution_id = $1 and office_key = $2", [election.constitution_id, election.office_key]);
    const party = await sql.query<{ party_id: string | null }>("select party_id from party_members where character_id = $1 and status = 'active'", [top.choice_id]);
    if (offices[0]) await seatHolder(sql, offices[0].id, top.choice_id, party[0]?.party_id ?? null);
  }
  await sql.query("update elections set status = 'closed' where id = $1", [election.id]);
  await event(sql, election.country_id, "result", "An office was filled from the recorded ballots.");
  return "elected";
}

export async function closeElection(sql: Sql, input: { userId: string; electionId: string }): Promise<string> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ country_id: string; voting: boolean; status: string }>(
    `select country_id, voting_ends > now() as voting, status from elections where id = $1 for update`,
    [input.electionId],
  );
  const election = rows[0];
  if (!election || election.status === "closed") throw new PoliticsError("That election is already closed.");
  if (election.voting) throw new PoliticsError("Voting is still open.");
  if (character.country_id !== election.country_id && !(await holdsPower(sql, character.id, election.country_id, "is_executive"))) {
    throw new PoliticsError("You cannot close an election in another country.");
  }
  const result = await settleElection(sql, input.electionId);
  if (result === "pending") throw new PoliticsError("Voting is still open.");
  if (result === "unchanged") throw new PoliticsError("That election is already closed.");
  return result;
}

export async function formGovernment(sql: Sql, input: { userId: string; countryId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const constitution = await constitutionFor(sql, input.countryId);
  if (!constitution || constitution.executive_selection !== "parliamentary") throw new PoliticsError("This constitution does not form a government from parliament.");
  if (character.country_id !== input.countryId) throw new PoliticsError("You cannot form a government in another country.");
  const partyId = await leaderParty(sql, character.id, input.countryId);
  if (!partyId) throw new PoliticsError("Only a party leader can form the government.");
  const filled = await sql.query<{ id: string }>(
    `select h.id from officeholders h
     join government_offices o on o.id = h.office_id
     where o.constitution_id = $1 and o.is_executive = true and h.status = 'active'`,
    [constitution.id],
  );
  if (filled.length > 0) throw new PoliticsError("An executive is already in office.");
  const counts = await sql.query<{ party_id: string; seats: number }>(
    `select party_id, count(*)::int as seats from parliamentary_seats
     where constitution_id = $1 and status = 'active' and party_id is not null
     group by party_id order by seats desc, party_id`,
    [constitution.id],
  );
  const agreements = await sql.query<{ party_a: string; party_b: string }>(
    "select party_a, party_b from coalition_agreements where constitution_id = $1 and status = 'active'",
    [constitution.id],
  );
  const agreement = agreements.find((row) => row.party_a === partyId || row.party_b === partyId);
  const seatOf = (id: string) => Number(counts.find((row) => row.party_id === id)?.seats ?? 0);
  const callerBloc = agreement ? seatOf(agreement.party_a) + seatOf(agreement.party_b) : seatOf(partyId);
  const members = new Set(agreement ? [agreement.party_a, agreement.party_b] : [partyId]);
  let rival = 0;
  for (const row of agreements) {
    if (members.has(row.party_a)) continue;
    rival = Math.max(rival, seatOf(row.party_a) + seatOf(row.party_b));
  }
  for (const row of counts) {
    if (members.has(row.party_id)) continue;
    if (agreements.some((item) => item.party_a === row.party_id || item.party_b === row.party_id)) continue;
    rival = Math.max(rival, Number(row.seats));
  }
  if (callerBloc <= rival) throw new PoliticsError("The largest party or coalition forms the government, and a tie does not.");
  const offices = await sql.query<{ id: string }>(
    `select id from government_offices where constitution_id = $1 and is_executive = true and selection = 'appointment'
       and not exists (select 1 from officeholders h where h.office_id = government_offices.id and h.status = 'active')`,
    [constitution.id],
  );
  if (!offices[0]) throw new PoliticsError("There is no vacant executive office to fill.");
  await seatHolder(sql, offices[0].id, character.id, partyId);
  await event(sql, input.countryId, "government", agreement ? "The coalition formed the government." : "The largest party formed the government.");
}

export async function appointMinister(sql: Sql, input: { userId: string; countryId: string; officeKey: string; characterId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  if (!(await holdsPower(sql, character.id, input.countryId, "may_appoint"))) throw new PoliticsError("You do not have appointment authority.");
  const constitution = await constitutionFor(sql, input.countryId);
  if (!constitution) throw new PoliticsError("This country has no game constitution.");
  const offices = await sql.query<{ id: string; selection: string }>(
    "select id, selection from government_offices where constitution_id = $1 and office_key = $2",
    [constitution.id, input.officeKey],
  );
  const office = offices[0];
  if (!office || office.selection !== "appointment") throw new PoliticsError("That office is not filled by appointment.");
  const held = await sql.query<{ id: string }>("select id from officeholders where office_id = $1 and status = 'active'", [office.id]);
  if (held.length > 0) throw new PoliticsError("That office is already filled.");
  const member = await sql.query<{ party_id: string }>(
    `select m.party_id from party_members m join parties p on p.id = m.party_id
     where m.character_id = $1 and m.status = 'active' and p.country_id = $2`,
    [input.characterId, input.countryId],
  );
  if (member.length === 0) throw new PoliticsError("Appoint a party member from this country.");
  await seatHolder(sql, office.id, input.characterId, member[0]?.party_id ?? null);
  await event(sql, input.countryId, "appointment", "A minister was appointed.");
}

export async function claimRuledOffice(sql: Sql, input: { userId: string; countryId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const constitution = await constitutionFor(sql, input.countryId);
  if (!constitution || character.country_id !== input.countryId) throw new PoliticsError("You cannot claim an office in this country.");
  const partyId = await leaderParty(sql, character.id, input.countryId);
  if (!partyId) throw new PoliticsError("Only a party leader can claim a vacant ruler office.");
  const offices = await sql.query<{ id: string }>(
    `select id from government_offices where constitution_id = $1 and selection = 'claim'
       and not exists (select 1 from officeholders h where h.office_id = government_offices.id and h.status = 'active')`,
    [constitution.id],
  );
  if (!offices[0]) throw new PoliticsError("There is no vacant claimable office.");
  const larger = await sql.query<{ id: string }>(
    `select p.id from parties p
     where p.country_id = $1 and p.status = 'active' and (
       select count(*) from party_members m where m.party_id = p.id and m.status = 'active'
     ) > (
       select count(*) from party_members m where m.party_id = $2 and m.status = 'active'
     )`,
    [input.countryId, partyId],
  );
  if (larger.length > 0) throw new PoliticsError("A larger party has the claim.");
  await seatHolder(sql, offices[0].id, character.id, partyId);
  await event(sql, input.countryId, "claim", "A party leader claimed the vacant ruler office.");
}

export async function challengeRuler(sql: Sql, input: { userId: string; countryId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const partyId = await leaderParty(sql, character.id, input.countryId);
  if (!partyId || character.country_id !== input.countryId) throw new PoliticsError("Only a party leader from this country can challenge.");
  const rulers = await sql.query<{ office_id: string; party_id: string | null }>(
    `select h.office_id, h.party_id from officeholders h
     join government_offices o on o.id = h.office_id
     join constitutions c on c.id = o.constitution_id
     where c.country_id = $1 and o.selection = 'claim' and h.status = 'active'`,
    [input.countryId],
  );
  const ruler = rulers[0];
  if (!ruler?.party_id) throw new PoliticsError("There is no ruler to challenge.");
  const counts = await sql.query<{ mine: number; theirs: number }>(
    `select
       (select count(*)::int from party_members where party_id = $1 and status = 'active') as mine,
       (select count(*)::int from party_members where party_id = $2 and status = 'active') as theirs`,
    [partyId, ruler.party_id],
  );
  if (Number(counts[0]?.mine ?? 0) <= Number(counts[0]?.theirs ?? 0)) throw new PoliticsError("Your party is not larger than the ruler's party.");
  await seatHolder(sql, ruler.office_id, character.id, partyId);
  await event(sql, input.countryId, "challenge", "A larger party replaced the ruler.");
}

export async function declareEmergency(sql: Sql, input: { userId: string; countryId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const constitution = await constitutionFor(sql, input.countryId);
  if (!constitution || (constitution.template_id !== "authoritarian" && constitution.template_id !== "dictatorship")) {
    throw new PoliticsError("This constitution has no emergency-powers rule.");
  }
  if (!(await holdsPower(sql, character.id, input.countryId, "is_executive"))) throw new PoliticsError("Only the executive can declare emergency restrictions.");
  await sql.query("update constitutions set opposition_restricted = true, version = version + 1 where id = $1", [constitution.id]);
  await sql.query(
    "insert into constitution_changes (constitution_id, version, change, actor_id) values ($1, $2, 'opposition restricted', $3)",
    [constitution.id, constitution.version + 1, character.id],
  );
  await event(sql, input.countryId, "emergency", "Opposition party formation was restricted by the game constitution.");
}

const EFFECT_RULES = {
  sales_tax_percent: { category: "taxation", min: 0, max: 25 },
  tariff_percent: { category: "trade", min: 0, max: 25 },
  wage_floor: { category: "employment", min: 1, max: 50 },
  extraction_cost: { category: "resource_extraction", min: 1, max: 20 },
} as const;

export async function proposeBill(sql: Sql, input: { userId: string; countryId: string; title: string; body: string; effectKey: keyof typeof EFFECT_RULES; effectValue: number }): Promise<string> {
  const title = input.title.trim();
  const body = input.body.trim();
  const effect = EFFECT_RULES[input.effectKey];
  if (!effect) throw new PoliticsError("That policy is not available.");
  if (title.length < 3 || title.length > 80 || body.length < 10 || body.length > 1000) throw new PoliticsError("Give the bill a title and a short text.");
  if (!Number.isInteger(input.effectValue) || input.effectValue < effect.min || input.effectValue > effect.max) {
    throw new PoliticsError(`That value must be a whole number from ${effect.min} to ${effect.max}.`);
  }
  const character = await lockCharacter(sql, input.userId);
  const constitution = await constitutionFor(sql, input.countryId);
  if (!constitution) throw new PoliticsError("This country has no game constitution.");
  const seat = await sql.query<{ id: string }>("select id from parliamentary_seats where constitution_id = $1 and character_id = $2 and status = 'active'", [constitution.id, character.id]);
  const proposer = seat.length > 0 || (await holdsPower(sql, character.id, input.countryId, "may_propose_law"));
  if (!proposer) throw new PoliticsError("You cannot propose legislation.");
  const voting = await rule(sql, "election_voting_seconds");
  const created = await sql.query<{ id: string }>(
    `insert into bills (country_id, constitution_id, title, body, category, sponsor_id, effect_key, effect_value, status, voting_ends)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'voting', now() + ($9 * interval '1 second'))
     returning id`,
    [input.countryId, constitution.id, title, body, effect.category, character.id, input.effectKey, input.effectValue, voting],
  );
  await event(sql, input.countryId, "bill", `Bill proposed: ${title}`);
  return created[0]?.id ?? "";
}

export async function voteBill(sql: Sql, input: { userId: string; billId: string; vote: "yes" | "no" }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const bills = await sql.query<{ id: string; constitution_id: string; country_id: string; status: string; voting: boolean; effect_key: string; effect_value: number; threshold_percent: number; title: string }>(
    `select id, constitution_id, country_id, status, voting_ends > now() as voting, effect_key, effect_value, threshold_percent, title
     from bills where id = $1 for update`,
    [input.billId],
  );
  const bill = bills[0];
  if (!bill || bill.status !== "voting") throw new PoliticsError("That bill is not open for votes.");
  const seat = await sql.query<{ id: string }>("select id from parliamentary_seats where constitution_id = $1 and character_id = $2 and status = 'active'", [bill.constitution_id, character.id]);
  const minister = await holdsPower(sql, character.id, bill.country_id, "may_propose_law");
  if (seat.length === 0 && !minister) throw new PoliticsError("You do not have a legislative vote.");
  if (bill.voting) {
    const inserted = await sql.query<{ character_id: string }>(
      "insert into bill_votes (bill_id, character_id, vote) values ($1, $2, $3) on conflict (bill_id, character_id) do nothing returning character_id",
      [bill.id, character.id, input.vote],
    );
    if (inserted.length === 0) throw new PoliticsError("You have already voted on this bill.");
    return;
  }
  await enactIfReady(sql, bill);
}

async function enactIfReady(sql: Sql, bill: { id: string; country_id: string; effect_key: string; effect_value: number; threshold_percent: number; title: string; status: string }) {
  const votes = await sql.query<{ vote: string; count: number }>("select vote, count(*)::int as count from bill_votes where bill_id = $1 group by vote", [bill.id]);
  const yes = Number(votes.find((row) => row.vote === "yes")?.count ?? 0);
  const no = Number(votes.find((row) => row.vote === "no")?.count ?? 0);
  const passed = yes + no > 0 && yes * 100 >= bill.threshold_percent * (yes + no) && yes > no;
  if (!passed) {
    await sql.query("update bills set status = 'rejected' where id = $1 and status = 'voting'", [bill.id]);
    await event(sql, bill.country_id, "bill", `${bill.title} was rejected.`);
    return;
  }
  const updated = await sql.query<{ id: string }>("update bills set status = 'enacted' where id = $1 and status = 'voting' returning id", [bill.id]);
  if (updated.length === 0) return;
  await sql.query(
    "insert into policy_versions (country_id, effect_key, effect_value, bill_id) values ($1, $2, $3, $4)",
    [bill.country_id, bill.effect_key, bill.effect_value, bill.id],
  );
  await event(sql, bill.country_id, "law", `${bill.title} set ${bill.effect_key} to ${bill.effect_value}.`);
}

export type BillSettlement = "enacted" | "rejected" | "pending" | "unchanged";

export async function settleBill(sql: Sql, billId: string): Promise<BillSettlement> {
  const bills = await sql.query<{ id: string; country_id: string; status: string; voting: boolean; effect_key: string; effect_value: number; threshold_percent: number; title: string }>(
    "select id, country_id, status, voting_ends > now() as voting, effect_key, effect_value, threshold_percent, title from bills where id = $1 for update",
    [billId],
  );
  const bill = bills[0];
  if (!bill || bill.status !== "voting") return "unchanged";
  if (bill.voting) return "pending";
  await enactIfReady(sql, bill);
  const after = await sql.query<{ status: string }>("select status from bills where id = $1", [billId]);
  if (after[0]?.status === "enacted") return "enacted";
  if (after[0]?.status === "rejected") return "rejected";
  return "unchanged";
}

export async function closeBill(sql: Sql, input: { userId: string; billId: string }): Promise<void> {
  await lockCharacter(sql, input.userId);
  const result = await settleBill(sql, input.billId);
  if (result === "pending") throw new PoliticsError("The vote is still open.");
  if (result === "unchanged") throw new PoliticsError("That bill is not awaiting a count.");
}

export async function spendTreasury(sql: Sql, input: { userId: string; countryId: string; characterId: string; amount: number; idempotencyKey: string }): Promise<"applied" | "replayed"> {
  if (!/^[0-9a-f-]{16,80}$/i.test(input.idempotencyKey)) throw new PoliticsError("Refresh the page and try the payment again.");
  const character = await lockCharacter(sql, input.userId);
  if (!(await holdsPower(sql, character.id, input.countryId, "may_spend"))) throw new PoliticsError("You are not authorized to spend public funds.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new PoliticsError("Enter a positive whole amount.");
  const paid = await transfer(sql, {
    from: { kind: "government", id: input.countryId },
    to: { kind: "character", id: input.characterId },
    amount: input.amount,
    reason: "public_spending",
    idempotencyKey: `spend:${input.idempotencyKey}`,
    actorUserId: input.userId,
  });
  if (paid === "replayed") return "replayed";
  await event(sql, input.countryId, "spending", `Public funds of ${input.amount} were paid out.`);
  if (input.characterId === character.id) {
    const loss = await rule(sql, "scandal_reputation_loss");
    await sql.query("update characters set reputation = greatest(0, reputation - $2) where id = $1", [character.id, loss]);
    await sql.query(
      "insert into investigations (country_id, subject_character_id, opened_by, reason) values ($1, $2, $2, 'Paid public funds to their own character.')",
      [input.countryId, character.id],
    );
    await event(sql, input.countryId, "scandal", "A public payment to the officeholder's own character was recorded.");
  }
  return "applied";
}

export async function setDiplomacy(sql: Sql, input: { userId: string; otherCountryId: string; status: "friendly" | "neutral" | "strained" | "sanctioned"; note: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  if (!(await holdsPower(sql, character.id, character.country_id, "may_diplomacy"))) throw new PoliticsError("You are not authorized to conduct diplomacy.");
  if (input.otherCountryId === character.country_id) throw new PoliticsError("Choose another country.");
  const note = input.note.trim().slice(0, 200);
  const [countryA, countryB] = [character.country_id, input.otherCountryId].sort();
  await sql.query(
    `insert into diplomatic_relations (country_a, country_b, status, updated_by, note)
     values ($1, $2, $3, $4, $5)
     on conflict (country_a, country_b) do update set status = excluded.status, updated_by = excluded.updated_by, note = excluded.note, updated_at = now()`,
    [countryA, countryB, input.status, character.id, note],
  );
  await event(sql, character.country_id, "diplomacy", `A game diplomatic status was set to ${input.status}.`);
}

export async function signCoalition(sql: Sql, input: { userId: string; countryId: string; otherPartyId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const constitution = await constitutionFor(sql, input.countryId);
  if (!constitution || constitution.parliament_system !== "pr") throw new PoliticsError("This constitution has no parliament to form a coalition in.");
  const partyId = await leaderParty(sql, character.id, input.countryId);
  if (!partyId || partyId === input.otherPartyId) throw new PoliticsError("Choose another party in this country.");
  const other = await sql.query<{ id: string }>(
    "select id from parties where id = $1 and country_id = $2 and status = 'active'",
    [input.otherPartyId, input.countryId],
  );
  if (!other[0]) throw new PoliticsError("That party is not active in this country.");
  const seated = await sql.query<{ party_id: string; seats: number }>(
    `select party_id, count(*)::int as seats from parliamentary_seats
     where constitution_id = $1 and status = 'active' and party_id in ($2, $3)
     group by party_id`,
    [constitution.id, partyId, input.otherPartyId],
  );
  if (seated.length < 2) throw new PoliticsError("Both parties need seats from a recorded election before they can agree.");
  const open = await sql.query<{ id: string }>("select id from coalition_agreements where constitution_id = $1 and status = 'active'", [constitution.id]);
  if (open.length > 0) throw new PoliticsError("A coalition agreement is already active.");
  const [partyA, partyB] = [partyId, input.otherPartyId].sort();
  await sql.query(
    `insert into coalition_agreements (constitution_id, party_a, party_b, status)
     values ($1, $2, $3, 'active')`,
    [constitution.id, partyA, partyB],
  );
  await event(sql, input.countryId, "coalition", "Two parties signed a coalition agreement.");
}

export async function ruleInvestigation(sql: Sql, input: { userId: string; investigationId: string; ruling: "uphold" | "dismiss" }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const rows = await sql.query<{ id: string; country_id: string; subject_character_id: string; status: string }>(
    "select id, country_id, subject_character_id, status from investigations where id = $1 for update",
    [input.investigationId],
  );
  const investigation = rows[0];
  if (!investigation || investigation.status !== "open") throw new PoliticsError("That investigation is not open.");
  if (investigation.subject_character_id === character.id) throw new PoliticsError("You cannot rule on an investigation about yourself.");
  if (!(await holdsPower(sql, character.id, investigation.country_id, "may_propose_law"))) {
    throw new PoliticsError("You are not authorized to rule on an investigation.");
  }
  if (input.ruling === "dismiss") {
    await sql.query("update investigations set status = 'closed', outcome = 'dismissed' where id = $1", [investigation.id]);
    await event(sql, investigation.country_id, "investigation", "An investigation was dismissed.");
    return;
  }
  const loss = await rule(sql, "scandal_reputation_loss");
  await sql.query("update characters set reputation = greatest(0, reputation - $2) where id = $1", [investigation.subject_character_id, loss]);
  await sql.query(
    `update officeholders h set status = 'removed', ended_at = now()
     from government_offices o
     join constitutions c on c.id = o.constitution_id
     where h.office_id = o.id and c.country_id = $1 and h.character_id = $2 and h.status = 'active'`,
    [investigation.country_id, investigation.subject_character_id],
  );
  await sql.query("update investigations set status = 'closed', outcome = 'upheld' where id = $1", [investigation.id]);
  await event(sql, investigation.country_id, "investigation", "An investigation was upheld and the subject left office.");
}

export async function signTreaty(sql: Sql, input: { userId: string; otherCountryId: string; title: string }): Promise<void> {
  const title = input.title.trim();
  if (title.length < 3 || title.length > 80) throw new PoliticsError("Give the treaty a short title.");
  const character = await lockCharacter(sql, input.userId);
  if (!(await holdsPower(sql, character.id, character.country_id, "may_diplomacy"))) throw new PoliticsError("You are not authorized to sign a treaty.");
  if (input.otherCountryId === character.country_id) throw new PoliticsError("Choose another country.");
  const [countryA, countryB] = [character.country_id, input.otherCountryId].sort();
  const created = await sql.query<{ id: string }>(
    `insert into treaties (country_a, country_b, title, status, signed_by)
     values ($1, $2, $3, 'signed', $4)
     on conflict (country_a, country_b, title) do nothing
     returning id`,
    [countryA, countryB, title, character.id],
  );
  if (created.length === 0) throw new PoliticsError("That treaty title is already signed for these countries.");
  await event(sql, character.country_id, "treaty", `A game treaty was signed: ${title}. It has no military effect.`);
}

export async function claimMonarchy(sql: Sql, input: { userId: string; countryId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const constitution = await constitutionFor(sql, input.countryId);
  if (!constitution || character.country_id !== input.countryId) throw new PoliticsError("You can claim the monarchy only in your political home.");
  const offices = await sql.query<{ id: string }>(
    `select o.id from government_offices o
     where o.constitution_id = $1 and o.selection = 'succession'
     for update`,
    [constitution.id],
  );
  const office = offices[0];
  if (!office) throw new PoliticsError("This constitution has no monarchy to claim.");
  const held = await sql.query<{ id: string }>("select id from officeholders where office_id = $1 and status = 'active'", [office.id]);
  if (held.length > 0) throw new PoliticsError("The monarchy is already held.");
  const member = await sql.query<{ party_id: string }>(
    `select m.party_id from party_members m join parties p on p.id = m.party_id
     where m.character_id = $1 and m.status = 'active' and p.country_id = $2`,
    [character.id, input.countryId],
  );
  await seatHolder(sql, office.id, character.id, member[0]?.party_id ?? null);
  await event(sql, input.countryId, "succession", "A resident claimed the vacant game monarchy. This is not a real monarch.");
}

export async function succeedMonarch(sql: Sql, input: { userId: string; countryId: string; characterId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const constitution = await constitutionFor(sql, input.countryId);
  if (!constitution || character.country_id !== input.countryId) throw new PoliticsError("You cannot record a succession in this country.");
  const partyId = await leaderParty(sql, character.id, input.countryId);
  if (!partyId) throw new PoliticsError("Only a party leader can record a game succession.");
  const offices = await sql.query<{ id: string }>(
    `select id from government_offices where constitution_id = $1 and selection = 'succession'
       and not exists (select 1 from officeholders h where h.office_id = government_offices.id and h.status = 'active')`,
    [constitution.id],
  );
  if (!offices[0]) throw new PoliticsError("There is no vacant succession office.");
  const member = await sql.query<{ party_id: string }>(
    `select m.party_id from party_members m join parties p on p.id = m.party_id
     where m.character_id = $1 and m.status = 'active' and p.country_id = $2`,
    [input.characterId, input.countryId],
  );
  if (member.length === 0) throw new PoliticsError("Appoint a party member from this country.");
  await seatHolder(sql, offices[0].id, input.characterId, member[0]?.party_id ?? null);
  await event(sql, input.countryId, "succession", "A party recorded a game succession. This is not a real monarch.");
}

export async function depositPartyFunds(sql: Sql, input: { userId: string; amount: number; idempotencyKey: string }): Promise<void> {
  if (!/^[0-9a-f-]{16,80}$/i.test(input.idempotencyKey)) throw new PoliticsError("Refresh the page and try the deposit again.");
  const character = await lockCharacter(sql, input.userId);
  const membership = await sql.query<{ party_id: string; role: string }>("select party_id, role from party_members where character_id = $1 and status = 'active'", [character.id]);
  if (!membership[0]) throw new PoliticsError("Join a party before depositing.");
  if (membership[0].role !== "leader") throw new PoliticsError("Only the party leader moves the treasury.");
  await transfer(sql, {
    from: { kind: "character", id: character.id },
    to: { kind: "party", id: membership[0].party_id },
    amount: input.amount,
    reason: "party_deposit",
    idempotencyKey: `party-deposit:${input.idempotencyKey}`,
    actorUserId: input.userId,
  });
}
