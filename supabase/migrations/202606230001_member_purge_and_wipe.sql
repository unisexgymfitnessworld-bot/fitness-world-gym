-- Hard-delete helpers: per-member purge + full gym reset.
--
-- Both run as single transactions (no partial wipes). service_role only —
-- revoked from anon/authenticated. Settings/credentials are NEVER touched:
-- a wipe resets business data, not configuration.
create or replace function public.purge_member_data(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_logs integer;
  v_visits integer;
  v_receipts integer;
  v_renewals integer;
begin
  delete from public.sms_logs where member_id = p_member_id;
  get diagnostics v_logs = row_count;
  delete from public.attendance where member_id = p_member_id;
  get diagnostics v_visits = row_count;
  delete from public.payment_receipts where member_id = p_member_id;
  get diagnostics v_receipts = row_count;
  delete from public.renewal_history where member_id = p_member_id;
  get diagnostics v_renewals = row_count;
  delete from public.members where id = p_member_id;
  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'memberId', p_member_id,
    'smsLogs', v_logs,
    'visits', v_visits,
    'receipts', v_receipts,
    'renewals', v_renewals
  );
end;
$$;

create or replace function public.wipe_all_gym_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_logs integer;
  v_visits integer;
  v_receipts integer;
  v_renewals integer;
  v_members integer;
begin
  delete from public.sms_logs;
  get diagnostics v_logs = row_count;
  delete from public.attendance;
  get diagnostics v_visits = row_count;
  delete from public.payment_receipts;
  get diagnostics v_receipts = row_count;
  delete from public.renewal_history;
  get diagnostics v_renewals = row_count;
  delete from public.members;
  get diagnostics v_members = row_count;
  alter sequence if exists public.members_reg_no_seq restart with 1;
  return jsonb_build_object(
    'members', v_members,
    'receipts', v_receipts,
    'renewals', v_renewals,
    'visits', v_visits,
    'smsLogs', v_logs
  );
end;
$$;

revoke all on function public.purge_member_data(uuid) from anon, authenticated;
revoke all on function public.wipe_all_gym_data() from anon, authenticated;
grant execute on function public.purge_member_data(uuid) to service_role;
grant execute on function public.wipe_all_gym_data() to service_role;
