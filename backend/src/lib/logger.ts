import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  redact: ["req.headers.authorization", "authorization", "FAST2SMS_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
});
