import { format } from "date-fns";
import { HttpError } from "../lib/httpError.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import type { DbMember, DbRenewalHistoryEntry, Member, PaymentStatus, RenewalHistoryEntry } from "../types/index.js";
import { mapRenewalHistory } from "./mappers.js";

interface RecordRenewalHistoryInput {
  oldMember: Member;
  newStartDate: string;
  newDueDate: string;
  amount: number;
  paymentStatus: PaymentStatus;
  ownerUserId?: string | null;
}

export async function listRenewalHistory(memberId: string): Promise<RenewalHistoryEntry[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("renewal_history")
    .select("*")
    .eq("member_id", memberId)
    .order("renewed_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(500, "RENEWAL_HISTORY_LIST_FAILED", error.message);
  }

  return ((data ?? []) as DbRenewalHistoryEntry[]).map(mapRenewalHistory);
}

export async function recordRenewalHistory(input: RecordRenewalHistoryInput): Promise<RenewalHistoryEntry> {
  const { oldMember, newStartDate, newDueDate, amount, paymentStatus, ownerUserId = null } = input;
  const { data, error } = await getSupabaseAdmin()
    .from("renewal_history")
    .insert({
      member_id: oldMember.id,
      owner_user_id: ownerUserId,
      old_plan_type: oldMember.planType,
      new_plan_type: oldMember.planType,
      old_start_date: oldMember.membershipStart,
      old_due_date: oldMember.membershipDue,
      new_start_date: newStartDate,
      new_due_date: newDueDate,
      amount,
      payment_status: paymentStatus,
      renewed_on: format(new Date(), "yyyy-MM-dd"),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new HttpError(500, "RENEWAL_HISTORY_CREATE_FAILED", error?.message ?? "Unable to record renewal history");
  }

  return mapRenewalHistory(data as DbRenewalHistoryEntry);
}

export function memberOwnerUserId(row: DbMember | null | undefined): string | null {
  const owner = (row as DbMember & { owner_user_id?: string | null } | null | undefined)?.owner_user_id;
  return owner ?? null;
}
