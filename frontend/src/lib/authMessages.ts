export function friendlyAuthError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const message = raw.trim();
  const lower = message.toLowerCase();

  if (!message) {
    return "Unable to complete the auth request. Please try again.";
  }

  if (lower.includes("invalid login credentials")) {
    return "Wrong password, or this trainer email is not registered. Use Forgot password to reset access.";
  }

  if (lower.includes("email not confirmed")) {
    return "This trainer email is not confirmed yet. Open the Supabase email confirmation link first.";
  }

  if (lower.includes("trainer account is not allowed") || lower.includes("trainer_not_allowed")) {
    return "This email is not allowed for GymOS. Ask the developer to add it to TRAINER_EMAILS.";
  }

  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return "Too many attempts. Wait a few minutes and try again.";
  }

  if (lower.includes("api base url") || lower.includes("failed to fetch")) {
    return "GymOS server connection is not ready. Check VITE_API_BASE_URL and the Cloudflare Worker deploy.";
  }

  return message;
}
