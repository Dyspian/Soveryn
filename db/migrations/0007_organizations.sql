-- Player organizations. Amounts below are initial tuning assumptions, not measured live-player balance.
alter table ledger_entries drop constraint ledger_entries_from_kind_check;
alter table ledger_entries drop constraint ledger_entries_to_kind_check;
alter table ledger_entries add constraint ledger_entries_from_kind_check
  check (from_kind in ('character', 'business', 'system', 'party', 'government', 'organization'));
alter table ledger_entries add constraint ledger_entries_to_kind_check
  check (to_kind in ('character', 'business', 'system', 'party', 'government', 'organization'));

insert into game_rules (key, amount) values
  ('org_startup', 50),
  ('org_min_level', 2),
  ('org_member_limit', 12),
  ('org_switch_cooldown_seconds', 60),
  ('org_withdraw_limit', 100),
  ('org_approval_threshold', 40),
  ('org_invite_seconds', 3600),
  ('org_operation_seconds', 30),
  ('org_operation_stake', 10),
  ('org_operation_margin', 4),
  ('org_heat_decay', 5),
  ('org_heat_investigation', 25),
  ('org_heat_severe', 40),
  ('org_fine', 15),
  ('org_market_fee_percent', 8),
  ('org_listing_seconds', 3600),
  ('org_listing_limit', 3),
  ('org_influence_cap', 40),
  ('org_influence_gain', 4),
  ('org_lay_low_seconds', 60),
  ('org_restriction_seconds', 120)
on conflict (key) do nothing;

insert into products (id, name, description, category, unit, stack_limit) values
  ('sealed_crate', 'Sealed crate', 'A fictional cargo unit used by the game. It has no specified real-world contents.', 'restricted', 'units', 100)
on conflict (id) do nothing;

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tag text not null,
  description text not null default '',
  emblem_key text,
  org_type text not null check (org_type in (
    'syndicate', 'street_gang', 'smuggling_network', 'mercenary_company', 'private_security',
    'trade_association', 'political_action', 'corporate_group', 'underground_market'
  )),
  founder_character_id uuid not null references characters (id),
  leader_character_id uuid not null references characters (id),
  headquarters_place_id uuid not null references places (id),
  country_id uuid not null references countries (id),
  balance bigint not null default 0 check (balance >= 0),
  reputation integer not null default 0,
  influence integer not null default 0,
  member_limit integer not null,
  recruitment text not null check (recruitment in ('open', 'application', 'closed')),
  visibility text not null check (visibility in ('public', 'private')),
  status text not null default 'active' check (status in ('active', 'suspended', 'dissolved', 'archived')),
  created_at timestamptz not null default now(),
  constraint organizations_name_len check (char_length(name) between 3 and 40),
  constraint organizations_tag_len check (char_length(tag) between 2 and 5),
  constraint organizations_description_len check (char_length(description) <= 400),
  constraint organizations_emblem check (emblem_key is null or emblem_key in ('mark-1', 'mark-2', 'mark-3', 'mark-4', 'mark-5', 'mark-6'))
);

create unique index organizations_name_idx on organizations (lower(name)) where status <> 'dissolved';
create unique index organizations_tag_idx on organizations (lower(tag)) where status <> 'dissolved';
create index organizations_hq_idx on organizations (headquarters_place_id);

create table organization_ranks (
  organization_id uuid not null references organizations (id) on delete cascade,
  rank_key text not null check (rank_key in ('founder', 'leader', 'deputy', 'officer', 'specialist', 'member', 'recruit')),
  name text not null,
  sort_order integer not null,
  invite boolean not null default false,
  approve boolean not null default false,
  remove boolean not null default false,
  promote boolean not null default false,
  edit boolean not null default false,
  withdraw boolean not null default false,
  approve_spend boolean not null default false,
  start_operations boolean not null default false,
  locations boolean not null default false,
  treaties boolean not null default false,
  rivalries boolean not null default false,
  market boolean not null default false,
  reports boolean not null default false,
  settings boolean not null default false,
  dissolve boolean not null default false,
  primary key (organization_id, rank_key),
  constraint organization_rank_name_len check (char_length(name) between 3 and 24)
);

create table organization_members (
  organization_id uuid not null references organizations (id) on delete cascade,
  character_id uuid not null references characters (id) on delete cascade,
  rank_key text not null,
  is_founder boolean not null default false,
  status text not null check (status in ('active', 'left', 'removed')),
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (organization_id, character_id),
  foreign key (organization_id, rank_key) references organization_ranks (organization_id, rank_key)
);

create unique index organization_one_membership_idx on organization_members (character_id) where status = 'active';

