create table if not exists public.renewal_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  old_plan_type text not null check (old_plan_type in ('1 Month', '3 Months', '6 Months', '1 Year', 'Custom')),
  new_plan_type text not null check (new_plan_type in ('1 Month', '3 Months', '6 Months', '1 Year', 'Custom')),
  old_start_date date not null,
  old_due_date date not null,
  new_start_date date not null,
  new_due_date date not null,
  amount decimal(8,2) not null check (amount >= 0),
  payment_status text not null check (payment_status in ('Paid', 'Pending', 'Partially Paid')),
  renewed_on date not null default current_date,
  created_at timestamptz default now()
);

create index if not exists idx_renewal_history_member_date
  on public.renewal_history(member_id, renewed_on desc);

create index if not exists idx_renewal_history_owner_date
  on public.renewal_history(owner_user_id, renewed_on desc);

alter table public.renewal_history enable row level security;

revoke all privileges on table public.renewal_history from anon, authenticated;
grant select, insert, update, delete on public.renewal_history to service_role;

drop policy if exists "renewal history backend only" on public.renewal_history;
create policy "renewal history backend only"
on public.renewal_history for all
to anon, authenticated
using (false)
with check (false);

comment on table public.renewal_history is 'Immutable-style ledger of member plan renewals for trainer reports and audits. Access is through the backend service role only.';
comment on column public.renewal_history.renewed_on is 'Business date when the renewal was recorded.';
