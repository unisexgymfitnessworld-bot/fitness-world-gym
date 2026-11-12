import { differenceInCalendarDays, endOfMonth, isWithinInterval, parseISO, startOfMonth } from "date-fns";
import type { AttendanceEntry, RenewalHistoryEntry } from "../types";

export interface RenewalHistorySummary {
  count: number;
  latestPlan: string;
  latestRenewedOn: string;
  totalAmount: number;
  pendingAmount: number;
}

export interface ProgressPoint {
  visitDate: string;
  weightKg: number;
}

export interface ProgressInsights {
  points: ProgressPoint[];
  firstWeightKg: number | null;
  latestWeightKg: number | null;
  weightChangeKg: number | null;
}

export interface AttendanceInsights {
  lastVisitDate: string | null;
  visitsThisMonth: number;
  daysSinceLastVisit: number | null;
  statusLabel: "Consistent" | "Needs follow-up" | "Inactive" | "No visits";
}

function safeAmount(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

export function summarizeRenewalHistory(history: RenewalHistoryEntry[]): RenewalHistorySummary {
  const sorted = [...history].sort((a, b) => b.renewedOn.localeCompare(a.renewedOn) || b.createdAt.localeCompare(a.createdAt));
  const latest = sorted[0];

  return {
    count: sorted.length,
    latestPlan: latest?.newPlanType ?? "No renewals",
    latestRenewedOn: latest?.renewedOn ?? "",
    totalAmount: sorted.reduce((sum, entry) => sum + safeAmount(entry.amount), 0),
    pendingAmount: sorted.reduce((sum, entry) => sum + (entry.paymentStatus === "Paid" ? 0 : safeAmount(entry.amount)), 0),
  };
}

export function buildProgressPoints(attendance: AttendanceEntry[], currentWeightKg?: number): ProgressInsights {
  const points = attendance
    .filter((entry): entry is AttendanceEntry & { weightKg: number } => Number.isFinite(entry.weightKg))
    .map((entry) => ({ visitDate: entry.visitDate, weightKg: Number(entry.weightKg) }))
    .sort((a, b) => a.visitDate.localeCompare(b.visitDate));

  if (points.length === 0) {
    const fallbackWeight = Number.isFinite(currentWeightKg) ? Number(currentWeightKg) : null;
    return {
      points: fallbackWeight === null ? [] : [{ visitDate: "", weightKg: fallbackWeight }],
      firstWeightKg: fallbackWeight,
      latestWeightKg: fallbackWeight,
      weightChangeKg: null,
    };
  }

  const first = points[0]?.weightKg ?? null;
  const latest = points.at(-1)?.weightKg ?? null;

  return {
    points,
    firstWeightKg: first,
    latestWeightKg: latest,
    weightChangeKg: first !== null && latest !== null ? Number((latest - first).toFixed(1)) : null,
  };
}

export function buildAttendanceInsights(attendance: AttendanceEntry[], now = new Date()): AttendanceInsights {
  const sorted = [...attendance].sort((a, b) => b.visitDate.localeCompare(a.visitDate));
  const lastVisitDate = sorted[0]?.visitDate ?? null;
  const monthInterval = { start: startOfMonth(now), end: endOfMonth(now) };
  const visitsThisMonth = attendance.filter((entry) => isWithinInterval(parseISO(entry.visitDate), monthInterval)).length;

  if (!lastVisitDate) {
    return {
      lastVisitDate: null,
      visitsThisMonth,
      daysSinceLastVisit: null,
      statusLabel: "No visits",
    };
  }

  const daysSinceLastVisit = differenceInCalendarDays(now, parseISO(lastVisitDate));
  const statusLabel = daysSinceLastVisit <= 3 ? "Consistent" : daysSinceLastVisit <= 7 ? "Needs follow-up" : "Inactive";

  return {
    lastVisitDate,
    visitsThisMonth,
    daysSinceLastVisit,
    statusLabel,
  };
}
