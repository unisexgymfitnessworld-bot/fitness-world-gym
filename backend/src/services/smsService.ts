import { HttpError } from "../lib/httpError.js";
import { logger } from "../lib/logger.js";
import { requireEnv } from "../lib/env.js";
import { markReminderSent } from "./memberService.js";
import type { Member } from "../types/index.js";

interface Fast2SmsResponse {
  return?: boolean;
  request_id?: string;
  message?: string[];
}

export function createReminderText(member: Pick<Member, "name" | "membershipDue">): string {
  return `Hi ${member.name}, your Fitness World membership expires in 3 days on ${member.membershipDue}. Please renew to continue. - Fitness World`;
}

export async function sendSms(phone: string, message: string): Promise<string> {
  const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
    method: "POST",
    headers: {
      authorization: requireEnv("FAST2SMS_API_KEY"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      route: "q",
      message,
      language: "english",
      numbers: phone,
      flash: 0,
    }),
  });

  const payload = (await response.json()) as Fast2SmsResponse;
  if (!response.ok || payload.return !== true) {
    throw new HttpError(502, "FAST2SMS_FAILED", payload.message?.join(", ") ?? "Fast2SMS request failed");
  }

  return payload.request_id ?? "sent";
}

export async function sendReminderForMember(member: Member): Promise<void> {
  try {
    await sendSms(member.phone, createReminderText(member));
    await markReminderSent(member.id);
  } catch (error) {
    logger.error({ error, memberId: member.id }, "SMS reminder failed");
  }
}
