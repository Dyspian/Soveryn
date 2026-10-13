import type { Sql } from "@/lib/db";
import { distanceKm, simulatedTransit } from "@/lib/economy/distance";
import { EconomyError } from "@/lib/economy/errors";
import { transfer } from "@/lib/economy/service";
import { countriesSanctioned } from "@/lib/organizations/access";
import { nodeBonus, recordEconomyProgress } from "@/lib/progression/service";

export class TravelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TravelError";
  }
}

export type TravelQuote = {
  destinationId: string;
  destinationName: string;
  destinationCountry: string;
  distanceKm: number;
  cost: number;
  seconds: number;
};

export type ActiveJourney = {
  id: string;
  destinationId: string;
  destinationName: string;
  destinationCountry: string;
  destinationLatitude: number;
  destinationLongitude: number;
  distanceKm: number;
  cost: number;
  departedAt: string;
  arrivesAt: string;
};

export type TravelState = {
  placeId: string;
  cityName: string;
  countryName: string;
  homeCountryName: string;
  latitude: number;
  longitude: number;
  active: ActiveJourney | null;
  recent: { id: string; destinationName: string; cost: number; arrivedAt: string }[];
};

async function rule(sql: Sql, key: string): Promise<number> {
  const rows = await sql.query<{ amount: number | string }>("select amount from game_rules where key = $1", [key]);
  const amount = Number(rows[0]?.amount);
  if (!Number.isFinite(amount)) throw new TravelError("A required travel rule is missing.");
  return amount;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "23505";
}

function assertKey(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TravelError("The travel confirmation is not valid.");
  }
}

export async function settleJourney(sql: Sql, journeyId: string): Promise<"arrived" | "waiting" | "unchanged"> {
  const rows = await sql.query<{
    id: string;
    character_id: string;
    destination_place_id: string;
    status: string;
    ready: boolean;
  }>(
    `select id, character_id, destination_place_id, status, arrives_at <= now() as ready
     from journeys where id = $1 for update`,
    [journeyId],
  );
  const journey = rows[0];
  if (!journey) return "unchanged";
  if (journey.status === "arrived") return "arrived";
  if (journey.status !== "in_transit") return "unchanged";
  if (!journey.ready) return "waiting";
  const updated = await sql.query<{ id: string }>(
    "update journeys set status = 'arrived', arrived_at = now() where id = $1 and status = 'in_transit' returning id",
    [journey.id],
  );
  if (updated.length === 0) return "arrived";
  await sql.query("update characters set place_id = $2 where id = $1", [journey.character_id, journey.destination_place_id]);
  await recordEconomyProgress(sql, journey.character_id, "journey_arrived");
  return "arrived";
}

export async function settleCharacterTravel(sql: Sql, userId: string): Promise<void> {
  const due = await sql.query<{ id: string }>(
    `select j.id
     from journeys j
     join characters c on c.id = j.character_id
     where c.user_id = $1 and j.status = 'in_transit' and j.arrives_at <= now()`,
    [userId],
  );
  for (const journey of due) await settleJourney(sql, journey.id);
}

export async function loadTravel(sql: Sql, userId: string): Promise<TravelState | null> {
  await settleCharacterTravel(sql, userId);
  const here = await sql.query<{
    place_id: string;
    city: string;
    country: string;
    home: string;
    latitude: number | string;
    longitude: number | string;
  }>(
    `select c.place_id, p.name as city, pc.name as country, hc.name as home, p.latitude, p.longitude
     from characters c
     join places p on p.id = c.place_id
     join countries pc on pc.id = p.country_id
     join countries hc on hc.id = c.country_id
     where c.user_id = $1`,
    [userId],
  );
  const row = here[0];
  if (!row) return null;
  const active = await sql.query<{
    id: string;
    destination_place_id: string;
    destination_name: string;
    destination_country: string;
    destination_latitude: number | string;
    destination_longitude: number | string;
    distance_km: number;
    cost: number;
    departed_at: string | Date;
    arrives_at: string | Date;
  }>(
    `select j.id, j.destination_place_id, p.name as destination_name, co.name as destination_country,
            p.latitude as destination_latitude, p.longitude as destination_longitude,
            j.distance_km, j.cost, j.departed_at, j.arrives_at
     from journeys j
     join characters c on c.id = j.character_id
     join places p on p.id = j.destination_place_id
     join countries co on co.id = p.country_id
     where c.user_id = $1 and j.status = 'in_transit'`,
    [userId],
  );
  const current = active[0];
  const recent = await sql.query<{ id: string; destination_name: string; cost: number; arrived_at: string | Date }>(
    `select j.id, p.name as destination_name, j.cost, j.arrived_at
     from journeys j
     join characters c on c.id = j.character_id
     join places p on p.id = j.destination_place_id
     where c.user_id = $1 and j.status = 'arrived'
     order by j.arrived_at desc
     limit 5`,
    [userId],
  );
  return {
    placeId: row.place_id,
    cityName: row.city,
    countryName: row.country,
    homeCountryName: row.home,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    active: current
      ? {
          id: current.id,
          destinationId: current.destination_place_id,
          destinationName: current.destination_name,
          destinationCountry: current.destination_country,
          destinationLatitude: Number(current.destination_latitude),
          destinationLongitude: Number(current.destination_longitude),
          distanceKm: Number(current.distance_km),
          cost: Number(current.cost),
          departedAt: new Date(current.departed_at).toISOString(),
          arrivesAt: new Date(current.arrives_at).toISOString(),
        }
      : null,
    recent: recent.map((item) => ({
      id: item.id,
      destinationName: item.destination_name,
      cost: Number(item.cost),
      arrivedAt: new Date(item.arrived_at).toISOString(),
    })),
  };
}

