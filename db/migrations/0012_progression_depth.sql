-- Repeatable contracts and one daily practice session. Existing one-time mission rewards keep their source keys.

update game_rules set amount = 86400 where key = 'practice_cooldown_seconds';

alter table character_missions
  add column completions integer not null default 0 check (completions >= 0),
  add column available_at timestamptz;

alter table mission_objectives drop constraint mission_objectives_kind_check;

alter table mission_objectives add constraint mission_objectives_kind_check check (
  kind in ('match_population', 'mention_city', 'skill_practiced', 'deliver_item', 'skill_level', 'level_reached', 'work_shift')
);

insert into missions (
  id, name, description, category, difficulty, min_level, repeatable, cooldown_seconds,
  xp_reward, currency_reward, reputation_reward, reward_context
) values
  ('milestone-level-3', 'Reach level 3', 'A one-time mark for continued play. It completes when this character reaches level 3.', 'progression', 'milestone', 1, false, 0, 40, 20, 0, 'mission'),
  ('milestone-management', 'Management milestone', 'Raise Management to level 2. The bonus on mission experience applies only after that level is stored.', 'business', 'milestone', 1, false, 0, 25, 12, 0, 'mission'),
  ('milestone-finance', 'Finance milestone', 'Raise Finance to level 2. Later practice sessions add the stored skill-experience bonus.', 'business', 'milestone', 1, false, 0, 25, 12, 0, 'mission'),
  ('milestone-diplomacy', 'Diplomacy milestone', 'Raise Diplomacy to level 2. Civic rewards then include the stored reputation bonus.', 'politics', 'milestone', 1, false, 0, 25, 10, 1, 'mission'),
  ('milestone-production', 'Production milestone', 'Raise Production to level 2. Practice still waits a day; this level only trims that wait by the stored seconds.', 'industry', 'milestone', 1, false, 0, 25, 12, 0, 'mission'),
  ('milestone-negotiation', 'Negotiation milestone', 'Raise Negotiation to level 2. Currency rewards then include the stored percent.', 'trade', 'milestone', 1, false, 0, 25, 14, 0, 'mission'),
  ('milestone-planning', 'Planning milestone', 'Raise Operational planning to level 2. This is a fictional planning exercise.', 'criminal', 'milestone', 1, false, 0, 25, 10, 0, 'mission'),
  ('milestone-watch', 'Watch milestone', 'Raise Operational planning to level 2 on the security path.', 'security', 'milestone', 1, false, 0, 25, 10, 1, 'mission'),
  ('milestone-networking', 'Networking milestone', 'Raise Networking to level 2. Introduction rewards then include the stored experience bonus.', 'social', 'milestone', 1, false, 0, 25, 10, 0, 'introduction'),
  ('contract-desk', 'Daily management review', 'Practice Management while this contract is active. It can be taken again one day after it is completed.', 'business', 'standard', 1, true, 86400, 16, 10, 0, 'mission'),
  ('contract-finance', 'Daily accounts', 'Practice Finance while this contract is active. It can be taken again one day after it is completed.', 'business', 'standard', 1, true, 86400, 16, 12, 0, 'mission'),
  ('contract-diplomacy', 'Daily civic note', 'Practice Diplomacy while this contract is active. It can be taken again one day after it is completed.', 'politics', 'standard', 1, true, 86400, 16, 8, 1, 'mission'),
  ('contract-shift', 'Daily production shift', 'Work one company shift while this contract is active. The shift uses the existing work rules. It can be taken again one day after it is completed.', 'industry', 'standard', 1, true, 86400, 16, 12, 0, 'delivery'),
  ('contract-trade', 'Daily negotiation', 'Practice Negotiation while this contract is active. It can be taken again one day after it is completed.', 'trade', 'standard', 1, true, 86400, 14, 14, 0, 'mission'),
  ('contract-plan', 'Daily planning drill', 'Practice Operational planning while this contract is active. It does not open a criminal action. It can be taken again one day after it is completed.', 'criminal', 'standard', 1, true, 86400, 16, 8, 0, 'mission'),
  ('contract-post', 'Daily security note', 'Practice Diplomacy while this contract is active. It can be taken again one day after it is completed.', 'security', 'standard', 1, true, 86400, 14, 10, 1, 'mission'),
  ('contract-contacts', 'Daily contacts', 'Practice Networking while this contract is active. It can be taken again one day after it is completed.', 'social', 'standard', 1, true, 86400, 16, 8, 0, 'introduction'),
  ('contract-steady', 'Steady work contract', 'Work one company shift. Open from level 4. It can be taken again one day after it is completed, and it does not replace the company wage.', 'economy', 'advanced', 4, true, 86400, 22, 16, 0, 'mission');

