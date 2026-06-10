import { HttpError } from "../lib/httpError.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import type { DbMember, DbPaymentReceipt, Member, PaymentReceipt, PaymentReceiptInput, PaymentStatus } from "../types/index.js";
import { getMember } from "./memberService.js";
import { mapMember, mapPaymentReceipt, paymentReceiptInputToDb } from "./mappers.js";

interface PaymentReceiptResult {
  receipt: PaymentReceipt;
  member: Member;
}

function generateReceiptNo(date = new Date()): string {
  const stamp = date.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `FW-R-${stamp}-${suffix}`;
}

async function receiptTotal(memberId: string): Promise<number> {
  const { data, error } = await getSupabaseAdmin().from("payment_receipts").select("amount").eq("member_id", memberId);
  if (error) {
    throw new HttpError(500, "PAYMENT_RECEIPTS_SUM_FAILED", error.message);
  }
  return (data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
}

function nextPaymentStatus(feesAmount: number, collectedAmount: number): PaymentStatus {
  if (feesAmount <= 0 || collectedAmount >= feesAmount) {
    return "Paid";
  }
  return collectedAmount > 0 ? "Partially Paid" : "Pending";
}

async function updateMemberPayment(memberId: string, feesAmount: number, collectedAmount: number): Promise<Member> {
  const safeCollected = Math.min(Math.max(collectedAmount, 0), feesAmount);
  const balanceAmount = Math.max(feesAmount - safeCollected, 0);
  const paymentStatus = nextPaymentStatus(feesAmount, safeCollected);

  const { data, error } = await getSupabaseAdmin()
    .from("members")
    .update({
      partial_paid_amount: safeCollected,
      balance_amount: balanceAmount,
      payment_status: paymentStatus,
    })
    .eq("id", memberId)
    .select("*")
    .single();

  if (error || !data) {
    throw new HttpError(500, "MEMBER_PAYMENT_SYNC_FAILED", error?.message ?? "Unable to sync member payment");
  }
  return mapMember(data as DbMember);
}

export async function listPaymentReceipts(memberId: string): Promise<PaymentReceipt[]> {
  await getMember(memberId);
  const { data, error } = await getSupabaseAdmin()
    .from("payment_receipts")
    .select("*")
    .eq("member_id", memberId)
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(500, "PAYMENT_RECEIPTS_LIST_FAILED", error.message);
  }
  return ((data ?? []) as DbPaymentReceipt[]).map(mapPaymentReceipt);
}

export async function listAllPaymentReceipts(): Promise<PaymentReceipt[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("payment_receipts")
    .select("*")
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(500, "PAYMENT_RECEIPTS_LIST_FAILED", error.message);
  }
  return ((data ?? []) as DbPaymentReceipt[]).map(mapPaymentReceipt);
}

export async function createPaymentReceipt(memberId: string, input: PaymentReceiptInput, ownerUserId: string | null): Promise<PaymentReceiptResult> {
  const member = await getMember(memberId);
  const existingReceiptTotal = await receiptTotal(memberId);
  const legacyCollectedAmount = Math.max(0, Math.min(member.partialPaidAmount - existingReceiptTotal, member.feesAmount));
  const collectedBeforeReceipt = legacyCollectedAmount + existingReceiptTotal;
  const currentBalance = Math.max(member.feesAmount - collectedBeforeReceipt, 0);

  if (member.feesAmount <= 0) {
    throw new HttpError(400, "PAYMENT_NOT_REQUIRED", "This member has no fees to collect");
  }
  if (currentBalance <= 0) {
    throw new HttpError(400, "PAYMENT_ALREADY_SETTLED", "This member has no pending balance");
  }
  if (input.amount > currentBalance) {
    throw new HttpError(400, "PAYMENT_EXCEEDS_BALANCE", `Payment cannot exceed the pending balance of ₹${currentBalance}`);
  }

  const receiptNo = input.receiptNo?.trim() || generateReceiptNo();
  const { data, error } = await getSupabaseAdmin()
    .from("payment_receipts")
    .insert(paymentReceiptInputToDb(memberId, ownerUserId, input, receiptNo))
    .select("*")
    .single();

  if (error || !data) {
    throw new HttpError(500, "PAYMENT_RECEIPT_CREATE_FAILED", error?.message ?? "Unable to create payment receipt");
  }

  const syncedMember = await updateMemberPayment(memberId, member.feesAmount, collectedBeforeReceipt + input.amount);
  return {
    receipt: mapPaymentReceipt(data as DbPaymentReceipt),
    member: syncedMember,
  };
}
