-- Align the stored diplomacy sentence with the reward the server pays.
update skill_definitions
set description = 'Fictional game skill. Each level adds 1 reputation when a mission or introduction reward is paid.'
where id = 'diplomacy'
  and effect_key = 'reputation_flat';
