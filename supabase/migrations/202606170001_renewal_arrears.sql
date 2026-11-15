-- Fitness World GymOS — record arrears carried into a renewal (audit fix).
-- Safe to re-run.
alter table public.renewal_history
add column if not exists arrears_carried numeric not null default 0;
