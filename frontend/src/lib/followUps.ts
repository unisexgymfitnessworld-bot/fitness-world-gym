import { differenceInCalendarDays, parseISO } from "date-fns";
import { getCollectiblePendingAmount, isCollectible } from "./analytics";
import { daysUntil, formatCurrency, getMemberActionDueDate } from "./utils";
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
      if (member.status === "Deleted") {
        return null;
      }
      const dueDate = getMemberActionDueDate(member);
      const dueInDays = daysUntil(dueDate);
      const pendingAmount = getCollectiblePendingAmount(member, now);

      if (member.status === "Expired") {
        if (!isCollectible(member, now)) return null;
        return {
          id: `${member.id}-expired`,
          member,
          kind: "expired",
          title: "Plan ended",
          detail: "Call and renew before they train again.",
          badge: "Ended",
          template: "expired-plan",
          priority: 1,
        };
      }

      if (member.paymentStatus === "Partially Paid" && pendingAmount > 0) {
        return {
          id: `${member.id}-partial`,
          member,
          kind: "partial",
          title: "Half-paid fees",
          detail: `Still to get ${formatCurrency(pendingAmount)}.`,
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
          title: "Fees not paid",
          detail: `Collect ${formatCurrency(pendingAmount)}.`,
          badge: "Fees",
          template: "pending-payment",
          priority: 3,
        };
      }

      if (member.status === "Active" && dueInDays >= 0 && dueInDays <= 3) {
        return {
          id: `${member.id}-renewal`,
          member,
          kind: "renewal",
          title: "Plan ending soon",
          detail: dueInDays === 0 ? "Plan ends today — renew now." : `Plan ends in ${dueInDays} day${dueInDays === 1 ? "" : "s"}.`,
          badge: dueInDays === 0 ? "Today" : `${dueInDays}d left`,
          template: "renewal-due",
          priority: 4,
        };
      }

      const lastVisit = lastVisitDate(member.id, attendance);
      const inactiveDays = lastVisit
        ? differenceInCalendarDays(now, parseISO(lastVisit))
        : differenceInCalendarDays(now, parseISO(member.joinDate));
      if (member.status === "Active" && inactiveDays >= 7) {
        return {
          id: `${member.id}-inactive`,
          member,
          kind: "inactive",
          title: "Stopped coming",
          detail: lastVisit ? `No visit for ${inactiveDays} days — call them.` : `Joined ${inactiveDays} days ago, never came — call them.`,
          badge: "Not coming",
          template: "inactive-member",
          priority: 5,
        };
      }

      return null;
    })
    .filter((item): item is FollowUpItem => item !== null);

  return items.sort((a, b) => a.priority - b.priority || a.member.regNo.localeCompare(b.member.regNo));
}
