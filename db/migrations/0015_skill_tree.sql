-- Specialization focuses spend existing skill points. They do not reset skills or change specialization.
-- A character can hold one choice in each exclusive group. Mastery requires that choice.

alter table missions add column requires_node text;

alter table mission_objectives drop constraint mission_objectives_kind_check;

alter table mission_objectives add constraint mission_objectives_kind_check check (
  kind in (
    'match_population', 'mention_city', 'skill_practiced', 'deliver_item',
    'skill_level', 'level_reached', 'work_shift',
    'market_sold', 'shipment_delivered', 'production_finished',
    'journey_arrived'
  )
);

create table skill_nodes (
  id text primary key,
  name text not null,
  summary text not null,
  branch text not null,
  tier text not null check (tier in ('foundation', 'choice', 'mastery')),
  min_level integer not null check (min_level >= 1),
  skill_id text references skill_definitions (id),
  skill_level integer not null default 0 check (skill_level >= 0),
  requires_node text references skill_nodes (id),
  requires_group text,
  exclusive_group text,
  cost integer not null default 1 check (cost > 0),
  effect_key text not null default 'none',
  effect_value integer not null default 0 check (effect_value >= 0),
  effect_cap integer not null default 0 check (effect_cap >= 0),
  effect_skill_id text references skill_definitions (id)
);

create table character_skill_nodes (
  character_id uuid not null references characters (id) on delete cascade,
  node_id text not null references skill_nodes (id),
  acquired_at timestamptz not null default now(),
  primary key (character_id, node_id)
);

