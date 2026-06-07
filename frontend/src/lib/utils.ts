import { addDays, addMonths, differenceInCalendarDays, format, isAfter, parseISO } from "date-fns";
import type { Member, MemberInput, MemberStatus, PlanType } from "../types";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function formatDisplayDate(value: string): string {
  return format(parseISO(value), "dd MMM yyyy");
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
  const start = parseISO(startDate);
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
}

export function getMembershipStatus(dueDate: string): MemberStatus {
  return isAfter(parseISO(dueDate), addDays(new Date(), -1)) ? "Active" : "Expired";
}

export function getDueTone(member: Pick<Member, "membershipDue" | "status">): "expired" | "due" | "healthy" | "suspended" {
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

export function createWhatsAppLink(member: Pick<Member, "name" | "phone" | "membershipDue">): string {
  const text = `Hi ${member.name}, your Fitness World membership update is ready. Due date: ${formatDisplayDate(member.membershipDue)}. - Fitness World`;
  return `https://wa.me/91${member.phone}?text=${encodeURIComponent(text)}`;
}

export function createReminderMessage(member: Pick<Member, "name" | "membershipDue">): string {
  return `Hi ${member.name}, your Fitness World membership expires in 3 days on ${formatDisplayDate(member.membershipDue)}. Please renew to continue. - Fitness World`;
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
    status: getMembershipStatus(input.membershipDue),
    smsSent3days: false,
    createdAt: now,
    updatedAt: now,
  };
}
