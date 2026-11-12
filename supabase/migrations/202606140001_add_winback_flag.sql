-- One-time win-back reminder flag for long-expired members.
-- The daily SMS job messages Expired members whose plan ended more than
-- 15 days ago and who have never received a win-back, then sets this flag.
-- Renewals reset it so a future lapse can trigger a fresh win-back.
alter table public.members
add column if not exists sms_sent_winback boolean default false;
