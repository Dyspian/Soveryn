-- Player release records. Existing accounts stay playable until they accept the notice.
-- Closing an account replaces the login and keeps the character, ledger, and political history.

alter table users add column if not exists terms_accepted_at timestamptz;
alter table users add column if not exists closed_at timestamptz;
alter table characters add column if not exists guide_dismissed_at timestamptz;

insert into game_rules (key, amount)
values ('feature_warfare', 0)
on conflict (key) do nothing;
