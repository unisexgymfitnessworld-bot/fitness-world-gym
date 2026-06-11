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

  // Supabase cold-start / database waking up
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("fetch failed")
  ) {
    return "The server is waking up from sleep — this can take 15–20 seconds. Please wait and try again.";
  }

  // Timeout errors
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("econnreset")) {
    return "Request timed out while the server was waking up. Please try again in a moment.";
  }

  if (lower.includes("api base url")) {
    return "GymOS server connection is not ready. Check VITE_API_BASE_URL and the Cloudflare Worker deploy.";
  }

  return message;
}
