-- Rich email bodies ride on the outbox row so retries re-send the PDF too.
-- Safe to re-run.
alter table public.sms_logs add column if not exists email_html text;
alter table public.sms_logs add column if not exists email_pdf_name text;
