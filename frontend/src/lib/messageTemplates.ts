import { formatCurrency, formatDisplayDate, getMemberActionDueDate, getMemberDueKind } from "./utils";
import type { Member } from "../types";

export type MessageTemplateId =
  | "pending-payment"
  | "partial-payment"
  | "renewal-due"
  | "expired-plan"
  | "inactive-member"
  | "progress-follow-up";

export interface MessageTemplateOption {
  id: MessageTemplateId;
  label: string;
  description: string;
}

export const messageTemplateOptions: MessageTemplateOption[] = [
  {
    id: "pending-payment",
    label: "Pending Payment",
    description: "Ask member to clear full pending fees.",
  },
  {
    id: "partial-payment",
    label: "Partial Balance",
    description: "Follow up on remaining balance.",
  },
  {
    id: "renewal-due",
    label: "Renewal Due",
    description: "Reminder before plan renewal date.",
  },
  {
    id: "expired-plan",
    label: "Expired Plan",
    description: "Ask expired member to renew.",
  },
  {
    id: "inactive-member",
    label: "Inactive Member",
    description: "Bring member back to training.",
  },
  {
    id: "progress-follow-up",
    label: "Progress Follow-up",
    description: "Friendly progress and workout check-in.",
  },
];

export function createMessageForTemplate(member: Member, templateId: MessageTemplateId): string {
  const actionDate = formatDisplayDate(getMemberActionDueDate(member));
  const dueKind = getMemberDueKind(member).toLowerCase();

  switch (templateId) {
    case "pending-payment":
      return `Hi ${member.name}, your Fitness World fee payment of ${formatCurrency(member.feesAmount)} is still pending. Please clear it at the gym desk or share the payment update. - Fitness World`;
    case "partial-payment":
      return `Hi ${member.name}, ${formatCurrency(member.balanceAmount)} is still pending for your Fitness World plan. Please clear the balance to keep your record updated. - Fitness World`;
    case "renewal-due":
      return `Hi ${member.name}, your Fitness World ${dueKind} is due on ${actionDate}. Please renew before the date to continue training without interruption. - Fitness World`;
    case "expired-plan":
      return `Hi ${member.name}, your Fitness World plan expired on ${actionDate}. Please renew your membership to restart training. - Fitness World`;
    case "inactive-member":
      return `Hi ${member.name}, we have not seen you at Fitness World recently. Please visit the gym so we can keep your fitness progress on track. - Fitness World`;
    case "progress-follow-up":
      return `Hi ${member.name}, checking in on your ${member.goal.toLowerCase()} progress at Fitness World. Visit the gym and we will review your workout and body progress. - Fitness World`;
  }
}

export function getDefaultMessageTemplate(member: Member): MessageTemplateId {
  if (member.status === "Expired") {
    return "expired-plan";
  }
  if (member.paymentStatus === "Pending") {
    return "pending-payment";
  }
  if (member.paymentStatus === "Partially Paid") {
    return "partial-payment";
  }
  return "renewal-due";
}
