import { addMonths, format, parseISO } from "date-fns";
import { HttpError } from "../lib/httpError.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import type { DbMember, Member, MemberInput, PaymentStatus, PlanType } from "../types/index.js";
import { mapMember, memberInputToDb } from "./mappers.js";
import { memberOwnerUserId, recordRenewalHistory } from "./renewalService.js";

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

function calculatePlanDueDate(startDate: string, planType: MemberInput["planType"]): string {
  switch (planType) {
    case "1 Month":
      return format(addMonths(parseISO(startDate), 1), "yyyy-MM-dd");
    case "3 Months":
      return format(addMonths(parseISO(startDate), 3), "yyyy-MM-dd");
    case "6 Months":
      return format(addMonths(parseISO(startDate), 6), "yyyy-MM-dd");
    case "1 Year":
      return format(addMonths(parseISO(startDate), 12), "yyyy-MM-dd");
    case "Custom":
      return format(addMonths(parseISO(startDate), 1), "yyyy-MM-dd");
  }
}

function normalizeMembershipDates(input: MemberInput): MemberInput {
  if (input.planType === "Custom") {
    return input;
  }
  return {
    ...input,
    membershipDue: calculatePlanDueDate(input.membershipStart, input.planType),
  };
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

  // Due soon filter (package renewal or custom plan end date in next 3 days)
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
  const { data, error } = await getSupabaseAdmin().from("members").insert(memberInputToDb(normalizeMembershipDates(input))).select("*").single();
  if (error || !data) {
    throw new HttpError(500, "MEMBER_CREATE_FAILED", error?.message ?? "Unable to create member");
  }
  return mapMember(data as DbMember);
}

export async function updateMember(memberId: string, input: MemberInput): Promise<Member> {
  const { data, error } = await getSupabaseAdmin().from("members").update(memberInputToDb(normalizeMembershipDates(input))).eq("id", memberId).select("*").single();
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

export async function renewMember(memberId: string, membershipStart: string, membershipDue: string, feesAmount: number, planType?: PlanType, paymentStatus: PaymentStatus = "Pending", partialPaidAmount: number = 0): Promise<Member> {
  const { data: currentRow, error: currentError } = await getSupabaseAdmin().from("members").select("*").eq("id", memberId).single();
  if (currentError || !currentRow) {
    throw new HttpError(404, "MEMBER_NOT_FOUND", "Member not found");
  }

  const currentMember = mapMember(currentRow as DbMember);
  const newPlan = planType ?? currentMember.planType;

  // Derive partial/balance amounts based on what the trainer actually collected
  let safePartial: number;
  let balanceAmount: number;
  if (paymentStatus === "Paid") {
    safePartial = feesAmount;
    balanceAmount = 0;
  } else if (paymentStatus === "Partially Paid") {
    safePartial = Math.min(Math.max(partialPaidAmount, 0), feesAmount);
    balanceAmount = Math.max(feesAmount - safePartial, 0);
  } else {
    // Pending — no money collected yet
    safePartial = 0;
    balanceAmount = feesAmount;
  }

  await recordRenewalHistory({
    oldMember: currentMember,
    newStartDate: membershipStart,
    newDueDate: membershipDue,
    amount: feesAmount,
    paymentStatus,
    ownerUserId: memberOwnerUserId(currentRow as DbMember),
    newPlanType: newPlan,
  });

  const { data, error } = await getSupabaseAdmin()
    .from("members")
    .update({
      membership_start: membershipStart,
      membership_due: membershipDue,
      fees_amount: feesAmount,
      plan_type: newPlan,
      payment_status: paymentStatus,
      partial_paid_amount: safePartial,
      balance_amount: balanceAmount,
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
  const member = await getMember(memberId);
  const today = format(new Date(), "yyyy-MM-dd");
  const nextStatus = member.status === "Suspended" ? (member.membershipDue < today ? "Expired" : "Active") : "Suspended";
  const { data, error } = await getSupabaseAdmin().from("members").update({ status: nextStatus }).eq("id", memberId).select("*").single();
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
