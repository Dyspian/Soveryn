import type { Sql } from "@/lib/db";
import { transfer } from "@/lib/economy/service";
import { shiftClaimedOn } from "@/lib/economy/shift-claims";
import { lockCharacter, rule } from "@/lib/organizations/access";
import { BULLETIN_MISSION_ID } from "@/lib/world/bulletin";

const BULLETIN_TYPE = "work_bulletin";
const REWARD_CAP = 50;
const GOAL_CAP = 20;
const MIN_WINDOW_SECONDS = 3600;
const MAX_WINDOW_SECONDS = 7 * 24 * 3600;

export type BulletinResult =
  | { state: "none" }
  | { state: "recorded"; eventId: string; amount: number }
  | { state: "already"; eventId: string }
  | { state: "used"; eventId: string };

export type WorldEventView = {
  id: string;
  title: string;
  detail: string;
  status: "scheduled" | "active" | "ended" | "cancelled";
  outcome: "pending" | "met" | "unmet";
  countryName: string;
  iso2: string;
  progress: number;
  goal: number;
  reward: number;
  startsAt: string;
  endsAt: string;
  eligible: boolean;
  contractAccepted: boolean;
  playerNote: string;
};

type EventStep = { activated: number; resolved: number; opened: number };

export function bulletinLimits(input: { windowSeconds: number; cooldownSeconds: number; maxActive: number; goal: number; reward: number }): {
  windowSeconds: number;
  cooldownSeconds: number;
  maxActive: number;
  goal: number;
  reward: number;
} | null {
  const windowSeconds = Math.trunc(input.windowSeconds);
  const cooldownSeconds = Math.trunc(input.cooldownSeconds);
  const maxActive = Math.trunc(input.maxActive);
  const goal = Math.trunc(input.goal);
  const reward = Math.trunc(input.reward);
  if (windowSeconds < MIN_WINDOW_SECONDS || windowSeconds > MAX_WINDOW_SECONDS) return null;
  if (cooldownSeconds < 0 || cooldownSeconds > MAX_WINDOW_SECONDS) return null;
  if (maxActive < 1 || maxActive > 12) return null;
  if (goal < 1 || goal > GOAL_CAP) return null;
  if (reward < 1 || reward > REWARD_CAP) return null;
  return { windowSeconds, cooldownSeconds, maxActive, goal, reward };
}

export function bulletinCopy(countryName: string, reward: number, goal: number): { title: string; detail: string } | null {
  const name = countryName.trim();
  if (name.length < 1 || name.length > 120) return null;
  const title = name.length + " work bulletin".length <= 80 ? `${name} work bulletin` : "Work bulletin";
  const detail = `${name} has an open starting city and a resident. One company shift by a character whose political home is ${name} pays ${reward} once. Goal ${goal}. The bulletin closes at its end time. A missed window is not replayed.`;
  if (title.length < 3 || title.length > 80 || detail.length < 3 || detail.length > 400) return null;
  return { title, detail };
}

export function bulletinPlayerNote(input: {
  status: WorldEventView["status"];
  outcome: WorldEventView["outcome"];
  home: boolean;
  joined: boolean;
  reward: number;
  homeCountryName: string;
}): { eligible: boolean; playerNote: string } {
  if (input.status === "scheduled") return { eligible: false, playerNote: "This bulletin is scheduled and is not open for a shift yet." };
  if (input.status === "cancelled") return { eligible: false, playerNote: "This bulletin was cancelled. No further payment is made." };
  if (input.status === "ended") {
    if (input.outcome === "met") return { eligible: false, playerNote: "The goal was met. A recorded contribution is not paid again." };
    return { eligible: false, playerNote: "The window closed before the goal was met. No further payment is made." };
  }
  if (!input.home) return { eligible: false, playerNote: `Your political home is ${input.homeCountryName}, so this bulletin does not include you.` };
  if (input.joined) return { eligible: false, playerNote: "Your shift is already recorded for this bulletin." };
  return {
    eligible: true,
    playerNote: `A company shift while this is open records one contribution and pays ${input.reward}. A shift already recorded on a joint contract is not paid here. The mission board lists a matching contract. That contract does not pay a second time.`,
  };
}

const POLICY_EFFECTS: Record<string, { label: string; effect: string }> = {
  sales_tax_percent: {
    label: "Sales tax",
    effect: "A market purchase in this country adds this percent of the price. The tax is paid to the game treasury.",
  },
  tariff_percent: {
    label: "Import tariff",
    effect: "A shipment from another country into this country pays this amount instead of the default tariff.",
  },
  wage_floor: {
    label: "Wage floor",
    effect: "A new job posting in this country cannot offer a wage below this amount.",
  },
  extraction_cost: {
    label: "Extraction cost",
    effect: "An extraction run in this country charges this amount instead of the site operating cost.",
  },
};

