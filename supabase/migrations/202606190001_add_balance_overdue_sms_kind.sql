-- Allow the overdue-balance nudge kind in the SMS outbox.
--
-- The 09:00 IST job now sends a balance reminder 2 days after expiry
-- (kind 'balance_overdue'). Fresh databases get the widened check from the
-- base sms_logs migration / APPLY_MISSING_MIGRATIONS.sql; this alters
-- databases that already applied the older check.
alter table if exists public.sms_logs drop constraint if exists sms_logs_kind_check;
alter table if exists public.sms_logs
  add constraint sms_logs_kind_check
  check (kind in ('manual', 'reminder_3day', 'reminder_dueday', 'winback', 'receipt', 'test', 'balance_overdue'));
