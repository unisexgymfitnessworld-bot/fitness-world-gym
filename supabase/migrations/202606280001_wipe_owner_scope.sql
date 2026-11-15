-- Wipe-all must never cross workspaces: scope it to one owner.
-- Safe to re-run. A NULL owner refuses instead of wiping everything.
-- The old no-arg signature is dropped so no caller can wipe all owners.
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
