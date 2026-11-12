-- Fitness World GymOS — missing migrations + cleanup (November 2026).
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste this whole
-- file → Run. Safe to re-run (all statements are idempotent).
--
-- 1) Creates system_settings (lets the app save SMS credentials from Settings).
-- 2) Adds sms_sent_winback flag (one-time win-back SMS per lapse).
-- 3) Deletes obsolete fast2sms_api_key / sms_provider settings rows.

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