create table organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  character_id uuid not null references characters (id) on delete cascade,
  invited_by uuid not null references characters (id),
  status text not null check (status in ('pending', 'accepted', 'declined', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index organization_one_invite_idx on organization_invitations (organization_id, character_id) where status = 'pending';

create table organization_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  character_id uuid not null references characters (id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create unique index organization_one_application_idx on organization_applications (organization_id, character_id) where status = 'pending';

create table organization_locations (
  organization_id uuid not null references organizations (id) on delete cascade,
  place_id uuid not null references places (id),
  primary key (organization_id, place_id)
);

create table organization_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  kind text not null,
  detail text not null,
  visibility text not null check (visibility in ('public', 'members', 'officers')),
  created_at timestamptz not null default now()
);

create index organization_events_idx on organization_events (organization_id, created_at desc);

create table organization_withdrawals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  actor_character_id uuid not null references characters (id),
  approver_character_id uuid references characters (id),
  payee_character_id uuid not null references characters (id),
  amount bigint not null check (amount > 0),
  idempotency_key text not null unique,
  status text not null check (status in ('pending', 'applied', 'rejected')),
  created_at timestamptz not null default now()
);

create table organization_notices (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters (id) on delete cascade,
  organization_id uuid references organizations (id) on delete cascade,
  kind text not null,
  detail text not null,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (character_id, dedupe_key)
);

create table character_underworld (
  character_id uuid primary key references characters (id) on delete cascade,
  reputation integer not null default 0,
  experience integer not null default 0,
  concealment integer not null default 0,
  planning integer not null default 0,
  negotiation integer not null default 0,
  network integer not null default 0,
  heat integer not null default 0,
  fines bigint not null default 0 check (fines >= 0),
  market_restricted_until timestamptz,
  lay_low_until timestamptz,
  updated_at timestamptz not null default now()
);

create table operations (
  id uuid primary key default gen_random_uuid(),
  definition_key text not null check (definition_key in ('survey', 'protection', 'recovery')),
  organization_id uuid references organizations (id),
  place_id uuid not null references places (id),
  opened_by uuid not null references characters (id),
  status text not null check (status in ('preparation', 'recruiting', 'ready', 'in_progress', 'completed', 'failed', 'cancelled')),
  stake bigint not null default 0,
  completes_at timestamptz,
  result_summary text,
  created_at timestamptz not null default now()
);

create index operations_org_idx on operations (organization_id, status);

create table operation_participants (
  operation_id uuid not null references operations (id) on delete cascade,
  character_id uuid not null references characters (id),
  primary key (operation_id, character_id)
);

create table enforcement_cases (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters (id),
  organization_id uuid references organizations (id),
  country_id uuid not null references countries (id),
  status text not null check (status in ('preliminary', 'active', 'review', 'resolved', 'closed')),
  evidence integer not null default 0,
  fine_amount bigint not null default 0,
  outcome text,
  created_at timestamptz not null default now()
);

create unique index enforcement_one_open_idx on enforcement_cases (character_id) where status in ('preliminary', 'active', 'review');

create table heat_events (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters (id),
  delta integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table underground_listings (
  id uuid primary key default gen_random_uuid(),
  seller_character_id uuid not null references characters (id),
  place_id uuid not null references places (id),
  product_id text not null references products (id),
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price > 0),
  status text not null check (status in ('open', 'sold', 'cancelled', 'expired')),
  buyer_character_id uuid references characters (id),
  expires_at timestamptz not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index underground_open_idx on underground_listings (status, expires_at);

create table delivery_contracts (
  id uuid primary key default gen_random_uuid(),
  poster_character_id uuid not null references characters (id),
  carrier_character_id uuid references characters (id),
  organization_id uuid references organizations (id),
  origin_place_id uuid not null references places (id),
  destination_place_id uuid not null references places (id),
  product_id text not null references products (id),
  quantity integer not null check (quantity > 0),
  payment bigint not null check (payment > 0),
  deposit bigint not null check (deposit > 0),
  status text not null check (status in ('available', 'accepted', 'in_transit', 'arrived', 'completed', 'failed', 'expired', 'cancelled')),
  arrives_at timestamptz,
  deadline timestamptz not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  constraint delivery_distinct_places check (origin_place_id <> destination_place_id)
);

create table organization_influence (
  organization_id uuid not null references organizations (id) on delete cascade,
  place_id uuid not null references places (id),
  score integer not null check (score >= 0 and score <= 100),
  updated_at timestamptz not null default now(),
  primary key (organization_id, place_id)
);

create table organization_relations (
  organization_a uuid not null references organizations (id) on delete cascade,
  organization_b uuid not null references organizations (id) on delete cascade,
  status text not null check (status in ('neutral', 'cooperative', 'partner', 'allied', 'competitive', 'rival', 'hostile', 'ceasefire', 'dissolved')),
  proposal text check (proposal is null or proposal in ('cooperative', 'partner', 'allied', 'ceasefire')),
  proposed_by uuid references characters (id),
  proposal_expires timestamptz,
  updated_at timestamptz not null default now(),
  primary key (organization_a, organization_b),
  constraint organization_relation_order check (organization_a < organization_b)
);
