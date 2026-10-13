create table character_connections (
  character_a uuid not null references characters (id) on delete cascade,
  character_b uuid not null references characters (id) on delete cascade,
  requester_id uuid not null references characters (id),
  status text not null check (status in ('pending', 'accepted', 'declined', 'removed', 'blocked')),
  blocker_id uuid references characters (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (character_a, character_b),
  constraint connection_order check (character_a < character_b),
  constraint connection_requester check (requester_id = character_a or requester_id = character_b),
  constraint connection_blocker check (
    (status = 'blocked' and blocker_id is not null and (blocker_id = character_a or blocker_id = character_b))
    or (status <> 'blocked' and blocker_id is null)
  )
);

create index character_connections_b_idx on character_connections (character_b, status);
