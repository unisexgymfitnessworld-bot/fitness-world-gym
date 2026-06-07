import cron from "node-cron";
import { logger } from "../lib/logger.js";
import { autoExpireMembers } from "../services/memberService.js";

export function startExpireStatusJob(): void {
  // Run every day at midnight (0 0 * * *)
  cron.schedule("0 0 * * *", () => {
    void runExpireStatus();
  });
  logger.info("Daily member status auto-expiry job scheduled (0 0 * * *)");
}

export async function runExpireStatus(): Promise<void> {
  try {
    const count = await autoExpireMembers();
    logger.info({ count }, "Daily member status auto-expiry job completed");
  } catch (error) {
    logger.error({ error }, "Daily member status auto-expiry job failed");
  }
}
