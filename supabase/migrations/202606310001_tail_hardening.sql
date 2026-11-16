-- Tail hardening: worker-enforced rules as DB constraints, missing triggers,
-- and composite indexes for the reminder/sweep queries.
--
-- Safety: everything is additive or NOT VALID + VALIDATE (new rows enforced,
-- old rows validated when clean). No backfill, no blocking rewrite, rerunnable.
-- Rollback per block: drop the named constraint / trigger / index.
-- Live DBs: run this file (or APPLY_MISSING_MIGRATIONS.sql section 19) once.

-- ── Winback flag resets with the 3-day flag on due change ────────────────────
-- Rollback: re-create the function with only the sms_sent_3days line.
create or replace function public.reset_sms_sent_on_renewal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.membership_due is distinct from new.membership_due then
    new.sms_sent_3days = false;
    new.sms_sent_winback = false;
  end if;
  return new;
end;
$$;

-- ── Worker-enforced ranges as CHECKs ─────────────────────────────────────────
-- Rollback: alter table public.members drop constraint if exists <name>.
alter table public.members
  add constraint members_weight_range check (weight_kg between 20 and 250) not valid;
alter table public.members validate constraint members_weight_range;

alter table public.members
  add constraint members_height_range check (height_cm between 90 and 240) not valid;
alter table public.members validate constraint members_height_range;

alter table public.members
  add constraint members_due_after_start check (membership_due >= membership_start) not valid;
alter table public.members validate constraint members_due_after_start;

-- ── Attendance rows always belong to a member ─────────────────────────────────
-- Rollback: alter table public.attendance drop constraint if exists attendance_member_not_null.
alter table public.attendance
  add constraint attendance_member_not_null check (member_id is not null) not valid;
alter table public.attendance validate constraint attendance_member_not_null;

-- ── Settings rows stamp their own updates ────────────────────────────────────
-- Rollback: drop trigger if exists set_system_settings_updated_at on public.system_settings.
drop trigger if exists set_system_settings_updated_at on public.system_settings;
create trigger set_system_settings_updated_at
before update on public.system_settings
for each row execute function public.set_updated_at();

-- ── Owner audit trail: never null, honestly commented ────────────────────────
-- Rollback: drop the constraint; the comment can stay.
alter table public.members
  add constraint members_owner_not_null check (owner_user_id is not null) not valid;
alter table public.members validate constraint members_owner_not_null;

comment on column public.members.owner_user_id is 'Audit trail: Supabase Auth user that created this member record. NOT a workspace boundary — all trainers share one gym workspace.';

-- ── Composite indexes for reminder / sweep filters ──────────────────────────
-- Rollback: drop index if exists <name>.
create index if not exists idx_members_status_due_sms3
  on public.members (status, membership_due, sms_sent_3days);
create index if not exists idx_members_status_due_winback
  on public.members (status, membership_due, sms_sent_winback);
create index if not exists idx_sms_logs_status_next_retry
  on public.sms_logs (status, next_retry_at);
