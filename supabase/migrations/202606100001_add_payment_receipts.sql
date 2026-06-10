create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  receipt_no text not null,
  paid_on date not null,
  amount numeric(10,2) not null check (amount > 0),
  method text not null check (method in ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Other')),
  note text default '' not null,
  created_at timestamptz default now() not null,
  constraint payment_receipts_receipt_no_not_blank check (length(trim(receipt_no)) > 0)
);

create index if not exists idx_payment_receipts_member
  on public.payment_receipts(member_id, paid_on desc);

create index if not exists idx_payment_receipts_owner_date
  on public.payment_receipts(owner_user_id, paid_on desc);

create unique index if not exists idx_payment_receipts_owner_receipt_no
  on public.payment_receipts(owner_user_id, receipt_no)
  where owner_user_id is not null;

alter table public.payment_receipts enable row level security;

revoke all privileges on table public.payment_receipts from anon, authenticated;
grant select, insert, update, delete on public.payment_receipts to service_role;

drop policy if exists "payment receipts backend only" on public.payment_receipts;
create policy "payment receipts backend only"
on public.payment_receipts for all
to anon, authenticated
using (false)
with check (false);

comment on table public.payment_receipts is 'Receipt ledger for member payment collections. Access is through the backend service role only.';
comment on column public.payment_receipts.owner_user_id is 'Supabase Auth user that owns this receipt, matching the member workspace owner.';
