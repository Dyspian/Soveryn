create table if not exists schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

create table data_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  url text not null,
  license text not null,
  attribution text not null,
  version_label text,
  imported_at timestamptz not null default now()
);

create table countries (
  id uuid primary key default gen_random_uuid(),
  iso2 char(2) not null unique,
  iso3 char(3) not null,
  geoname_id bigint,
  name text not null,
  capital_name text,
  continent char(2),
  area_sq_km numeric,
  area_source_token text,
  population bigint,
  population_source_token text,
  population_quality text not null,
  boundary_geojson text,
  boundary_source text,
  starting_city_target integer not null,
  starting_city_min integer not null,
  starting_city_max integer not null,
  source_id uuid references data_sources (id),
  created_at timestamptz not null default now(),
  constraint countries_population_nonnegative check (population is null or population > 0),
  constraint countries_targets check (
    starting_city_min > 0
    and starting_city_target between starting_city_min and starting_city_max
  )
);

create table places (
  id uuid primary key default gen_random_uuid(),
  geoname_id bigint not null unique,
  country_id uuid not null references countries (id),
  name text not null,
  ascii_name text not null,
  alternate_names text,
  alternate_names_truncated boolean not null default false,
  latitude double precision not null,
  longitude double precision not null,
  feature_class char(1) not null,
  feature_code text not null,
  admin1_code text,
  population bigint,
  population_source_token text,
  population_quality text not null,
  elevation_m integer,
  timezone text,
  source_modified_on date,
  source_id uuid references data_sources (id),
  created_at timestamptz not null default now(),
  constraint places_latitude check (latitude between -90 and 90),
  constraint places_longitude check (longitude between -180 and 180),
  constraint places_population_positive check (population is null or population > 0)
);

create index places_country_idx on places (country_id);
create index places_name_lower_idx on places (lower(name));
create index places_ascii_lower_idx on places (lower(ascii_name));
create index places_lat_lon_idx on places (latitude, longitude);

create table starting_locations (
  place_id uuid primary key references places (id) on delete cascade,
  status text not null default 'open' check (
    status in ('open', 'disabled', 'full', 'restricted', 'event')
  ),
  capacity integer,
  selected_by_rule text not null,
  updated_at timestamptz not null default now(),
  constraint starting_capacity_positive check (capacity is null or capacity > 0)
);

create table city_game_attributes (
  place_id uuid primary key references places (id) on delete cascade,
  logistics smallint not null default 0,
  industry smallint not null default 0,
  commerce smallint not null default 0,
  government smallint not null default 0,
  energy smallint not null default 0,
  strategic smallint not null default 0,
  design_note text,
  constraint city_game_ranges check (
    logistics between 0 and 5
    and industry between 0 and 5
    and commerce between 0 and 5
    and government between 0 and 5
    and energy between 0 and 5
    and strategic between 0 and 5
  ),
  constraint city_game_note_len check (design_note is null or char_length(design_note) <= 500)
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text not null default 'player' check (role in ('player', 'admin')),
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index sessions_user_idx on sessions (user_id);

create table characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users (id) on delete cascade,
  username text not null,
  display_name text,
  biography text,
  portrait_key text not null,
  country_id uuid not null references countries (id),
  place_id uuid not null references places (id),
  created_at timestamptz not null default now(),
  constraint characters_username_len check (char_length(username) between 3 and 20),
  constraint characters_biography_len check (biography is null or char_length(biography) <= 2000),
  constraint characters_display_len check (display_name is null or char_length(display_name) <= 40)
);

create unique index characters_username_lower_idx on characters (lower(username));
create index characters_place_idx on characters (place_id);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table rate_limits (
  bucket text primary key,
  hits integer not null,
  window_started_at timestamptz not null default now()
);

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
  if place_country is null or place_country <> new.country_id then
    raise exception 'city_country_mismatch';
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
      and (new.id is null or id <> new.id);
    if resident_count >= loc_capacity then
      raise exception 'city_full';
    end if;
  end if;

  return new;
end;
$$;

create trigger characters_location_check
before insert or update of country_id, place_id on characters
for each row execute function enforce_character_location();
