-- Member email addresses for the email notification channel.
-- Nullable: existing members have none until collected at the desk.
alter table if exists public.members
  add column if not exists email text;
