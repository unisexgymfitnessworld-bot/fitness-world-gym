import { endOfMonth, isWithinInterval, parseISO, startOfMonth, subMonths } from "date-fns";
import type { Member } from "../types";

export type AnalyticsRange = "1m" | "2m" | "all";

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
  const interval = { start, end };
  return [member.joinDate, member.membershipStart].some((date) => isWithinInterval(parseISO(date), interval));
}

export function splitAmountForCouple(amount: number): [number, number] {
  const normalized = safeAmount(amount);
  const first = Math.ceil(normalized / 2);
  return [first, normalized - first];
}

export function getMemberCollectedAmount(member: Pick<Member, "feesAmount" | "paymentStatus" | "partialPaidAmount">): number {
  if (member.paymentStatus === "Paid") {
    return safeAmount(member.feesAmount);
  }
  if (member.paymentStatus === "Partially Paid") {
    return safeAmount(member.partialPaidAmount);
  }
  return 0;
}

export function getMemberPendingAmount(member: Pick<Member, "feesAmount" | "paymentStatus" | "partialPaidAmount" | "balanceAmount">): number {
  if (member.paymentStatus === "Pending") {
    return safeAmount(member.feesAmount);
  }
  if (member.paymentStatus === "Partially Paid") {
    return safeAmount(member.balanceAmount) || Math.max(0, safeAmount(member.feesAmount) - safeAmount(member.partialPaidAmount));
  }
  return 0;
}

export function summarizePeriod(label: string, members: Member[]): PeriodAnalytics {
  const expectedAmount = members.reduce((total, member) => total + safeAmount(member.feesAmount), 0);
  const collectedAmount = members.reduce((total, member) => total + getMemberCollectedAmount(member), 0);
  const pendingAmount = members.reduce((total, member) => total + getMemberPendingAmount(member), 0);
  const pendingMembers = members.filter((member) => getMemberPendingAmount(member) > 0).length;

  return {
    label,
    memberCount: members.length,
    activeCount: members.filter((member) => member.status === "Active").length,
    newMembers: members.filter((member) => member.joinDate === member.membershipStart).length,
    renewals: members.filter((member) => member.joinDate !== member.membershipStart).length,
    coupleMembers: members.filter((member) => member.trainingType === "Couple").length,
    expectedAmount,
    collectedAmount,
    pendingAmount,
    pendingMembers,
    collectionRate: expectedAmount > 0 ? Math.round((collectedAmount / expectedAmount) * 100) : 0,
  };
}

export function getMembersForAnalyticsRange(members: Member[], range: AnalyticsRange, now = new Date()): Member[] {
  const nonDeleted = members.filter((member) => member.status !== "Deleted");
  if (range === "all") {
    return nonDeleted;
  }

  const currentMonthEnd = endOfMonth(now);
  const periodStart = range === "1m" ? startOfMonth(now) : startOfMonth(subMonths(now, 1));
  return nonDeleted.filter((member) => memberTouchesPeriod(member, periodStart, currentMonthEnd));
}

export function summarizeAnalyticsRange(members: Member[], range: AnalyticsRange, now = new Date()): PeriodAnalytics {
  const label = range === "1m" ? "This Month" : range === "2m" ? "Last 2 Months" : "All Time";
  return summarizePeriod(label, getMembersForAnalyticsRange(members, range, now));
}

export function summarizeMemberAnalytics(members: Member[], now = new Date()): DashboardAnalytics {
  const nonDeleted = members.filter((member) => member.status !== "Deleted");
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const lastTwoMonthsStart = startOfMonth(subMonths(now, 1));

  const thisMonthMembers = nonDeleted.filter((member) => memberTouchesPeriod(member, currentMonthStart, currentMonthEnd));
  const lastTwoMonthsMembers = nonDeleted.filter((member) => memberTouchesPeriod(member, lastTwoMonthsStart, currentMonthEnd));

  return {
    thisMonth: summarizePeriod("This Month", thisMonthMembers),
    lastTwoMonths: summarizePeriod("Last 2 Months", lastTwoMonthsMembers),
    allTime: summarizePeriod("All Time", nonDeleted),
  };
}
