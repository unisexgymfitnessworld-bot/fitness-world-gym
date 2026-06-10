import { differenceInCalendarDays, parseISO } from "date-fns";
import { getMemberPendingAmount } from "./analytics";
import { daysUntil, formatCurrency, getMemberActionDueDate, isPlanLessThanOneMonth } from "./utils";
import type { AttendanceEntry, Member } from "../types";
import type { MessageTemplateId } from "./messageTemplates";

export type FollowUpKind = "payment" | "partial" | "renewal" | "expired" | "inactive";

export interface FollowUpItem {
  id: string;
  member: Member;
  kind: FollowUpKind;
  title: string;
  detail: string;
  badge: string;
  template: MessageTemplateId;
  priority: number;
}

function lastVisitDate(memberId: string, attendance: AttendanceEntry[]): string | null {
  return attendance
    .filter((entry) => entry.memberId === memberId)
    .map((entry) => entry.visitDate)
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
}

export function buildTodayFollowUps(members: Member[], attendance: AttendanceEntry[], now = new Date()): FollowUpItem[] {
  const items = members
    .map((member): FollowUpItem | null => {
      const dueDate = getMemberActionDueDate(member);
      const dueInDays = daysUntil(dueDate);
      const pendingAmount = getMemberPendingAmount(member);
      const isShortTerm = isPlanLessThanOneMonth(member);

      if (member.status === "Expired") {
        if (isShortTerm) return null;
        return {
          id: `${member.id}-expired`,
          member,
          kind: "expired",
          title: "Expired plan",
          detail: "Renewal call needed before training continues.",
          badge: "Expired",
          template: "expired-plan",
          priority: 1,
        };
      }

      if (member.paymentStatus === "Partially Paid" && pendingAmount > 0) {
        return {
          id: `${member.id}-partial`,
          member,
          kind: "partial",
          title: "Partial balance",
          detail: `${formatCurrency(pendingAmount)} pending collection.`,
          badge: "Collect",
          template: "partial-payment",
          priority: 2,
        };
      }

      if (member.paymentStatus === "Pending" && pendingAmount > 0) {
        return {
          id: `${member.id}-payment`,
          member,
          kind: "payment",
          title: "Payment pending",
          detail: `${formatCurrency(pendingAmount)} fee not collected.`,
          badge: "Fees",
          template: "pending-payment",
          priority: 3,
        };
      }

      if (member.status === "Active" && dueInDays >= 0 && dueInDays <= 3) {
        if (isShortTerm) return null;
        return {
          id: `${member.id}-renewal`,
          member,
          kind: "renewal",
          title: "Renewal due soon",
          detail: dueInDays === 0 ? "Renewal is due today." : `Renewal due in ${dueInDays} days.`,
          badge: `${dueInDays}d`,
          template: "renewal-due",
          priority: 4,
        };
      }

      const lastVisit = lastVisitDate(member.id, attendance);
      const inactiveDays = lastVisit ? differenceInCalendarDays(now, parseISO(lastVisit)) : null;
      if (member.status === "Active" && inactiveDays !== null && inactiveDays >= 7) {
        return {
          id: `${member.id}-inactive`,
          member,
          kind: "inactive",
          title: "No recent check-in",
          detail: `${inactiveDays} days since last visit.`,
          badge: "Inactive",
          template: "inactive-member",
          priority: 5,
        };
      }

      return null;
    })
    .filter((item): item is FollowUpItem => item !== null);

  return items.sort((a, b) => a.priority - b.priority || a.member.regNo.localeCompare(b.member.regNo));
}
