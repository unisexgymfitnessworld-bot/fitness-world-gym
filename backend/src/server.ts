import { app } from "./app.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { startSmsReminderJob } from "./jobs/smsReminder.js";
import { startExpireStatusJob } from "./jobs/expireStatus.js";

app.listen(env.PORT, () => {
  startSmsReminderJob();
  startExpireStatusJob();
  logger.info({ port: env.PORT }, "Fitness World backend listening");
});
