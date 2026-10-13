alter table users
  add column status text not null default 'active' check (status in ('active', 'suspended'));

alter table characters
  add column specialization text not null default 'generalist' check (
    specialization in (
      'entrepreneur', 'politician', 'industrialist', 'trader',
      'criminal', 'security', 'explorer', 'generalist'
    )
  ),
  add column level integer not null default 1 check (level between 1 and 50),
  add column xp integer not null default 0 check (xp >= 0),
  add column skill_points integer not null default 0 check (skill_points >= 0),
  add column currency bigint not null default 100 check (currency >= 0),
  add column reputation integer not null default 0 check (reputation >= 0),
  add column condition integer not null default 100 check (condition between 0 and 100),
  add column status text not null default 'active' check (status in ('active', 'retired'));

create table game_rules (
  key text primary key,
  amount integer not null
);

create table level_bands (
  level integer primary key check (level >= 1),
  xp_required integer not null check (xp_required >= 0)
);

create table skill_definitions (
  id text primary key,
  category text not null,
  name text not null,
  description text not null,
  max_level smallint not null check (max_level between 1 and 10),
  xp_per_level integer not null check (xp_per_level > 0),
  effect_key text not null,
  effect_per_level integer not null check (effect_per_level >= 0)
);

create table character_skills (
  character_id uuid not null references characters (id) on delete cascade,
  skill_id text not null references skill_definitions (id),
  level smallint not null default 0 check (level >= 0),
  xp integer not null default 0 check (xp >= 0),
  primary key (character_id, skill_id)
);

create table progression_events (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters (id) on delete cascade,
  kind text not null,
  source_key text not null,
  xp_awarded integer not null default 0,
  currency_awarded integer not null default 0,
  reputation_awarded integer not null default 0,
  detail text not null,
  created_at timestamptz not null default now(),
  unique (character_id, source_key)
);

create index progression_events_character_idx on progression_events (character_id, created_at desc);

create table action_cooldowns (
  character_id uuid not null references characters (id) on delete cascade,
  action_key text not null,
  available_at timestamptz not null,
  primary key (character_id, action_key)
);

create table item_definitions (
  id text primary key,
  name text not null,
  description text not null,
  category text not null,
  stack_limit integer not null check (stack_limit > 0)
);

create table inventory_entries (
  character_id uuid not null references characters (id) on delete cascade,
  item_id text not null references item_definitions (id),
  quantity integer not null check (quantity > 0),
  primary key (character_id, item_id)
);

create table inventory_events (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters (id) on delete cascade,
  item_id text not null references item_definitions (id),
  delta integer not null,
  reason text not null,
  source_key text not null,
  created_at timestamptz not null default now(),
  unique (character_id, source_key)
);

create table missions (
  id text primary key,
  name text not null,
  description text not null,
  category text not null,
  difficulty text not null,
  min_level integer not null default 1 check (min_level >= 1),
  repeatable boolean not null default false,
  cooldown_seconds integer not null default 0 check (cooldown_seconds >= 0),
  xp_reward integer not null check (xp_reward >= 0),
  currency_reward integer not null check (currency_reward >= 0),
  reputation_reward integer not null default 0 check (reputation_reward >= 0),
  reward_context text not null,
  active boolean not null default true
);

create table mission_specializations (
  mission_id text not null references missions (id) on delete cascade,
  specialization text not null,
  primary key (mission_id, specialization)
);

create table mission_objectives (
  id text primary key,
  mission_id text not null references missions (id) on delete cascade,
  sort_order integer not null,
  kind text not null check (kind in ('match_population', 'mention_city', 'skill_practiced', 'deliver_item')),
  description text not null,
  skill_id text references skill_definitions (id),
  item_id text references item_definitions (id),
  quantity integer not null default 1 check (quantity > 0),
  unique (mission_id, sort_order)
);

