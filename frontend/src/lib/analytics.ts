import { differenceInCalendarDays, endOfMonth, isWithinInterval, parseISO, startOfMonth, subMonths } from "date-fns";
import type { Member, PaymentReceipt, RenewalHistoryEntry } from "../types";

export type AnalyticsRange = "1m" | "2m" | "all";

/**
 * Days after expiry during which an ended plan still lands in the trainer's
 * follow-up queue. Older balances stay in every money total (nothing owed is
 * ever hidden) — they just stop shouting for a call every single day.
 */
export const COLLECTION_GRACE_DAYS = 30;

export interface PeriodAnalytics {
  label: string;
  memberCount: number;
  activeCount: number;
  newMembers: number;
  renewals: number;
  coupleMembers: number;
  expectedAmount: number;
  collectedAmount: number;
  pendingAmount: number;
  pendingMembers: number;
  agedAmount: number;
  agedMembers: number;
  collectionRate: number;
}

export interface DashboardAnalytics {
  thisMonth: PeriodAnalytics;
  lastTwoMonths: PeriodAnalytics;
  allTime: PeriodAnalytics;
}

function safeAmount(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

function memberTouchesPeriod(member: Member, start: Date, end: Date): boolean {
  try {
    const interval = { start, end };
    return [member.joinDate, member.membershipStart].some((date) => {
      const parsed = parseISO(date);
      return !Number.isNaN(parsed.getTime()) && isWithinInterval(parsed, interval);
    });
  } catch {
    return false;
  }
}

function memberHasMoneyInPeriod(memberId: string, receipts: PaymentReceipt[], renewals: RenewalHistoryEntry[], start: Date, end: Date): boolean {
  const period = { start, end };
  return (
    receipts.some((receipt) => receipt.memberId === memberId && dateInScope(receipt.paidOn, period)) ||
    renewals.some((entry) => entry.memberId === memberId && dateInScope(entry.renewedOn, period))
  );
}

export function splitAmountForCouple(amount: number): [number, number] {
  const normalized = safeAmount(amount);
  const first = Math.ceil(normalized / 2);
  return [first, normalized - first];
}

export function getMemberCollectedAmount(member: Pick<Member, "feesAmount" | "paymentStatus" | "partialPaidAmount" | "advanceAmount" | "totalCollected">): number {
  // Lifetime cash is the anchor when present; otherwise fall back to the
  // cycle snapshot (pre-bucket rows).
  if (typeof member.totalCollected === "number" && member.totalCollected > 0) {
    return safeAmount(member.totalCollected);
  }
  if (member.paymentStatus === "Paid") {
    return safeAmount(member.feesAmount) + safeAmount(member.advanceAmount);
  }
  if (member.paymentStatus === "Partially Paid") {
    return safeAmount(member.partialPaidAmount) + safeAmount(member.advanceAmount);
  }
  return 0;
}

export function getMemberPendingAmount(member: Pick<Member, "feesAmount" | "paymentStatus" | "partialPaidAmount" | "balanceAmount" | "arrearsAmount">): number {
  if (member.paymentStatus === "Pending") {
    return safeAmount(member.feesAmount) + safeAmount(member.arrearsAmount);
  }
  if (member.paymentStatus === "Partially Paid") {
    return (
      safeAmount(member.balanceAmount) ||
      Math.max(0, safeAmount(member.feesAmount) - safeAmount(member.partialPaidAmount)) + safeAmount(member.arrearsAmount)
    );
  }
  return 0;
}

export function isCollectible(member: Pick<Member, "status" | "membershipDue">, now = new Date()): boolean {
  if (member.status === "Active") {
    return true;
  }
  if (member.status !== "Expired") {
    return false;
  }
  const daysSinceDue = differenceInCalendarDays(now, parseISO(member.membershipDue));
  return Number.isFinite(daysSinceDue) && daysSinceDue <= COLLECTION_GRACE_DAYS;
}

export function getCollectiblePendingAmount(
  member: Pick<Member, "status" | "membershipDue" | "feesAmount" | "paymentStatus" | "partialPaidAmount" | "balanceAmount" | "arrearsAmount">,
  now = new Date(),
): number {
  if (!isCollectible(member, now)) {
    return 0;
  }
  return getMemberPendingAmount(member);
}

/**
 * Every rupee the member still owes. Unlike the grace-window collectible
 * figure, this never hides old dues: desk headlines, table chips, and book
 * reports all use it. Removed members are excluded — their rows are out of
 * the gym's books.
 */
export function getTotalPendingAmount(
  member: Pick<Member, "status" | "feesAmount" | "paymentStatus" | "partialPaidAmount" | "balanceAmount" | "arrearsAmount">,
): number {
  if (member.status === "Deleted") {
    return 0;
  }
  return getMemberPendingAmount(member);
}

export function getAgedPendingAmount(
  member: Pick<Member, "status" | "membershipDue" | "feesAmount" | "paymentStatus" | "partialPaidAmount" | "balanceAmount" | "arrearsAmount">,
  now = new Date(),
): number {
  if (member.status === "Deleted") {
    return 0;
  }
  return Math.max(0, getMemberPendingAmount(member) - getCollectiblePendingAmount(member, now));
}

export interface AnalyticsMoneyScope {
  receipts: PaymentReceipt[];
  renewals: RenewalHistoryEntry[];
  /** Null = all time (no date filtering). */
  period: { start: Date; end: Date } | null;
}

function dateInScope(dateText: string, period: { start: Date; end: Date } | null): boolean {
  if (!period) {
    return true;
  }
  try {
    const parsed = parseISO(dateText);
    return !Number.isNaN(parsed.getTime()) && isWithinInterval(parsed, period);
  } catch {
    return false;
  }
}

/**
 * Money truth comes from receipts + renewal history, never from the member
 * row's current cycle alone (a renew used to erase prior-cycle money).
 *
 * - collected = receipts paid in scope + first-cycle cash of members who have
 *   no receipts at all (legacy join payments, attributed to their join month).
 * - expected = renewal totals (fee + carried arrears) in scope + first-cycle
 *   fees: never-renewed members contribute current fees; renewed members
 *   contribute their first renewal's closing fee (old_amount), attributed to
 *   their join month. Renewals recorded before old_amount existed contribute 0
 *   for that first cycle — the only remaining history gap, old data only.
 * - pending/aged stay member-row snapshots: dues are a right-now concept.
 */
export function summarizePeriod(
  label: string,
  members: Member[],
  now = new Date(),
  scope: AnalyticsMoneyScope | null = null,
): PeriodAnalytics {
  const receipts = scope?.receipts ?? [];
  const renewals = scope?.renewals ?? [];
  const period = scope?.period ?? null;
  // Collected and expected must describe the same members, or the rate mixes
  // gym-wide cash with a filtered roster.
  const memberIds = new Set(members.map((member) => member.id));
  const scopedReceipts = receipts.filter((receipt) => memberIds.has(receipt.memberId) && dateInScope(receipt.paidOn, period));
  const scopedRenewals = renewals.filter((entry) => memberIds.has(entry.memberId) && dateInScope(entry.renewedOn, period));
  const renewedIds = new Set(renewals.map((entry) => entry.memberId));
  const receiptedIds = new Set(receipts.map((receipt) => receipt.memberId));
  const firstRenewalByMember = new Map<string, RenewalHistoryEntry>();
  for (const entry of renewals) {
    const prior = firstRenewalByMember.get(entry.memberId);
    if (!prior || entry.renewedOn < prior.renewedOn) {
      firstRenewalByMember.set(entry.memberId, entry);
    }
  }

  const collectedAmount =
    scopedReceipts.reduce((total, receipt) => total + safeAmount(receipt.amount), 0) +
    members
      .filter((member) => !receiptedIds.has(member.id) && dateInScope(member.joinDate, period))
      .reduce((total, member) => total + getMemberCollectedAmount(member), 0);
  const inExpectedFees = (member: Member): boolean => {
    if (period === null) {
      return true;
    }
    return (
      memberTouchesPeriod(member, period.start, period.end) ||
      memberHasMoneyInPeriod(member.id, receipts, renewals, period.start, period.end)
    );
  };
  const expectedAmount =
    scopedRenewals.reduce((total, entry) => total + safeAmount(entry.amount) + safeAmount(entry.arrearsCarried), 0) +
    members
      .filter((member) => !renewedIds.has(member.id) && inExpectedFees(member))
      .reduce((total, member) => total + safeAmount(member.feesAmount), 0) +
    members
      .filter((member) => renewedIds.has(member.id) && dateInScope(member.joinDate, period))
      .reduce((total, member) => total + safeAmount(firstRenewalByMember.get(member.id)?.oldAmount), 0);
  const pendingAmount = members.reduce((total, member) => total + getTotalPendingAmount(member), 0);
  const pendingMembers = members.filter((member) => getTotalPendingAmount(member) > 0).length;
  const agedAmount = members.reduce((total, member) => total + getAgedPendingAmount(member, now), 0);
  const agedMembers = members.filter((member) => getAgedPendingAmount(member, now) > 0).length;

  return {
    label,
    memberCount: members.length,
    activeCount: members.filter((member) => member.status === "Active").length,
    newMembers: period === null ? members.length : members.filter((member) => dateInScope(member.joinDate, period)).length,
    renewals: scopedRenewals.length,
    coupleMembers: members.filter((member) => member.trainingType === "Couple").length,
    expectedAmount,
    collectedAmount,
    pendingAmount,
    pendingMembers,
    agedAmount,
    agedMembers,
    collectionRate: expectedAmount > 0 ? Math.round((collectedAmount / expectedAmount) * 100) : 0,
  };
}

export function getMembersForAnalyticsRange(
  members: Member[],
  range: AnalyticsRange,
  now = new Date(),
  receipts: PaymentReceipt[] = [],
  renewals: RenewalHistoryEntry[] = [],
): Member[] {
  const nonDeleted = members.filter((member) => member.status !== "Deleted");
  if (range === "all") {
    return nonDeleted;
  }

  const currentMonthEnd = endOfMonth(now);
  const periodStart = range === "1m" ? startOfMonth(now) : startOfMonth(subMonths(now, 1));
  return nonDeleted.filter(
    (member) =>
      memberTouchesPeriod(member, periodStart, currentMonthEnd) ||
      memberHasMoneyInPeriod(member.id, receipts, renewals, periodStart, currentMonthEnd),
  );
}

export function summarizeAnalyticsRange(
  members: Member[],
  range: AnalyticsRange,
  now = new Date(),
  receipts: PaymentReceipt[] = [],
  renewals: RenewalHistoryEntry[] = [],
): PeriodAnalytics {
  const label = range === "1m" ? "This Month" : range === "2m" ? "Last 2 Months" : "All Time";
  const filtered = getMembersForAnalyticsRange(members, range, now, receipts, renewals);
  if (range === "all") {
    return summarizePeriod(label, filtered, now, { receipts, renewals, period: null });
  }
  const currentMonthEnd = endOfMonth(now);
  const periodStart = range === "1m" ? startOfMonth(now) : startOfMonth(subMonths(now, 1));
  return summarizePeriod(label, filtered, now, { receipts, renewals, period: { start: periodStart, end: currentMonthEnd } });
}

export function summarizeMemberAnalytics(
  members: Member[],
  now = new Date(),
  receipts: PaymentReceipt[] = [],
  renewals: RenewalHistoryEntry[] = [],
): DashboardAnalytics {
  const nonDeleted = members.filter((member) => member.status !== "Deleted");
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const lastTwoMonthsStart = startOfMonth(subMonths(now, 1));

  const thisMonthMembers = getMembersForAnalyticsRange(nonDeleted, "1m", now, receipts, renewals);
  const lastTwoMonthsMembers = getMembersForAnalyticsRange(nonDeleted, "2m", now, receipts, renewals);

  return {
    thisMonth: summarizePeriod("This Month", thisMonthMembers, now, { receipts, renewals, period: { start: currentMonthStart, end: currentMonthEnd } }),
    lastTwoMonths: summarizePeriod("Last 2 Months", lastTwoMonthsMembers, now, { receipts, renewals, period: { start: lastTwoMonthsStart, end: currentMonthEnd } }),
    allTime: summarizePeriod("All Time", nonDeleted, now, { receipts, renewals, period: null }),
  };
}
