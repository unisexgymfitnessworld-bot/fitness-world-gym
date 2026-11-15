-- Member profile photos: the worker writes members.avatar but no earlier
-- migration created it. Additive and idempotent: safe whether or not the
-- column already exists (some databases may have it via drift).
alter table if exists public.members
  add column if not exists avatar text;