insert into skill_nodes (
  id, name, summary, branch, tier, min_level, skill_id, skill_level, requires_group, exclusive_group,
  cost, effect_key, effect_value, effect_cap, effect_skill_id
) values
  ('node-habit', 'Kept practice', 'Practice grants 1 extra skill experience. The daily session and its cooldown stay in place. Focuses together cannot add more than 2 skill experience.', 'shared', 'foundation', 2, null, 0, null, null, 1, 'practice_skill_xp', 1, 1, null),
  ('ent-books', 'Closer books', 'Finance company shifts add 2 currency. Focuses cannot add more than 2. This does not change the wage.', 'entrepreneur', 'choice', 3, 'finance', 1, null, 'entrepreneur', 1, 'service_shift_flat', 2, 2, 'finance'),
  ('ent-terms', 'Tighter terms', 'The market fee you pay is reduced by another 2 percent of that fee. Focuses cannot reduce more than 4 percent of the fee, and the fee cannot go below zero.', 'entrepreneur', 'choice', 3, 'negotiation', 1, null, 'entrepreneur', 1, 'market_fee_flat', 2, 4, null),
  ('pol-chamber', 'Chamber practice', 'Practicing Public speaking grants 1 extra character experience. That session does not finish the diplomacy practice contract.', 'politician', 'choice', 3, 'public_speaking', 1, null, 'politician', 1, 'practice_character_xp', 1, 1, 'public_speaking'),
  ('pol-desk', 'Civic standing', 'Mission and introduction rewards add 1 reputation. This does not grant a political office or a vote.', 'politician', 'choice', 3, 'diplomacy', 1, null, 'politician', 1, 'reputation_flat', 1, 1, null),
  ('ind-runs', 'Lean runs', 'Recipe operating cost is reduced by 1 more currency and cannot fall below 1.', 'industrialist', 'choice', 3, 'production', 1, null, 'industrialist', 1, 'production_cost_flat', 1, 1, null),
  ('ind-freight', 'Freight desk', 'Goods shipment cost is reduced by 2 currency and cannot fall below 1. Passenger travel is unchanged.', 'industrialist', 'choice', 3, 'logistics', 1, null, 'industrialist', 1, 'shipment_cost_flat', 2, 4, null),
  ('trd-counter', 'Counter offers', 'The market fee you pay is reduced by another 2 percent of that fee. Focuses cannot reduce more than 4 percent of the fee, and the fee cannot go below zero.', 'trader', 'choice', 3, 'negotiation', 1, null, 'trader', 1, 'market_fee_flat', 2, 4, null),
  ('trd-haul', 'Haul planning', 'Goods shipment cost is reduced by 2 currency and cannot fall below 1. A haul contract opens. Passenger travel is unchanged.', 'trader', 'choice', 3, 'logistics', 1, null, 'trader', 1, 'shipment_cost_flat', 2, 4, null),
  ('crm-plan', 'Planning drill', 'Practicing Operational planning grants 1 extra skill experience. Focuses together cannot add more than 2. This does not open a criminal action.', 'criminal', 'choice', 3, 'operational_planning', 1, null, 'criminal', 1, 'practice_skill_xp', 1, 1, 'operational_planning'),
  ('crm-contacts', 'Contact book', 'Practicing Networking grants 1 extra skill experience and opens a networking contract. This does not open a criminal action.', 'criminal', 'choice', 3, 'networking', 1, null, 'criminal', 1, 'practice_skill_xp', 1, 1, 'networking'),
  ('sec-watch', 'Watch notes', 'Practicing Operational planning grants 1 extra skill experience and opens a planning contract. This does not grant an enforcement power.', 'security', 'choice', 3, 'operational_planning', 1, null, 'security', 1, 'practice_skill_xp', 1, 1, 'operational_planning'),
  ('sec-post', 'Post notes', 'Mission and introduction rewards add 1 reputation. This does not grant a political office.', 'security', 'choice', 3, 'diplomacy', 1, null, 'security', 1, 'reputation_flat', 1, 1, null),
  ('exp-road', 'Road sense', 'Passenger journey cost is reduced by 2 currency and cannot fall below 1. Goods shipments are unchanged.', 'explorer', 'choice', 3, 'logistics', 1, null, 'explorer', 1, 'travel_cost_flat', 2, 4, null),
  ('exp-book', 'Field contacts', 'Practicing Networking grants 1 extra skill experience. Focuses together cannot add more than 2.', 'explorer', 'choice', 3, 'networking', 1, null, 'explorer', 1, 'practice_skill_xp', 1, 1, 'networking'),
  ('gen-office', 'Office method', 'Mission experience is 2 percent higher. Practice experience is unchanged. Focuses cannot add more than 4 percent.', 'generalist', 'choice', 3, 'management', 1, null, 'generalist', 1, 'mission_xp_percent', 2, 4, null),
  ('gen-crew', 'Crew lead', 'Construction company shifts add 2 currency. Focuses cannot add more than 2. This does not change the wage.', 'generalist', 'choice', 3, 'management', 1, null, 'generalist', 1, 'service_shift_flat', 2, 2, 'management'),
  ('cap-entrepreneur', 'Venture mastery', 'Opens a one-time contract to raise Negotiation to level 3. The earlier focus stays in place.', 'entrepreneur', 'mastery', 4, 'negotiation', 2, 'entrepreneur', null, 1, 'none', 0, 0, null),
  ('cap-politician', 'Civic mastery', 'Opens a one-time contract to raise Diplomacy to level 3. This does not grant an office.', 'politician', 'mastery', 4, 'diplomacy', 2, 'politician', null, 1, 'none', 0, 0, null),
  ('cap-industrialist', 'Plant mastery', 'Opens a one-time contract to raise Production to level 3.', 'industrialist', 'mastery', 4, 'production', 2, 'industrialist', null, 1, 'none', 0, 0, null),
  ('cap-trader', 'Trading mastery', 'Opens a one-time contract to raise Negotiation to level 3.', 'trader', 'mastery', 4, 'negotiation', 2, 'trader', null, 1, 'none', 0, 0, null),
  ('cap-criminal', 'Planning mastery', 'Opens a one-time contract to raise Operational planning to level 3. This does not open a criminal action.', 'criminal', 'mastery', 4, 'operational_planning', 2, 'criminal', null, 1, 'none', 0, 0, null),
  ('cap-security', 'Watch mastery', 'Opens a one-time contract to raise Operational planning to level 3. This does not grant an enforcement power.', 'security', 'mastery', 4, 'operational_planning', 2, 'security', null, 1, 'none', 0, 0, null),
  ('cap-explorer', 'Route mastery', 'Opens a one-time contract to raise Networking to level 3.', 'explorer', 'mastery', 4, 'networking', 2, 'explorer', null, 1, 'none', 0, 0, null),
  ('cap-generalist', 'Management mastery', 'Opens a one-time contract to raise Management to level 3.', 'generalist', 'mastery', 4, 'management', 2, 'generalist', null, 1, 'none', 0, 0, null);

