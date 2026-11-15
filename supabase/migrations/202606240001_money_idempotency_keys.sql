-- Idempotency keys for money writes: a retried receipt POST or renew PATCH
-- must return the first result instead of double-charging.
-- Partial unique indexes: rows without a key (old data, API clients that
-- omit it) are unaffected.
alter table if exists public.payment_receipts
  add column if not exists client_request_id text;

alter table if exists public.renewal_history
  add column if not exists client_request_id text;

create unique index if not exists uq_payment_receipts_idempotency
  on public.payment_receipts (member_id, client_request_id)
  where client_request_id is not null;

create unique index if not exists uq_renewal_history_idempotency
  on public.renewal_history (member_id, client_request_id)
  where client_request_id is not null;