create table character_missions (
  character_id uuid not null references characters (id) on delete cascade,
  mission_id text not null references missions (id),
  status text not null check (status in ('active', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (character_id, mission_id)
);

create table character_objectives (
  character_id uuid not null references characters (id) on delete cascade,
  objective_id text not null references mission_objectives (id),
  progress integer not null default 0 check (progress >= 0),
  completed boolean not null default false,
  note text,
  primary key (character_id, objective_id)
);

insert into game_rules (key, amount) values
  ('practice_cooldown_seconds', 45),
  ('practice_skill_xp', 10),
  ('practice_character_xp', 5),
  ('starting_currency', 100);

insert into level_bands (level, xp_required) values
  (1, 0),
  (2, 40),
  (3, 100),
  (4, 180),
  (5, 280),
  (6, 400),
  (7, 550),
  (8, 730),
  (9, 940),
  (10, 1200);

insert into skill_definitions (id, category, name, description, max_level, xp_per_level, effect_key, effect_per_level) values
  ('management', 'Business', 'Management', 'Fictional game skill. Each level adds 2% to mission experience.', 5, 20, 'mission_xp_percent', 2),
  ('negotiation', 'Business', 'Negotiation', 'Fictional game skill. Each level adds 2% to currency rewards.', 5, 20, 'currency_percent', 2),
  ('finance', 'Business', 'Finance', 'Fictional game skill. Each level adds 1 skill experience when practicing.', 5, 20, 'practice_skill_xp', 1),
  ('diplomacy', 'Politics', 'Diplomacy', 'Fictional game skill. Each level adds 1 reputation when a civic or introduction reward is paid.', 5, 20, 'reputation_flat', 1),
  ('public_speaking', 'Politics', 'Public speaking', 'Fictional game skill. Each level adds 1 character experience when practicing.', 5, 20, 'practice_character_xp', 1),
  ('logistics', 'Industry', 'Logistics', 'Fictional game skill. Each level adds 5 currency when a delivery reward is paid.', 5, 20, 'delivery_currency_flat', 5),
  ('production', 'Industry', 'Production', 'Fictional game skill. Each level shortens practice cooldown by 5 seconds, to a floor of 15.', 5, 20, 'cooldown_reduction_seconds', 5),
  ('networking', 'Social', 'Networking', 'Fictional game skill. Each level adds 5 experience when an introduction reward is paid.', 5, 20, 'introduction_xp_flat', 5),
  ('operational_planning', 'Criminal activities', 'Operational planning', 'Fictional game skill for in-game planning. Each level adds 5 experience when a city-research reward is paid.', 5, 20, 'research_xp_flat', 5);

insert into item_definitions (id, name, description, category, stack_limit) values
  ('field_notebook', 'Field notebook', 'Fictional blank notebook issued with a new character.', 'record', 5),
  ('local_shipment', 'Local shipment', 'Fictional cargo for the delivery introduction. It has no real-world value.', 'cargo', 5);

insert into missions (
  id, name, description, category, difficulty, xp_reward, currency_reward, reputation_reward, reward_context
) values
  ('city-research', 'Research the starting city', 'Confirm the population stored for your starting city. The server compares your answer with the imported record.', 'exploration', 'introductory', 40, 25, 0, 'research'),
  ('local-introduction', 'Introduce yourself locally', 'Write a short in-game introduction that names your starting city. The server checks the saved city name.', 'social', 'introductory', 30, 15, 1, 'introduction'),
  ('practice-management', 'Practice management', 'Practice the Management skill after accepting this mission.', 'business', 'introductory', 20, 10, 0, 'mission'),
  ('practice-negotiation', 'Practice negotiation', 'Practice the Negotiation skill after accepting this mission.', 'business', 'introductory', 20, 10, 0, 'mission'),
  ('practice-diplomacy', 'Attend a civic introduction', 'Practice the Diplomacy skill after accepting this mission.', 'politics', 'introductory', 20, 10, 1, 'mission'),
  ('practice-logistics', 'Review a shipment route', 'Practice the Logistics skill after accepting this mission.', 'industry', 'introductory', 20, 10, 0, 'mission'),
  ('practice-networking', 'Meet a local contact', 'Practice the Networking skill after accepting this mission.', 'social', 'introductory', 20, 10, 0, 'mission'),
  ('practice-planning', 'Plan an in-game operation', 'Practice Operational planning after accepting this mission. This is a fictional exercise.', 'criminal', 'introductory', 20, 10, 0, 'mission'),
  ('local-delivery', 'Deliver a local shipment', 'Accepting this mission issues one local shipment. Delivering it consumes that item.', 'trade', 'introductory', 35, 40, 0, 'delivery');

insert into mission_specializations (mission_id, specialization)
select mission_id, specialization
from (
  values
    ('city-research'),
    ('local-introduction')
) as shared (mission_id)
cross join (
  values
    ('entrepreneur'), ('politician'), ('industrialist'), ('trader'),
    ('criminal'), ('security'), ('explorer'), ('generalist')
) as specs (specialization)
union all
select * from (
  values
    ('practice-management', 'generalist'),
    ('practice-negotiation', 'entrepreneur'),
    ('practice-negotiation', 'trader'),
    ('practice-diplomacy', 'politician'),
    ('practice-logistics', 'industrialist'),
    ('practice-networking', 'explorer'),
    ('practice-planning', 'criminal'),
    ('practice-planning', 'security'),
    ('local-delivery', 'entrepreneur'),
    ('local-delivery', 'industrialist'),
    ('local-delivery', 'trader'),
    ('local-delivery', 'generalist')
) as focused (mission_id, specialization);

insert into mission_objectives (id, mission_id, sort_order, kind, description, skill_id, item_id, quantity) values
  ('city-research-population', 'city-research', 1, 'match_population', 'Enter the population stored for your starting city. If none was reported, enter unreported.', null, null, 1),
  ('local-introduction-note', 'local-introduction', 1, 'mention_city', 'Write 20–400 characters and include your starting city name.', null, null, 1),
  ('practice-management-skill', 'practice-management', 1, 'skill_practiced', 'Practice Management once while this mission is active.', 'management', null, 1),
  ('practice-negotiation-skill', 'practice-negotiation', 1, 'skill_practiced', 'Practice Negotiation once while this mission is active.', 'negotiation', null, 1),
  ('practice-diplomacy-skill', 'practice-diplomacy', 1, 'skill_practiced', 'Practice Diplomacy once while this mission is active.', 'diplomacy', null, 1),
  ('practice-logistics-skill', 'practice-logistics', 1, 'skill_practiced', 'Practice Logistics once while this mission is active.', 'logistics', null, 1),
  ('practice-networking-skill', 'practice-networking', 1, 'skill_practiced', 'Practice Networking once while this mission is active.', 'networking', null, 1),
  ('practice-planning-skill', 'practice-planning', 1, 'skill_practiced', 'Practice Operational planning once while this mission is active.', 'operational_planning', null, 1),
  ('local-delivery-item', 'local-delivery', 1, 'deliver_item', 'Deliver the local shipment from your inventory.', null, 'local_shipment', 1);

insert into character_skills (character_id, skill_id, level, xp)
select c.id, s.id,
  case when c.specialization = 'generalist' and s.id = 'management' then 1 else 0 end,
  case when c.specialization = 'generalist' and s.id = 'management' then s.xp_per_level else 0 end
from characters c
cross join skill_definitions s
on conflict (character_id, skill_id) do nothing;

update characters
set skill_points = 1
where specialization = 'generalist' and skill_points = 0 and xp = 0 and level = 1;

insert into inventory_entries (character_id, item_id, quantity)
select id, 'field_notebook', 1 from characters
on conflict (character_id, item_id) do nothing;

insert into inventory_events (character_id, item_id, delta, reason, source_key)
select id, 'field_notebook', 1, 'starting kit', 'grant:field_notebook'
from characters
on conflict (character_id, source_key) do nothing;
