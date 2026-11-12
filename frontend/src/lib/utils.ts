import { addDays, addMonths, differenceInCalendarDays, format, isAfter, isWithinInterval, parseISO } from "date-fns";
import type { Member, MemberInput, MemberStatus, PlanType } from "../types";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function formatDisplayDate(value: string): string {
  try {
    const parsed = parseISO(value);
    if (Number.isNaN(parsed.getTime())) {
      return "—";
    }
    return format(parsed, "dd MMM yyyy");
  } catch {
    return "—";
  }
}

export function displayGoal(member: Pick<Member, "goal" | "goalOther">): string {
  if (member.goal === "Other" && member.goalOther?.trim()) {
    return member.goalOther.trim();
  }
  return member.goal;
}

export function bmiCategory(bmi: number): string {
  if (!Number.isFinite(bmi) || bmi <= 0) {
    return "Not available";
  }
  if (bmi < 18.5) {
    return "Underweight";
  }
  if (bmi < 25) {
    return "Normal";
  }
  if (bmi < 30) {
    return "Overweight";
  }
  return "Obese";
}

export function dueCountdown(member: DueAwareMember): string | null {
  if (isPlanLessThanOneMonth(member)) {
    return null;
  }
  const remaining = daysUntil(member.membershipDue);
  if (remaining < 0) {
    return `Expired ${-remaining} day${-remaining === 1 ? "" : "s"} ago`;
  }
  if (remaining === 0) {
    return "Expires today";
  }
  if (remaining === 1) {
    return "Expires tomorrow";
  }
  return `${remaining} days left`;
}

export function daysUntil(value: string): number {
  return differenceInCalendarDays(parseISO(value), new Date());
}

export function calculateBmi(weightKg: number, heightCm: number): number {
  if (weightKg <= 0 || heightCm <= 0) {
    return 0;
  }
  const heightM = heightCm / 100;
  return Number((weightKg / (heightM * heightM)).toFixed(2));
}

export function calculateDueDate(startDate: string, planType: PlanType): string {
  try {
    const start = parseISO(startDate);
    if (Number.isNaN(start.getTime())) {
      return startDate;
    }
    switch (planType) {
      case "1 Month":
        return format(addMonths(start, 1), "yyyy-MM-dd");
      case "3 Months":
        return format(addMonths(start, 3), "yyyy-MM-dd");
      case "6 Months":
        return format(addMonths(start, 6), "yyyy-MM-dd");
      case "1 Year":
        return format(addMonths(start, 12), "yyyy-MM-dd");
      case "Custom":
        return format(addMonths(start, 1), "yyyy-MM-dd");
    }
  } catch {
    return startDate;
  }
}

export function getMembershipStatus(dueDate: string, paymentStatus?: string): MemberStatus {
  const today = format(new Date(), "yyyy-MM-dd");
  if (dueDate < today) {
    return "Expired";
  }
  if (dueDate === today && (paymentStatus === "Pending" || paymentStatus === "Partially Paid")) {
    return "Expired";
  }
  return "Active";
}

type DueAwareMember = Pick<Member, "membershipStart" | "membershipDue" | "paymentStatus" | "planType" | "status">;

export function isPlanLongTerm(planType: PlanType, membershipStart?: string, membershipDue?: string): boolean {
  if (planType !== "Custom") {
    return getPlanDurationMonths(planType) > 1;
  }
  if (membershipStart && membershipDue) {
    const days = differenceInCalendarDays(parseISO(membershipDue), parseISO(membershipStart));
    return days > 31;
  }
  return false;
}

export function isPlanLessThanOneMonth(member: DueAwareMember): boolean {
  if (member.planType !== "Custom") {
    return false;
  }
  if (member.membershipStart && member.membershipDue) {
    const days = differenceInCalendarDays(parseISO(member.membershipDue), parseISO(member.membershipStart));
    return days < 30;
  }
  return false;
}

export function getMemberActionDueDate(member: DueAwareMember, now = new Date()): string {
  void now;
  return member.membershipDue;
}