export function policyEffectCopy(effectKey: string): { label: string; effect: string } | null {
  return POLICY_EFFECTS[effectKey] ?? null;
}

export type CountryBulletin = {
  title: string;
  status: "scheduled" | "active";
  progress: number;
  goal: number;
  reward: number;
  startsAt: string;
  endsAt: string;
};

export type CountryPolicy = {
  effectKey: string;
  effectValue: number;
  label: string;
  effect: string;
};

export type CountryWorldState = {
  iso2: string;
  countryName: string;
  bulletin: CountryBulletin | null;
  policies: CountryPolicy[];
};

export async function countryWorldState(sql: Sql, iso2: string): Promise<CountryWorldState | null> {
  const code = iso2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const countries = await sql.query<{ id: string; iso2: string; name: string }>(
    "select id, iso2, name from countries where iso2 = $1",
    [code],
  );
  const country = countries[0];
  if (!country) return null;
  const bulletins = await sql.query<{
    title: string;
    status: "scheduled" | "active";
    progress: number;
    goal: number;
    reward: number;
    startsAt: string;
    endsAt: string;
  }>(
    `select title, status, progress, goal, reward, starts_at as "startsAt", ends_at as "endsAt"
     from world_events
     where country_id = $1 and event_type = $2 and status in ('scheduled', 'active')
     order by ends_at
     limit 1`,
    [country.id, BULLETIN_TYPE],
  );
  const bulletin = bulletins[0];
  const policies = await sql.query<{ effectKey: string; effectValue: number }>(
    `select distinct on (effect_key) effect_key as "effectKey", effect_value as "effectValue"
     from policy_versions
     where country_id = $1 and effective_at <= now()
     order by effect_key, effective_at desc`,
    [country.id],
  );
  return {
    iso2: country.iso2,
    countryName: country.name,
    bulletin: bulletin
      ? {
          title: bulletin.title,
          status: bulletin.status,
          progress: Number(bulletin.progress),
          goal: Number(bulletin.goal),
          reward: Number(bulletin.reward),
          startsAt: bulletin.startsAt,
          endsAt: bulletin.endsAt,
        }
      : null,
    policies: policies.flatMap((row) => {
      const copy = policyEffectCopy(row.effectKey);
      if (!copy || !Number.isInteger(Number(row.effectValue))) return [];
      return [{ effectKey: row.effectKey, effectValue: Number(row.effectValue), label: copy.label, effect: copy.effect }];
    }),
  };
}

function logEvent(action: string, fields: Record<string, string | number>) {
  console.info(JSON.stringify({ event: "world_event", action, ...fields }));
}

export async function advanceWorldEvents(sql: Sql): Promise<EventStep> {
  const batch = await rule(sql, "sim_batch");
  const resolved = await resolveDueEvents(sql, batch);
  const activated = await activateDueEvents(sql, batch);
  const opened = await openWorkBulletins(sql);
  return { activated, resolved, opened };
}

async function resolveDueEvents(sql: Sql, batch: number): Promise<number> {
  const due = await sql.query<{ id: string; event_type: string; progress: number; goal: number }>(
    `select id, event_type, progress, goal
     from world_events
     where status in ('scheduled', 'active') and ends_at <= now()
     order by ends_at
     limit $1
     for update skip locked`,
    [batch],
  );
  let resolved = 0;
  for (const event of due) {
    const outcome = Number(event.progress) >= Number(event.goal) ? "met" : "unmet";
    const updated = await sql.query<{ id: string }>(
      `update world_events
       set status = 'ended', outcome = $2, resolved_at = now()
       where id = $1 and status in ('scheduled', 'active')
       returning id`,
      [event.id, outcome],
    );
    if (updated.length === 0) continue;
    if (event.event_type === BULLETIN_TYPE) await releaseBulletinContracts(sql, event.id);
    resolved += 1;
    logEvent("resolved", { eventId: event.id, eventType: event.event_type, outcome, progress: Number(event.progress) });
  }
  return resolved;
}

