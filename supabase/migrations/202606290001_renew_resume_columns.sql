-- Renew resume support: remember what was collected so an interrupted
-- renewal (history saved, member update lost) can be completed on retry
-- instead of wedging forever. Safe to re-run.
alter table public.renewal_history add column if not exists collected_amount numeric not null default 0;
alter table public.renewal_history add column if not exists collected_method text not null default 'Cash';
