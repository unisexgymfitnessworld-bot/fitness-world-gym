import { format } from "date-fns";
import { HttpError } from "../lib/httpError.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import type { DbMember, Member, MemberInput, PaymentStatus } from "../types/index.js";
import { mapMember, memberInputToDb } from "./mappers.js";

interface ListMembersOptions {
  search?: string;
  status?: string;
  goal?: string;
  payment?: string;
  dueSoon?: boolean;
  sort?: string;
  page?: number;
  limit?: number;
}

export async function listMembers(options: ListMembersOptions = {}): Promise<Member[]> {
  let query = getSupabaseAdmin().from("members").select("*");

  // Search filter
  if (options.search) {
    const searchVal = options.search.trim();
    query = query.or(`name.ilike.%${searchVal}%,phone.ilike.%${searchVal}%,reg_no.ilike.%${searchVal}%`);
  }

  // Status filter
  if (options.status && options.status !== "All") {
    query = query.eq("status", options.status);
  }

  // Goal filter
  if (options.goal && options.goal !== "All Goals") {
    query = query.eq("goal", options.goal);
  }

  // Payment status filter
  if (options.payment && options.payment !== "All Payments") {
    query = query.eq("payment_status", options.payment);
  }

  // Due soon filter (membership due in next 3 days)
  if (options.dueSoon) {
    const today = format(new Date(), "yyyy-MM-dd");
    const targetDate = format(new Date(Date.now() + 3 * 86_400_000), "yyyy-MM-dd");
    query = query.eq("status", "Active").gte("membership_due", today).lte("membership_due", targetDate);
  }

  // Sorting
  if (options.sort) {
    const parts = options.sort.split(":");
    const column = parts[0];
    const direction = parts[1];
    if (column) {
      const asc = direction === "desc" ? false : true;
      query = query.order(column, { ascending: asc });
    }
  } else {
    query = query.order("created_at", { ascending: false });
  }

  // Pagination
  if (options.page !== undefined && options.limit !== undefined) {
    const from = (options.page - 1) * options.limit;
    const to = from + options.limit - 1;
    query = query.range(from, to);
  }

  const { data, error } = await query;
  if (error) {
    throw new HttpError(500, "MEMBERS_LIST_FAILED", error.message);
  }
  return ((data ?? []) as DbMember[]).map(mapMember);
}

export async function autoExpireMembers(): Promise<number> {
  const today = format(new Date(), "yyyy-MM-dd");
  const { data, error } = await getSupabaseAdmin()
    .from("members")
    .update({ status: "Expired" })
    .eq("status", "Active")
    .lt("membership_due", today)
    .select("*");

  if (error) {
    throw new HttpError(500, "AUTO_EXPIRE_FAILED", error.message);
  }
  return data ? data.length : 0;
}

export async function getMember(memberId: string): Promise<Member> {
  const { data, error } = await getSupabaseAdmin().from("members").select("*").eq("id", memberId).single();
  if (error || !data) {
    throw new HttpError(404, "MEMBER_NOT_FOUND", "Member not found");
  }
  return mapMember(data as DbMember);
}

export async function createMember(input: MemberInput): Promise<Member> {
  const { data, error } = await getSupabaseAdmin().from("members").insert(memberInputToDb(input)).select("*").single();
  if (error || !data) {
    throw new HttpError(500, "MEMBER_CREATE_FAILED", error?.message ?? "Unable to create member");
  }
  return mapMember(data as DbMember);
}

export async function updateMember(memberId: string, input: MemberInput): Promise<Member> {
  const { data, error } = await getSupabaseAdmin().from("members").update(memberInputToDb(input)).eq("id", memberId).select("*").single();
  if (error || !data) {
    throw new HttpError(500, "MEMBER_UPDATE_FAILED", error?.message ?? "Unable to update member");
  }
  return mapMember(data as DbMember);
}

export async function updatePayment(memberId: string, paymentStatus: PaymentStatus): Promise<Member> {
  const { data, error } = await getSupabaseAdmin().from("members").update({ payment_status: paymentStatus }).eq("id", memberId).select("*").single();
  if (error || !data) {
    throw new HttpError(500, "PAYMENT_UPDATE_FAILED", error?.message ?? "Unable to update payment");
  }
  return mapMember(data as DbMember);
}

export async function renewMember(memberId: string, membershipStart: string, membershipDue: string, feesAmount: number): Promise<Member> {
  const { data, error } = await getSupabaseAdmin()
    .from("members")
    .update({
      membership_start: membershipStart,
      membership_due: membershipDue,
      fees_amount: feesAmount,
      payment_status: "Paid",
      status: "Active",
      sms_sent_3days: false,
    })
    .eq("id", memberId)
    .select("*")
    .single();

  if (error || !data) {
    throw new HttpError(500, "MEMBER_RENEW_FAILED", error?.message ?? "Unable to renew member");
  }
  return mapMember(data as DbMember);
}

export async function suspendMember(memberId: string): Promise<Member> {
  const { data, error } = await getSupabaseAdmin().from("members").update({ status: "Suspended" }).eq("id", memberId).select("*").single();
  if (error || !data) {
    throw new HttpError(500, "MEMBER_SUSPEND_FAILED", error?.message ?? "Unable to suspend member");
  }
  return mapMember(data as DbMember);
}

export async function membersDueInThreeDays(): Promise<Member[]> {
  const targetDate = format(new Date(Date.now() + 3 * 86_400_000), "yyyy-MM-dd");
  const { data, error } = await getSupabaseAdmin()
    .from("members")
    .select("*")
    .eq("membership_due", targetDate)
    .eq("sms_sent_3days", false)
    .eq("status", "Active");

  if (error) {
    throw new HttpError(500, "DUE_MEMBER_QUERY_FAILED", error.message);
  }
  return ((data ?? []) as DbMember[]).map(mapMember);
}

export async function markReminderSent(memberId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("members").update({ sms_sent_3days: true }).eq("id", memberId);
  if (error) {
    throw new HttpError(500, "SMS_MARK_SENT_FAILED", error.message);
  }
}
