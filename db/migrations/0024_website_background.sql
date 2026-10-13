-- Public website image. Game screens do not read this table.
create table if not exists website_assets (
  id text primary key,
  content_type text not null,
  bytes bytea not null,
  updated_at timestamptz not null default now()
);