insert into mission_specializations (mission_id, specialization)
select mission_id, specialization
from (values ('milestone-level-3'), ('contract-steady')) as shared (mission_id)
cross join (
  values
    ('entrepreneur'), ('politician'), ('industrialist'), ('trader'),
    ('criminal'), ('security'), ('explorer'), ('generalist')
) as specs (specialization)
union all
select * from (
  values
    ('milestone-management', 'generalist'),
    ('milestone-finance', 'entrepreneur'),
    ('milestone-diplomacy', 'politician'),
    ('milestone-production', 'industrialist'),
    ('milestone-negotiation', 'trader'),
    ('milestone-planning', 'criminal'),
    ('milestone-watch', 'security'),
    ('milestone-networking', 'explorer'),
    ('contract-desk', 'generalist'),
    ('contract-finance', 'entrepreneur'),
    ('contract-diplomacy', 'politician'),
    ('contract-shift', 'industrialist'),
    ('contract-trade', 'trader'),
    ('contract-plan', 'criminal'),
    ('contract-post', 'security'),
    ('contract-contacts', 'explorer')
) as focused (mission_id, specialization);

insert into mission_objectives (id, mission_id, sort_order, kind, description, skill_id, item_id, quantity) values
  ('milestone-level-3-level', 'milestone-level-3', 1, 'level_reached', 'Reach character level 3.', null, null, 3),
  ('milestone-management-level', 'milestone-management', 1, 'skill_level', 'Reach Management level 2.', 'management', null, 2),
  ('milestone-finance-level', 'milestone-finance', 1, 'skill_level', 'Reach Finance level 2.', 'finance', null, 2),
  ('milestone-diplomacy-level', 'milestone-diplomacy', 1, 'skill_level', 'Reach Diplomacy level 2.', 'diplomacy', null, 2),
  ('milestone-production-level', 'milestone-production', 1, 'skill_level', 'Reach Production level 2.', 'production', null, 2),
  ('milestone-negotiation-level', 'milestone-negotiation', 1, 'skill_level', 'Reach Negotiation level 2.', 'negotiation', null, 2),
  ('milestone-planning-level', 'milestone-planning', 1, 'skill_level', 'Reach Operational planning level 2.', 'operational_planning', null, 2),
  ('milestone-watch-level', 'milestone-watch', 1, 'skill_level', 'Reach Operational planning level 2.', 'operational_planning', null, 2),
  ('milestone-networking-level', 'milestone-networking', 1, 'skill_level', 'Reach Networking level 2.', 'networking', null, 2),
  ('contract-desk-practice', 'contract-desk', 1, 'skill_practiced', 'Practice Management once while this contract is active.', 'management', null, 1),
  ('contract-finance-practice', 'contract-finance', 1, 'skill_practiced', 'Practice Finance once while this contract is active.', 'finance', null, 1),
  ('contract-diplomacy-practice', 'contract-diplomacy', 1, 'skill_practiced', 'Practice Diplomacy once while this contract is active.', 'diplomacy', null, 1),
  ('contract-shift-work', 'contract-shift', 1, 'work_shift', 'Work one company shift while this contract is active.', null, null, 1),
  ('contract-trade-practice', 'contract-trade', 1, 'skill_practiced', 'Practice Negotiation once while this contract is active.', 'negotiation', null, 1),
  ('contract-plan-practice', 'contract-plan', 1, 'skill_practiced', 'Practice Operational planning once while this contract is active.', 'operational_planning', null, 1),
  ('contract-post-practice', 'contract-post', 1, 'skill_practiced', 'Practice Diplomacy once while this contract is active.', 'diplomacy', null, 1),
  ('contract-contacts-practice', 'contract-contacts', 1, 'skill_practiced', 'Practice Networking once while this contract is active.', 'networking', null, 1),
  ('contract-steady-work', 'contract-steady', 1, 'work_shift', 'Work one company shift while this contract is active.', null, null, 1);
