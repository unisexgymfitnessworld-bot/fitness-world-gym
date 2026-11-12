import type { User } from "@supabase/supabase-js";
import { env } from "./env.js";
import { HttpError } from "./httpError.js";

const defaultTrainerEmails = [
  "digimartrix26@gmail.com",
  "vijayfitnessworld@gmail.com",
  "jaiga9655@gmail.com",
  "vedasaradhiv@gmail.com"
];

function normalizeEmail(email: string | undefined | null): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function allowedTrainerEmails(): Set<string> {
  const configured = (env.TRAINER_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);

  return new Set(configured.length > 0 ? configured : defaultTrainerEmails);
}

export function assertTrainerAllowed(user: User): void {
  const email = normalizeEmail(user.email);
  const role = user.app_metadata?.role;
  if (!email || (!allowedTrainerEmails().has(email) && role !== "developer" && role !== "trainer")) {
    throw new HttpError(403, "TRAINER_NOT_ALLOWED", "This trainer account is not allowed to access GymOS");
  }
}
