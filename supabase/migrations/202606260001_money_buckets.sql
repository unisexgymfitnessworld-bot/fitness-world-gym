-- Money buckets: arrears + current cycle + advance credit, never merged.
-- Backfills legacy merged rows using each member's latest renewal fee as the
-- true cycle fee (oldest-first attribution, same rule as lib/money.ts).

alter table members add column if not exists arrears_amount integer not null default 0;
alter table members add column if not exists advance_amount integer not null default 0;
alter table members add column if not exists total_collected integer not null default 0;

-- Nullable: NULL = unknown (pre-bucket receipt), values = oldest-first lines.
alter table payment_receipts add column if not exists arrears_applied integer;
alter table payment_receipts add column if not exists cycle_applied integer;
alter table payment_receipts add column if not exists advance_applied integer;

-- Lifetime cash anchor: receipts win, else the row's paid figure (avoids
-- double-counting cash recorded in both places).
with receipt_totals as (
  select member_id, coalesce(sum(amount), 0)::int as total
  from payment_receipts
  group by member_id
)
update members m
set total_collected = greatest(coalesce(r.total, 0), coalesce(m.partial_paid_amount, 0))
from receipt_totals r
where r.member_id = m.id and m.total_collected = 0;

update members
set total_collected = greatest(coalesce(partial_paid_amount, 0), 0)
where total_collected = 0;

-- Split merged rows (renewed with carried arrears): fees back to the true
-- cycle fee, remainder into arrears oldest-first. Balance is preserved.
-- Rerun-safe: only rows that still look merged are touched.
with latest_renewal as (
  select distinct on (member_id)
    member_id, amount, arrears_carried
  from renewal_history
  order by member_id, renewed_on desc, created_at desc
)
update members m
set
  fees_amount = lr.amount,
  partial_paid_amount = least(greatest((m.fees_amount - m.balance_amount) - (m.fees_amount - lr.amount), 0), lr.amount),
  arrears_amount = greatest((m.fees_amount - lr.amount) - (m.fees_amount - m.balance_amount), 0)
from latest_renewal lr
where lr.member_id = m.id
  and lr.arrears_carried > 0
  and m.fees_amount > lr.amount
  and m.arrears_amount = 0
  and m.advance_amount = 0;
