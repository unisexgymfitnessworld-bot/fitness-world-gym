-- Closing-cycle fee on renewals: without it, every renew erases the fee of
-- the cycle it closes, and All-Time expected money can never be computed.
-- Nullable: renewals recorded before this migration have no closing fee.
alter table if exists public.renewal_history
  add column if not exists old_amount numeric;
