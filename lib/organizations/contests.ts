import type { Sql } from "@/lib/db";
import { transfer } from "@/lib/economy/service";
import { activeMember, addInfluence, countriesSanctioned, lockCharacter, lockOrg, notify, recordEvent, requirePermission, rule } from "@/lib/organizations/access";
import { OrgError } from "@/lib/organizations/domain";

type ContestRow = {
  id: string;
  place_id: string;
  challenger_organization_id: string;
  defender_organization_id: string;
  status: string;
  stake: number | string;
  resolves_at: string | Date | null;
  outcome: string;
};

function ordered(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

async function relationStatus(sql: Sql, left: string, right: string): Promise<string | null> {
  const [organizationA, organizationB] = ordered(left, right);
  const rows = await sql.query<{ status: string }>(
    "select status from organization_relations where organization_a = $1 and organization_b = $2",
    [organizationA, organizationB],
  );
  return rows[0]?.status ?? null;
}

async function openStartingCity(sql: Sql, placeId: string): Promise<{ id: string; name: string }> {
  const rows = await sql.query<{ id: string; name: string }>(
    `select p.id, p.name
     from places p
     join starting_locations s on s.place_id = p.id
     where p.id = $1 and s.status = 'open'`,
    [placeId],
  );
  const place = rows[0];
  if (!place) throw new OrgError("Choose an open starting city.");
  return place;
}

async function lockContest(sql: Sql, contestId: string): Promise<ContestRow> {
  const rows = await sql.query<ContestRow>(
    `select id, place_id, challenger_organization_id, defender_organization_id, status, stake, resolves_at, outcome
     from city_contests where id = $1 for update`,
    [contestId],
  );
  const contest = rows[0];
  if (!contest) throw new OrgError("That city contest does not exist.");
  return contest;
}

export async function proposeCityContest(sql: Sql, input: { userId: string; organizationId: string; otherOrganizationId: string; placeId: string }): Promise<string> {
  const character = await lockCharacter(sql, input.userId);
  const challenger = await lockOrg(sql, input.organizationId);
  const defender = await lockOrg(sql, input.otherOrganizationId);
  if (challenger.id === defender.id) throw new OrgError("Choose another organization.");
  await requirePermission(sql, character.id, challenger.id, "rivalries");
  const relation = await relationStatus(sql, challenger.id, defender.id);
  if (relation !== "rival") throw new OrgError("A recorded rivalry is required. A ceasefire, alliance, or partnership blocks a city contest.");
  if (await countriesSanctioned(sql, challenger.country_id, defender.country_id)) {
    throw new OrgError("A diplomatic sanction between the headquarters countries blocks this contest.");
  }
  const place = await openStartingCity(sql, input.placeId);
  const open = await sql.query<{ id: string }>(
    "select id from city_contests where place_id = $1 and status in ('proposed', 'active')",
    [place.id],
  );
  if (open.length > 0) throw new OrgError("A contest is already open for that city.");
  const stake = await rule(sql, "city_contest_stake");
  if (!Number.isInteger(stake) || stake <= 0) throw new OrgError("The contest stake is not configured.");
  const created = await sql.query<{ id: string }>(
    `insert into city_contests (place_id, challenger_organization_id, defender_organization_id, proposed_by, status, stake)
     values ($1, $2, $3, $4, 'proposed', $5) returning id`,
    [place.id, challenger.id, defender.id, character.id, stake],
  );
  const contestId = created[0]?.id;
  if (!contestId) throw new OrgError("The contest could not be proposed.");
  await notify(sql, defender.leader_character_id, defender.id, "contest", `${challenger.name} proposed a presence contest in ${place.name}.`, `contest:${contestId}`);
  await recordEvent(sql, challenger.id, "contest", `A presence contest was proposed in ${place.name}. It does not change the country.`, "public");
  return contestId;
}

export async function acceptCityContest(sql: Sql, input: { userId: string; contestId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const contest = await lockContest(sql, input.contestId);
  if (contest.status !== "proposed") throw new OrgError("That contest is not waiting for acceptance.");
  const membership = await activeMember(sql, character.id);
  if (membership?.organization_id !== contest.defender_organization_id) throw new OrgError("The challenged organization accepts the contest.");
  await requirePermission(sql, character.id, contest.defender_organization_id, "rivalries");
  const relation = await relationStatus(sql, contest.challenger_organization_id, contest.defender_organization_id);
  if (relation !== "rival") throw new OrgError("The rivalry is no longer recorded, so this contest cannot start.");
  const [first, second] = ordered(contest.challenger_organization_id, contest.defender_organization_id);
  const left = await lockOrg(sql, first);
  const right = await lockOrg(sql, second);
  const challenger = left.id === contest.challenger_organization_id ? left : right;
  const defender = left.id === contest.defender_organization_id ? left : right;
  if (await countriesSanctioned(sql, challenger.country_id, defender.country_id)) {
    throw new OrgError("A diplomatic sanction between the headquarters countries blocks this contest.");
  }
  const seconds = await rule(sql, "city_contest_seconds");
  const stake = Number(contest.stake);
  await transfer(sql, {
    from: { kind: "organization", id: challenger.id },
    to: { kind: "system", id: null },
    amount: stake,
    reason: "city_contest",
    idempotencyKey: `contest:${contest.id}:challenger`,
    actorUserId: input.userId,
  });
  await transfer(sql, {
    from: { kind: "organization", id: defender.id },
    to: { kind: "system", id: null },
    amount: stake,
    reason: "city_contest",
    idempotencyKey: `contest:${contest.id}:defender`,
    actorUserId: input.userId,
  });
  await sql.query(
    `update city_contests set status = 'active', resolves_at = now() + ($2 * interval '1 second') where id = $1 and status = 'proposed'`,
    [contest.id, seconds],
  );
  await recordEvent(sql, challenger.id, "contest", "The presence contest started. Both treasuries paid the stake.", "public");
  await recordEvent(sql, defender.id, "contest", "The presence contest started. Both treasuries paid the stake.", "public");
}

export async function supportCityContest(sql: Sql, input: { userId: string; contestId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const contest = await lockContest(sql, input.contestId);
  if (contest.status !== "active") throw new OrgError("Support is recorded only while the contest is active.");
  const membership = await activeMember(sql, character.id);
  if (!membership || (membership.organization_id !== contest.challenger_organization_id && membership.organization_id !== contest.defender_organization_id)) {
    throw new OrgError("Only a member of a participating organization can record support.");
  }
  const inserted = await sql.query<{ character_id: string }>(
    `insert into city_contest_support (contest_id, character_id, organization_id)
     values ($1, $2, $3) on conflict (contest_id, character_id) do nothing returning character_id`,
    [contest.id, character.id, membership.organization_id],
  );
  if (inserted.length === 0) throw new OrgError("You already recorded support for this contest.");
}

export async function cancelCityContest(sql: Sql, input: { userId: string; contestId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const contest = await lockContest(sql, input.contestId);
  if (contest.status !== "proposed") throw new OrgError("An active contest can no longer be cancelled.");
  const membership = await activeMember(sql, character.id);
  if (!membership || (membership.organization_id !== contest.challenger_organization_id && membership.organization_id !== contest.defender_organization_id)) {
    throw new OrgError("You cannot cancel that contest.");
  }
  await requirePermission(sql, character.id, membership.organization_id, "rivalries");
  await sql.query("update city_contests set status = 'cancelled', resolved_at = now() where id = $1 and status = 'proposed'", [contest.id]);
  await recordEvent(sql, contest.challenger_organization_id, "contest", "The proposed presence contest was cancelled before either treasury paid.", "public");
}

export type ContestSettlement = "resolved" | "pending" | "unchanged";

export async function settleCityContest(sql: Sql, contestId: string): Promise<ContestSettlement> {
  const contest = await lockContest(sql, contestId);
  if (contest.status !== "active") return "unchanged";
  if (!contest.resolves_at || new Date(contest.resolves_at).getTime() > Date.now()) return "pending";
  const support = await sql.query<{ organization_id: string; count: number }>(
    "select organization_id, count(*)::int as count from city_contest_support where contest_id = $1 group by organization_id",
    [contest.id],
  );
  const influence = await sql.query<{ organization_id: string; score: number }>(
    `select organization_id, score from organization_influence
     where place_id = $1 and organization_id in ($2, $3)`,
    [contest.place_id, contest.challenger_organization_id, contest.defender_organization_id],
  );
  const total = (organizationId: string) =>
    Number(support.find((row) => row.organization_id === organizationId)?.count ?? 0) +
    Number(influence.find((row) => row.organization_id === organizationId)?.score ?? 0);
  const challengerTotal = total(contest.challenger_organization_id);
  const defenderTotal = total(contest.defender_organization_id);
  const outcome = challengerTotal > defenderTotal ? "challenger" : defenderTotal > challengerTotal ? "defender" : "draw";
  const updated = await sql.query<{ id: string }>(
    `update city_contests set status = 'resolved', outcome = $2, resolved_at = now()
     where id = $1 and status = 'active' returning id`,
    [contest.id, outcome],
  );
  if (updated.length === 0) return "unchanged";
  const winner = outcome === "challenger" ? contest.challenger_organization_id : outcome === "defender" ? contest.defender_organization_id : null;
  if (winner) await addInfluence(sql, winner, contest.place_id);
  const detail =
    outcome === "draw"
      ? "The presence contest ended in a draw. Neither influence score changed."
      : "The presence contest ended. The higher score gained influence. The city and country were not transferred.";
  await recordEvent(sql, contest.challenger_organization_id, "contest", detail, "public");
  await recordEvent(sql, contest.defender_organization_id, "contest", detail, "public");
  return "resolved";
}

export async function placeContest(sql: Sql, placeId: string) {
  const rows = await sql.query<{
    id: string;
    status: string;
    outcome: string;
    challenger: string;
    defender: string;
    city: string;
    resolvesAt: string | Date | null;
  }>(
    `select c.id, c.status, c.outcome, ch.name as challenger, df.name as defender, p.name as city, c.resolves_at as "resolvesAt"
     from city_contests c
     join organizations ch on ch.id = c.challenger_organization_id
     join organizations df on df.id = c.defender_organization_id
     join places p on p.id = c.place_id
     where c.place_id = $1
     order by c.created_at desc
     limit 1`,
    [placeId],
  );
  return rows[0] ?? null;
}