async function releaseBulletinContracts(sql: Sql, eventId: string): Promise<void> {
  await sql.query(
    `delete from character_objectives co
     using mission_objectives o, character_missions cm, characters ch, world_events e
     where co.objective_id = o.id
       and o.mission_id = $2
       and cm.mission_id = o.mission_id
       and cm.character_id = co.character_id
       and cm.status = 'active'
       and ch.id = cm.character_id
       and e.id = $1
       and e.event_type = $3
       and ch.country_id = e.country_id`,
    [eventId, BULLETIN_MISSION_ID, BULLETIN_TYPE],
  );
  await sql.query(
    `delete from character_missions cm
     using characters ch, world_events e
     where cm.mission_id = $2
       and cm.status = 'active'
       and ch.id = cm.character_id
       and e.id = $1
       and e.event_type = $3
       and ch.country_id = e.country_id`,
    [eventId, BULLETIN_MISSION_ID, BULLETIN_TYPE],
  );
}

async function activateDueEvents(sql: Sql, batch: number): Promise<number> {
  const updated = await sql.query<{ id: string; event_type: string }>(
    `update world_events
     set status = 'active'
     where id in (
       select id from world_events
       where status = 'scheduled' and starts_at <= now() and ends_at > now()
       order by starts_at
       limit $1
       for update skip locked
     )
     returning id, event_type`,
    [batch],
  );
  for (const event of updated) logEvent("activated", { eventId: event.id, eventType: event.event_type });
  return updated.length;
}

async function openWorkBulletins(sql: Sql): Promise<number> {
  const limits = bulletinLimits({
    windowSeconds: await rule(sql, "bulletin_window_seconds"),
    cooldownSeconds: await rule(sql, "bulletin_cooldown_seconds"),
    maxActive: await rule(sql, "bulletin_max_active"),
    goal: await rule(sql, "bulletin_goal"),
    reward: await rule(sql, "bulletin_reward"),
  });
  if (!limits) {
    logEvent("skipped", { reason: "bulletin rules are outside the allowed bounds" });
    return 0;
  }
  const open = await sql.query<{ count: number }>(
    `select count(*)::int as count from world_events
     where event_type = $1 and status in ('scheduled', 'active')`,
    [BULLETIN_TYPE],
  );
  const room = limits.maxActive - Number(open[0]?.count ?? 0);
  if (room <= 0) return 0;
  const countries = await sql.query<{ id: string; name: string }>(
    `select c.id, c.name
     from countries c
     where exists (
       select 1 from starting_locations sl
       join places p on p.id = sl.place_id
       where p.country_id = c.id and sl.status = 'open'
     )
     and exists (select 1 from characters ch where ch.country_id = c.id)
     and not exists (
       select 1 from world_events e
       where e.country_id = c.id and e.event_type = $1 and e.status in ('scheduled', 'active')
     )
     and not exists (
       select 1 from world_events e
       where e.country_id = c.id and e.event_type = $1 and e.ends_at > now() - ($2 * interval '1 second')
     )
     order by c.id
     limit $3`,
    [BULLETIN_TYPE, limits.cooldownSeconds, room],
  );
  const slot = Math.floor(Date.now() / 1000 / limits.windowSeconds);
  let opened = 0;
  for (const country of countries) {
    const copy = bulletinCopy(country.name, limits.reward, limits.goal);
    if (!copy) {
      logEvent("skipped", { reason: "bulletin copy did not fit", countryId: country.id });
      continue;
    }
    const inserted = await sql.query<{ id: string }>(
      `insert into world_events (
         event_key, event_type, title, detail, starts_at, ends_at, status, country_id, outcome, goal, reward, progress
       ) values (
         $1, $2, $3, $4, now(), now() + ($5 * interval '1 second'), 'active', $6, 'pending', $7, $8, 0
       )
       on conflict (event_key) do nothing
       returning id`,
      [`${BULLETIN_TYPE}:${country.id}:${slot}`, BULLETIN_TYPE, copy.title, copy.detail, limits.windowSeconds, country.id, limits.goal, limits.reward],
    );
    const id = inserted[0]?.id;
    if (!id) continue;
    opened += 1;
    logEvent("opened", { eventId: id, eventType: BULLETIN_TYPE, countryId: country.id, reward: limits.reward, goal: limits.goal });
  }
  return opened;
}