async function plan(sql: Sql, characterId: string, destinationId: string): Promise<TravelQuote & { originId: string; userId: string }> {
  const origin = await sql.query<{
    id: string;
    user_id: string;
    place_id: string;
    origin_country: string;
    latitude: number | string;
    longitude: number | string;
  }>(
    `select c.id, c.user_id, c.place_id, p.country_id as origin_country, p.latitude, p.longitude
     from characters c
     join places p on p.id = c.place_id
     where c.id = $1`,
    [characterId],
  );
  const from = origin[0];
  if (!from) throw new TravelError("Create a character before traveling.");
  const destination = await sql.query<{
    id: string;
    name: string;
    country_name: string;
    country_id: string;
    latitude: number | string;
    longitude: number | string;
    status: string | null;
  }>(
    `select p.id, p.name, co.name as country_name, p.country_id, p.latitude, p.longitude, s.status
     from places p
     join countries co on co.id = p.country_id
     left join starting_locations s on s.place_id = p.id
     where p.id = $1`,
    [destinationId],
  );
  const to = destination[0];
  if (!to) throw new TravelError("That destination is not a stored city.");
  if (to.id === from.place_id) throw new TravelError("You are already in that city.");
  if (to.status !== "open") throw new TravelError("Only an open starting city can be a destination.");
  if (await countriesSanctioned(sql, from.origin_country, to.country_id)) {
    throw new TravelError("A recorded sanction blocks travel between these countries.");
  }
  const km = Math.max(1, Math.round(distanceKm(
    { latitude: Number(from.latitude), longitude: Number(from.longitude) },
    { latitude: Number(to.latitude), longitude: Number(to.longitude) },
  )));
  const rawCost = simulatedTransit(km, {
    per100km: await rule(sql, "shipment_cost_per_100km"),
    minimum: await rule(sql, "shipment_base_cost"),
  });
  const skills = await sql.query<{ level: number; effect_per_level: number }>(
    `select cs.level, sd.effect_per_level
     from character_skills cs
     join skill_definitions sd on sd.id = cs.skill_id
     where cs.character_id = $1 and sd.effect_key = 'delivery_currency_flat'`,
    [from.id],
  );
  const discount = skills[0] ? Number(skills[0].level) * Number(skills[0].effect_per_level) : 0;
  const focusDiscount = await nodeBonus(sql, from.id, "travel_cost_flat", { kind: "general" });
  const seconds = simulatedTransit(km, {
    per100km: await rule(sql, "shipment_seconds_per_100km"),
    minimum: await rule(sql, "shipment_min_seconds"),
  });
  return {
    userId: from.user_id,
    originId: from.place_id,
    destinationId: to.id,
    destinationName: to.name,
    destinationCountry: to.country_name,
    distanceKm: km,
    cost: Math.max(1, rawCost - discount - focusDiscount),
    seconds,
  };
}

export async function quoteJourney(sql: Sql, userId: string, destinationId: string): Promise<TravelQuote> {
  const character = await sql.query<{ id: string }>("select id from characters where user_id = $1", [userId]);
  if (!character[0]) throw new TravelError("Create a character before traveling.");
  const quoted = await plan(sql, character[0].id, destinationId);
  return {
    destinationId: quoted.destinationId,
    destinationName: quoted.destinationName,
    destinationCountry: quoted.destinationCountry,
    distanceKm: quoted.distanceKm,
    cost: quoted.cost,
    seconds: quoted.seconds,
  };
}

export async function departJourney(sql: Sql, userId: string, destinationId: string, idempotencyKey: string): Promise<string> {
  assertKey(idempotencyKey);
  const locked = await sql.query<{ id: string; currency: number | string }>(
    "select id, currency from characters where user_id = $1 for update",
    [userId],
  );
  const character = locked[0];
  if (!character) throw new TravelError("Create a character before traveling.");
  await settleCharacterTravel(sql, userId);
  const key = `travel:${character.id}:${idempotencyKey}`;
  const replay = await sql.query<{ id: string }>("select id from journeys where idempotency_key = $1", [key]);
  if (replay[0]) return replay[0].id;
  const active = await sql.query<{ id: string }>(
    "select id from journeys where character_id = $1 and status = 'in_transit' for update",
    [character.id],
  );
  if (active[0]) throw new TravelError("A journey is already in transit.");
  const quoted = await plan(sql, character.id, destinationId);
  if (Number(character.currency) < quoted.cost) throw new TravelError("You do not have enough currency for this journey.");
  let inserted: { id: string }[];
  try {
    inserted = await sql.query<{ id: string }>(
      `insert into journeys (
         character_id, origin_place_id, destination_place_id, distance_km, cost, status, arrives_at, idempotency_key
       ) values ($1, $2, $3, $4, $5, 'in_transit', now() + ($6 * interval '1 second'), $7)
       returning id`,
      [character.id, quoted.originId, quoted.destinationId, quoted.distanceKm, quoted.cost, quoted.seconds, key],
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new TravelError("A journey is already in transit.");
    throw error;
  }
  const journeyId = inserted[0]?.id;
  if (!journeyId) throw new TravelError("The journey could not be saved.");
  try {
    await transfer(sql, {
      from: { kind: "character", id: character.id },
      to: { kind: "system", id: null },
      amount: quoted.cost,
      reason: "travel",
      idempotencyKey: `travel:${journeyId}:cost`,
      actorUserId: userId,
    });
  } catch (error) {
    if (error instanceof EconomyError) throw new TravelError(error.message);
    throw error;
  }
  return journeyId;
}
