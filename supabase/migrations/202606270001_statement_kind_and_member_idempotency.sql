-- Statement kind for the sms_logs outbox + idempotency key for member creates.
-- Safe to re-run.
alter table public.sms_logs drop constraint if exists sms_logs_kind_check;
alter table public.sms_logs
  add constraint sms_logs_kind_check
  check (kind in ('manual', 'reminder_3day', 'reminder_dueday', 'winback', 'receipt', 'test', 'balance_overdue', 'statement'));

alter table public.members add column if not exists client_request_id text;

create unique index if not exists uq_members_idempotency
  on public.members (owner_user_id, client_request_id)
  where client_request_id is not null;
