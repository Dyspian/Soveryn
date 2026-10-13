alter table ledger_entries drop constraint ledger_entries_from_kind_check;
alter table ledger_entries drop constraint ledger_entries_to_kind_check;
alter table ledger_entries add constraint ledger_entries_from_kind_check
  check (from_kind in ('character', 'business', 'system', 'party', 'government'));
alter table ledger_entries add constraint ledger_entries_to_kind_check
  check (to_kind in ('character', 'business', 'system', 'party', 'government'));

insert into game_rules (key, amount) values
  ('party_startup', 20),
  ('party_min_level', 2),
  ('election_registration_seconds', 120),
  ('election_voting_seconds', 300),
  ('scandal_reputation_loss', 10)
on conflict (key) do nothing;

create table government_templates (
  id text primary key,
  name text not null,
  summary text not null,
  executive_selection text not null check (executive_selection in ('direct_fptp', 'parliamentary', 'claim', 'succession')),
  parliament_system text not null check (parliament_system in ('pr', 'none')),
  parliament_seats integer not null check (parliament_seats >= 0),
  restrict_opposition_on_adopt boolean not null default false
);

create table template_offices (
  template_id text not null references government_templates (id) on delete cascade,
  office_key text not null,
  name text not null,
  selection text not null check (selection in ('election_fptp', 'election_pr', 'appointment', 'succession', 'claim')),
  is_executive boolean not null default false,
  is_legislative boolean not null default false,
  may_appoint boolean not null default false,
  may_spend boolean not null default false,
  may_propose_law boolean not null default false,
  may_diplomacy boolean not null default false,
  seat_count integer not null default 1 check (seat_count > 0),
  primary key (template_id, office_key)
);

create table constitutions (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null unique references countries (id),
  template_id text not null references government_templates (id),
  version integer not null default 1 check (version >= 1),
  opposition_restricted boolean not null default false,
  adopted_by uuid references characters (id),
  note text not null,
  adopted_at timestamptz not null default now()
);

create table constitution_changes (
  id uuid primary key default gen_random_uuid(),
  constitution_id uuid not null references constitutions (id) on delete cascade,
  version integer not null,
  change text not null,
  actor_id uuid references characters (id),
  created_at timestamptz not null default now()
);

create table government_offices (
  id uuid primary key default gen_random_uuid(),
  constitution_id uuid not null references constitutions (id) on delete cascade,
  office_key text not null,
  name text not null,
  selection text not null,
  is_executive boolean not null default false,
  is_legislative boolean not null default false,
  may_appoint boolean not null default false,
  may_spend boolean not null default false,
  may_propose_law boolean not null default false,
  may_diplomacy boolean not null default false,
  seat_count integer not null default 1,
  unique (constitution_id, office_key)
);

