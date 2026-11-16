/**
 * Gym money buckets — the single source of truth for dues math.
 *
 * A member's money is THREE buckets that are never merged:
 * - arrears: unpaid amounts from closed periods (old dues).
 * - current cycle: feesAmount minus partialPaidAmount (this period only).
 * - advance: credit paid ahead (applies to future cycles at renew).
 *
 * Rules: payments allocate oldest-first (arrears → cycle → advance);
 * renew closes the cycle (unpaid cycle due rolls into arrears) and applies
 * advance credit to the new fee. Mirrored in workers/gymos-api/src/index.js —
 * keep both in sync (see money.test.ts + worker probes).
 */

export interface MoneyBuckets {
  feesAmount: number;
  partialPaidAmount: number;
  arrearsAmount: number;
  advanceAmount: number;
}

export interface PaymentAllocation {
  arrearsApplied: number;
  cycleApplied: number;
  advanceApplied: number;
  total: number;
}

export function safeMoney(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

/** Still owed on the current cycle (never negative). */
export function cycleDue(buckets: Pick<MoneyBuckets, "feesAmount" | "partialPaidAmount">): number {
  return Math.max(safeMoney(buckets.feesAmount) - safeMoney(buckets.partialPaidAmount), 0);
}

/** Total still owed: arrears + current cycle due. Advance is credit, not debt. */
export function totalBalance(buckets: Pick<MoneyBuckets, "feesAmount" | "partialPaidAmount" | "arrearsAmount">): number {
  return safeMoney(buckets.arrearsAmount) + cycleDue(buckets);
}

/**
 * Split a payment oldest-first: arrears, then current cycle, then advance.
 * `cycleFee`/`cyclePaid` describe the cycle the payment lands on.
 */
export function allocatePayment(
  arrears: number,
  cycleFee: number,
  cyclePaid: number,
  amount: number,
): PaymentAllocation {
  let rest = safeMoney(amount);
  const arrearsApplied = Math.min(safeMoney(arrears), rest);
  rest -= arrearsApplied;
  const cycleOpen = Math.max(safeMoney(cycleFee) - safeMoney(cyclePaid), 0);
  const cycleApplied = Math.min(cycleOpen, rest);
  rest -= cycleApplied;
  return { arrearsApplied, cycleApplied, advanceApplied: rest, total: safeMoney(amount) };
}

export interface AppliedBuckets {
  partialPaidAmount: number;
  arrearsAmount: number;
  advanceAmount: number;
  balanceAmount: number;
  totalCollected: number;
}

/** Apply an allocation to plain (non-renew) buckets. */
export function applyAllocation(
  buckets: MoneyBuckets,
  allocation: PaymentAllocation,
  totalCollectedBefore: number,
): AppliedBuckets {
  const arrearsAmount = Math.max(safeMoney(buckets.arrearsAmount) - allocation.arrearsApplied, 0);
  const partialPaidAmount = safeMoney(buckets.partialPaidAmount) + allocation.cycleApplied;
  const advanceAmount = safeMoney(buckets.advanceAmount) + allocation.advanceApplied;
  const balanceAmount = arrearsAmount + Math.max(safeMoney(buckets.feesAmount) - partialPaidAmount, 0);
  return {
    partialPaidAmount,
    arrearsAmount,
    advanceAmount,
    balanceAmount,
    totalCollected: safeMoney(totalCollectedBefore) + allocation.total,
  };
}

export interface ReceiptApplied {
  arrearsApplied?: number;
  cycleApplied?: number;
  advanceApplied?: number;
  amount: number;
}

/**
 * Exact inverse of applyAllocation for deleting a wrong bill: arrears reopen,
 * cycle/advance/total decrease. Pre-bucket receipts stored no split, so the
 * whole amount reverses from the cycle. Reversing a bill whose money was
 * later consumed by a renewal is approximate by design (floors at zero).
 */
export function reverseAllocation(
  buckets: MoneyBuckets,
  applied: ReceiptApplied,
  totalCollectedBefore: number,
): AppliedBuckets {
  const cycle = applied.cycleApplied ?? applied.amount;
  const arrearsAmount = safeMoney(buckets.arrearsAmount) + safeMoney(applied.arrearsApplied);
  const partialPaidAmount = Math.max(safeMoney(buckets.partialPaidAmount) - safeMoney(cycle), 0);
  const advanceAmount = Math.max(safeMoney(buckets.advanceAmount) - safeMoney(applied.advanceApplied), 0);
  const balanceAmount = arrearsAmount + Math.max(safeMoney(buckets.feesAmount) - partialPaidAmount, 0);
  return {
    partialPaidAmount,
    arrearsAmount,
    advanceAmount,
    balanceAmount,
    totalCollected: Math.max(safeMoney(totalCollectedBefore) - safeMoney(applied.amount), 0),
  };
}

export type SimplePaymentStatus = "Paid" | "Pending" | "Partially Paid";

export function statusFromBuckets(
  buckets: Pick<MoneyBuckets, "feesAmount" | "partialPaidAmount" | "arrearsAmount" | "advanceAmount">,
): SimplePaymentStatus {
  if (totalBalance(buckets) <= 0) {
    return "Paid";
  }
  const paidSomething =
    safeMoney(buckets.partialPaidAmount) > 0 || safeMoney(buckets.advanceAmount) > 0;
  return paidSomething ? "Partially Paid" : "Pending";
}

export interface RenewalResult extends AppliedBuckets {
  feesAmount: number;
  paymentStatus: SimplePaymentStatus;
  /** Arrears figure shown on the renewal (old dues closed into the bucket). */
  arrearsClosed: number;
  /** Advance credit consumed against the new fee. */
  creditUsed: number;
  allocation: PaymentAllocation;
}

/**
 * Renew into a new cycle. The unpaid part of the closing cycle rolls into
 * arrears; existing advance credit offsets the new fee first; the collected
 * amount then allocates oldest-first (arrears → new cycle → advance).
 */
export function applyRenewal(
  buckets: MoneyBuckets,
  newFees: number,
  collected: number,
  totalCollectedBefore: number,
): RenewalResult {
  const fees = safeMoney(newFees);
  const closingDue = cycleDue(buckets);
  const arrearsClosed = safeMoney(buckets.arrearsAmount) + closingDue;
  // Advance credit offsets the new fee before any fresh cash.
  const creditUsed = Math.min(safeMoney(buckets.advanceAmount), fees);
  const cyclePaidFromCredit = creditUsed;
  const allocation = allocatePayment(arrearsClosed, fees, cyclePaidFromCredit, collected);
  const arrearsAmount = Math.max(arrearsClosed - allocation.arrearsApplied, 0);
  const partialPaidAmount = cyclePaidFromCredit + allocation.cycleApplied;
  const advanceAmount =
    safeMoney(buckets.advanceAmount) - creditUsed + allocation.advanceApplied;
  const balanceAmount = arrearsAmount + Math.max(fees - partialPaidAmount, 0);
  const next: MoneyBuckets = { feesAmount: fees, partialPaidAmount, arrearsAmount, advanceAmount };
  return {
    feesAmount: fees,
    partialPaidAmount,
    arrearsAmount,
    advanceAmount,
    balanceAmount,
    totalCollected: safeMoney(totalCollectedBefore) + allocation.total,
    paymentStatus: statusFromBuckets(next),
    arrearsClosed,
    creditUsed,
    allocation,
  };
}

/**
 * Split a legacy MERGED balance (fees held old+new as one number) back into
 * buckets, given the true new-cycle fee from renewal history. Assumes past
 * payments hit oldest-first — the same rule going forward.
 */
export function splitMergedBalance(
  mergedFees: number,
  balance: number,
  trueNewFees: number,
): { feesAmount: number; partialPaidAmount: number; arrearsAmount: number } {
  const fees = safeMoney(trueNewFees);
  const merged = safeMoney(mergedFees);
  // Balance is authoritative: effective paid = merged total minus balance.
  const paidEffective = Math.max(merged - safeMoney(balance), 0);
  const trueArrears = Math.max(merged - fees, 0);
  const arrearsAmount = Math.max(trueArrears - paidEffective, 0);
  const partialPaidAmount = Math.min(Math.max(paidEffective - trueArrears, 0), fees);
  return { feesAmount: fees, partialPaidAmount, arrearsAmount };
}

/** Human receipt lines shared by print, SMS, WhatsApp and email. */
export function receiptLines(allocation: PaymentAllocation): string[] {
  const lines: string[] = [];
  if (allocation.arrearsApplied > 0) {
    lines.push(`Old pending: Rs.${allocation.arrearsApplied}`);
  }
  if (allocation.cycleApplied > 0) {
    lines.push(`This plan: Rs.${allocation.cycleApplied}`);
  }
  if (allocation.advanceApplied > 0) {
    lines.push(`Extra paid: Rs.${allocation.advanceApplied}`);
  }
  lines.push(`Total: Rs.${allocation.total}`);
  return lines;
}
