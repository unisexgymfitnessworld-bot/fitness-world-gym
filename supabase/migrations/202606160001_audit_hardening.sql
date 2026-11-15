-- Fitness World GymOS — audit hardening (run in Supabase SQL Editor, in order).
-- Safe to re-run (all statements are idempotent).
--
-- BEFORE running section 3, check for duplicates (must return zero rows):
--   select receipt_no, count(*) from public.payment_receipts group by receipt_no having count(*) > 1;
--   select member_id, visit_date, count(*) from public.attendance group by member_id, visit_date having count(*) > 1;
-- If any rows come back, dedupe them first or section 3 will fail safely.

-- ── 1) drop legacy WhatsApp session secrets (Baileys gateway is removed) ──
drop table if exists public.whatsapp_sessions;

-- ── 2) defense-in-depth grants on system_settings ────────────────────────
revoke all on public.system_settings from anon, authenticated;
grant select, insert, update, delete on public.system_settings to service_role;

-- ── 3) money + attendance integrity ──────────────────────────────────────
create unique index if not exists idx_payment_receipts_receipt_no_unique
  on public.payment_receipts (receipt_no);

create unique index if not exists idx_attendance_member_visit_unique
  on public.attendance (member_id, visit_date);
