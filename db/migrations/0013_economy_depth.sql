-- Skill-shaped service fees, and contracts that complete only after a real sale, shipment, or production run.
-- Existing ledger rows, stock, and one-time mission rewards are left in place.

insert into game_rules (key, amount) values
  ('service_skill_bonus_per_level', 1),
  ('service_skill_bonus_cap', 5),
  ('production_cost_reduction_per_level', 1)
on conflict (key) do nothing;

alter table mission_objectives drop constraint mission_objectives_kind_check;

alter table mission_objectives add constraint mission_objectives_kind_check check (
  kind in (
    'match_population', 'mention_city', 'skill_practiced', 'deliver_item',
    'skill_level', 'level_reached', 'work_shift',
    'market_sold', 'shipment_delivered', 'production_finished'
  )
);

insert into missions (
  id, name, description, category, difficulty, min_level, repeatable, cooldown_seconds,
  xp_reward, currency_reward, reputation_reward, reward_context
) values
  (
    'contract-sale',
    'Record a sale',
    'Sell one open market listing. The contract completes when a buyer pays. Listing the goods is not enough, and the same sale cannot be counted twice.',
    'trade',
    'standard',
    2,
    true,
    86400,
    14,
    8,
    0,
    'mission'
  ),
  (
    'contract-haul',
    'Deliver a shipment',
    'Dispatch goods to another stored city and collect them when the simulated transit has arrived. The character stays in the starting city.',
    'logistics',
    'standard',
    2,
    true,
    86400,
    14,
    8,
    0,
    'delivery'
  ),
  (
    'contract-refine',
    'Finish a recipe',
    'Collect one finished production job into company stock. Starting the recipe is not enough.',
    'industry',
    'standard',
    2,
    true,
    86400,
    16,
    8,
    0,
    'mission'
  );

insert into mission_specializations (mission_id, specialization) values
  ('contract-sale', 'trader'),
  ('contract-sale', 'entrepreneur'),
  ('contract-haul', 'explorer'),
  ('contract-haul', 'industrialist'),
  ('contract-refine', 'industrialist');

insert into mission_objectives (id, mission_id, sort_order, kind, description, skill_id, item_id, quantity) values
  ('contract-sale-sold', 'contract-sale', 1, 'market_sold', 'Complete one market sale while this contract is active.', null, null, 1),
  ('contract-haul-delivered', 'contract-haul', 1, 'shipment_delivered', 'Deliver one shipment while this contract is active.', null, null, 1),
  ('contract-refine-finished', 'contract-refine', 1, 'production_finished', 'Collect one finished recipe while this contract is active.', null, null, 1);
