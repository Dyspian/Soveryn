insert into game_rules (key, amount) values
  ('city_contest_seconds', 60),
  ('city_contest_stake', 10)
on conflict (key) do nothing;

create table city_contests (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references places (id),
  challenger_organization_id uuid not null references organizations (id),
  defender_organization_id uuid not null references organizations (id),
  proposed_by uuid not null references characters (id),
  status text not null check (status in ('proposed', 'active', 'resolved', 'cancelled')),
  stake bigint not null check (stake > 0),
  resolves_at timestamptz,
  outcome text not null default 'pending' check (outcome in ('pending', 'challenger', 'defender', 'draw')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint city_contest_distinct_orgs check (challenger_organization_id <> defender_organization_id)
);

create unique index city_contests_one_open_idx on city_contests (place_id) where status in ('proposed', 'active');

create table city_contest_support (
  contest_id uuid not null references city_contests (id) on delete cascade,
  character_id uuid not null references characters (id),
  organization_id uuid not null references organizations (id),
  created_at timestamptz not null default now(),
  primary key (contest_id, character_id)
);
