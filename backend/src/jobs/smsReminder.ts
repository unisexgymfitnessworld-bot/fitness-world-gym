import cron from "node-cron";
import { logger } from "../lib/logger.js";
import { membersDueInThreeDays } from "../services/memberService.js";
import { sendReminderForMember } from "../services/smsService.js";

export function startSmsReminderJob(): void {
  cron.schedule("0 9 * * *", () => {
    void runSmsReminder();
  });
}

export async function runSmsReminder(): Promise<void> {
  try {
    const members = await membersDueInThreeDays();
    for (const member of members) {
      await sendReminderForMember(member);
    }
    logger.info({ count: members.length }, "SMS reminder job completed");
  } catch (error) {
    logger.error({ error }, "SMS reminder job failed");
  }
}
