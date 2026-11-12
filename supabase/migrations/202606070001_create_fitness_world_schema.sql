create extension if not exists pgcrypto with schema extensions;

create sequence if not exists public.members_reg_no_seq start 1;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  reg_no text unique not null default ('FW-' || lpad(nextval('public.members_reg_no_seq')::text, 3, '0')),
  name text not null,
  phone text not null check (phone ~ '^\d{10}$'),
  age integer not null check (age between 12 and 90),
  gender text not null check (gender in ('Male', 'Female', 'Other')),
  join_date date not null,
  weight_kg decimal(5,2) not null,
  height_cm decimal(5,2) not null,
  bmi decimal(4,2) generated always as (round((weight_kg / ((height_cm / 100) ^ 2))::numeric, 2)) stored,
  goal text not null check (goal in ('Weight Loss', 'Weight Gain', 'Muscle Gain', 'General Fitness', 'Other')),
  goal_other text,
  health_problem text,
  special_instruction text,
  warmup_exercises text,
  flexibility_training text,
  cardio_training text,
  plan_type text not null check (plan_type in ('1 Month', '3 Months', '6 Months', '1 Year', 'Custom')),
  membership_start date not null,
  membership_due date not null,
  fees_amount decimal(8,2) not null check (fees_amount >= 0),
  payment_status text default 'Pending' check (payment_status in ('Paid', 'Pending')),
  status text default 'Active' check (status in ('Active', 'Expired', 'Suspended')),
  sms_sent_3days boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete cascade,
  visit_date date not null,
  weight_kg decimal(5,2),
  created_at timestamptz default now()
);

create index if not exists idx_members_due on public.members(membership_due);
create index if not exists idx_members_status on public.members(status);
create index if not exists idx_members_phone on public.members(phone);
create index if not exists idx_members_payment_status on public.members(payment_status);
create index if not exists idx_attendance_member on public.attendance(member_id);
create index if not exists idx_attendance_date on public.attendance(visit_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.reset_sms_sent_on_renewal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.membership_due is distinct from new.membership_due then
    new.sms_sent_3days = false;
  end if;
  return new;
end;
$$;

drop trigger if exists set_members_updated_at on public.members;
create trigger set_members_updated_at
before update on public.members
for each row execute function public.set_updated_at();

drop trigger if exists reset_member_sms_sent_on_renewal on public.members;
create trigger reset_member_sms_sent_on_renewal
before update of membership_due on public.members
for each row execute function public.reset_sms_sent_on_renewal();

alter table public.members enable row level security;
alter table public.attendance enable row level security;

revoke all privileges on table public.members from anon, authenticated;
revoke all privileges on table public.attendance from anon, authenticated;
revoke all privileges on sequence public.members_reg_no_seq from anon, authenticated;

grant select on public.members to anon;
grant select, insert, update, delete on public.members to service_role;
grant select, insert, update, delete on public.attendance to service_role;
grant usage, select on sequence public.members_reg_no_seq to service_role;

drop policy if exists "members backend only" on public.members;
create policy "members backend only"
on public.members for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "trainers can read members" on public.members;
drop policy if exists "trainers can create members" on public.members;
drop policy if exists "trainers can update members" on public.members;
drop policy if exists "trainers can delete members" on public.members;

drop policy if exists "attendance backend only" on public.attendance;
create policy "attendance backend only"
on public.attendance for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "trainers can read attendance" on public.attendance;
drop policy if exists "trainers can create attendance" on public.attendance;
drop policy if exists "trainers can update attendance" on public.attendance;
drop policy if exists "trainers can delete attendance" on public.attendance;
