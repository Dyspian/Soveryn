create table economy_requests (
  idempotency_key text primary key,
  character_id uuid not null references characters (id) on delete cascade,
  request_hash text not null,
  result_text text,
  created_at timestamptz not null default now()
);

create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  from_kind text not null check (from_kind in ('character', 'business', 'system')),
  from_id uuid,
  to_kind text not null check (to_kind in ('character', 'business', 'system')),
  to_id uuid,
  amount bigint not null check (amount > 0),
  reason text not null,
  actor_user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ledger_party_ids check (
    (from_kind = 'system' or from_id is not null)
    and (to_kind = 'system' or to_id is not null)
  )
);

create index ledger_from_idx on ledger_entries (from_kind, from_id, created_at desc);
create index ledger_to_idx on ledger_entries (to_kind, to_id, created_at desc);

create table products (
  id text primary key,
  name text not null,
  description text not null,
  category text not null,
  unit text not null,
  stack_limit integer not null check (stack_limit > 0)
);

create table business_categories (
  id text primary key,
  name text not null,
  startup_cost integer not null check (startup_cost > 0)
);

create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_character_id uuid not null references characters (id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null references business_categories (id),
  country_id uuid not null references countries (id),
  place_id uuid not null references places (id),
  balance bigint not null default 0 check (balance >= 0),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  constraint businesses_name_len check (char_length(name) between 3 and 40),
  constraint businesses_description_len check (char_length(description) <= 400)
);

create unique index businesses_owner_name_idx on businesses (owner_character_id, lower(name));
create index businesses_place_idx on businesses (place_id);
create index businesses_owner_idx on businesses (owner_character_id);

create table stock_holdings (
  holder_kind text not null check (holder_kind in ('character', 'business')),
  holder_id uuid not null,
  place_id uuid not null references places (id),
  product_id text not null references products (id),
  quantity integer not null check (quantity > 0),
  primary key (holder_kind, holder_id, place_id, product_id)
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  holder_kind text not null check (holder_kind in ('character', 'business')),
  holder_id uuid not null,
  place_id uuid not null references places (id),
  product_id text not null references products (id),
  delta integer not null check (delta <> 0),
  reason text not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index stock_movements_holder_idx on stock_movements (holder_kind, holder_id, created_at desc);

create table recipes (
  id text primary key,
  name text not null,
  description text not null,
  output_product_id text not null references products (id),
  output_quantity integer not null check (output_quantity > 0),
  duration_seconds integer not null check (duration_seconds > 0),
  operating_cost integer not null check (operating_cost >= 0),
  allowed_categories text not null
);

create table recipe_inputs (
  recipe_id text not null references recipes (id) on delete cascade,
  product_id text not null references products (id),
  quantity integer not null check (quantity > 0),
  primary key (recipe_id, product_id)
);

create table production_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  recipe_id text not null references recipes (id),
  status text not null check (status in ('running', 'completed', 'cancelled')),
  started_at timestamptz not null default now(),
  completes_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index production_jobs_business_idx on production_jobs (business_id, status);

create table resource_types (
  id text primary key,
  name text not null,
  product_id text references products (id),
  description text not null
);

create table resource_records (
  id uuid primary key default gen_random_uuid(),
  resource_type_id text not null references resource_types (id),
  country_id uuid not null references countries (id),
  region_key text not null default '',
  geographic_level text not null check (geographic_level in ('country', 'region', 'field')),
  metric text not null check (metric in ('proved_reserves', 'resources', 'production', 'capacity')),
  amount numeric,
  amount_quality text not null check (amount_quality in ('reported', 'reported_zero', 'unreported')),
  unit text not null,
  period_label text not null,
  source_id uuid not null references data_sources (id),
  source_record text not null,
  published_on date,
  confidence text not null check (confidence in ('official', 'secondary')),
  notes text not null,
  imported_at timestamptz not null default now(),
  unique (resource_type_id, country_id, geographic_level, metric, period_label, source_id, region_key),
  constraint resource_amount_matches_quality check (
    (amount_quality = 'unreported' and amount is null)
    or (amount_quality = 'reported' and amount > 0)
    or (amount_quality = 'reported_zero' and amount = 0)
  )
);

create index resource_records_country_idx on resource_records (country_id, resource_type_id);

create table extraction_sites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  resource_type_id text not null references resource_types (id),
  country_id uuid not null references countries (id),
  simulated_remaining integer not null check (simulated_remaining >= 0),
  batch_size integer not null check (batch_size > 0),
  operating_cost integer not null check (operating_cost >= 0),
  next_available_at timestamptz,
  status text not null default 'active' check (status in ('active', 'depleted', 'closed')),
  created_at timestamptz not null default now(),
  unique (business_id, resource_type_id)
);

