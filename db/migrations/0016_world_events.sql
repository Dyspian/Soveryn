-- Work bulletins reuse world_events. A bulletin opens only for a country that already
-- has an open starting city and a resident. It does not invent demand, prices, or stock.
-- Missed windows are closed from their stored end time. They are not replayed.

alter table world_events
  add column country_id uuid references countries (id),
  add column outcome text not null default 'pending',
  add column goal integer not null default 1,
  add column reward integer not null default 0,
  add column progress integer not null default 0,
  add column resolved_at timestamptz;

alter table world_events
  add constraint world_event_outcome_check check (outcome in ('pending', 'met', 'unmet')),
  add constraint world_event_goal_check check (goal > 0),
  add constraint world_event_reward_check check (reward >= 0),
  add constraint world_event_progress_check check (progress >= 0);

create table world_event_contributions (
  event_id uuid not null references world_events (id) on delete cascade,
  character_id uuid not null references characters (id) on delete cascade,
  source_key text not null unique,
  created_at timestamptz not null default now(),
  primary key (event_id, character_id)
);

create index world_events_due_idx on world_events (ends_at) where status in ('scheduled', 'active');
create index world_events_country_idx on world_events (country_id, event_type, status);

insert into game_rules (key, amount) values
  ('bulletin_window_seconds', 86400),
  ('bulletin_cooldown_seconds', 86400),
  ('bulletin_max_active', 3),
  ('bulletin_goal', 1),
  ('bulletin_reward', 8)
on conflict (key) do nothing;
