-- Fitness World GymOS — missing migrations + cleanup (November 2026).
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste this whole
-- file → Run. Safe to re-run (all statements are idempotent).
--
-- 1) Creates system_settings (lets the app save SMS credentials from Settings).
-- 2) Adds sms_sent_winback flag (one-time win-back SMS per lapse).
-- 3) Deletes obsolete fast2sms_api_key / sms_provider settings rows.
-- 4) Creates sms_logs (persistent SMS outbox + delivery history for auto-retry).

-- ── 1) system_settings store ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO service_role;

DROP POLICY IF EXISTS "Allow service role full access" ON public.system_settings;
CREATE POLICY "Allow service role full access" ON public.system_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2) one-time win-back flag ────────────────────────────────────────────
alter table public.members
add column if not exists sms_sent_winback boolean default false;

-- ── 3) drop obsolete Fast2SMS / provider-switch settings ─────────────────
DELETE FROM public.system_settings
WHERE key IN ('fast2sms_api_key', 'sms_provider');

-- ── 4) sms_logs outbox + audit log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  phone text NOT NULL,
  message text NOT NULL,
  kind text NOT NULL DEFAULT 'manual'
    CHECK (kind IN ('manual', 'reminder_3day', 'reminder_dueday', 'winback', 'receipt', 'test', 'balance_overdue')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  provider text NOT NULL DEFAULT 'smsgate',
  provider_message_id text,
  smsgate_state text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_error_code text,
  next_retry_at timestamptz,
  sent_at timestamptz,
  on_sent_action text CHECK (on_sent_action IN ('reminder_3day', 'winback')),
  client_request_id text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON public.sms_logs(status);
CREATE INDEX IF NOT EXISTS idx_sms_logs_next_retry ON public.sms_logs(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_sms_logs_member ON public.sms_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_created ON public.sms_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_sms_logs_client_request ON public.sms_logs(client_request_id);

DROP TRIGGER IF EXISTS set_sms_logs_updated_at ON public.sms_logs;
CREATE TRIGGER set_sms_logs_updated_at
BEFORE UPDATE ON public.sms_logs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.sms_logs FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_logs TO service_role;

DROP POLICY IF EXISTS "sms_logs backend only" ON public.sms_logs;
CREATE POLICY "sms_logs backend only"
ON public.sms_logs FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- ── 5) balance_overdue kind (for DBs that ran section 4 before it existed) ──
ALTER TABLE IF EXISTS public.sms_logs DROP CONSTRAINT IF EXISTS sms_logs_kind_check;
ALTER TABLE IF EXISTS public.sms_logs
  ADD CONSTRAINT sms_logs_kind_check
  CHECK (kind IN ('manual', 'reminder_3day', 'reminder_dueday', 'winback', 'receipt', 'test', 'balance_overdue'));

-- ── 6) members.avatar photo column ─────────────────────────────────────────
ALTER TABLE IF EXISTS public.members
  ADD COLUMN IF NOT EXISTS avatar text;

-- ── 7) close anon SELECT on members (defense in depth) ─────────────────────
REVOKE ALL ON public.members FROM anon, authenticated;

-- ── 8) members.email for the email channel ─────────────────────────────────
ALTER TABLE IF EXISTS public.members
  ADD COLUMN IF NOT EXISTS email text;

