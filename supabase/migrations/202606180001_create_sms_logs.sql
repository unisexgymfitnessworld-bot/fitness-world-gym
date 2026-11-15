-- Persistent SMS outbox + audit log (January 2026 production hardening).
--
-- Every SMS attempt (manual, automatic reminders, receipts, tests) is recorded
-- here so failed messages can be retried automatically and the gym has a full
-- delivery history. The worker treats this table as optional: if the migration
-- has not been applied yet, sending still works, only logging is skipped.
create table if not exists public.sms_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  phone text not null,
  message text not null,
  kind text not null default 'manual'
    check (kind in ('manual', 'reminder_3day', 'reminder_dueday', 'winback', 'receipt', 'test', 'balance_overdue')),
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'failed')),
  provider text not null default 'smsgate',
  provider_message_id text,
  smsgate_state text,
  attempts integer not null default 0,
  last_error text,
  last_error_code text,
  next_retry_at timestamptz,
  sent_at timestamptz,
  on_sent_action text check (on_sent_action in ('reminder_3day', 'winback')),
  client_request_id text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_sms_logs_status on public.sms_logs(status);
create index if not exists idx_sms_logs_next_retry on public.sms_logs(next_retry_at);
create index if not exists idx_sms_logs_member on public.sms_logs(member_id);
create index if not exists idx_sms_logs_created on public.sms_logs(created_at);
create index if not exists idx_sms_logs_client_request on public.sms_logs(client_request_id);

drop trigger if exists set_sms_logs_updated_at on public.sms_logs;
create trigger set_sms_logs_updated_at
before update on public.sms_logs
for each row execute function public.set_updated_at();

alter table public.sms_logs enable row level security;

revoke all privileges on table public.sms_logs from anon, authenticated;

grant select, insert, update, delete on public.sms_logs to service_role;

drop policy if exists "sms_logs backend only" on public.sms_logs;
create policy "sms_logs backend only"
on public.sms_logs for all
to anon, authenticated
using (false)
with check (false);