export async function recordShiftBulletin(sql: Sql, userId: string): Promise<BulletinResult> {
  const character = await lockCharacter(sql, userId);
  const events = await sql.query<{ id: string; reward: number }>(
    `select id, reward
     from world_events
     where event_type = $2 and status = 'active' and country_id = $1
       and starts_at <= now() and ends_at > now()
     order by ends_at
     limit 1
     for update`,
    [character.country_id, BULLETIN_TYPE],
  );
  const event = events[0];
  if (!event) return { state: "none" };
  const existing = await sql.query<{ event_id: string }>(
    "select event_id from world_event_contributions where event_id = $1 and character_id = $2",
    [event.id, character.id],
  );
  if (existing.length > 0) return { state: "already", eventId: event.id };
  const reward = Number(event.reward);
  if (!Number.isInteger(reward) || reward < 1 || reward > REWARD_CAP) throw new Error("That bulletin reward is not valid.");
  const shifts = await sql.query<{ id: string }>(
    `select s.id
     from work_shifts s
     where s.character_id = $1
       and s.created_at >= (select starts_at from world_events where id = $2)
       and s.created_at <= now()
       and not exists (
         select 1 from world_event_contributions c where c.source_key = 'shift:' || s.id::text
       )
     order by s.created_at
     limit 8
     for update`,
    [character.id, event.id],
  );
  let shift: { id: string } | undefined;
  let usedOnJoint = false;
  for (const row of shifts) {
    if (await shiftClaimedOn(sql, row.id, "joint")) {
      usedOnJoint = true;
      continue;
    }
    shift = row;
    break;
  }
  if (!shift) return usedOnJoint ? { state: "used", eventId: event.id } : { state: "none" };
  const inserted = await sql.query<{ event_id: string }>(
    `insert into world_event_contributions (event_id, character_id, source_key)
     values ($1, $2, $3)
     on conflict (event_id, character_id) do nothing
     returning event_id`,
    [event.id, character.id, `shift:${shift.id}`],
  );
  if (inserted.length === 0) return { state: "already", eventId: event.id };
  await transfer(sql, {
    from: { kind: "system", id: null },
    to: { kind: "character", id: character.id },
    amount: reward,
    reason: "work_bulletin",
    idempotencyKey: `bulletin:${event.id}:${character.id}`,
    actorUserId: userId,
  });
  await sql.query("update world_events set progress = progress + 1 where id = $1 and status = 'active'", [event.id]);
  logEvent("contribution", { eventId: event.id, eventType: BULLETIN_TYPE, amount: reward });
  return { state: "recorded", eventId: event.id, amount: reward };
}

export async function loadWorldBoard(sql: Sql, userId: string): Promise<{ homeCountryName: string; events: WorldEventView[] }> {
  const home = await sql.query<{ name: string }>(
    `select c.name
     from characters ch
     join countries c on c.id = ch.country_id
     where ch.user_id = $1`,
    [userId],
  );
  const homeCountryName = home[0]?.name ?? "your starting country";
  const rows = await sql.query<{
    id: string;
    title: string;
    detail: string;
    status: WorldEventView["status"];
    outcome: WorldEventView["outcome"];
    countryName: string;
    iso2: string;
    progress: number;
    goal: number;
    reward: number;
    startsAt: string;
    endsAt: string;
    home: boolean;
    joined: boolean;
    contractAccepted: boolean;
  }>(
    `select e.id, e.title, e.detail, e.status, e.outcome,
            c.name as "countryName", c.iso2,
            e.progress, e.goal, e.reward,
            e.starts_at as "startsAt", e.ends_at as "endsAt",
            (e.country_id = me.country_id) as home,
            exists (
              select 1 from world_event_contributions x
              where x.event_id = e.id and x.character_id = me.id
            ) as joined,
            exists (
              select 1 from character_missions cm
              where cm.character_id = me.id and cm.mission_id = $3 and cm.status = 'active'
            ) as "contractAccepted"
     from world_events e
     join countries c on c.id = e.country_id
     join characters me on me.user_id = $1
     where e.event_type = $2
       and (
         e.status in ('scheduled', 'active')
         or (e.status = 'ended' and e.ends_at > now() - interval '14 days')
       )
     order by case e.status when 'active' then 0 when 'scheduled' then 1 else 2 end, e.ends_at desc
     limit 12`,
    [userId, BULLETIN_TYPE, BULLETIN_MISSION_ID],
  );
  return {
    homeCountryName,
    events: rows.map((row) => {
      const note = bulletinPlayerNote({
        status: row.status,
        outcome: row.outcome,
        home: row.home,
        joined: row.joined,
        reward: Number(row.reward),
        homeCountryName,
      });
      return {
        id: row.id,
        title: row.title,
        detail: row.detail,
        status: row.status,
        outcome: row.outcome,
        countryName: row.countryName,
        iso2: row.iso2,
        progress: Number(row.progress),
        goal: Number(row.goal),
        reward: Number(row.reward),
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        eligible: note.eligible,
        contractAccepted: row.contractAccepted === true,
        playerNote: note.playerNote,
      };
    }),
  };
}