insert into missions (
  id, name, description, category, difficulty, min_level, repeatable, cooldown_seconds,
  xp_reward, currency_reward, reputation_reward, reward_context, requires_node
) values
  ('contract-node-chamber', 'Speak in the chamber', 'Practice Public speaking while this contract is active. The diplomacy practice contract needs its own session.', 'politics', 'standard', 3, true, 86400, 14, 8, 0, 'mission', 'pol-chamber'),
  ('contract-node-haul', 'Plan a haul', 'Deliver one goods shipment while this contract is active. The character journey is a separate action.', 'trade', 'standard', 3, true, 86400, 14, 8, 0, 'delivery', 'trd-haul'),
  ('contract-node-contacts', 'Keep a contact', 'Practice Networking while this contract is active. This is a fictional contact note, not a criminal action.', 'criminal', 'standard', 3, true, 86400, 14, 8, 0, 'mission', 'crm-contacts'),
  ('contract-node-watch', 'Keep a watch note', 'Practice Operational planning while this contract is active. This does not grant an enforcement power.', 'security', 'standard', 3, true, 86400, 14, 8, 0, 'mission', 'sec-watch'),
  ('master-entrepreneur', 'Negotiation mastery', 'Raise Negotiation to level 3. The reward pays once.', 'business', 'milestone', 4, false, 0, 24, 12, 0, 'mission', 'cap-entrepreneur'),
  ('master-politician', 'Diplomacy mastery', 'Raise Diplomacy to level 3. The reward pays once and does not grant an office.', 'politics', 'milestone', 4, false, 0, 24, 12, 0, 'mission', 'cap-politician'),
  ('master-industrialist', 'Production mastery', 'Raise Production to level 3. The reward pays once.', 'industry', 'milestone', 4, false, 0, 24, 12, 0, 'mission', 'cap-industrialist'),
  ('master-trader', 'Deal mastery', 'Raise Negotiation to level 3. The reward pays once.', 'trade', 'milestone', 4, false, 0, 24, 12, 0, 'mission', 'cap-trader'),
  ('master-criminal', 'Planning mastery', 'Raise Operational planning to level 3. The reward pays once. This does not open a criminal action.', 'criminal', 'milestone', 4, false, 0, 24, 12, 0, 'mission', 'cap-criminal'),
  ('master-security', 'Watch mastery', 'Raise Operational planning to level 3. The reward pays once. This does not grant an enforcement power.', 'security', 'milestone', 4, false, 0, 24, 12, 0, 'mission', 'cap-security'),
  ('master-explorer', 'Contact mastery', 'Raise Networking to level 3. The reward pays once.', 'social', 'milestone', 4, false, 0, 24, 12, 0, 'mission', 'cap-explorer'),
  ('master-generalist', 'Management mastery', 'Raise Management to level 3. The reward pays once.', 'business', 'milestone', 4, false, 0, 24, 12, 0, 'mission', 'cap-generalist');

insert into mission_specializations (mission_id, specialization) values
  ('contract-node-chamber', 'politician'),
  ('contract-node-haul', 'trader'),
  ('contract-node-contacts', 'criminal'),
  ('contract-node-watch', 'security'),
  ('master-entrepreneur', 'entrepreneur'),
  ('master-politician', 'politician'),
  ('master-industrialist', 'industrialist'),
  ('master-trader', 'trader'),
  ('master-criminal', 'criminal'),
  ('master-security', 'security'),
  ('master-explorer', 'explorer'),
  ('master-generalist', 'generalist');

insert into mission_objectives (id, mission_id, sort_order, kind, description, skill_id, item_id, quantity) values
  ('contract-node-chamber-practice', 'contract-node-chamber', 1, 'skill_practiced', 'Practice Public speaking once while this contract is active.', 'public_speaking', null, 1),
  ('contract-node-haul-delivered', 'contract-node-haul', 1, 'shipment_delivered', 'Deliver one goods shipment while this contract is active.', null, null, 1),
  ('contract-node-contacts-practice', 'contract-node-contacts', 1, 'skill_practiced', 'Practice Networking once while this contract is active.', 'networking', null, 1),
  ('contract-node-watch-practice', 'contract-node-watch', 1, 'skill_practiced', 'Practice Operational planning once while this contract is active.', 'operational_planning', null, 1),
  ('master-entrepreneur-level', 'master-entrepreneur', 1, 'skill_level', 'Reach Negotiation level 3.', 'negotiation', null, 3),
  ('master-politician-level', 'master-politician', 1, 'skill_level', 'Reach Diplomacy level 3.', 'diplomacy', null, 3),
  ('master-industrialist-level', 'master-industrialist', 1, 'skill_level', 'Reach Production level 3.', 'production', null, 3),
  ('master-trader-level', 'master-trader', 1, 'skill_level', 'Reach Negotiation level 3.', 'negotiation', null, 3),
  ('master-criminal-level', 'master-criminal', 1, 'skill_level', 'Reach Operational planning level 3.', 'operational_planning', null, 3),
  ('master-security-level', 'master-security', 1, 'skill_level', 'Reach Operational planning level 3.', 'operational_planning', null, 3),
  ('master-explorer-level', 'master-explorer', 1, 'skill_level', 'Reach Networking level 3.', 'networking', null, 3),
  ('master-generalist-level', 'master-generalist', 1, 'skill_level', 'Reach Management level 3.', 'management', null, 3);

alter table missions
  add constraint missions_requires_node_fk foreign key (requires_node) references skill_nodes (id);
