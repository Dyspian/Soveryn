-- The country work bulletin also appears as a mission-board contract while it is open.
-- The contract tracks the shift. It pays nothing. The bulletin ledger row is the only reward.

insert into missions (
  id, name, description, category, difficulty, min_level, repeatable, cooldown_seconds,
  xp_reward, currency_reward, reputation_reward, reward_context
) values (
  'bulletin-shift',
  'Country work bulletin',
  'Shown only while a work bulletin is open for your political home. One company shift records that bulletin and pays its stored reward once. Completing this contract does not pay a second time.',
  'business',
  'standard',
  1,
  true,
  0,
  0,
  0,
  0,
  'bulletin'
);

insert into mission_specializations (mission_id, specialization)
select 'bulletin-shift', specialization
from (
  values
    ('entrepreneur'), ('politician'), ('industrialist'), ('trader'),
    ('criminal'), ('security'), ('explorer'), ('generalist')
) as specs (specialization);

insert into mission_objectives (id, mission_id, sort_order, kind, description, skill_id, item_id, quantity) values
  ('bulletin-shift-work', 'bulletin-shift', 1, 'work_shift', 'Work one company shift while this contract and the work bulletin are both open.', null, null, 1);
