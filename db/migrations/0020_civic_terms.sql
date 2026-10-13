-- A civic term is one UTC week, Monday 00:00 through the next Monday.
-- One recorded mission completion in that week pays the stored reputation once.
-- A missed week is kept and is not replayed. Currency, level, and inventory are not changed.

insert into game_rules (key, amount) values ('term_reputation', 1)
on conflict (key) do nothing;

create table character_terms (
  character_id uuid not null references characters (id) on delete cascade,
  term_key text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('open', 'recorded', 'missed')),
  source_key text,
  recorded_at timestamptz,
  primary key (character_id, term_key),
  constraint character_term_window check (ends_at > starts_at),
  constraint character_term_source check (
    (status = 'recorded' and source_key is not null and recorded_at is not null)
    or (status <> 'recorded' and source_key is null and recorded_at is null)
  )
);

create index character_terms_key_idx on character_terms (term_key, status);