create table extraction_events (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references extraction_sites (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_kind text not null check (seller_kind in ('character', 'business')),
  seller_id uuid not null,
  place_id uuid not null references places (id),
  product_id text not null references products (id),
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price > 0),
  status text not null default 'open' check (status in ('open', 'sold', 'cancelled')),
  buyer_character_id uuid references characters (id),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  sold_at timestamptz
);

create index market_listings_place_idx on market_listings (place_id, status);

create table job_postings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  title text not null,
  wage integer not null check (wage > 0),
  skill_id text references skill_definitions (id),
  min_skill_level smallint not null default 0 check (min_skill_level >= 0),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  constraint job_title_len check (char_length(title) between 3 and 60)
);

create index job_postings_status_idx on job_postings (status, created_at desc);

create table job_applications (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid not null references job_postings (id) on delete cascade,
  character_id uuid not null references characters (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  unique (posting_id, character_id)
);

create table employments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  character_id uuid not null references characters (id) on delete cascade,
  posting_id uuid not null references job_postings (id),
  wage integer not null check (wage > 0),
  status text not null check (status in ('active', 'dismissed')),
  hired_at timestamptz not null default now(),
  dismissed_at timestamptz
);

create unique index employments_one_active_idx on employments (character_id) where status = 'active';
create index employments_business_idx on employments (business_id, status);

create table wage_payments (
  id uuid primary key default gen_random_uuid(),
  employment_id uuid not null references employments (id) on delete cascade,
  period_date date not null,
  amount integer not null check (amount > 0),
  ledger_key text not null unique,
  created_at timestamptz not null default now(),
  unique (employment_id, period_date)
);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  holder_kind text not null check (holder_kind in ('character', 'business')),
  holder_id uuid not null,
  origin_place_id uuid not null references places (id),
  destination_place_id uuid not null references places (id),
  product_id text not null references products (id),
  quantity integer not null check (quantity > 0),
  shipping_cost integer not null check (shipping_cost >= 0),
  tariff integer not null check (tariff >= 0),
  status text not null check (status in ('in_transit', 'delivered')),
  departs_at timestamptz not null default now(),
  arrives_at timestamptz not null,
  simulation_note text not null,
  payer_kind text not null check (payer_kind in ('character', 'business')),
  payer_id uuid not null,
  created_at timestamptz not null default now(),
  constraint shipment_distinct_places check (origin_place_id <> destination_place_id)
);

create index shipments_holder_idx on shipments (holder_kind, holder_id, status);

insert into game_rules (key, amount) values
  ('business_min_level', 2),
  ('business_max_active', 3),
  ('market_fee_percent', 5),
  ('wage_min', 1),
  ('wage_max', 50),
  ('extraction_starting_units', 400),
  ('extraction_batch', 20),
  ('extraction_cost', 5),
  ('extraction_cooldown_seconds', 60),
  ('shipment_base_cost', 5),
  ('shipment_cost_per_100km', 2),
  ('international_tariff', 8),
  ('shipment_seconds_per_100km', 20),
  ('shipment_min_seconds', 15),
  ('production_queue_limit', 2),
  ('max_listing_quantity', 100),
  ('max_unit_price', 500)
on conflict (key) do nothing;

insert into business_categories (id, name, startup_cost) values
  ('trade', 'Retail and wholesale trade', 40),
  ('manufacturing', 'Manufacturing', 80),
  ('logistics', 'Logistics and transport', 60),
  ('agriculture', 'Agriculture', 50),
  ('mining', 'Mining and resource extraction', 90),
  ('energy', 'Energy', 90),
  ('construction', 'Construction and infrastructure', 70),
  ('finance', 'Finance and professional services', 80),
  ('hospitality', 'Hospitality and local services', 40);

