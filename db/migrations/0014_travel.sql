-- Player journeys between open starting cities. The political home country stays on characters.country_id.
-- Arrival updates characters.place_id only after arrives_at.
-- Creation still requires the starting city to belong to the chosen country.

create or replace function enforce_character_location()
returns trigger
language plpgsql
as $$
declare
  place_country uuid;
  loc_status text;
  loc_capacity integer;
  resident_count integer;
begin
  select country_id into place_country from places where id = new.place_id;
  if place_country is null then
    raise exception 'city_country_mismatch';
  end if;
  if tg_op = 'INSERT' or new.country_id is distinct from old.country_id then
    if place_country <> new.country_id then
      raise exception 'city_country_mismatch';
    end if;
  end if;

  select status, capacity into loc_status, loc_capacity
  from starting_locations
  where place_id = new.place_id;

  if loc_status is distinct from 'open' then
    raise exception 'city_not_selectable';
  end if;

  if loc_capacity is not null then
    select count(*) into resident_count
    from characters
    where place_id = new.place_id
      and id <> new.id;
    if resident_count >= loc_capacity then
      raise exception 'city_full';
    end if;
  end if;

  return new;
end;
$$;

create table journeys (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters (id) on delete cascade,
  origin_place_id uuid not null references places (id),
  destination_place_id uuid not null references places (id),
  distance_km integer not null check (distance_km >= 0),
  cost integer not null check (cost > 0),
  status text not null check (status in ('in_transit', 'arrived')),
  departed_at timestamptz not null default now(),
  arrives_at timestamptz not null,
  arrived_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  constraint journeys_distinct_places check (origin_place_id <> destination_place_id)
);

create unique index journeys_one_active_idx on journeys (character_id) where status = 'in_transit';
create index journeys_due_idx on journeys (arrives_at) where status = 'in_transit';

alter table mission_objectives drop constraint mission_objectives_kind_check;

alter table mission_objectives add constraint mission_objectives_kind_check check (
  kind in (
    'match_population', 'mention_city', 'skill_practiced', 'deliver_item',
    'skill_level', 'level_reached', 'work_shift',
    'market_sold', 'shipment_delivered', 'production_finished',
    'journey_arrived'
  )
);

insert into missions (
  id, name, description, category, difficulty, min_level, repeatable, cooldown_seconds,
  xp_reward, currency_reward, reputation_reward, reward_context
) values (
  'contract-journey',
  'Arrive in another city',
  'Start a journey to another open starting city and arrive. Choosing the city on the map does not finish this. The character moves only when the journey arrives.',
  'exploration',
  'standard',
  1,
  true,
  86400,
  16,
  8,
  0,
  'mission'
);

insert into mission_specializations (mission_id, specialization) values ('contract-journey', 'explorer');

insert into mission_objectives (id, mission_id, sort_order, kind, description, skill_id, item_id, quantity) values (
  'contract-journey-arrived',
  'contract-journey',
  1,
  'journey_arrived',
  'Arrive from a journey that was in transit while this contract is active.',
  null,
  null,
  1
);