create table officeholders (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references government_offices (id) on delete cascade,
  character_id uuid not null references characters (id),
  party_id uuid,
  status text not null check (status in ('active', 'resigned', 'removed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create unique index officeholders_one_active_idx on officeholders (office_id) where status = 'active';

create table parties (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries (id),
  name text not null,
  abbreviation text not null,
  platform text not null default '',
  founder_id uuid not null references characters (id),
  leader_id uuid not null references characters (id),
  balance bigint not null default 0 check (balance >= 0),
  status text not null default 'active' check (status in ('active', 'dissolved')),
  created_at timestamptz not null default now(),
  constraint party_name_len check (char_length(name) between 3 and 40),
  constraint party_abbr_len check (char_length(abbreviation) between 2 and 8),
  constraint party_platform_len check (char_length(platform) <= 500)
);

create unique index parties_country_name_idx on parties (country_id, lower(name)) where status = 'active';

create table party_members (
  party_id uuid not null references parties (id) on delete cascade,
  character_id uuid not null references characters (id) on delete cascade,
  role text not null check (role in ('leader', 'member')),
  status text not null check (status in ('active', 'left', 'expelled')),
  joined_at timestamptz not null default now(),
  primary key (party_id, character_id)
);

create unique index party_members_one_active_idx on party_members (character_id) where status = 'active';

create table elections (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries (id),
  constitution_id uuid not null references constitutions (id),
  kind text not null check (kind in ('fptp_office', 'pr_parliament', 'two_round', 'party_leadership', 'confidence')),
  office_key text,
  party_id uuid references parties (id),
  opened_by uuid not null references characters (id),
  status text not null check (status in ('open', 'runoff', 'closed')),
  round integer not null default 1 check (round >= 1),
  seat_count integer not null default 1,
  secret boolean not null default true,
  registration_ends timestamptz not null,
  voting_ends timestamptz not null,
  created_at timestamptz not null default now()
);

create index elections_country_idx on elections (country_id, status);

create table candidates (
  election_id uuid not null references elections (id) on delete cascade,
  character_id uuid not null references characters (id),
  party_id uuid references parties (id),
  support_points integer not null default 0 check (support_points >= 0),
  round integer not null default 1,
  primary key (election_id, character_id, round)
);

create table ballot_receipts (
  election_id uuid not null references elections (id) on delete cascade,
  voter_id uuid not null references characters (id),
  round integer not null,
  created_at timestamptz not null default now(),
  primary key (election_id, voter_id, round)
);

create table ballot_choices (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references elections (id) on delete cascade,
  round integer not null,
  choice_kind text not null check (choice_kind in ('character', 'party', 'yesno')),
  choice_id uuid,
  choice_value text,
  created_at timestamptz not null default now()
);

create index ballot_choices_election_idx on ballot_choices (election_id, round);

create table parliamentary_seats (
  id uuid primary key default gen_random_uuid(),
  constitution_id uuid not null references constitutions (id) on delete cascade,
  character_id uuid references characters (id),
  party_id uuid references parties (id),
  election_id uuid references elections (id),
  status text not null check (status in ('active', 'vacated')),
  created_at timestamptz not null default now()
);

create index parliamentary_seats_active_idx on parliamentary_seats (constitution_id) where status = 'active';

create table bills (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries (id),
  constitution_id uuid not null references constitutions (id),
  title text not null,
  body text not null,
  category text not null,
  sponsor_id uuid not null references characters (id),
  effect_key text not null,
  effect_value integer not null,
  threshold_percent integer not null default 50 check (threshold_percent between 1 and 100),
  status text not null check (status in ('voting', 'passed', 'rejected', 'enacted')),
  voting_ends timestamptz not null,
  created_at timestamptz not null default now(),
  constraint bill_title_len check (char_length(title) between 3 and 80)
);

create table bill_votes (
  bill_id uuid not null references bills (id) on delete cascade,
  character_id uuid not null references characters (id),
  vote text not null check (vote in ('yes', 'no')),
  primary key (bill_id, character_id)
);

create table policy_versions (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries (id),
  effect_key text not null,
  effect_value integer not null,
  bill_id uuid references bills (id),
  effective_at timestamptz not null default now()
);

create index policy_versions_country_idx on policy_versions (country_id, effect_key, effective_at desc);

create table government_accounts (
  country_id uuid primary key references countries (id),
  balance bigint not null default 0 check (balance >= 0)
);

create table political_events (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries (id),
  kind text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create index political_events_country_idx on political_events (country_id, created_at desc);

create table investigations (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries (id),
  subject_character_id uuid not null references characters (id),
  opened_by uuid not null references characters (id),
  reason text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create table diplomatic_relations (
  country_a uuid not null references countries (id),
  country_b uuid not null references countries (id),
  status text not null check (status in ('friendly', 'neutral', 'strained', 'sanctioned')),
  updated_by uuid references characters (id),
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (country_a, country_b),
  constraint diplomacy_order check (country_a < country_b)
);

insert into government_templates (id, name, summary, executive_selection, parliament_system, parliament_seats, restrict_opposition_on_adopt) values
  ('parliamentary_republic', 'Parliamentary republic', 'A game-scale parliament chooses the prime minister. This template is not a description of any real country.', 'parliamentary', 'pr', 5, false),
  ('presidential_republic', 'Presidential republic', 'A directly elected president appoints finance ministers. Parliament is a separate game-scale chamber.', 'direct_fptp', 'pr', 5, false),
  ('semi_presidential', 'Semi-presidential republic', 'A president and a prime minister divide appointment, spending, and diplomacy.', 'direct_fptp', 'pr', 5, false),
  ('constitutional_monarchy', 'Constitutional monarchy', 'The monarch office is vacant until a succession is recorded. The prime minister governs.', 'parliamentary', 'pr', 5, false),
  ('federal_republic', 'Federal republic', 'A president, a game-scale parliament, and one national mayor office. This is not a mayor for every city.', 'direct_fptp', 'pr', 5, false),
  ('one_party', 'One-party state', 'Adopting this template restricts new parties after the first. The general secretary is elected.', 'direct_fptp', 'pr', 5, true),
  ('authoritarian', 'Authoritarian state', 'An elected president can later restrict opposition by an emergency change. Parliament still exists.', 'direct_fptp', 'pr', 5, false),
  ('dictatorship', 'Dictatorship', 'No parliament. The largest party''s leader may claim the vacant ruler office. A larger party can challenge them. Emergency powers can later block new parties.', 'claim', 'none', 0, false);

insert into template_offices (template_id, office_key, name, selection, is_executive, is_legislative, may_appoint, may_spend, may_propose_law, may_diplomacy, seat_count) values
  ('parliamentary_republic', 'parliament', 'Parliament', 'election_pr', false, true, false, false, true, false, 5),
  ('parliamentary_republic', 'prime_minister', 'Prime minister', 'appointment', true, false, true, true, true, false, 1),
  ('parliamentary_republic', 'finance_minister', 'Finance minister', 'appointment', false, false, false, true, true, false, 1),
  ('parliamentary_republic', 'foreign_minister', 'Foreign minister', 'appointment', false, false, false, false, false, true, 1),
  ('presidential_republic', 'president', 'President', 'election_fptp', true, false, true, true, true, true, 1),
  ('presidential_republic', 'parliament', 'Parliament', 'election_pr', false, true, false, false, true, false, 5),
  ('presidential_republic', 'finance_minister', 'Finance minister', 'appointment', false, false, false, true, true, false, 1),
  ('semi_presidential', 'president', 'President', 'election_fptp', true, false, true, false, false, true, 1),
  ('semi_presidential', 'prime_minister', 'Prime minister', 'appointment', true, false, false, true, true, false, 1),
  ('semi_presidential', 'parliament', 'Parliament', 'election_pr', false, true, false, false, true, false, 5),
  ('constitutional_monarchy', 'monarch', 'Monarch', 'succession', false, false, false, false, false, true, 1),
  ('constitutional_monarchy', 'prime_minister', 'Prime minister', 'appointment', true, false, true, true, true, false, 1),
  ('constitutional_monarchy', 'parliament', 'Parliament', 'election_pr', false, true, false, false, true, false, 5),
  ('federal_republic', 'president', 'President', 'election_fptp', true, false, true, true, true, true, 1),
  ('federal_republic', 'parliament', 'Parliament', 'election_pr', false, true, false, false, true, false, 5),
  ('federal_republic', 'mayor', 'Mayor', 'election_fptp', false, false, false, false, false, false, 1),
  ('one_party', 'general_secretary', 'General secretary', 'election_fptp', true, false, true, true, true, true, 1),
  ('one_party', 'parliament', 'Parliament', 'election_pr', false, true, false, false, true, false, 5),
  ('authoritarian', 'president', 'President', 'election_fptp', true, false, true, true, true, true, 1),
  ('authoritarian', 'parliament', 'Parliament', 'election_pr', false, true, false, false, true, false, 5),
  ('dictatorship', 'ruler', 'Ruler', 'claim', true, false, true, true, true, true, 1);
