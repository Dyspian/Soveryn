create table coalition_agreements (
  id uuid primary key default gen_random_uuid(),
  constitution_id uuid not null references constitutions (id) on delete cascade,
  party_a uuid not null references parties (id),
  party_b uuid not null references parties (id),
  status text not null check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  constraint coalition_distinct check (party_a <> party_b),
  constraint coalition_order check (party_a < party_b)
);

create unique index coalition_one_active_idx on coalition_agreements (constitution_id) where status = 'active';

alter table investigations add column outcome text check (outcome is null or outcome in ('upheld', 'dismissed'));

create table treaties (
  id uuid primary key default gen_random_uuid(),
  country_a uuid not null references countries (id),
  country_b uuid not null references countries (id),
  title text not null,
  status text not null check (status in ('signed')),
  signed_by uuid references characters (id),
  created_at timestamptz not null default now(),
  constraint treaty_order check (country_a < country_b),
  constraint treaty_title_len check (char_length(title) between 3 and 80),
  unique (country_a, country_b, title)
);