export function getMemberDueKind(member: DueAwareMember, now = new Date()): "Renewal" | "Plan End" {
  void now;
  return member.planType === "Custom" ? "Plan End" : "Renewal";
}

export function getMemberDueDatesForMonth(member: DueAwareMember, selectedYear: number, selectedMonth: number): string[] {
  if (isPlanLessThanOneMonth(member)) {
    return [];
  }
  const monthStart = new Date(selectedYear, selectedMonth, 1);
  const monthEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
  const due = parseISO(member.membershipDue);
  return isWithinInterval(due, { start: monthStart, end: monthEnd }) ? [member.membershipDue] : [];
}

export function getDueTone(member: DueAwareMember): "expired" | "due" | "healthy" | "suspended" {
  if (member.status === "Suspended") {
    return "suspended";
  }
  const remaining = daysUntil(member.membershipDue);
  if (remaining < 0) {
    return "expired";
  }
  if (remaining <= 3) {
    return "due";
  }
  return "healthy";
}

export function getPlanDurationMonths(planType: PlanType): number {
  switch (planType) {
    case "1 Month":
      return 1;
    case "3 Months":
      return 3;
    case "6 Months":
      return 6;
    case "1 Year":
      return 12;
    case "Custom":
      return 0; // Needs to be calculated from dates
  }
}

export function getPlanDurationLabel(planType: PlanType): string {
  switch (planType) {
    case "1 Month":
      return "1 calendar month";
    case "3 Months":
      return "3 calendar months";
    case "6 Months":
      return "6 calendar months";
    case "1 Year":
      return "12 calendar months";
    case "Custom":
      return "manual end date";
  }
}

export function createPlanDueSummary(startDate: string, planType: PlanType, customDueDate?: string): string {
  const dueDate = planType === "Custom" && customDueDate ? customDueDate : calculateDueDate(startDate, planType);
  if (planType === "Custom") {
    return `Custom plan uses the manual end date: ${formatDisplayDate(dueDate)}.`;
  }
  return `${planType} plan runs for ${getPlanDurationLabel(planType)} and ends on ${formatDisplayDate(dueDate)}. Payment status tracks the plan fee balance separately.`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPhone(value: string): string {
  return value.replace(/^(\d{5})(\d{5})$/, "$1 $2");
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

export function registrationNumberValue(regNo: string): number {
  const parsed = Number(regNo.replace(/\D/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function compareRegistrationNumbers(a: string, b: string): number {
  const numeric = registrationNumberValue(a) - registrationNumberValue(b);
  return numeric === 0 ? a.localeCompare(b) : numeric;
}

export function createReminderMessage(member: Pick<Member, "name"> & DueAwareMember): string {
  const dueDate = getMemberActionDueDate(member);
  const dueKind = getMemberDueKind(member);
  return `Hi ${member.name}, your Fitness World ${dueKind.toLowerCase()} is on ${formatDisplayDate(dueDate)}. Please renew to continue smoothly. - Fitness World`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function nextRegNo(members: Array<Pick<Member, "regNo">>): string {
  const max = members.reduce((current, member) => {
    const parsed = Number(member.regNo.replace("FW-", ""));
    return Number.isFinite(parsed) ? Math.max(current, parsed) : current;
  }, 0);
  return `FW-${String(max + 1).padStart(3, "0")}`;
}

export function toMember(input: MemberInput, members: Array<Pick<Member, "regNo">>): Member {
  const now = new Date().toISOString();
  return {
    ...input,
    id: crypto.randomUUID(),
    regNo: nextRegNo(members),
    bmi: calculateBmi(input.weightKg, input.heightCm),
    status: getMembershipStatus(input.membershipDue, input.paymentStatus),
    smsSent3days: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function calculateNextRenewalStart(member: DueAwareMember): string {
  const today = todayISO();
  if (member.status === "Active" && member.membershipDue >= today) {
    try {
      const nextDay = addDays(parseISO(member.membershipDue), 1);
      return format(nextDay, "yyyy-MM-dd");
    } catch (err) {
      console.error(err);
    }
  }
  return today;
}