-- ── 9) purge + wipe-all functions (atomic hard deletes) ────────────────────
CREATE OR REPLACE FUNCTION public.purge_member_data(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_logs integer;
  v_visits integer;
  v_receipts integer;
  v_renewals integer;
BEGIN
  DELETE FROM public.sms_logs WHERE member_id = p_member_id;
  GET DIAGNOSTICS v_logs = ROW_COUNT;
  DELETE FROM public.attendance WHERE member_id = p_member_id;
  GET DIAGNOSTICS v_visits = ROW_COUNT;
  DELETE FROM public.payment_receipts WHERE member_id = p_member_id;
  GET DIAGNOSTICS v_receipts = ROW_COUNT;
  DELETE FROM public.renewal_history WHERE member_id = p_member_id;
  GET DIAGNOSTICS v_renewals = ROW_COUNT;
  DELETE FROM public.members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object(
    'memberId', p_member_id,
    'smsLogs', v_logs,
    'visits', v_visits,
    'receipts', v_receipts,
    'renewals', v_renewals
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.wipe_all_gym_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_logs integer;
  v_visits integer;
  v_receipts integer;
  v_renewals integer;
  v_members integer;
BEGIN
  DELETE FROM public.sms_logs;
  GET DIAGNOSTICS v_logs = ROW_COUNT;
  DELETE FROM public.attendance;
  GET DIAGNOSTICS v_visits = ROW_COUNT;
  DELETE FROM public.payment_receipts;
  GET DIAGNOSTICS v_receipts = ROW_COUNT;
  DELETE FROM public.renewal_history;
  GET DIAGNOSTICS v_renewals = ROW_COUNT;
  DELETE FROM public.members;
  GET DIAGNOSTICS v_members = ROW_COUNT;
  ALTER SEQUENCE IF EXISTS public.members_reg_no_seq RESTART WITH 1;
  RETURN jsonb_build_object(
    'members', v_members,
    'receipts', v_receipts,
    'renewals', v_renewals,
    'visits', v_visits,
    'smsLogs', v_logs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_member_data(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.wipe_all_gym_data() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_member_data(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wipe_all_gym_data() TO service_role;

-- ── 10) money idempotency keys ─────────────────────────────────────────────
ALTER TABLE IF EXISTS public.payment_receipts
  ADD COLUMN IF NOT EXISTS client_request_id text;

ALTER TABLE IF EXISTS public.renewal_history
  ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_receipts_idempotency
  ON public.payment_receipts (member_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_renewal_history_idempotency
  ON public.renewal_history (member_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ── 11) renewal closing-cycle fee (for truthful history stats) ─────────────
ALTER TABLE IF EXISTS public.renewal_history
  ADD COLUMN IF NOT EXISTS old_amount numeric;

-- ── 12) money buckets (arrears + advance + lifetime cash) ────────────────────
ALTER TABLE IF EXISTS public.members
  ADD COLUMN IF NOT EXISTS arrears_amount integer NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.members
  ADD COLUMN IF NOT EXISTS advance_amount integer NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.members
  ADD COLUMN IF NOT EXISTS total_collected integer NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.payment_receipts
  ADD COLUMN IF NOT EXISTS arrears_applied integer;
ALTER TABLE IF EXISTS public.payment_receipts
  ADD COLUMN IF NOT EXISTS cycle_applied integer;
ALTER TABLE IF EXISTS public.payment_receipts
  ADD COLUMN IF NOT EXISTS advance_applied integer;

-- Lifetime cash anchor (rerun-safe: only untouched rows).
WITH receipt_totals AS (
  SELECT member_id, COALESCE(SUM(amount), 0)::int AS total
  FROM public.payment_receipts
  GROUP BY member_id
)
UPDATE public.members m
SET total_collected = GREATEST(COALESCE(r.total, 0), COALESCE(m.partial_paid_amount, 0))
FROM receipt_totals r
WHERE r.member_id = m.id AND m.total_collected = 0;

UPDATE public.members
SET total_collected = GREATEST(COALESCE(partial_paid_amount, 0), 0)
WHERE total_collected = 0;

-- Split merged rows back into buckets (rerun-safe: only still-merged rows).
WITH latest_renewal AS (
  SELECT DISTINCT ON (member_id)
    member_id, amount, arrears_carried
  FROM public.renewal_history
  ORDER BY member_id, renewed_on DESC, created_at DESC
)
UPDATE public.members m
SET
  fees_amount = lr.amount,
  partial_paid_amount = LEAST(GREATEST((m.fees_amount - m.balance_amount) - (m.fees_amount - lr.amount), 0), lr.amount),
  arrears_amount = GREATEST((m.fees_amount - lr.amount) - (m.fees_amount - m.balance_amount), 0)
FROM latest_renewal lr
WHERE lr.member_id = m.id
  AND lr.arrears_carried > 0
  AND m.fees_amount > lr.amount
  AND m.arrears_amount = 0
  AND m.advance_amount = 0;

-- ── 13) early pieces DBs may have skipped (owner, money, ledgers, status) ──
ALTER TABLE IF EXISTS public.members
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_members_owner_user_id ON public.members(owner_user_id);

ALTER TABLE IF EXISTS public.members
  ADD COLUMN IF NOT EXISTS training_type text DEFAULT 'General' NOT NULL,
  ADD COLUMN IF NOT EXISTS address text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS partial_paid_amount numeric DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS balance_amount numeric DEFAULT 0 NOT NULL;
ALTER TABLE IF EXISTS public.members DROP CONSTRAINT IF EXISTS members_training_type_check;
ALTER TABLE IF EXISTS public.members ADD CONSTRAINT members_training_type_check
  CHECK (training_type IN ('Personal', 'General', 'Couple'));
ALTER TABLE IF EXISTS public.members DROP CONSTRAINT IF EXISTS members_payment_status_check;
ALTER TABLE IF EXISTS public.members ADD CONSTRAINT members_payment_status_check
  CHECK (payment_status IN ('Paid', 'Pending', 'Partially Paid'));
ALTER TABLE IF EXISTS public.members DROP CONSTRAINT IF EXISTS members_partial_paid_amount_check;
ALTER TABLE IF EXISTS public.members ADD CONSTRAINT members_partial_paid_amount_check
  CHECK (partial_paid_amount >= 0 AND partial_paid_amount <= fees_amount);
ALTER TABLE IF EXISTS public.members DROP CONSTRAINT IF EXISTS members_balance_amount_check;
ALTER TABLE IF EXISTS public.members ADD CONSTRAINT members_balance_amount_check
  CHECK (balance_amount >= 0);

CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  receipt_no text NOT NULL,
  paid_on date NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Other')),
  note text DEFAULT '' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT payment_receipts_receipt_no_not_blank CHECK (length(trim(receipt_no)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_member ON public.payment_receipts(member_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_owner_date ON public.payment_receipts(owner_user_id, paid_on DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_receipts_owner_receipt_no
  ON public.payment_receipts(owner_user_id, receipt_no) WHERE owner_user_id IS NOT NULL;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.payment_receipts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_receipts TO service_role;
DROP POLICY IF EXISTS "payment receipts backend only" ON public.payment_receipts;
CREATE POLICY "payment receipts backend only" ON public.payment_receipts FOR ALL
TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.renewal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  old_plan_type text NOT NULL CHECK (old_plan_type IN ('1 Month', '3 Months', '6 Months', '1 Year', 'Custom')),
  new_plan_type text NOT NULL CHECK (new_plan_type IN ('1 Month', '3 Months', '6 Months', '1 Year', 'Custom')),
  old_start_date date NOT NULL,
  old_due_date date NOT NULL,
  new_start_date date NOT NULL,
  new_due_date date NOT NULL,
  amount decimal(8,2) NOT NULL CHECK (amount >= 0),
  payment_status text NOT NULL CHECK (payment_status IN ('Paid', 'Pending', 'Partially Paid')),
  renewed_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_renewal_history_member_date ON public.renewal_history(member_id, renewed_on DESC);
CREATE INDEX IF NOT EXISTS idx_renewal_history_owner_date ON public.renewal_history(owner_user_id, renewed_on DESC);
ALTER TABLE public.renewal_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.renewal_history FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.renewal_history TO service_role;
DROP POLICY IF EXISTS "renewal history backend only" ON public.renewal_history;
CREATE POLICY "renewal history backend only" ON public.renewal_history FOR ALL
TO anon, authenticated USING (false) WITH CHECK (false);

ALTER TABLE IF EXISTS public.members DROP CONSTRAINT IF EXISTS members_status_check;
ALTER TABLE IF EXISTS public.members ADD CONSTRAINT members_status_check
  CHECK (status IN ('Active', 'Expired', 'Suspended', 'Deleted'));

DROP TABLE IF EXISTS public.whatsapp_sessions;
REVOKE ALL ON public.system_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_receipts_receipt_no_unique ON public.payment_receipts (receipt_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_member_visit_unique ON public.attendance (member_id, visit_date);

ALTER TABLE IF EXISTS public.renewal_history
  ADD COLUMN IF NOT EXISTS arrears_carried numeric NOT NULL DEFAULT 0;

-- ── 14) statement kind for member dues statements ───────────────────────────
ALTER TABLE IF EXISTS public.sms_logs DROP CONSTRAINT IF EXISTS sms_logs_kind_check;
ALTER TABLE IF EXISTS public.sms_logs
  ADD CONSTRAINT sms_logs_kind_check
  CHECK (kind IN ('manual', 'reminder_3day', 'reminder_dueday', 'winback', 'receipt', 'test', 'balance_overdue', 'statement'));

-- ── 15) member-create idempotency key ───────────────────────────────────────
ALTER TABLE IF EXISTS public.members
  ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_members_idempotency
  ON public.members (owner_user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ── 16) owner-scoped wipe (replaces the wipe-everything version) ────────────
DROP FUNCTION IF EXISTS public.wipe_all_gym_data();

CREATE OR REPLACE FUNCTION public.wipe_all_gym_data(p_owner_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_logs integer;
  v_visits integer;
  v_receipts integer;
  v_renewals integer;
  v_members integer;
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'WIPE_OWNER_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.sms_logs WHERE member_id IN (SELECT id FROM public.members WHERE owner_user_id = p_owner_id);
  GET DIAGNOSTICS v_logs = ROW_COUNT;
  DELETE FROM public.attendance WHERE member_id IN (SELECT id FROM public.members WHERE owner_user_id = p_owner_id);
  GET DIAGNOSTICS v_visits = ROW_COUNT;
  DELETE FROM public.payment_receipts WHERE member_id IN (SELECT id FROM public.members WHERE owner_user_id = p_owner_id);
  GET DIAGNOSTICS v_receipts = ROW_COUNT;
  DELETE FROM public.renewal_history WHERE member_id IN (SELECT id FROM public.members WHERE owner_user_id = p_owner_id);
  GET DIAGNOSTICS v_renewals = ROW_COUNT;
  DELETE FROM public.members WHERE owner_user_id = p_owner_id;
  GET DIAGNOSTICS v_members = ROW_COUNT;
  RETURN jsonb_build_object(
    'members', v_members,
    'receipts', v_receipts,
    'renewals', v_renewals,
    'visits', v_visits,
    'smsLogs', v_logs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wipe_all_gym_data(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wipe_all_gym_data(uuid) TO service_role;

-- ── 17) renew resume columns (collected cash + method) ──────────────────────
ALTER TABLE IF EXISTS public.renewal_history
  ADD COLUMN IF NOT EXISTS collected_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.renewal_history
  ADD COLUMN IF NOT EXISTS collected_method text NOT NULL DEFAULT 'Cash';

-- ── 18) rich email body on the outbox (retries re-send the PDF too) ─────────
ALTER TABLE IF EXISTS public.sms_logs
  ADD COLUMN IF NOT EXISTS email_html text;
ALTER TABLE IF EXISTS public.sms_logs
  ADD COLUMN IF NOT EXISTS email_pdf_name text;
