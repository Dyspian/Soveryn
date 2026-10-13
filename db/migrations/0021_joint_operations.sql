-- A joint shift is an organization contract. Two members each record one company
-- shift worked during the open window. The existing stake and margin rules apply once.

alter table operations drop constraint operations_definition_key_check;
alter table operations add constraint operations_definition_key_check
  check (definition_key in ('survey', 'protection', 'recovery', 'joint'));

insert into game_rules (key, amount) values ('joint_goal', 2)
on conflict (key) do nothing;

create table operation_contributions (
  operation_id uuid not null references operations (id) on delete cascade,
  character_id uuid not null references characters (id),
  source_key text not null,
  created_at timestamptz not null default now(),
  primary key (operation_id, character_id),
  unique (source_key)
);

create index operation_contributions_operation_idx on operation_contributions (operation_id);
