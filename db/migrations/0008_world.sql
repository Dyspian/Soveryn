-- Persistent world tick. Times are UTC timestamptz. There is no accelerated game clock.
-- The embedded database has no automated backup. Stop the server and copy data/pglite to restore it.
-- These tuning values are initial assumptions.

insert into game_rules (key, amount) values
  ('sim_batch', 8),
  ('sim_lease_seconds', 20),
  ('sim_max_attempts', 5),
  ('sim_catchup_steps', 4),
  ('heat_decay_seconds', 3600),
  ('sim_paused', 0)
on conflict (key) do nothing;

alter table character_underworld add column if not exists heat_decayed_at timestamptz;

create table simulation_ticks (
  id integer primary key check (id = 1),
  locked_until timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_error text
);

insert into simulation_ticks (id) values (1);

create table simulation_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  processed integer not null default 0 check (processed >= 0),
  failed integer not null default 0 check (failed >= 0),
  note text
);

create table world_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  job_type text not null,
  entity_id uuid,
  run_at timestamptz not null,
  status text not null check (status in ('scheduled', 'ready', 'running', 'completed', 'retry', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index world_jobs_due_idx on world_jobs (run_at) where status in ('scheduled', 'ready', 'retry');

create table world_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  title text not null,
  detail text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('scheduled', 'active', 'ended', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint world_event_window check (ends_at > starts_at),
  constraint world_event_copy check (char_length(title) between 3 and 80 and char_length(detail) between 3 and 400)
);

create index operations_due_idx on operations (completes_at) where status = 'in_progress';
create index production_due_idx on production_jobs (completes_at) where status = 'running';
create index shipments_due_idx on shipments (arrives_at) where status = 'in_transit';
create index deliveries_due_idx on delivery_contracts (arrives_at) where status = 'in_transit';