insert into products (id, name, description, category, unit, stack_limit) values
  ('crude_oil', 'Crude oil', 'Game commodity. Extraction creates this only from simulated capacity, not from a national reserve figure.', 'energy', 'units', 500),
  ('natural_gas', 'Natural gas', 'Game commodity. Extraction creates this only from simulated capacity, not from a national reserve figure.', 'energy', 'units', 500),
  ('diesel', 'Diesel', 'Refined in game from crude oil. This is not a real-world fuel certificate.', 'energy', 'units', 500),
  ('wheat', 'Wheat', 'Agricultural commodity. It enters the game only when a sourced production path exists or another holder sells it.', 'agriculture', 'units', 500),
  ('flour', 'Flour', 'Milled in game from wheat.', 'food', 'units', 500),
  ('timber', 'Timber', 'Forestry commodity. It is not created without a sourced extraction record.', 'agriculture', 'units', 500),
  ('iron_ore', 'Iron ore', 'Mineral commodity. It is not created without a sourced extraction record.', 'mineral', 'units', 500),
  ('coal', 'Coal', 'Mineral commodity. It is not created without a sourced extraction record.', 'mineral', 'units', 500),
  ('copper_ore', 'Copper ore', 'Mineral commodity. It is not created without a sourced extraction record.', 'mineral', 'units', 500),
  ('steel', 'Steel billet', 'Smelted in game from iron ore and coal.', 'industrial', 'units', 500),
  ('copper_cathode', 'Copper cathode', 'Refined in game from copper ore.', 'industrial', 'units', 500),
  ('consumer_goods', 'Consumer goods', 'Assembled in game from steel and copper cathode.', 'consumer', 'units', 200);

insert into recipes (id, name, description, output_product_id, output_quantity, duration_seconds, operating_cost, allowed_categories) values
  ('refine_diesel', 'Refine diesel', 'Consumes crude oil and yields diesel after a simulated processing time.', 'diesel', 1, 30, 4, 'energy,manufacturing'),
  ('mill_flour', 'Mill flour', 'Consumes wheat and yields flour.', 'flour', 1, 20, 2, 'agriculture,manufacturing'),
  ('smelt_steel', 'Smelt steel', 'Consumes iron ore and coal and yields steel.', 'steel', 1, 45, 6, 'manufacturing'),
  ('refine_copper', 'Refine copper', 'Consumes copper ore and yields copper cathode.', 'copper_cathode', 1, 45, 6, 'manufacturing'),
  ('assemble_goods', 'Assemble consumer goods', 'Consumes steel and copper cathode.', 'consumer_goods', 1, 40, 5, 'manufacturing');

insert into recipe_inputs (recipe_id, product_id, quantity) values
  ('refine_diesel', 'crude_oil', 2),
  ('mill_flour', 'wheat', 2),
  ('smelt_steel', 'iron_ore', 2),
  ('smelt_steel', 'coal', 1),
  ('refine_copper', 'copper_ore', 2),
  ('assemble_goods', 'steel', 1),
  ('assemble_goods', 'copper_cathode', 1);

insert into resource_types (id, name, product_id, description) values
  ('crude_oil', 'Crude oil', 'crude_oil', 'Petroleum. Reference statistics are country totals and are not mineable stock.'),
  ('natural_gas', 'Natural gas', 'natural_gas', 'Natural gas. Reference statistics are country totals and are not mineable stock.'),
  ('coal', 'Coal', 'coal', 'Coal. A game extraction site opens only after a positive sourced record exists for the country.'),
  ('iron_ore', 'Iron ore', 'iron_ore', 'Iron ore. A game extraction site opens only after a positive sourced record exists for the country.'),
  ('copper', 'Copper', 'copper_ore', 'Copper. A game extraction site opens only after a positive sourced record exists for the country.'),
  ('gold', 'Gold', null, 'Gold. Reference only until a product and a sourced record are both present.'),
  ('bauxite', 'Bauxite', null, 'Bauxite. Reference only until a sourced record is imported.'),
  ('lithium', 'Lithium', null, 'Lithium. Reference only until a sourced record is imported.'),
  ('cobalt', 'Cobalt', null, 'Cobalt. Reference only until a sourced record is imported.'),
  ('uranium', 'Uranium', null, 'Uranium. Reference only until a sourced record is imported.'),
  ('timber', 'Timber', 'timber', 'Timber. A game extraction site opens only after a positive sourced record exists for the country.'),
  ('wheat', 'Wheat', 'wheat', 'Wheat. A game extraction site opens only after a positive sourced record exists for the country.');
