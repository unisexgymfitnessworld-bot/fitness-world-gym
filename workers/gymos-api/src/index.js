const EXPIRY_CRON = "30 18 * * *"; // 00:00 Asia/Kolkata, Cloudflare cron is UTC.
const SMS_CRON = "30 3 * * *"; // 09:00 Asia/Kolkata, Cloudflare cron is UTC.
const KEEP_ALIVE_CRON = "*/10 * * * *";
const ONE_DAY_MS = 86_400_000;
const TIME_ZONE = "Asia/Kolkata";

const SMSGATE_BASE_URL = "https://api.sms-gate.app/3rdparty/v1";
const SMS_DEFAULT_COUNTRY_CODE = "+91";
const SMS_MAX_LENGTH = 320;
const SMS_MIN_LENGTH = 12;
const SMS_TTL_SECONDS = 86_400;
const SMS_PRIORITY = 100;
const SMS_FETCH_TIMEOUT_MS = 15_000;
// Production hardening (January 2026): every send retries transient failures,
// unknown outcomes are verified against SMSGate before any re-post (so a retry
// can never double-send), and anything still unsent lands in the sms_logs
// outbox for the automatic retry sweep.
const SMS_SEND_MAX_ATTEMPTS = 3;
const SMS_SEND_BACKOFF_BASE_MS = 800;
const SMS_STATE_CHECK_TIMEOUT_MS = 8_000;
const SMS_HEALTH_TIMEOUT_MS = 8_000;
const OPENWA_SEND_TIMEOUT_MS = 20_000;
const OPENWA_HEALTH_TIMEOUT_MS = 8_000;
const APPSCRIPT_SEND_TIMEOUT_MS = 20_000;
const APPSCRIPT_HEALTH_TIMEOUT_MS = 8_000;
const NOTIFY_CHANNELS = new Set(["whatsapp", "sms", "email"]);
const DEFAULT_CHANNEL_ORDER = ["whatsapp", "sms", "email"];
const SMS_BULK_PACING_MS = 400;
const SMS_RETRY_SWEEP_MIN_INTERVAL_MS = 15 * 60 * 1000;
const SMS_RETRY_SWEEP_BATCH = 50;
const SMS_RETRY_MAX_ATTEMPTS = 8;
const SMS_RETRY_DELAYS_MS = [
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];
// Last-seen age bands for the gym phone (heuristic display only, never gates
// sending: SMSGate queues with a 24h TTL when the phone is temporarily away).
const PHONE_ONLINE_FRESH_MS = 10 * 60 * 1000;
const PHONE_ONLINE_RECENT_MS = 2 * 60 * 60 * 1000;
const SMS_LOG_KINDS = new Set(["manual", "reminder_3day", "reminder_dueday", "winback", "receipt", "test", "balance_overdue", "statement"]);
const SMS_LOG_STATUSES = new Set(["queued", "sent", "delivered", "failed"]);
// SMSGate message states (android-sms-gateway/server ProcessingState).
// "Sent" = handed to the carrier, "Delivered" = confirmed on the handset.
const SMSGATE_SUCCESS_STATES = new Set(["Processed", "Sent", "Delivered"]);
const SMSGATE_DELIVERED_STATES = new Set(["Delivered"]);
const SMSGATE_FAILED_STATES = new Set(["Failed", "Cancelled"]);
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_LOGIN = 10;
const RATE_LIMIT_MAX_SMS_TEST = 30;
const RATE_LIMIT_MAX_SMS_SETTINGS = 30;
const RATE_LIMIT_MAX_SMS_SEND = 60;
const REMINDER_WINDOW_START_DAYS = 1;
const REMINDER_WINDOW_END_DAYS = 3;
const WINBACK_MIN_DAYS = 15;
const WINBACK_MAX_DAYS = 30;

const GENDERS = new Set(["Male", "Female", "Other"]);
const GOALS = new Set(["Weight Loss", "Weight Gain", "Muscle Gain", "General Fitness", "Other"]);
const PLAN_TYPES = new Set(["1 Month", "3 Months", "6 Months", "1 Year", "Custom"]);
const PAYMENT_STATUSES = new Set(["Paid", "Pending", "Partially Paid"]);
const PAYMENT_METHODS = new Set(["Cash", "UPI", "Card", "Bank Transfer", "Other"]);
const STATUS_VALUES = new Set(["Active", "Expired", "Suspended", "Deleted"]);
const TRAINING_TYPES = new Set(["Personal", "General", "Couple"]);
const rateLimitStore = new Map();
const logBuffer = [];
// Negative cache for the sms_logs table probe (migration may be unapplied).
let smsLogsProbe = { available: null, checkedAt: 0 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FIXED_PLAN_MONTHS = new Map([
  ["1 Month", 1],
  ["3 Months", 3],
  ["6 Months", 6],
  ["1 Year", 12],
]);

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      return errorResponse(request, env, error);
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(handleScheduled(controller, env));
  },
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if ((url.pathname === "/health" || url.pathname === "/api/health") && method === "GET") {
    // Liveness only: no database work on the unauthenticated path.
    return jsonResponse(request, env, {
      status: "ok",
      timestamp: new Date().toISOString(),
      runtime: "cloudflare-worker",
    });
  }


  const path = normalizeApiPath(url.pathname);

  if (path === "/auth/login" && method === "POST") {
    await applyRateLimit(request, env, "login", RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_LOGIN);
    const body = await parseJsonBody(request);
    return jsonResponse(request, env, { success: true, data: await loginTrainer(env, body) });
  }

  const authUser = await authenticateTrainer(request, env);

  if (path === "/auth/me" && method === "GET") {
    return jsonResponse(request, env, { success: true, data: { trainer: trainerFromUser(authUser) } });
  }

  if (path === "/auth/logout" && method === "POST") {
    return jsonResponse(request, env, { success: true, data: { message: "Logged out" } });
  }

  if (path === "/developer/diagnostics" && method === "GET") {
    assertDeveloper(authUser);
    return jsonResponse(request, env, { success: true, data: await developerDiagnostics(env) });
  }

  if (path === "/developer/settings" && method === "POST") {
    assertDeveloper(authUser);
    const body = await parseJsonBody(request);
    if (body && typeof body === "object" && body.smsgate_password !== undefined) {
      const password = String(body.smsgate_password).trim();
      if (password.length > 200) {
        throw new ApiError(400, "INVALID_INPUT", "smsgate_password is too long");
      }
      if (password) {
        body.smsgate_password = await encryptStoredSecret(env, password);
      } else {
        delete body.smsgate_password;
      }
    }
    await saveSystemSettings(env, body);
    return jsonResponse(request, env, { success: true, data: { message: "Settings saved successfully" } });
  }

  if (path === "/developer/test-notification" && method === "POST") {
    assertDeveloper(authUser);
    await applyRateLimit(request, env, "sms-test", RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_SMS_TEST);
    const body = await parseJsonBody(request);
    const phone = requiredString(body.phone, "phone number");
    const message = requiredString(body.message, "test message");
    if (message.length > SMS_MAX_LENGTH) {
      throw new ApiError(400, "INVALID_SMS_MESSAGE", `Test message must be ${SMS_MAX_LENGTH} characters or less`);
    }

    const result = await dispatchSms(env, { phone, message, kind: "test" });
    logInfo("developer_test_notification", { phone: maskPhone(phone), requestId: result.requestId, status: result.status });
    return jsonResponse(request, env, { success: true, data: { requestId: result.requestId, status: result.status } });
  }

  if (path === "/developer/logs" && method === "GET") {
    assertDeveloper(authUser);
    return jsonResponse(request, env, { success: true, data: logBuffer });
  }

  if (path === "/developer/ping-db" && method === "GET") {
    assertDeveloper(authUser);
    const start = Date.now();
    let supabaseStatus = "ok";
    try {
      await keepSupabaseAlive(env);
    } catch (err) {
      supabaseStatus = "error";
    }
    const latency = Date.now() - start;
    logInfo("developer_ping_db", { latency, dbStatus: supabaseStatus });
    return jsonResponse(request, env, {
      success: true,
      data: {
        latency,
        supabase: supabaseStatus,
        checkedAt: new Date().toISOString()
      }
    });
  }

  if (path === "/developer/fix" && method === "POST") {
    assertDeveloper(authUser);
    await applyRateLimit(request, env, "dev-fix", RATE_LIMIT_WINDOW_MS, 10);
    const body = await parseJsonBody(request);
    return jsonResponse(request, env, { success: true, data: await runDeveloperFix(env, body) });
  }

  // Team self-service for trainers (developers use /developer/accounts).
  // Trainers see trainer accounts only, create trainer role only, edit
  // name/password only, and can never touch developer accounts or roles.
  if (path === "/team/accounts" && method === "GET") {
    return jsonResponse(request, env, { success: true, data: await listTeamAccounts(env, authUser) });
  }

  if (path === "/team/accounts" && method === "POST") {
    await applyRateLimit(request, env, "accounts", RATE_LIMIT_WINDOW_MS, 20);
    return jsonResponse(request, env, { success: true, data: await createTeamAccount(env, await parseJsonBody(request), authUser) }, 201);
  }

  const teamAccountMatch = path.match(/^\/team\/accounts\/([^/]+)$/);
  if (teamAccountMatch) {
    const accountId = assertUuid(teamAccountMatch[1], "account id");
    if (method === "PATCH") {
      await applyRateLimit(request, env, "accounts", RATE_LIMIT_WINDOW_MS, 20);
      return jsonResponse(request, env, { success: true, data: await updateTeamAccount(env, accountId, await parseJsonBody(request), authUser) });
    }
    if (method === "DELETE") {
      await applyRateLimit(request, env, "accounts", RATE_LIMIT_WINDOW_MS, 20);
      await deleteTeamAccount(env, accountId, authUser);
      return jsonResponse(request, env, { success: true, data: { message: "Account removed" } });
    }
  }

  if (path === "/developer/accounts" && method === "GET") {
    assertDeveloper(authUser);
    return jsonResponse(request, env, { success: true, data: await listTrainerAccounts(env, authUser) });
  }

  if (path === "/developer/accounts" && method === "POST") {
    assertDeveloper(authUser);
    await applyRateLimit(request, env, "accounts", RATE_LIMIT_WINDOW_MS, 20);
    return jsonResponse(request, env, { success: true, data: await createTrainerAccount(env, await parseJsonBody(request), authUser) }, 201);
  }

  const accountMatch = path.match(/^\/developer\/accounts\/([^/]+)$/);
  if (accountMatch) {
    assertDeveloper(authUser);
    const accountId = assertUuid(accountMatch[1], "account id");
    if (method === "PATCH") {
      return jsonResponse(request, env, { success: true, data: await updateTrainerAccount(env, accountId, await parseJsonBody(request), authUser) });
    }
    if (method === "DELETE") {
      await deleteTrainerAccount(env, accountId, authUser);
      return jsonResponse(request, env, { success: true, data: { message: "Account deleted" } });
    }
  }

  // SMS setup endpoints: shared by trainers and developers (placed before the
  // trainer-workspace gate so both roles can configure the gym phone).
  if (path === "/sms/status" && method === "GET") {
    const includeSecrets = roleFromUser(authUser) === "developer";
    return jsonResponse(request, env, { success: true, data: await smsStatus(env, includeSecrets) });
  }

  // Credential keys are developer-only: trainers may flip the on/off
  // switches and the reminder pause, nothing that connects an account.
  const DEVELOPER_SETTING_KEYS = new Set([
    "smsgate_username", "smsgate_password", "smsgate_device_id", "smsgate_sim_number",
    "wa_enabled", "wa_base_url", "wa_api_key", "wa_session_id",
    "email_enabled", "appscript_url", "appscript_secret", "notify_channel_order",
  ]);

  if (path === "/sms/settings" && method === "POST") {
    await applyRateLimit(request, env, "sms-settings", RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_SMS_SETTINGS);
    const rawBody = await parseJsonBody(request);
    if (roleFromUser(authUser) !== "developer") {
      const attempted = rawBody && typeof rawBody === "object"
        ? Object.keys(rawBody).filter((key) => DEVELOPER_SETTING_KEYS.has(key) && String(rawBody[key] ?? "").trim() !== "")
        : [];
      if (attempted.length > 0) {
        throw new ApiError(403, "DEVELOPER_ONLY", "Only a developer can change connection settings");
      }
    }
    const body = validateSmsSettingsInput(rawBody);
    if (body.smsgate_password) {
      body.smsgate_password = await encryptStoredSecret(env, body.smsgate_password);
    } else if (body.smsgate_password !== undefined) {
      // Blank password means "keep the saved one", never wipe it.
      delete body.smsgate_password;
    }
    for (const key of ["wa_api_key", "appscript_secret"]) {
      if (body[key]) {
        body[key] = await encryptStoredSecret(env, body[key]);
      } else if (body[key] !== undefined) {
        delete body[key];
      }
    }
    await saveSystemSettings(env, body);
    logInfo("sms_settings_saved", { by: authUser.email });
    return jsonResponse(request, env, { success: true, data: { message: "SMS settings saved successfully" } });
  }

  if (path === "/sms/test" && method === "POST") {
    await applyRateLimit(request, env, "sms-test", RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_SMS_TEST);
    const body = await parseJsonBody(request);
    const phone = requiredString(body.phone, "phone number");
    const message = requiredString(body.message, "test message");
    if (message.length > SMS_MAX_LENGTH) {
      throw new ApiError(400, "INVALID_SMS_MESSAGE", `Test message must be ${SMS_MAX_LENGTH} characters or less`);
    }
    const result = await dispatchSms(env, { phone, message, kind: "test" });
    logInfo("sms_test_sent", { phone: maskPhone(phone), requestId: result.requestId, status: result.status });
    return jsonResponse(request, env, { success: true, data: { requestId: result.requestId, status: result.status } });
  }

  if (path === "/sms/health" && method === "GET") {
    await applyRateLimit(request, env, "sms-health", RATE_LIMIT_WINDOW_MS, 30);
    return jsonResponse(request, env, { success: true, data: await smsHealth(env) });
  }

  if (path === "/sms/logs" && method === "GET") {
    const status = url.searchParams.get("status");
    const limit = Math.min(numberParam(url.searchParams.get("limit")) ?? 20, 100);
    const offset = numberParam(url.searchParams.get("offset")) ?? 0;
    if (status && status !== "all" && !SMS_LOG_STATUSES.has(status)) {
      throw new ApiError(400, "INVALID_INPUT", "status filter is invalid");
    }
    return jsonResponse(request, env, { success: true, data: await listSmsLogs(env, { status, limit, offset }) });
  }

  if (path === "/sms/retry" && method === "POST") {
    await applyRateLimit(request, env, "sms-retry", RATE_LIMIT_WINDOW_MS, 30);
    const body = await parseJsonBody(request);
    const logId = assertUuid(body.logId ?? body.log_id, "log id");
    return jsonResponse(request, env, { success: true, data: await retrySmsLog(env, logId) });
  }

  // Full gym reset. Open to trainers by explicit owner request: the RPC is
  // scoped to the caller's own workspace (no cross-workspace wipe), plus
  // ERASE ALL + backup checkbox + 3-taps-per-window rate limiting.
  if (path === "/admin/wipe-all" && method === "POST") {
    await applyRateLimit(request, env, "admin-wipe", RATE_LIMIT_WINDOW_MS, 3);
    const body = await parseJsonBody(request);
    if (body.confirm !== "ERASE ALL") {
      throw new ApiError(400, "INVALID_CONFIRM", "Type ERASE ALL to confirm wiping all gym data");
    }
    return jsonResponse(request, env, { success: true, data: await wipeAllGymData(env, authUser) });
  }

  assertTrainerWorkspace(authUser);

  if (path === "/members/payments/all" && method === "GET") {
    return jsonResponse(request, env, { success: true, data: await listAllPaymentReceipts(env, authUser) });
  }

  if (path === "/members/renewals/all" && method === "GET") {
    return jsonResponse(request, env, { success: true, data: await listAllRenewalHistory(env, authUser) });
  }

  if (path === "/attendance" && method === "GET") {
    return jsonResponse(request, env, { success: true, data: await listAllAttendance(env, authUser) });
  }

  if (path === "/members" && method === "GET") {
    return jsonResponse(request, env, { success: true, data: await listMembers(env, authUser, url.searchParams) });
  }

  if (path === "/members" && method === "POST") {
    const body = validateMemberInput(await parseJsonBody(request));
    const { member } = await createMember(env, authUser, body);
    return jsonResponse(request, env, { success: true, data: member }, 201);
  }

  if (path === "/members/batch" && method === "POST") {
    await applyRateLimit(request, env, "members-write", RATE_LIMIT_WINDOW_MS, 30);
    const body = await parseJsonBody(request);
    const inputs = body?.members;
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 2) {
      throw new ApiError(400, "INVALID_BATCH", "Provide 1 to 2 members to create together");
    }
    const validated = inputs.map(validateMemberInput);
    const created = [];
    try {
      for (const input of validated) {
        created.push(await createMember(env, authUser, input));
      }
    } catch (error) {
      // Roll back only rows created by THIS call: replayed rows from an
      // earlier attempt must survive.
      for (const entry of created) {
        if (!entry.isNew) continue;
        try {
          await supabaseJson(env, `/members?id=eq.${encodeURIComponent(entry.member.id)}`, { method: "DELETE" });
        } catch {
          // Best-effort rollback; the original error is what matters.
        }
      }
      throw error;
    }
    return jsonResponse(request, env, { success: true, data: created.map((entry) => entry.member) }, 201);
  }

  const memberMatch = path.match(/^\/members\/([^/]+)(?:\/([^/]+))?$/);
  if (memberMatch) {
    const memberId = assertUuid(memberMatch[1], "member id");
    const action = memberMatch[2];

    if (!action && method === "GET") {
      return jsonResponse(request, env, { success: true, data: await getMember(env, authUser, memberId) });
    }

    if (!action && method === "PUT") {
      const body = validateMemberInput(await parseJsonBody(request));
      return jsonResponse(request, env, { success: true, data: await updateMember(env, authUser, memberId, body) });
    }

    if (!action && method === "DELETE") {
      return jsonResponse(request, env, { success: true, data: await deleteMember(env, authUser, memberId) });
    }

    if (action === "suspend" && method === "PATCH") {
      return jsonResponse(request, env, { success: true, data: await suspendMember(env, authUser, memberId) });
    }

    if (action === "restore" && method === "PATCH") {
      return jsonResponse(request, env, { success: true, data: await restoreMember(env, authUser, memberId) });
    }

    if (action === "purge" && method === "POST") {
      await applyRateLimit(request, env, "members", RATE_LIMIT_WINDOW_MS, 30);
      return jsonResponse(request, env, { success: true, data: await purgeMember(env, authUser, memberId) });
    }

    if (action === "payments" && method === "GET") {
      return jsonResponse(request, env, { success: true, data: await listPaymentReceipts(env, authUser, memberId) });
    }

    if (action === "renewals" && method === "GET") {
      return jsonResponse(request, env, { success: true, data: await listRenewalHistory(env, authUser, memberId) });
    }

    if (action === "payments" && method === "POST") {
      await applyRateLimit(request, env, "payments", RATE_LIMIT_WINDOW_MS, 60);
      const body = validatePaymentReceiptInput(await parseJsonBody(request));
      return jsonResponse(request, env, { success: true, data: await createPaymentReceipt(env, authUser, memberId, body) }, 201);
    }

    if (action === "renew" && method === "PATCH") {
      await applyRateLimit(request, env, "renew", RATE_LIMIT_WINDOW_MS, 30);
      const body = validateRenewInput(await parseJsonBody(request));
      return jsonResponse(request, env, {
        success: true,
        data: await renewMember(env, authUser, memberId, body.membershipStart, body.membershipDue, body.feesAmount, body.planType, body.paymentStatus, body.collectedAmount, body.method, body.clientRequestId ?? null),
      });
    }

    if (action === "resend-receipt" && method === "POST") {
      await applyRateLimit(request, env, "resend", RATE_LIMIT_WINDOW_MS, 30);
      const body = validateResendInput(await parseJsonBody(request));
      return jsonResponse(request, env, {
        success: true,
        data: await resendReceipt(env, authUser, memberId, body.receiptId, body.channel),
      });
    }

    if (action === "statement" && method === "POST") {
      await applyRateLimit(request, env, "statement", RATE_LIMIT_WINDOW_MS, 30);
      const body = validateStatementInput(await parseJsonBody(request));
      return jsonResponse(request, env, {
        success: true,
        data: await sendStatement(env, authUser, memberId, body.channel, body.dryRun),
      });
    }
  }

  const attendanceMemberMatch = path.match(/^\/attendance\/([^/]+)$/);
  if (attendanceMemberMatch && method === "GET") {
    const memberId = assertUuid(attendanceMemberMatch[1], "member id");
    const month = url.searchParams.get("month") ?? undefined;
    return jsonResponse(request, env, { success: true, data: await listAttendance(env, authUser, memberId, month) });
  }

  if (path === "/attendance" && method === "POST") {
    const body = validateAttendanceInput(await parseJsonBody(request));
    return jsonResponse(request, env, { success: true, data: await createAttendance(env, authUser, body.memberId, body.visitDate, body.weightKg) }, 201);
  }

  const attendanceDeleteMatch = path.match(/^\/attendance\/entry\/([^/]+)$/);
  if (attendanceDeleteMatch && method === "DELETE") {
    const attendanceId = assertUuid(attendanceDeleteMatch[1], "attendance id");
    await deleteAttendance(env, authUser, attendanceId);
    return jsonResponse(request, env, { success: true, data: { message: "Deleted" } });
  }

  if (path === "/dashboard/stats" && method === "GET") {
    return jsonResponse(request, env, { success: true, data: await getDashboardStats(env, authUser) });
  }

  if (path === "/notify/test" && method === "POST") {
    await applyRateLimit(request, env, "sms-test", RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_SMS_TEST);
    const body = await parseJsonBody(request);
    const channel = String(body.channel ?? "").trim().toLowerCase();
    if (!NOTIFY_CHANNELS.has(channel)) {
      throw new ApiError(400, "INVALID_INPUT", "channel must be whatsapp, sms, or email");
    }
    const to = requiredString(body.to ?? body.phone ?? body.email, "destination");
    const message = requiredString(body.message, "test message");
    const maxLength = channel === "email" ? 2000 : SMS_MAX_LENGTH;
    if (message.length > maxLength) {
      throw new ApiError(400, "INVALID_SMS_MESSAGE", `Test message must be ${maxLength} characters or less`);
    }
    const provider = channel === "whatsapp" ? "openwa" : channel === "email" ? "appscript" : "smsgate";
    const result = await dispatchSms(env, { phone: to, message, kind: "test", provider });
    logInfo("notify_test_sent", { channel, requestId: result.requestId, status: result.status });
    return jsonResponse(request, env, { success: true, data: { requestId: result.requestId, status: result.status, channel } });
  }

  if (path === "/sms/send" && method === "POST") {
    await applyRateLimit(request, env, "sms", RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_SMS_SEND);
    const body = validateSmsInput(await parseJsonBody(request));
    const member = await getMember(env, authUser, body.memberId);
    assertNotDeleted(member);

    const result = await dispatchSmart(env, {
      phone: member.phone,
      email: member.email,
      message: body.message,
      kind: "manual",
      memberId: member.id,
      clientRequestId: body.clientRequestId,
      channel: body.channel,
    });
    // Only a confirmed send clears the reminder flag; queued messages keep it
    // so the automatic retry (or the next 9 AM sweep via dedup) still covers
    // the member instead of silently dropping them.
    if (result.status === "sent" && body.markReminder) {
      await markReminderSent(env, member.id);
    }
    logInfo("sms_manual_send", { memberId: member.id, status: result.status, channel: result.channel ?? null, duplicate: result.duplicate === true });
    return jsonResponse(request, env, { success: true, data: { requestId: result.requestId, status: result.status, duplicate: result.duplicate === true, channel: result.channel ?? null } });
  }

  throw new ApiError(404, "NOT_FOUND", "Route not found");
}

async function handleScheduled(controller, env) {
  const startedAt = new Date().toISOString();
  // The retry sweep runs on every tick (throttled internally to ~15 min): it is
  // the delivery guarantee for any message that failed its first attempt, and
  // it runs even when the DB keep-alive toggle is off.
  try {
    const retry = await runSmsRetrySweep(env);
    if (retry.processed > 0) {
      logInfo("scheduled_sms_retry_complete", { startedAt, ...retry });
    }
  } catch (error) {
    logError("scheduled_sms_retry_failed", error);
  }

  // Each job is isolated: a failure in one must never skip the others.
  if (controller.cron === KEEP_ALIVE_CRON) {
    try {
      const settings = await getSystemSettings(env);
      if (settings.db_keep_alive_enabled === "false") {
        logInfo("scheduled_keep_alive_skipped", { startedAt });
        return;
      }
      await keepSupabaseAlive(env);
      logInfo("scheduled_keep_alive_complete", { startedAt });
    } catch (error) {
      logError("scheduled_keep_alive_failed", error);
    }
    return;
  }

  if (controller.cron === EXPIRY_CRON) {
    try {
      const expired = await runExpireStatus(env);
      await saveSystemSettings(env, { expiry_last_run_at: new Date().toISOString(), expiry_last_run_changed: String(expired) });
      logInfo("scheduled_expiry_complete", { startedAt, expired });
    } catch (error) {
      logError("scheduled_expiry_failed", error);
    }
    return;
  }

  if (controller.cron === SMS_CRON) {
    try {
      const result = await runSmsReminder(env);
      logInfo("scheduled_sms_complete", { startedAt, ...result });
    } catch (error) {
      logError("scheduled_sms_failed", error);
    }
    return;
  }

  const [expiry, sms] = await Promise.allSettled([runExpireStatus(env), runSmsReminder(env)]);
  if (expiry.status === "rejected") {
    logError("scheduled_expiry_failed", expiry.reason);
  }
  if (sms.status === "rejected") {
    logError("scheduled_sms_failed", sms.reason);
  }
  logInfo("scheduled_maintenance_complete", {
    startedAt,
    expired: expiry.status === "fulfilled" ? expiry.value : -1,
    sms: sms.status === "fulfilled" ? sms.value : null,
  });
}

function normalizeApiPath(pathname) {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  if (trimmed === "/api") {
    return "/";
  }
  return trimmed.startsWith("/api/") ? trimmed.slice(4) : trimmed;
}

async function parseJsonBody(request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 1_000_000) {
    throw new ApiError(413, "BODY_TOO_LARGE", "Request body is too large");
  }

  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}

async function authenticateTrainer(request, env) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing bearer token");
  }

  const key = supabasePublishableKey(env);
  const response = await fetch(`${supabaseUrl(env)}/auth/v1/user`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired session");
  }

  const user = await response.json();
  await assertTrainerAllowed(env, user);
  return user;
}

async function loginTrainer(env, body) {
  if (!body || typeof body !== "object") {
    throw new ApiError(400, "INVALID_LOGIN", "Email and password are required");
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email.includes("@") || password.length < 6) {
    throw new ApiError(400, "INVALID_LOGIN", "Email and password are required");
  }

  try {
    const key = supabasePublishableKey(env);
    const response = await fetch(`${supabaseUrl(env)}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const payload = await safeJson(response);
    if (!response.ok || !payload?.access_token || !payload?.user) {
      throw new ApiError(401, "LOGIN_FAILED", "Invalid email or password");
    }
    await assertTrainerAllowed(env, payload.user);
    return {
      token: payload.access_token,
      trainer: trainerFromUser(payload.user),
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      throw error;
    }
    // Generic response: must not reveal whether the email exists, is
    // unconfirmed, or simply isn't allowlisted.
    logWarn("login_failed", { email });
    throw new ApiError(401, "LOGIN_FAILED", "Invalid email or password");
  }
}

function trainerFromUser(user) {
  const metadata = user.user_metadata ?? {};
  const role = roleFromUser(user);
  return {
    id: user.id,
    name: typeof metadata.name === "string" && metadata.name.trim() ? metadata.name.trim() : user.email?.split("@")[0] ?? "Fitness World Trainer",
    email: user.email ?? "",
    role,
    avatar: typeof metadata.avatar === "string" && metadata.avatar.trim() ? metadata.avatar.trim() : undefined,
  };
}

async function assertTrainerAllowed(env, user) {
  // Strict: ONLY allowlisted emails can log in. Server-set roles decide
  // the level (developer vs trainer) but can never smuggle in an account.
  const email = normalizeEmail(user?.email);
  if (!email || !(await allowedTrainerEmailSet(env)).has(email)) {
    throw new ApiError(403, "TRAINER_NOT_ALLOWED", "This trainer account is not allowed to access GymOS");
  }
}

function roleFromUser(user) {
  return explicitRoleFromUser(user) ?? "trainer";
}

export function explicitRoleFromUser(user) {
  // No hardcoded emails: developer comes ONLY from server-writable
  // app_metadata (set once in the Supabase dashboard). user_metadata is
  // client-writable and must never grant roles (self-promotion).
  const role = user?.app_metadata?.role;
  return role === "developer" || role === "trainer" ? role : undefined;
}

function assertDeveloper(user) {
  if (roleFromUser(user) !== "developer") {
    throw new ApiError(403, "DEVELOPER_ONLY", "Developer console access is required");
  }
}

function assertTrainerWorkspace(user) {
  if (roleFromUser(user) === "developer") {
    throw new ApiError(403, "TRAINER_WORKSPACE_ONLY", "Developer accounts use the system dashboard, not gym member data");
  }
}

// Single-gym shared workspace: every trainer sees every member record.
// owner_user_id is a creator audit trail, not an access boundary.
function ownerFilter(user) {
  return "not.is.null";
}

async function developerDiagnostics(env) {
  let supabase = "ok";
  let memberOwnershipReady = true;
  let orphanMembers = 0;
  let expiredActiveMembers = 0;
  let totalMembers = 0;
  let totalAttendance = 0;

  try {
    await keepSupabaseAlive(env);
    orphanMembers = await countRows(env, "members", [["owner_user_id", "is.null"]]);
    expiredActiveMembers = await countRows(env, "members", [
      ["status", "eq.Active"],
      ["membership_due", `lt.${isoDateInTimeZone()}`],
    ]);
    totalMembers = await countRows(env, "members", []);
    totalAttendance = await countRows(env, "attendance", []);
  } catch (error) {
    supabase = "error";
    memberOwnershipReady = false;
    logWarn("developer_diagnostics_partial_failure", { message: error instanceof Error ? error.message : "Unknown error" });
  }

  const settings = await getSystemSettings(env);
  const accounts = await listAllTrainerAccounts(env);

  const smsgateUsername = settings.smsgate_username || env.SMSGATE_USERNAME;
  const smsgatePassword = settings.smsgate_password || env.SMSGATE_PASSWORD;

  const smsEnabled = settings.sms_enabled !== "false";
  const smsgateConfigured = Boolean(smsgateUsername && smsgatePassword);
  const smsOutbox = await smsOutboxStats(env);

  return {
    api: "ok",
    supabase,
    smsConfigured: smsgateConfigured && smsEnabled,
    smsgateConfigured: smsgateConfigured && smsEnabled,
    memberOwnershipReady,
    orphanMembers,
    expiredActiveMembers,
    totalMembers,
    totalAttendance,
    sms: {
      logsReady: smsOutbox.logsReady,
      queued: smsOutbox.queued,
      failedLast24h: smsOutbox.failedLast24h,
      sentToday: smsOutbox.sentToday,
      deliveredToday: smsOutbox.deliveredToday,
      lastRunAt: settings.sms_last_run_at ?? null,
      lastRunSent: Number(settings.sms_last_run_sent ?? 0),
      lastRunFailed: Number(settings.sms_last_run_failed ?? 0),
      lastRunQueued: Number(settings.sms_last_run_queued ?? 0),
      lastRunSkipped: Number(settings.sms_last_run_skipped ?? 0),
      lastRunError: settings.sms_last_run_error ?? "",
      lastRetryAt: settings.sms_last_retry_run ?? null,
      lastRetrySent: Number(settings.sms_last_retry_sent ?? 0),
      lastExpiryRunAt: settings.expiry_last_run_at ?? null,
      lastExpiryChanged: Number(settings.expiry_last_run_changed ?? 0),
    },
    accounts: {
      total: accounts.length,
      developers: accounts.filter((account) => account.role === "developer").length,
      trainers: accounts.filter((account) => account.role === "trainer").length,
    },
    cron: {
      expiry: "00:00 IST daily",
      sms: "09:00 IST daily",
      retrySweep: "every ~15 min (piggybacked on worker ticks)",
    },
    settings: {
      sms_enabled: settings.sms_enabled ?? "true",
      smsgate_username: settings.smsgate_username ?? (env.SMSGATE_USERNAME ?? ""),
      smsgate_password: "",
      smsgate_password_configured: Boolean(settings.smsgate_password || env.SMSGATE_PASSWORD),
      smsgate_device_id: settings.smsgate_device_id ?? (env.SMSGATE_DEVICE_ID ?? ""),
      smsgate_sim_number: settings.smsgate_sim_number ?? (env.SMSGATE_SIM_NUMBER ?? ""),
      db_keep_alive_enabled: settings.db_keep_alive_enabled ?? "false",
      sms_auto_reminder_paused: settings.sms_auto_reminder_paused ?? "false",
    },
    checkedAt: new Date().toISOString(),
  };
}

async function runDeveloperFix(env, body) {
  const action = requiredString(body.action, "fix action");
  if (action === "expire-members") {
    const changed = await runExpireStatus(env);
    return {
      message: "Expired member status check completed",
      changed,
    };
  }
  if (action === "send-sms-reminder") {
    const targetDate = isoDateInTimeZone(addDays(new Date(), 3));
    const result = await runSmsReminder(env);
    return {
      message: "SMS reminder sweep completed",
      sent: result.sent,
      failed: result.failed,
      queued: result.queued,
      targetDate,
    };
  }
  throw new ApiError(400, "UNKNOWN_FIX_ACTION", "Unknown developer fix action");
}

async function listTrainerAccounts(env, currentUser) {
  const accounts = await listAllTrainerAccounts(env);
  return accounts.map((account) => ({
    ...account,
    currentUser: account.id === currentUser.id,
  }));
}

async function listAllTrainerAccounts(env) {
  const payload = await supabaseAuthAdminJson(env, "/users?page=1&per_page=1000");
  const users = Array.isArray(payload?.users) ? payload.users : [];
  const allowed = await allowedTrainerEmailSet(env);
  return users
    .filter((user) => allowed.has(normalizeEmail(user.email)))
    .map(mapTrainerAccount)
    .sort((a, b) => a.email.localeCompare(b.email));
}

async function createTrainerAccount(env, body) {
  const input = validateAccountInput(body, { requirePassword: true });
  const payload = await supabaseAuthAdminJson(env, "/users", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      app_metadata: { role: input.role },
      user_metadata: { name: input.name },
    }),
  });
  return mapTrainerAccount(payload?.user ?? payload);
}

async function updateTrainerAccount(env, accountId, body, currentUser) {
  const input = validateAccountInput(body, { requirePassword: false });
  if (accountId === currentUser.id && input.role !== "developer") {
    throw new ApiError(400, "CANNOT_DEMOTE_SELF", "You cannot remove your own developer access");
  }
  const existing = await supabaseAuthAdminJson(env, `/users/${encodeURIComponent(accountId)}`);
  const existingUser = existing?.user ?? existing ?? {};
  const update = {
    app_metadata: { ...(existingUser.app_metadata ?? {}), role: input.role },
    user_metadata: { ...(existingUser.user_metadata ?? {}), name: input.name },
  };
  if (input.email) {
    update.email = input.email;
    update.email_confirm = true;
  }
  if (input.password) {
    update.password = input.password;
  }

  const payload = await supabaseAuthAdminJson(env, `/users/${encodeURIComponent(accountId)}`, {
    method: "PUT",
    body: JSON.stringify(update),
  });
  const account = mapTrainerAccount(payload?.user ?? payload);
  return {
    ...account,
    currentUser: account.id === currentUser.id,
  };
}

async function deleteTrainerAccount(env, accountId, currentUser) {
  if (accountId === currentUser.id) {
    throw new ApiError(400, "CANNOT_DELETE_SELF", "You cannot delete the account you are currently using");
  }
  const accounts = await listAllTrainerAccounts(env);
  const target = accounts.find((account) => account.id === accountId);
  const developerCount = accounts.filter((account) => account.role === "developer").length;
  if (target?.role === "developer" && developerCount <= 1) {
    throw new ApiError(400, "CANNOT_DELETE_LAST_DEVELOPER", "You cannot delete the last developer account");
  }
  await supabaseAuthAdminJson(env, `/users/${encodeURIComponent(accountId)}`, {
    method: "DELETE",
  });
  if (target) {
    await removeExtraTrainerEmail(env, target.email);
  }
}

async function teamTargetAccount(env, accountId) {
  const accounts = await listAllTrainerAccounts(env);
  const target = accounts.find((account) => account.id === accountId);
  if (!target) {
    throw new ApiError(404, "ACCOUNT_NOT_FOUND", "Account not found");
  }
  if (target.role !== "trainer") {
    throw new ApiError(403, "DEVELOPER_ONLY", "Only a developer can change that account");
  }
  return target;
}

async function listTeamAccounts(env, currentUser) {
  const accounts = await listTrainerAccounts(env, currentUser);
  return accounts.filter((account) => account.role === "trainer");
}

async function createTeamAccount(env, body, currentUser) {
  const name = requiredString(body.name, "display name");
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !email.includes("@")) {
    throw new ApiError(400, "INVALID_EMAIL", "Account email is invalid");
  }
  if (password.length < 12) {
    throw new ApiError(400, "WEAK_PASSWORD", "Password must be at least 12 characters");
  }
  const account = await createTrainerAccount(env, { email, name, role: "trainer", password });
  await addExtraTrainerEmail(env, email, normalizeEmail(currentUser?.email));
  return { ...account, currentUser: account.id === currentUser.id };
}

async function updateTeamAccount(env, accountId, body, currentUser) {
  const target = await teamTargetAccount(env, accountId);
  // Name + password only: trainers can never change emails or roles.
  const name = body.name !== undefined ? requiredString(body.name, "display name") : target.name;
  const password = typeof body.password === "string" && body.password.length > 0 ? body.password : undefined;
  if (password !== undefined && password.length < 12) {
    throw new ApiError(400, "WEAK_PASSWORD", "Password must be at least 12 characters");
  }
  const update = {
    app_metadata: { role: "trainer" },
    user_metadata: { name },
  };
  if (password !== undefined) {
    update.password = password;
  }
  const payload = await supabaseAuthAdminJson(env, `/users/${encodeURIComponent(accountId)}`, {
    method: "PUT",
    body: JSON.stringify(update),
  });
  const account = mapTrainerAccount(payload?.user ?? payload);
  return { ...account, currentUser: account.id === currentUser.id };
}

async function deleteTeamAccount(env, accountId, currentUser) {
  if (accountId === currentUser.id) {
    throw new ApiError(400, "CANNOT_DELETE_SELF", "You cannot delete the account you are currently using");
  }
  const target = await teamTargetAccount(env, accountId);
  await supabaseAuthAdminJson(env, `/users/${encodeURIComponent(accountId)}`, {
    method: "DELETE",
  });
  await removeExtraTrainerEmail(env, target.email);
  logWarn("team_account_deleted", { email: target.email, by: normalizeEmail(currentUser?.email) });
}

function validateAccountInput(body, options) {
  const email = options.requirePassword ? requiredString(body.email, "email").toLowerCase() : optionalText(body.email)?.toLowerCase();
  const name = requiredString(body.name, "display name");
  const role = assertEnum(body.role, new Set(["developer", "trainer"]), "role");
  const password = typeof body.password === "string" && body.password.length > 0 ? body.password : undefined;

  if (email && !email.includes("@")) {
    throw new ApiError(400, "INVALID_EMAIL", "Account email is invalid");
  }
  if (options.requirePassword && (!password || password.length < 12)) {
    throw new ApiError(400, "WEAK_PASSWORD", "Password must be at least 12 characters");
  }
  if (!options.requirePassword && password && password.length < 12) {
    throw new ApiError(400, "WEAK_PASSWORD", "Password must be at least 12 characters");
  }

  return { email, name, role, password };
}

function mapTrainerAccount(user) {
  const metadata = user?.user_metadata ?? {};
  return {
    id: user?.id ?? "",
    email: user?.email ?? "",
    name: typeof metadata.name === "string" && metadata.name.trim() ? metadata.name.trim() : user?.email?.split("@")[0] ?? "Trainer",
    role: roleFromUser(user),
    createdAt: user?.created_at ?? new Date().toISOString(),
    confirmed: Boolean(user?.email_confirmed_at ?? user?.confirmed_at),
    currentUser: false,
  };
}

export function allowedTrainerEmails(env) {
  // No hardcoded fallback: access comes ONLY from the TRAINER_EMAILS secret.
  // An empty allowlist locks everyone out (fail closed) with a loud log so a
  // missing secret is obvious in the worker logs instead of a mystery 403.
  const configured = String(env.TRAINER_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
  if (configured.length === 0) {
    logError("trainer_allowlist_empty", new Error("TRAINER_EMAILS is not set: no trainer can log in"));
  }
  return new Set(configured);
}

const allowlistCache = { at: 0, set: null };

// Effective allowlist: the TRAINER_EMAILS secret PLUS trainer-added emails
// stored in system_settings. Cached 60s per isolate; a settings outage falls
// back to the secret alone (fail closed toward the known-good list).
async function allowedTrainerEmailSet(env) {
  const now = Date.now();
  if (allowlistCache.set && now - allowlistCache.at < 60000) {
    return allowlistCache.set;
  }
  const combined = allowedTrainerEmails(env);
  try {
    const settings = await getSystemSettings(env);
    for (const piece of String(settings.trainer_emails_extra ?? "").split(",")) {
      const email = normalizeEmail(piece);
      if (email) combined.add(email);
    }
  } catch {
    // Fall through with the secret list only.
  }
  allowlistCache.at = now;
  allowlistCache.set = combined;
  return combined;
}

function bustAllowlistCache() {
  allowlistCache.at = 0;
  allowlistCache.set = null;
}

async function addExtraTrainerEmail(env, email, actorEmail) {
  const clean = normalizeEmail(email);
  if (!clean || !clean.includes("@")) {
    throw new ApiError(400, "INVALID_EMAIL", "Account email is invalid");
  }
  const settings = await getSystemSettings(env);
  const current = String(settings.trainer_emails_extra ?? "")
    .split(",").map(normalizeEmail).filter(Boolean);
  if (!current.includes(clean)) {
    current.push(clean);
    await saveSystemSettings(env, { trainer_emails_extra: current.join(",") });
  }
  bustAllowlistCache();
  logWarn("trainer_allowlist_added", { email: clean, by: actorEmail });
}

async function removeExtraTrainerEmail(env, email) {
  const clean = normalizeEmail(email);
  const settings = await getSystemSettings(env);
  const current = String(settings.trainer_emails_extra ?? "")
    .split(",").map(normalizeEmail).filter(Boolean);
  if (current.includes(clean)) {
    await saveSystemSettings(env, { trainer_emails_extra: current.filter((entry) => entry !== clean).join(",") });
  }
  bustAllowlistCache();
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function rateLimitClientKey(request, scope) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `${scope}:${ip}`;
}

function applyRateLimitMemory(key, now, windowMs, maxRequests) {
  const current = rateLimitStore.get(key);
  if (!current || now > current.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    cleanupRateLimit(now);
    return;
  }
  current.count += 1;
  if (current.count > maxRequests) {
    throw new ApiError(429, "RATE_LIMIT_EXCEEDED", "Too many requests, please try again later");
  }
}

// Shared rate limiting via KV when bound (one bucket across all isolates),
// in-memory fallback otherwise. KV counters are read-modify-write, so a
// burst of truly concurrent requests can overshoot by a little — acceptable
// for abuse limiting. Bind with: wrangler kv namespace create RATE_LIMIT_KV
// + kv_namespaces in wrangler.jsonc.
let rateLimitKvWarned = false;

export async function applyRateLimit(request, env, scope, windowMs, maxRequests) {
  const now = Date.now();
  const key = rateLimitClientKey(request, scope);
  const kv = env?.RATE_LIMIT_KV;
  if (!kv || typeof kv.get !== "function") {
    if (!rateLimitKvWarned) {
      rateLimitKvWarned = true;
      logWarn("rate_limit_kv_unbound", { hint: "Bind RATE_LIMIT_KV or limits stay per-isolate" });
    }
    applyRateLimitMemory(key, now, windowMs, maxRequests);
    return;
  }
  const windowId = Math.floor(now / windowMs);
  const kvKey = `rl:${key}:${windowId}`;
  try {
    const count = (Number(await kv.get(kvKey)) || 0) + 1;
    if (count > maxRequests) {
      throw new ApiError(429, "RATE_LIMIT_EXCEEDED", "Too many requests, please try again later");
    }
    await kv.put(kvKey, String(count), { expirationTtl: Math.ceil(windowMs / 1000) + 60 });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // KV misconfigured or unreachable: degrade to the isolate-local bucket
    // rather than failing the request.
    logWarn("rate_limit_kv_fallback", { scope });
    applyRateLimitMemory(key, now, windowMs, maxRequests);
  }
}

function cleanupRateLimit(now) {
  if (rateLimitStore.size < 500) {
    return;
  }

  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

async function listMembers(env, user, params) {
  const restParams = new URLSearchParams({ select: "*", owner_user_id: ownerFilter(user) });
  const search = params.get("search")?.trim();
  const status = params.get("status");
  const goal = params.get("goal");
  const payment = params.get("payment");
  const dueSoon = params.get("due_soon") === "true" || params.get("dueSoon") === "true";
  const sort = params.get("sort");
  const page = numberParam(params.get("page"));
  const limit = numberParam(params.get("limit"));

  if (search) {
    // PostgREST filter syntax chars must not reach the query: strip syntax and
    // escape LIKE wildcards so the term stays a literal match.
    const clean = search
      .replace(/[(),.:;]/g, " ")
      .replace(/[*%\\]/g, "")
      .trim()
      .slice(0, 80);
    if (clean) {
      restParams.set("or", `(name.ilike.*${clean}*,phone.ilike.*${clean}*,reg_no.ilike.*${clean}*)`);
    }
  }
  if (status && status !== "All" && STATUS_VALUES.has(status)) restParams.set("status", `eq.${status}`);
  if (goal && goal !== "All Goals" && GOALS.has(goal)) restParams.set("goal", `eq.${goal}`);
  if (payment && payment !== "All Payments" && PAYMENT_STATUSES.has(payment)) restParams.set("payment_status", `eq.${payment}`);
  if (dueSoon) {
    // Same 7-day window as the desk's Plans Ending count: one ending-soon number.
    restParams.set("status", "eq.Active");
    restParams.set("membership_due", `gte.${isoDateInTimeZone()}`);
    restParams.append("membership_due", `lte.${isoDateInTimeZone(addDays(new Date(), 7))}`);
  }

  restParams.set("order", sortOrder(sort));
  if (page && limit) {
    restParams.set("offset", String((page - 1) * limit));
    restParams.set("limit", String(limit));
  }

  const rows = await supabaseJson(env, `/members?${restParams.toString()}`);
  return rows.map(mapMember);
}

async function getMember(env, user, memberId) {
  const rows = await supabaseJson(env, `/members?select=*&id=eq.${encodeURIComponent(memberId)}&owner_user_id=${ownerFilter(user)}&limit=1`);
  if (!rows[0]) {
    throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");
  }
  return mapMember(rows[0]);
}

export function deriveMembershipStatus(membershipDue, paymentStatus) {
  const today = isoDateInTimeZone();
  if (membershipDue < today) {
    return "Expired";
  }
  if (membershipDue === today && (paymentStatus === "Pending" || paymentStatus === "Partially Paid")) {
    return "Expired";
  }
  return "Active";
}

async function findMemberByRequestKey(env, user, clientRequestId) {
  const params = new URLSearchParams({
    select: "*",
    owner_user_id: ownerFilter(user),
    client_request_id: `eq.${clientRequestId}`,
    limit: "1",
  });
  const rows = await supabaseJson(env, `/members?${params.toString()}`);
  return rows?.[0] ? mapMember(rows[0]) : null;
}

const memberKeyProbe = { checkedAt: 0, available: false };

async function memberKeyAvailable(env) {
  const now = Date.now();
  if (now - memberKeyProbe.checkedAt < 5 * 60 * 1000) {
    return memberKeyProbe.available;
  }
  try {
    await supabaseJson(env, "/members?select=client_request_id&limit=1");
    memberKeyProbe.checkedAt = now;
    memberKeyProbe.available = true;
    return true;
  } catch {
    memberKeyProbe.checkedAt = now;
    memberKeyProbe.available = false;
    return false;
  }
}

// Join cash gets a real receipt row (paid on join day), so collection
// history never depends on the member row alone. Keyed so a retried create
// completes a missing receipt instead of duplicating one.
async function ensureJoinReceipt(env, user, memberRow, input) {
  if (!(input.partialPaidAmount > 0)) {
    return;
  }
  const joinCollected = input.paymentStatus === "Paid"
    ? moneyNum(input.feesAmount)
    : Math.min(moneyNum(input.partialPaidAmount), moneyNum(input.feesAmount));
  if (joinCollected <= 0) {
    return;
  }
  const bucketsOn = await bucketColumnsAvailable(env);
  const keyOn = input.clientRequestId && await idempotencyAvailable(env, "payment_receipts");
  const joinKey = keyOn ? `join:${input.clientRequestId}` : null;
  if (joinKey) {
    try {
      if (await findReceiptByRequestKey(env, user, memberRow.id, joinKey)) {
        if (bucketsOn && moneyNum(memberRow.totalCollected) <= 0) {
          await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberRow.id)}&select=id`, {
            method: "PATCH",
            body: JSON.stringify({ total_collected: joinCollected }),
          });
          memberRow.totalCollected = joinCollected;
        }
        return;
      }
    } catch {
      // Lookup failed: fall through and attempt the insert (409-safe).
    }
  }
  try {
    await supabaseJson(env, "/payment_receipts?select=id", {
      method: "POST",
      body: JSON.stringify({
        member_id: memberRow.id,
        owner_user_id: user.id,
        receipt_no: generateReceiptNo(new Date(`${input.joinDate}T00:00:00Z`)),
        paid_on: input.joinDate,
        amount: joinCollected,
        method: input.method ?? "Cash",
        note: `Join payment: ${input.planType} plan`,
        ...(bucketsOn ? { arrears_applied: 0, cycle_applied: joinCollected, advance_applied: 0 } : {}),
        ...(joinKey ? { client_request_id: joinKey } : {}),
      }),
    });
  } catch (error) {
    if (!(joinKey && isUniqueViolation(error) && /client_request_id/.test(error.message))) {
      logError("join_receipt_create_failed", error, { memberId: memberRow.id });
      return;
    }
  }
  if (bucketsOn) {
    try {
      await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberRow.id)}&select=id`, {
        method: "PATCH",
        body: JSON.stringify({ total_collected: joinCollected }),
      });
      memberRow.totalCollected = joinCollected;
    } catch (error) {
      logError("join_total_backfill_failed", error, { memberId: memberRow.id });
    }
  }
}

async function createMember(env, user, input) {
  const keyOn = input.clientRequestId && await memberKeyAvailable(env);
  if (keyOn) {
    const prior = await findMemberByRequestKey(env, user, input.clientRequestId);
    if (prior) {
      await ensureJoinReceipt(env, user, prior, input);
      return { member: prior, isNew: false };
    }
  }
  let rows;
  try {
    rows = await supabaseJson(env, "/members?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        ...memberInputToDb(input),
        owner_user_id: user.id,
        status: deriveMembershipStatus(input.membershipDue, input.paymentStatus),
        ...(keyOn ? { client_request_id: input.clientRequestId } : {}),
      }),
    });
  } catch (error) {
    if (keyOn && isUniqueViolation(error) && /client_request_id/.test(error.message)) {
      const prior = await findMemberByRequestKey(env, user, input.clientRequestId);
      if (prior) {
        await ensureJoinReceipt(env, user, prior, input);
        return { member: prior, isNew: false };
      }
    }
    throw error;
  }
  const created = mapMember(rows[0]);
  await ensureJoinReceipt(env, user, created, input);
  return { member: created, isNew: true };
}

async function updateMember(env, user, memberId, input) {
  const current = await getMember(env, user, memberId);
  const keepStatus = current.status === "Suspended" || current.status === "Deleted";
  const dueChanged = current.membershipDue !== input.membershipDue;
  // Editing details must never drop old dues: the sheet only knows the cycle
  // figures, so the balance is re-derived here with the stored arrears, and a
  // Paid mark with dues outstanding is corrected to Partially Paid.
  const editArrears = moneyNum(current.arrearsAmount);
  const editPartial = Math.min(moneyNum(input.partialPaidAmount), moneyNum(input.feesAmount));
  const editBalance = editArrears + Math.max(moneyNum(input.feesAmount) - editPartial, 0);
  const editStatus = editBalance > 0 && input.paymentStatus === "Paid" ? "Partially Paid" : input.paymentStatus;
  const rows = await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberId)}&owner_user_id=${ownerFilter(user)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      ...memberInputToDb(input),
      partial_paid_amount: editPartial,
      balance_amount: editBalance,
      payment_status: editStatus,
      status: keepStatus ? current.status : deriveMembershipStatus(input.membershipDue, editStatus),
      // The DB trigger resets sms_sent_3days on due change; winback needs the same.
      ...(dueChanged ? { sms_sent_winback: false } : {}),
    }),
  });
  if (!rows[0]) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");
  return mapMember(rows[0]);
}

async function listAllPaymentReceipts(env, user) {
  const params = new URLSearchParams({
    select: "*",
    owner_user_id: ownerFilter(user),
    order: "paid_on.desc,created_at.desc",
  });
  const rows = await supabaseJson(env, `/payment_receipts?${params.toString()}`);
  return rows.map(mapPaymentReceipt);
}

async function listAllRenewalHistory(env, user) {
  const params = new URLSearchParams({
    select: "*",
    owner_user_id: ownerFilter(user),
    order: "renewed_on.desc,created_at.desc",
  });
  const rows = await supabaseJson(env, `/renewal_history?${params.toString()}`);
  return rows.map(mapRenewalHistory);
}

async function listAllAttendance(env, user) {
  const params = new URLSearchParams({
    select: "*,members!inner(owner_user_id)",
    "members.owner_user_id": ownerFilter(user),
    order: "visit_date.desc",
  });
  const rows = await supabaseJson(env, `/attendance?${params.toString()}`);
  return rows.map(mapAttendance);
}

async function listPaymentReceipts(env, user, memberId) {
  await getMember(env, user, memberId);
  const params = new URLSearchParams({
    select: "*",
    member_id: `eq.${memberId}`,
    owner_user_id: ownerFilter(user),
    order: "paid_on.desc,created_at.desc",
  });
  const rows = await supabaseJson(env, `/payment_receipts?${params.toString()}`);
  const receipts = rows.map(mapPaymentReceipt);
  const delivery = await receiptDeliveryByMember(env, memberId);
  for (const receipt of receipts) {
    const slot = delivery.get(receipt.receiptNo);
    if (slot) receipt.delivery = slot;
  }
  return receipts;
}

async function listRenewalHistory(env, user, memberId) {
  await getMember(env, user, memberId);
  const params = new URLSearchParams({
    select: "*",
    member_id: `eq.${memberId}`,
    owner_user_id: ownerFilter(user),
    order: "renewed_on.desc,created_at.desc",
  });
  const rows = await supabaseJson(env, `/renewal_history?${params.toString()}`);
  return rows.map(mapRenewalHistory);
}

async function paymentReceiptTotal(env, user, memberId, membershipStart) {
  const params = new URLSearchParams({
    select: "amount",
    member_id: `eq.${memberId}`,
    owner_user_id: ownerFilter(user),
  });
  if (membershipStart) {
    params.set("paid_on", `gte.${membershipStart}`);
  }
  const rows = await supabaseJson(env, `/payment_receipts?${params.toString()}`);
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

async function findReceiptByRequestKey(env, user, memberId, clientRequestId) {
  const params = new URLSearchParams({
    select: "*",
    member_id: `eq.${memberId}`,
    owner_user_id: ownerFilter(user),
    client_request_id: `eq.${clientRequestId}`,
    limit: "1",
  });
  const rows = await supabaseJson(env, `/payment_receipts?${params.toString()}`);
  return rows?.[0] ? mapPaymentReceipt(rows[0]) : null;
}

async function createPaymentReceipt(env, user, memberId, input) {
  const member = await getMember(env, user, memberId);
  assertNotDeleted(member);
  // Idempotency first: a retried POST returns the first receipt instead of
  // double-charging. No receipt SMS is re-sent for the replay.
  const dedupOn = input.clientRequestId && await idempotencyAvailable(env, "payment_receipts");
  if (dedupOn) {
    const prior = await findReceiptByRequestKey(env, user, memberId, input.clientRequestId);
    if (prior) {
      return { receipt: prior, member, receiptSms: undefined, duplicate: true };
    }
  }
  const bucketsOn = await bucketColumnsAvailable(env);
  // Pure computation from a member snapshot, so a lost race can recompute
  // from a fresh snapshot instead of overwriting a concurrent payment.
  async function computeReceiptCalc(current) {
    if (bucketsOn) {
      const buckets = memberBuckets(current);
      const amount = moneyNum(input.amount);
      if (amount <= 0) {
        throw new ApiError(400, "INVALID_PAYMENT_AMOUNT", "Enter a valid payment amount.");
      }
      const alloc = allocateMoney(buckets.arrears, buckets.fees, buckets.partial, amount);
      const next = {
        arrearsAmount: Math.max(buckets.arrears - alloc.arrearsApplied, 0),
        partialPaidAmount: buckets.partial + alloc.cycleApplied,
        advanceAmount: buckets.advance + alloc.advanceApplied,
      };
      next.balanceAmount = next.arrearsAmount + Math.max(buckets.fees - next.partialPaidAmount, 0);
      next.totalCollected = moneyNum(current.totalCollected) + alloc.total;
      next.paymentStatus = statusFromBuckets(buckets.fees, next.partialPaidAmount, next.arrearsAmount, next.advanceAmount);
      return { allocation: alloc, applied: next, legacyCollected: 0 };
    }
    const existingReceiptTotal = await paymentReceiptTotal(env, user, memberId, current.membershipStart);
    const legacyCollectedAmount = Math.max(0, Math.min(current.partialPaidAmount - existingReceiptTotal, current.feesAmount));
    const collectedBeforeReceipt = legacyCollectedAmount + existingReceiptTotal;
    const currentBalance = Math.max(current.feesAmount - collectedBeforeReceipt, 0);
    if (current.feesAmount <= 0) {
      throw new ApiError(400, "PAYMENT_NOT_REQUIRED", "This member has no fees to collect");
    }
    if (currentBalance <= 0) {
      throw new ApiError(400, "PAYMENT_ALREADY_SETTLED", "This member has no pending balance");
    }
    if (input.amount > currentBalance) {
      throw new ApiError(400, "PAYMENT_EXCEEDS_BALANCE", `Payment cannot exceed the pending balance of ₹${currentBalance}`);
    }
    return { allocation: null, applied: null, legacyCollected: collectedBeforeReceipt + input.amount };
  }
  let { allocation, applied, legacyCollected } = await computeReceiptCalc(member);

  const receiptNo = input.receiptNo || generateReceiptNo();
  const entry = paymentReceiptInputToDb(memberId, user.id, input, receiptNo);
  if (bucketsOn && allocation) {
    entry.arrears_applied = allocation.arrearsApplied;
    entry.cycle_applied = allocation.cycleApplied;
    entry.advance_applied = allocation.advanceApplied;
  }
  if (dedupOn) {
    entry.client_request_id = input.clientRequestId;
  }
  let rows;
  try {
    rows = await supabaseJson(env, "/payment_receipts?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(entry),
    });
  } catch (error) {
    // Race loser: a concurrent retry already inserted this key — return it.
    if (dedupOn && isUniqueViolation(error) && /client_request_id/.test(error.message)) {
      const prior = await findReceiptByRequestKey(env, user, memberId, input.clientRequestId);
      if (prior) {
        return { receipt: prior, member, receiptSms: undefined, duplicate: true };
      }
    }
    // Custom receipt_no collision: friendly 409 instead of a raw Supabase error.
    if (isUniqueViolation(error) && /receipt_no/.test(error.message)) {
      throw new ApiError(409, "RECEIPT_NO_TAKEN", `Receipt number ${receiptNo} is already used`);
    }
    throw error;
  }
  const receipt = rows[0];
  if (!receipt) throw new ApiError(500, "PAYMENT_RECEIPT_CREATE_FAILED", "Unable to create payment receipt");

  function patchFromCalc(calc, snapshot) {
    if (bucketsOn && calc.applied) {
      return {
        partial_paid_amount: calc.applied.partialPaidAmount,
        arrears_amount: calc.applied.arrearsAmount,
        advance_amount: calc.applied.advanceAmount,
        balance_amount: calc.applied.balanceAmount,
        total_collected: calc.applied.totalCollected,
        payment_status: calc.applied.paymentStatus,
      };
    }
    const safeCollected = Math.min(Math.max(calc.legacyCollected, 0), snapshot.feesAmount);
    const balanceAmount = Math.max(snapshot.feesAmount - safeCollected, 0);
    return {
      partial_paid_amount: safeCollected,
      balance_amount: balanceAmount,
      payment_status: paymentStatusFromAmounts(snapshot.feesAmount, safeCollected),
    };
  }
  // Optimistic concurrency: the PATCH only lands if nobody else changed the
  // member since our snapshot. On conflict, recompute from a fresh snapshot
  // (and fix the receipt's allocation lines) instead of overwriting.
  const keepStatus = member.status === "Suspended" || member.status === "Deleted";
  let memberRows = null;
  let snapshot = member;
  let calc = { allocation, applied, legacyCollected };
  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (attempt > 1) {
        snapshot = await getMember(env, user, memberId);
        calc = await computeReceiptCalc(snapshot);
        allocation = calc.allocation;
        if (bucketsOn && calc.allocation) {
          await supabaseJson(env, `/payment_receipts?id=eq.${encodeURIComponent(receipt.id)}`, {
            method: "PATCH",
            body: JSON.stringify({
              arrears_applied: calc.allocation.arrearsApplied,
              cycle_applied: calc.allocation.cycleApplied,
              advance_applied: calc.allocation.advanceApplied,
            }),
          });
        }
      }
      const memberPatch = patchFromCalc(calc, snapshot);
      const guard = snapshot.updatedAt ? `&updated_at=eq.${encodeURIComponent(snapshot.updatedAt)}` : "";
      memberRows = await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberId)}&owner_user_id=${ownerFilter(user)}${guard}&select=*`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          ...memberPatch,
          // A member expired at midnight for unpaid dues revives when the dues clear.
          status: keepStatus ? snapshot.status : deriveMembershipStatus(snapshot.membershipDue, memberPatch.payment_status),
        }),
      });
      if (memberRows[0]) break;
      memberRows = null;
    }
    if (!memberRows) {
      throw new ApiError(409, "CONCURRENT_UPDATE", "Someone else just saved this member — please try again");
    }
  } catch (error) {
    // Compensate: never leave an orphan receipt behind a failed member update.
    try {
      await supabaseJson(env, `/payment_receipts?id=eq.${encodeURIComponent(receipt.id)}`, { method: "DELETE" });
    } catch {
      logError("receipt_compensation_failed", error, { receiptId: receipt.id });
    }
    throw error;
  }
  if (!memberRows[0]) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");

  const result = {
    receipt: mapPaymentReceipt(receipt),
    member: mapMember(memberRows[0]),
  };

  // Receipt goes out on SMS + email (each queued + auto-retried alone).
  const notified = await sendReceiptNotifications(env, result.member, result.receipt);
  result.receiptSms = notified.sms;
  result.receiptEmail = notified.email;

  return result;
}

async function findRenewalByRequestKey(env, user, memberId, clientRequestId) {
  const params = new URLSearchParams({
    select: "*",
    member_id: `eq.${memberId}`,
    owner_user_id: ownerFilter(user),
    client_request_id: `eq.${clientRequestId}`,
    limit: "1",
  });
  const rows = await supabaseJson(env, `/renewal_history?${params.toString()}`);
  return rows?.[0] ?? null;
}

// Finish a renewal whose history row exists but whose member PATCH may never
// have landed (crash between the writes). Only resumes when the member is
// provably still at the pre-renewal dates; anything else returns the current
// state as a duplicate so a later edit is never overwritten.
async function resumeRenewalFromHistory(env, user, member, historyRow, clientRequestId) {
  const memberId = member.id;
  const applied =
    member.membershipStart === historyRow.new_start_date &&
    member.membershipDue === historyRow.new_due_date &&
    member.planType === historyRow.new_plan_type;
  const untouched =
    member.membershipStart === historyRow.old_start_date &&
    member.membershipDue === historyRow.old_due_date;
  if (applied || !untouched) {
    const fresh = applied ? member : await getMember(env, user, memberId);
    return { member: fresh, receipt: null, receiptSms: undefined, duplicate: true };
  }
  const bucketsOn = await bucketColumnsAvailable(env);
  if (!bucketsOn || historyRow.collected_amount == null) {
    // Pre-bucket rows cannot be resumed safely (collected cash unknown);
    // surface the wedge honestly instead of guessing.
    throw new ApiError(409, "RENEW_INCOMPLETE",
      "This renewal was interrupted before saving. Run the database update, then renew again from the member page.");
  }
  const buckets = memberBuckets(member);
  const renewed = applyRenewalBuckets(buckets, Number(historyRow.amount), Number(historyRow.collected_amount), member.totalCollected);
  const rows = await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberId)}&owner_user_id=${ownerFilter(user)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      membership_start: historyRow.new_start_date,
      membership_due: historyRow.new_due_date,
      fees_amount: renewed.feesAmount,
      plan_type: historyRow.new_plan_type,
      payment_status: renewed.paymentStatus,
      partial_paid_amount: renewed.partialPaidAmount,
      arrears_amount: renewed.arrearsAmount,
      advance_amount: renewed.advanceAmount,
      total_collected: renewed.totalCollected,
      balance_amount: renewed.balanceAmount,
      status: deriveMembershipStatus(historyRow.new_due_date, renewed.paymentStatus),
      sms_sent_3days: false,
      sms_sent_winback: false,
    }),
  });
  if (!rows[0]) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");
  const updatedMember = mapMember(rows[0]);
  let receipt = null;
  try {
    receipt = await findReceiptByRequestKey(env, user, memberId, `renew:${clientRequestId}`);
  } catch {
    receipt = null;
  }
  if (!receipt && renewed.allocation.total > 0) {
    try {
      const receiptRows = await supabaseJson(env, "/payment_receipts?select=*", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          member_id: memberId,
          owner_user_id: user.id,
          receipt_no: generateReceiptNo(new Date(historyRow.new_start_date)),
          paid_on: historyRow.new_start_date,
          amount: renewed.allocation.total,
          method: historyRow.collected_method || "Cash",
          note: `Membership Renewal: ${historyRow.new_plan_type} plan (${historyRow.new_start_date} to ${historyRow.new_due_date}) — ${receiptSplitText(renewed.allocation)}`,
          arrears_applied: renewed.allocation.arrearsApplied,
          cycle_applied: renewed.allocation.cycleApplied,
          advance_applied: renewed.allocation.advanceApplied,
          client_request_id: `renew:${clientRequestId}`,
        }),
      });
      receipt = receiptRows?.[0] ? mapPaymentReceipt(receiptRows[0]) : null;
    } catch (error) {
      // Lost a race with another resumer: fetch the winner's receipt.
      if (isUniqueViolation(error) && /client_request_id/.test(error.message)) {
        receipt = await findReceiptByRequestKey(env, user, memberId, `renew:${clientRequestId}`).catch(() => null);
      } else {
        throw error;
      }
    }
  }
  const notified = receipt ? await sendReceiptNotifications(env, updatedMember, receipt) : null;
  logWarn("renew_resumed", { memberId, historyId: historyRow.id });
  return { member: updatedMember, receipt, receiptSms: notified?.sms, receiptEmail: notified?.email, resumed: true };
}

async function renewMember(env, user, memberId, membershipStart, membershipDue, feesAmount, planType, paymentStatus = "Pending", collectedAmount = 0, method = "Cash", clientRequestId = null) {
  const member = await getMember(env, user, memberId);
  assertNotDeleted(member);
  // Idempotency first: a retried PATCH resumes an interrupted renewal or
  // returns the current state instead of duplicating history rows, receipts,
  // and arrears. Receipt notifications are keyed per receipt, so resuming
  // never re-sends an already-sent message.
  const historyCols = await idempotencyAvailable(env, "renewal_history");
  const dedupOn = clientRequestId && historyCols;
  if (dedupOn) {
    const prior = await findRenewalByRequestKey(env, user, memberId, clientRequestId);
    if (prior) {
      return resumeRenewalFromHistory(env, user, member, prior, clientRequestId);
    }
  }
  const newPlan = planType ?? member.planType;

  // Bucket path: arrears stay visible, the new fee stays pure, collection
  // allocates oldest-first. Pre-migration databases keep legacy behavior.
  // Pure computation from a snapshot so a lost race can recompute instead of
  // overwriting a concurrent payment.
  const bucketsOn = await bucketColumnsAvailable(env);
  const fees = moneyNum(feesAmount);
  const collected = moneyNum(collectedAmount);
  async function computeRenewCalc(current) {
    const snapBuckets = memberBuckets(current);
    const snapArrearsClosed = snapBuckets.arrears + cycleDueOf(snapBuckets);
    const snapCreditUsed = Math.min(snapBuckets.advance, fees);
    let snapLegacyArrears = 0;
    if (!bucketsOn) {
      const oldReceiptTotal = await paymentReceiptTotal(env, user, memberId, current.membershipStart);
      const oldLegacy = Math.max(0, Math.min(current.partialPaidAmount - oldReceiptTotal, current.feesAmount));
      snapLegacyArrears = Math.max(current.feesAmount - (oldLegacy + oldReceiptTotal), 0);
    }
    const snapTotal = bucketsOn
      ? snapArrearsClosed + Math.max(fees - snapCreditUsed, 0)
      : fees + snapLegacyArrears;
    if (paymentStatus === "Paid" && collected < snapTotal && bucketsOn) {
      throw new ApiError(400, "INVALID_PAID_AMOUNT", `Paid needs at least Rs.${snapTotal} collected; use Partially Paid instead`);
    }
    if (paymentStatus === "Partially Paid") {
      if (snapTotal < 2) {
        throw new ApiError(400, "INVALID_PARTIAL_AMOUNT", "Partial payment needs a total of at least 2; mark Paid or Pending instead");
      }
      if (collected < 1 || collected >= snapTotal) {
        throw new ApiError(400, "INVALID_PARTIAL_AMOUNT", `Partial amount must be between 1 and ${snapTotal - 1}`);
      }
    }
    const snapPaid = paymentStatus === "Pending" ? 0 : paymentStatus === "Paid" && !bucketsOn ? snapTotal : collected;
    const snapRenewed = bucketsOn ? applyRenewalBuckets(snapBuckets, fees, snapPaid, current.totalCollected) : null;
    return {
      totalOwed: snapTotal,
      paidNow: snapPaid,
      renewed: snapRenewed,
      safePartial: bucketsOn ? snapRenewed.allocation.total : snapPaid,
      balanceAmount: bucketsOn ? snapRenewed.balanceAmount : Math.max(snapTotal - snapPaid, 0),
      derivedStatus: bucketsOn ? snapRenewed.paymentStatus : paymentStatusFromAmounts(snapTotal, snapPaid),
      historyArrears: bucketsOn ? snapRenewed.arrearsClosed : snapLegacyArrears,
    };
  }
  let calc = await computeRenewCalc(member);
  const totalOwed = calc.totalOwed;
  const paidNow = calc.paidNow;
  const renewed = calc.renewed;
  const safePartial = calc.safePartial;
  const balanceAmount = calc.balanceAmount;
  const derivedStatus = calc.derivedStatus;
  const historyArrears = calc.historyArrears;

  const historyEntry = {
    member_id: memberId,
    owner_user_id: user.id,
    old_plan_type: member.planType,
    new_plan_type: newPlan,
    old_start_date: member.membershipStart,
    old_due_date: member.membershipDue,
    new_start_date: membershipStart,
    new_due_date: membershipDue,
    amount: fees,
    arrears_carried: historyArrears,
    payment_status: derivedStatus,
    renewed_on: isoDateInTimeZone(),
  };
  if (historyCols) {
    historyEntry.old_amount = member.feesAmount;
  }
  if (bucketsOn) {
    historyEntry.collected_amount = paidNow;
    historyEntry.collected_method = method;
  }
  if (dedupOn) {
    historyEntry.client_request_id = clientRequestId;
  }
  let historyRows;
  try {
    historyRows = await supabaseJson(env, "/renewal_history?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(historyEntry),
    });
  } catch (error) {
    // Race loser: the winner may still be in flight, so wait a beat, then
    // either return its finished state or resume an interrupted one.
    if (dedupOn && isUniqueViolation(error) && /client_request_id/.test(error.message)) {
      await sleep(1500);
      const prior = await findRenewalByRequestKey(env, user, memberId, clientRequestId);
      const fresh = await getMember(env, user, memberId);
      if (!prior) {
        return { member: fresh, receipt: null, receiptSms: undefined, duplicate: true };
      }
      return resumeRenewalFromHistory(env, user, fresh, prior, clientRequestId);
    }
    throw error;
  }
  const historyId = historyRows?.[0]?.id;

  // Create a payment receipt only for money actually collected at renewal time.
  // A receipt failure deletes the history row again: without this the retry
  // would find the history key and the renewal could never complete cleanly.
  let receipt = null;
  if (safePartial > 0) {
    const receiptNo = generateReceiptNo(new Date(membershipStart));
    const receiptBody = {
      member_id: memberId,
      owner_user_id: user.id,
      receipt_no: receiptNo,
      paid_on: membershipStart,
      amount: safePartial,
      method,
      note: bucketsOn && renewed
        ? `Membership Renewal: ${newPlan} plan (${membershipStart} to ${membershipDue}) — ${receiptSplitText(renewed.allocation)}`
        : `Membership Renewal: ${newPlan} plan (${membershipStart} to ${membershipDue})${historyArrears > 0 ? ` (incl. Rs.${historyArrears} old dues)` : ""}`,
    };
    if (bucketsOn && renewed) {
      receiptBody.arrears_applied = renewed.allocation.arrearsApplied;
      receiptBody.cycle_applied = renewed.allocation.cycleApplied;
      receiptBody.advance_applied = renewed.allocation.advanceApplied;
    }
    if (dedupOn) {
      receiptBody.client_request_id = `renew:${clientRequestId}`;
    }
    let receiptRows;
    try {
      receiptRows = await supabaseJson(env, "/payment_receipts?select=*", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(receiptBody),
      });
    } catch (receiptError) {
      if (historyId) {
        try {
          await supabaseJson(env, `/renewal_history?id=eq.${encodeURIComponent(historyId)}`, { method: "DELETE" });
        } catch {
          logError("renew_history_compensation_failed", receiptError, { memberId, historyId });
        }
      }
      throw receiptError;
    }
    receipt = receiptRows && receiptRows[0] ? mapPaymentReceipt(receiptRows[0]) : null;
  }

  // Optimistic concurrency: only land if the member is untouched since our
  // snapshot. On conflict, recompute from fresh data and fix the history +
  // receipt rows to match before retrying.
  let rows = null;
  let snapshot = member;
  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (attempt > 1) {
        snapshot = await getMember(env, user, memberId);
        calc = await computeRenewCalc(snapshot);
        if (historyId) {
          await supabaseJson(env, `/renewal_history?id=eq.${encodeURIComponent(historyId)}`, {
            method: "PATCH",
            body: JSON.stringify({
              arrears_carried: calc.historyArrears,
              payment_status: calc.derivedStatus,
              ...(bucketsOn ? { collected_amount: calc.paidNow } : {}),
            }),
          });
        }
        if (receipt && bucketsOn && calc.renewed) {
          await supabaseJson(env, `/payment_receipts?id=eq.${encodeURIComponent(receipt.id)}`, {
            method: "PATCH",
            body: JSON.stringify({
              amount: calc.safePartial,
              arrears_applied: calc.renewed.allocation.arrearsApplied,
              cycle_applied: calc.renewed.allocation.cycleApplied,
              advance_applied: calc.renewed.allocation.advanceApplied,
              note: `Membership Renewal: ${newPlan} plan (${membershipStart} to ${membershipDue}) — ${receiptSplitText(calc.renewed.allocation)}`,
            }),
          });
        }
      }
      const guard = snapshot.updatedAt ? `&updated_at=eq.${encodeURIComponent(snapshot.updatedAt)}` : "";
      rows = await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberId)}&owner_user_id=${ownerFilter(user)}${guard}&select=*`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          membership_start: membershipStart,
          membership_due: membershipDue,
          fees_amount: bucketsOn && calc.renewed ? calc.renewed.feesAmount : calc.totalOwed,
          plan_type: newPlan,
          payment_status: calc.derivedStatus,
          partial_paid_amount: bucketsOn && calc.renewed ? calc.renewed.partialPaidAmount : calc.safePartial,
          ...(bucketsOn && calc.renewed
            ? {
                arrears_amount: calc.renewed.arrearsAmount,
                advance_amount: calc.renewed.advanceAmount,
                total_collected: calc.renewed.totalCollected,
              }
            : {}),
          balance_amount: calc.balanceAmount,
          status: deriveMembershipStatus(membershipDue, calc.derivedStatus),
          sms_sent_3days: false,
          sms_sent_winback: false,
        }),
      });
      if (rows[0]) break;
      rows = null;
    }
    if (!rows) {
      throw new ApiError(409, "CONCURRENT_UPDATE", "Someone else just saved this member — please try again");
    }
  } catch (error) {
    // Compensate: roll back the history entry and renewal receipt.
    try {
      if (receipt) {
        await supabaseJson(env, `/payment_receipts?id=eq.${encodeURIComponent(receipt.id)}`, { method: "DELETE" });
      }
      if (historyId) {
        await supabaseJson(env, `/renewal_history?id=eq.${encodeURIComponent(historyId)}`, { method: "DELETE" });
      }
    } catch {
      logError("renew_compensation_failed", error, { memberId });
    }
    throw error;
  }
  if (!rows[0]) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");

  const updatedMember = mapMember(rows[0]);
  // Surface the receipt outcomes like createPaymentReceipt does, so a
  // failed renewal message is visible instead of silently swallowed.
  const notified = receipt ? await sendReceiptNotifications(env, updatedMember, receipt) : null;

  return { member: updatedMember, receipt, receiptSms: notified?.sms, receiptEmail: notified?.email };
}

function assertNotDeleted(member) {
  if (member.status === "Deleted") {
    throw new ApiError(400, "MEMBER_DELETED", "This member is deleted. Restore the member first.");
  }
}

async function suspendMember(env, user, memberId) {
  const member = await getMember(env, user, memberId);
  assertNotDeleted(member);
  const nextStatus = member.status === "Suspended" ? (member.membershipDue < isoDateInTimeZone() ? "Expired" : "Active") : "Suspended";
  const rows = await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberId)}&owner_user_id=${ownerFilter(user)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: nextStatus }),
  });
  if (!rows[0]) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");
  return mapMember(rows[0]);
}

async function deleteMember(env, user, memberId) {
  const rows = await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberId)}&owner_user_id=${ownerFilter(user)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "Deleted" }),
  });
  if (!rows[0]) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");
  return mapMember(rows[0]);
}

async function restoreMember(env, user, memberId) {
  const member = await getMember(env, user, memberId);
  if (member.status !== "Deleted") {
    return member;
  }
  const rows = await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberId)}&owner_user_id=${ownerFilter(user)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: deriveMembershipStatus(member.membershipDue, member.paymentStatus) }),
  });
  if (!rows[0]) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");
  return mapMember(rows[0]);
}

// Hard delete: member + visits + receipts + renewals + message logs, atomically.
// Only for members that are already soft-deleted: purge is the second,
// deliberate step after Delete, never a one-tap accident.
async function purgeMember(env, user, memberId) {
  const member = await getMember(env, user, memberId);
  if (member.status !== "Deleted") {
    throw new ApiError(400, "PURGE_REQUIRES_DELETE", "Delete the member first, then delete forever from the Deleted list");
  }
  try {
    const counts = await supabaseJson(env, "/rpc/purge_member_data", {
      method: "POST",
      body: JSON.stringify({ p_member_id: memberId }),
    });
    logWarn("member_purged", { memberId, by: user.email, counts });
    return counts;
  } catch (error) {
    if (error instanceof ApiError && /MEMBER_NOT_FOUND/.test(error.message)) {
      throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");
    }
    if (error instanceof ApiError && error.status === 404) {
      throw new ApiError(503, "MIGRATION_MISSING", "Database update needed: run APPLY_MISSING_MIGRATIONS.sql in Supabase first");
    }
    throw error;
  }
}

// Full gym reset: every member, receipt, renewal, visit, and message log.
// Settings and credentials survive. Developers and trainers both may run it;
// the UI gates it behind a typed confirmation and a backup reminder.
async function wipeAllGymData(env, user) {
  try {
    const counts = await supabaseJson(env, "/rpc/wipe_all_gym_data", {
      method: "POST",
      body: JSON.stringify({ p_owner_id: user.id }),
    });
    logWarn("gym_data_wiped", { by: user.email, counts });
    return counts;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || /p_owner_id|wipe_all_gym_data/i.test(error.message))) {
      throw new ApiError(503, "MIGRATION_MISSING", "Database update needed: run APPLY_MISSING_MIGRATIONS.sql in Supabase first");
    }
    throw error;
  }
}

async function listAttendance(env, user, memberId, month) {
  await getMember(env, user, memberId);
  const params = new URLSearchParams({
    select: "*",
    member_id: `eq.${memberId}`,
    order: "visit_date.desc",
  });
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    params.set("visit_date", `gte.${month}-01`);
    params.append("visit_date", `lt.${month}-32`);
  }
  const rows = await supabaseJson(env, `/attendance?${params.toString()}`);
  return rows.map(mapAttendance);
}

async function createAttendance(env, user, memberId, visitDate, weightKg) {
  const member = await getMember(env, user, memberId);
  assertNotDeleted(member);
  const existing = await supabaseJson(env, `/attendance?select=id&member_id=eq.${encodeURIComponent(memberId)}&visit_date=eq.${encodeURIComponent(visitDate)}&limit=1`);
  if (existing && existing.length > 0) {
    throw new ApiError(409, "VISIT_ALREADY_LOGGED", "A visit is already logged for this date");
  }
  const rows = await supabaseJson(env, "/attendance?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      member_id: memberId,
      visit_date: visitDate,
      weight_kg: weightKg ?? null,
    }),
  });
  // A visit weight is the member's newest known weight — unless a LATER visit
  // already recorded one (backdated entries must not rewind the profile).
  // BMI recalculates itself (generated column).
  if (weightKg !== undefined && weightKg !== null) {
    const later = await supabaseJson(env, `/attendance?select=id&member_id=eq.${encodeURIComponent(memberId)}&visit_date=gt.${encodeURIComponent(visitDate)}&weight_kg=not.is.null&limit=1`);
    if (!later || later.length === 0) {
      await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberId)}&owner_user_id=${ownerFilter(user)}&select=id`, {
        method: "PATCH",
        body: JSON.stringify({ weight_kg: weightKg }),
      });
    }
  }
  return mapAttendance(rows[0]);
}

async function deleteAttendance(env, user, attendanceId) {
  const rows = await supabaseJson(env, `/attendance?select=id,member_id&id=eq.${encodeURIComponent(attendanceId)}&limit=1`);
  if (!rows[0]) throw new ApiError(404, "ATTENDANCE_NOT_FOUND", "Attendance entry not found");
  await getMember(env, user, rows[0].member_id);
  await supabaseJson(env, `/attendance?id=eq.${encodeURIComponent(attendanceId)}`, {
    method: "DELETE",
  });
}

async function getDashboardStats(env, user) {
  const today = isoDateInTimeZone();
  const weekEnd = isoDateInTimeZone(addDays(new Date(), 7));
  const monthStart = `${today.slice(0, 8)}01`;

  const [total, active, expired, pending, partiallyPaid, due, newThisMonth] = await Promise.all([
    countRows(env, "members", [["owner_user_id", ownerFilter(user)], ["status", "neq.Deleted"]]),
    countRows(env, "members", [["owner_user_id", ownerFilter(user)], ["status", "eq.Active"]]),
    countRows(env, "members", [["owner_user_id", ownerFilter(user)], ["status", "eq.Expired"]]),
    countRows(env, "members", [["owner_user_id", ownerFilter(user)], ["status", "neq.Deleted"], ["payment_status", "eq.Pending"]]),
    countRows(env, "members", [["owner_user_id", ownerFilter(user)], ["status", "neq.Deleted"], ["payment_status", "eq.Partially Paid"]]),
    countRows(env, "members", [
      ["owner_user_id", ownerFilter(user)],
      ["status", "eq.Active"],
      ["membership_due", `gte.${today}`],
      ["membership_due", `lte.${weekEnd}`],
    ]),
    countRows(env, "members", [["owner_user_id", ownerFilter(user)], ["status", "neq.Deleted"], ["created_at", `gte.${monthStart}`]]),
  ]);

  return {
    total_members: total,
    active,
    expired,
    due_this_week: due,
    pending_payments: pending + partiallyPaid,
    new_this_month: newThisMonth,
  };
}

async function runExpireStatus(env) {
  const today = isoDateInTimeZone();
  
  // 1. Expire plan ended yesterday or earlier
  const rows1 = await supabaseJson(env, `/members?status=eq.Active&membership_due=lt.${today}&select=id`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "Expired" }),
  });
  
  // 2. Expire plan ending today with unpaid status
  const rows2 = await supabaseJson(env, `/members?status=eq.Active&membership_due=eq.${today}&payment_status=in.(Pending,Partially Paid)&select=id`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "Expired" }),
  });
  
  return rows1.length + rows2.length;
}

function smsSendingConfigured(env, settings) {
  return Boolean((settings.smsgate_username || env.SMSGATE_USERNAME) && (settings.smsgate_password || env.SMSGATE_PASSWORD));
}

async function runSmsReminder(env) {
  const settings = await getSystemSettings(env);

  const smsEnabled = settings.sms_enabled !== "false";
  const smsAutoPaused = settings.sms_auto_reminder_paused === "true";
  const anyChannel = (smsEnabled && smsSendingConfigured(env, settings))
    || (settings.wa_enabled !== "false" && waSendingConfigured(env, settings))
    || (settings.email_enabled !== "false" && emailSendingConfigured(env, settings));

  const result = { sent: 0, failed: 0, queued: 0, skipped: 0, aborted: false, error: "" };
  if (smsAutoPaused || !anyChannel) {
    logWarn("sms_reminders_skipped", { smsEnabled, smsAutoPaused, anyChannel });
    result.error = smsAutoPaused ? "Automatic reminders are paused" : "No notification channel is configured";
    await saveSmsRunStats(env, result);
    return result;
  }
  // Shared across the run: a channel that fails auth/config for one member is
  // skipped for the rest instead of burning one failed attempt per member.
  const runState = { dead: new Set() };

  const BATCH_CAP = 250;
  // Deterministic dedup keys: a re-run never creates a second outbox row for
  // the same member+occasion, so redelivery is impossible by construction.
  const todayIst = isoDateInTimeZone();

  // 1. Process 3-Day Alerts via SMS (1-3 day window catches missed cron days)
  const threeDayMembers = (await membersNeedingReminder(env)).slice(0, BATCH_CAP);
  for (const member of threeDayMembers) {
    if (result.aborted) break;
    const owes3day = memberBalanceOwed(member);
    const outcome = await dispatchSmart(env, {
      phone: member.phone,
      email: member.email,
      message: owes3day > 0 ? createBalanceReminderText(member, "3day") : createReminderText(member),
      kind: "reminder_3day",
      memberId: member.id,
      clientRequestId: `auto:3day:${member.id}:${member.membershipDue}`,
      onSentAction: "reminder_3day",
      runState,
    });
    tallyReminderOutcome(result, outcome, member.id, "sms_3day_reminder");
    await sleep(SMS_BULK_PACING_MS);
  }

  // 2. Process Due Day Alerts via SMS (once per member per day: progress is
  // tracked so a retry only covers members not yet notified).
  if (!result.aborted) {
    if (settings.sms_last_dueday_run === todayIst) {
      logInfo("sms_dueday_run_skipped", { reason: "already ran today", today: todayIst });
    } else {
      let progress = { date: todayIst, sent: [] };
      try {
        const parsed = settings.sms_dueday_progress ? JSON.parse(settings.sms_dueday_progress) : null;
        if (parsed && parsed.date === todayIst && Array.isArray(parsed.sent)) {
          progress = parsed;
        }
      } catch {
        progress = { date: todayIst, sent: [] };
      }
      const alreadySent = new Set(progress.sent);
      const todayMembers = (await membersDueToday(env)).slice(0, BATCH_CAP);
      let dueDayFailures = 0;
      for (const member of todayMembers) {
        if (result.aborted) break;
        if (alreadySent.has(member.id)) {
          result.skipped += 1;
          continue;
        }
        const owesDueday = memberBalanceOwed(member);
        const outcome = await dispatchSmart(env, {
          phone: member.phone,
          email: member.email,
          message: owesDueday > 0 ? createBalanceReminderText(member, "dueday") : createDueDayReminderText(member),
          kind: "reminder_dueday",
          memberId: member.id,
          clientRequestId: `auto:dueday:${member.id}:${todayIst}`,
          runState,
        });
        tallyReminderOutcome(result, outcome, member.id, "sms_dueday_reminder");
        if (outcome.status === "sent") {
          alreadySent.add(member.id);
        } else {
          dueDayFailures += 1;
        }
        await sleep(SMS_BULK_PACING_MS);
      }
      await saveSystemSettings(env, { sms_dueday_progress: JSON.stringify({ date: todayIst, sent: [...alreadySent] }) });
      if (dueDayFailures === 0 && !result.aborted) {
        await saveSystemSettings(env, { sms_last_dueday_run: todayIst });
      }
    }
  }

  // 3. Process Win-Back Alerts via SMS (expired 15+ days ago, once each)
  if (!result.aborted) {
    const winbackMembers = (await membersNeedingWinback(env)).slice(0, BATCH_CAP);
    for (const member of winbackMembers) {
      if (result.aborted) break;
      const outcome = await dispatchSmart(env, {
        phone: member.phone,
        email: member.email,
        message: createWinbackText(member),
        kind: "winback",
        memberId: member.id,
        clientRequestId: `auto:winback:${member.id}:${member.membershipDue}`,
        onSentAction: "winback",
        runState,
      });
      tallyReminderOutcome(result, outcome, member.id, "sms_winback");
      await sleep(SMS_BULK_PACING_MS);
    }
  }

  // 4. Overdue balance nudge (expired exactly 2 days ago and still owes).
  // Date-anchored query fires once per member; the idempotency key makes a
  // same-day re-run replay instead of resending. All plan lengths included.
  if (!result.aborted) {
    const balanceMembers = (await membersNeedingBalanceNudge(env)).slice(0, BATCH_CAP);
    for (const member of balanceMembers) {
      if (result.aborted) break;
      const outcome = await dispatchSmart(env, {
        phone: member.phone,
        email: member.email,
        message: createBalanceReminderText(member, "overdue2day"),
        kind: "balance_overdue",
        memberId: member.id,
        clientRequestId: `auto:balance2day:${member.id}:${member.membershipDue}`,
        runState,
      });
      tallyReminderOutcome(result, outcome, member.id, "sms_balance_overdue");
      await sleep(SMS_BULK_PACING_MS);
    }
  }

  await saveSmsRunStats(env, result);
  return result;
}

function tallyReminderOutcome(result, outcome, memberId, event) {
  if (outcome.status === "sent") {
    result.sent += 1;
    return;
  }
  if (outcome.status === "queued") {
    result.queued += 1;
    logWarn(`${event}_queued`, { memberId, error: outcome.error });
    return;
  }
  result.failed += 1;
  logError(`${event}_failed`, outcome.error, { memberId });
  // Auth/config failures would fail every remaining member identically: stop
  // the batch immediately instead of hammering dead providers 250 times.
  if (outcome.code && isProviderAbortCode(outcome.code)) {
    result.aborted = true;
    result.error = typeof outcome.error === "string" ? outcome.error : "Notification authentication failed";
  } else if (!result.error) {
    result.error = typeof outcome.error === "string" ? outcome.error : "Some reminders failed";
  }
}

async function saveSmsRunStats(env, result) {
  try {
    await saveSystemSettings(env, {
      sms_last_run_at: new Date().toISOString(),
      sms_last_run_sent: String(result.sent),
      sms_last_run_failed: String(result.failed),
      sms_last_run_queued: String(result.queued),
      sms_last_run_skipped: String(result.skipped),
      sms_last_run_error: result.error ? String(result.error).slice(0, 240) : "",
    });
  } catch (error) {
    logError("save_sms_run_stats_failed", error);
  }
}

export function reminderWindowParams(fromDate = new Date()) {
  const params = new URLSearchParams({
    select: "*",
    sms_sent_3days: "eq.false",
    status: "eq.Active",
  });
  params.set("membership_due", `gte.${isoDateInTimeZone(addDays(fromDate, REMINDER_WINDOW_START_DAYS))}`);
  params.append("membership_due", `lte.${isoDateInTimeZone(addDays(fromDate, REMINDER_WINDOW_END_DAYS))}`);
  return params;
}

export function dueTodayParams(fromDate = new Date()) {
  return new URLSearchParams({
    select: "*",
    membership_due: `eq.${isoDateInTimeZone(fromDate)}`,
    status: "in.(Active,Expired)",
  });
}

export function winbackParams(fromDate = new Date()) {
  const params = new URLSearchParams({
    select: "*",
    status: "eq.Expired",
    sms_sent_winback: "eq.false",
  });
  params.set("membership_due", `lt.${isoDateInTimeZone(addDays(fromDate, -WINBACK_MIN_DAYS))}`);
  params.append("membership_due", `gte.${isoDateInTimeZone(addDays(fromDate, -WINBACK_MAX_DAYS))}`);
  return params;
}

// Overdue balance nudge: expired exactly 2 days ago and still owes money.
// Date-anchored, so it fires exactly once per member with no flag column.
// Unlike the renewal sweeps this covers ALL plan lengths: owed money is owed.
export function balanceOverdueParams(fromDate = new Date()) {
  return new URLSearchParams({
    select: "*",
    status: "eq.Expired",
    membership_due: `eq.${isoDateInTimeZone(addDays(fromDate, -2))}`,
    payment_status: "in.(Pending,Partially Paid)",
    balance_amount: "gt.0",
  });
}

export function createWinbackText(member) {
  return `Hi ${member.name}, your Fitness World plan ended on ${formatDisplayDateIST(member.membershipDue)}. We miss you at the gym - renew today and restart training. - Fitness World`;
}

async function membersNeedingReminder(env) {
  const rows = await supabaseJson(env, `/members?${reminderWindowParams().toString()}`);
  return rows.map(mapMember);
}

async function membersDueToday(env) {
  const rows = await supabaseJson(env, `/members?${dueTodayParams().toString()}`);
  return rows.map(mapMember);
}

async function membersNeedingWinback(env) {
  const rows = await supabaseJson(env, `/members?${winbackParams().toString()}`);
  return rows.map(mapMember);
}

async function membersNeedingBalanceNudge(env) {
  const rows = await supabaseJson(env, `/members?${balanceOverdueParams().toString()}`);
  return rows.map(mapMember);
}

async function markWinbackSent(env, memberId) {
  await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    body: JSON.stringify({ sms_sent_winback: true }),
  });
}

export function createDueDayReminderText(member) {
  const when = formatDisplayDateIST(member.membershipDue);
  if (member.status === "Expired") {
    return `Hi ${member.name}, your Fitness World plan ended on ${when}. Please renew to restart training. - Fitness World`;
  }
  return `Hi ${member.name}, your Fitness World membership expires today (${when}). Please renew to continue. - Fitness World`;
}

async function markReminderSent(env, memberId) {
  await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    body: JSON.stringify({ sms_sent_3days: true }),
  });
}

async function keepSupabaseAlive(env) {
  // Errors propagate so /developer/ping-db reports truthfully; the scheduled
  // caller already wraps this in try/catch.
  await supabaseJson(env, "/members?select=id&limit=1");
}

async function smsStatus(env, includeSecrets = true) {
  const settings = await getSystemSettings(env);
  // Trainers learn working/not-working only: usernames, URLs, device ids and
  // session ids never leave the backend for non-developers.
  const secret = (value) => (includeSecrets ? value : "");
  const smsEnabled = settings.sms_enabled !== "false";
  const smsgateConfigured = Boolean(
    (settings.smsgate_username || env.SMSGATE_USERNAME) && (settings.smsgate_password || env.SMSGATE_PASSWORD),
  );
  const waEnabled = settings.wa_enabled !== "false";
  const emailEnabled = settings.email_enabled !== "false";
  return {
    smsEnabled,
    smsConfigured: smsgateConfigured && smsEnabled,
    smsgateConfigured: smsgateConfigured && smsEnabled,
    waEnabled,
    waConfigured: waSendingConfigured(env, settings) && waEnabled,
    emailEnabled,
    emailConfigured: emailSendingConfigured(env, settings) && emailEnabled,
    settings: {
      sms_enabled: settings.sms_enabled ?? "true",
      smsgate_username: secret(settings.smsgate_username ?? (env.SMSGATE_USERNAME ?? "")),
      smsgate_password: "",
      smsgate_password_configured: Boolean(settings.smsgate_password || env.SMSGATE_PASSWORD),
      smsgate_device_id: secret(settings.smsgate_device_id ?? (env.SMSGATE_DEVICE_ID ?? "")),
      smsgate_sim_number: secret(settings.smsgate_sim_number ?? (env.SMSGATE_SIM_NUMBER ?? "")),
      sms_auto_reminder_paused: settings.sms_auto_reminder_paused ?? "false",
      wa_enabled: settings.wa_enabled ?? "true",
      wa_base_url: secret(settings.wa_base_url ?? (env.WA_BASE_URL ?? "")),
      wa_api_key: "",
      wa_api_key_configured: Boolean(settings.wa_api_key || env.WA_API_KEY),
      wa_session_id: secret(settings.wa_session_id ?? (env.WA_SESSION_ID ?? "")),
      email_enabled: settings.email_enabled ?? "true",
      appscript_url: secret(settings.appscript_url ?? (env.APPSCRIPT_URL ?? "")),
      appscript_secret: "",
      appscript_secret_configured: Boolean(settings.appscript_secret || env.APPSCRIPT_SECRET),
      notify_channel_order: secret(settings.notify_channel_order ?? "whatsapp,sms,email"),
    },
  };
}

export function validateSmsSettingsInput(body) {
  if (!body || typeof body !== "object") {
    throw new ApiError(400, "INVALID_INPUT", "Settings are required");
  }
  const out = {};
  if (body.sms_enabled !== undefined) {
    out.sms_enabled = assertFlag(body.sms_enabled, "sms_enabled");
  }
  for (const key of ["smsgate_username", "smsgate_password", "smsgate_device_id"]) {
    if (body[key] !== undefined) {
      const value = String(body[key]).trim();
      if (value.length > 200) {
        throw new ApiError(400, "INVALID_INPUT", `${key} is too long`);
      }
      out[key] = value;
    }
  }
  if (body.smsgate_sim_number !== undefined) {
    const value = String(body.smsgate_sim_number).trim();
    if (value && !/^\d{1,2}$/.test(value)) {
      throw new ApiError(400, "INVALID_INPUT", "SIM number must be digits");
    }
    out.smsgate_sim_number = value;
  }
  if (body.sms_auto_reminder_paused !== undefined) {
    out.sms_auto_reminder_paused = assertFlag(body.sms_auto_reminder_paused, "sms_auto_reminder_paused");
  }
  if (body.wa_enabled !== undefined) {
    out.wa_enabled = assertFlag(body.wa_enabled, "wa_enabled");
  }
  if (body.email_enabled !== undefined) {
    out.email_enabled = assertFlag(body.email_enabled, "email_enabled");
  }
  if (body.wa_base_url !== undefined) {
    const value = String(body.wa_base_url).trim().replace(/\/$/, "");
    if (value.length > 300 || (value && !/^https?:\/\/.+\..+/.test(value))) {
      throw new ApiError(400, "INVALID_INPUT", "WhatsApp server URL must be a valid http(s) URL");
    }
    out.wa_base_url = value;
  }
  for (const key of ["wa_api_key", "wa_session_id", "appscript_secret"]) {
    if (body[key] !== undefined) {
      const value = String(body[key]).trim();
      if (value.length > 300) {
        throw new ApiError(400, "INVALID_INPUT", `${key} is too long`);
      }
      out[key] = value;
    }
  }
  if (body.appscript_url !== undefined) {
    const value = String(body.appscript_url).trim();
    if (value.length > 300 || (value && !/^https:\/\/.+/.test(value))) {
      throw new ApiError(400, "INVALID_INPUT", "Apps Script URL must be a valid https URL");
    }
    out.appscript_url = value;
  }
  if (body.notify_channel_order !== undefined) {
    const order = String(body.notify_channel_order)
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry, index, all) => NOTIFY_CHANNELS.has(entry) && all.indexOf(entry) === index);
    if (order.length === 0) {
      throw new ApiError(400, "INVALID_INPUT", "Channel order must list at least one of: whatsapp, sms, email");
    }
    out.notify_channel_order = order.join(",");
  }
  return out;
}

function assertFlag(value, label) {
  const text = String(value);
  if (text !== "true" && text !== "false") {
    throw new ApiError(400, "INVALID_INPUT", `${label} must be true or false`);
  }
  return text;
}

export async function resolveSmsProviders(env, settings) {
  if (settings.sms_enabled === "false") {
    throw new ApiError(503, "SMS_DISABLED", "SMS sending is disabled in system settings");
  }

  const smsgate = {
    username: settings.smsgate_username || env.SMSGATE_USERNAME,
    password: await decryptStoredSecret(env, settings.smsgate_password || env.SMSGATE_PASSWORD),
    deviceId: settings.smsgate_device_id || env.SMSGATE_DEVICE_ID,
    simNumber: settings.smsgate_sim_number || env.SMSGATE_SIM_NUMBER,
  };

  if (!smsgate.username || !smsgate.password) {
    throw new ApiError(503, "SMS_NOT_CONFIGURED", "SMSGate is not configured. Add the gym phone's SMSGate cloud username and password in the developer console.");
  }

  return { smsgate };
}

function waSendingConfigured(env, settings) {
  return Boolean((settings.wa_base_url || env.WA_BASE_URL) && (settings.wa_api_key || env.WA_API_KEY) && (settings.wa_session_id || env.WA_SESSION_ID));
}

async function resolveWaProvider(env, settings) {
  if (settings.wa_enabled === "false") {
    throw new ApiError(503, "WA_DISABLED", "WhatsApp sending is disabled in system settings");
  }
  const plan = {
    baseUrl: (settings.wa_base_url || env.WA_BASE_URL || "").trim().replace(/\/$/, "").replace(/\/api$/, ""),
    apiKey: await decryptStoredSecret(env, settings.wa_api_key || env.WA_API_KEY),
    sessionId: (settings.wa_session_id || env.WA_SESSION_ID || "").trim(),
  };
  if (!plan.baseUrl || !plan.apiKey || !plan.sessionId) {
    throw new ApiError(503, "WA_NOT_CONFIGURED", "WhatsApp is not configured. Add the OpenWA server URL, API key, and session id in Settings → Notifications.");
  }
  return plan;
}

function emailSendingConfigured(env, settings) {
  return Boolean((settings.appscript_url || env.APPSCRIPT_URL) && (settings.appscript_secret || env.APPSCRIPT_SECRET));
}

async function resolveEmailProvider(env, settings) {
  if (settings.email_enabled === "false") {
    throw new ApiError(503, "EMAIL_DISABLED", "Email sending is disabled in system settings");
  }
  const plan = {
    url: (settings.appscript_url || env.APPSCRIPT_URL || "").trim(),
    secret: await decryptStoredSecret(env, settings.appscript_secret || env.APPSCRIPT_SECRET),
  };
  if (!plan.url || !plan.secret) {
    throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "Email is not configured. Deploy the Apps Script mailer and add its URL and secret in Settings → Notifications.");
  }
  return plan;
}

// Smart channel order for automatic sends: first deliverable channel wins,
// the rest are fallback. Defaults to WhatsApp → SMS → Email.
export function notifyChannelOrder(settings) {
  const raw = String(settings?.notify_channel_order ?? "");
  const order = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry, index, all) => NOTIFY_CHANNELS.has(entry) && all.indexOf(entry) === index);
  return order.length > 0 ? order : [...DEFAULT_CHANNEL_ORDER];
}

const ENC_SECRET_PREFIX = "enc:v1:";

async function secretAesKey(env) {
  if (!env.SMS_SECRET_KEY) {
    return null;
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.SMS_SECRET_KEY));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptStoredSecret(env, plaintext) {
  const key = await secretAesKey(env);
  if (!key) {
    // Fail closed: silently storing secrets in plaintext is worse than an
    // error. The deploy checklist sets SMS_SECRET_KEY before saving settings.
    throw new ApiError(500, "SMS_SECRET_KEY_MISSING", "Set SMS_SECRET_KEY before saving passwords or API keys");
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)));
  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv);
  combined.set(cipher, iv.length);
  return `${ENC_SECRET_PREFIX}${bytesToBase64(combined)}`;
}

export async function decryptStoredSecret(env, stored) {
  if (!stored || !stored.startsWith(ENC_SECRET_PREFIX)) {
    return stored;
  }
  const key = await secretAesKey(env);
  if (!key) {
    throw new ApiError(500, "SMS_SECRET_KEY_MISSING", "SMS credentials cannot be decrypted without SMS_SECRET_KEY");
  }
  const combined = base64ToBytes(stored.slice(ENC_SECRET_PREFIX.length));
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

export function normalizeTargetPhone(phone) {
  const targetPhone = String(phone ?? "").replace(/\D/g, "").slice(-10);
  if (targetPhone.length !== 10) {
    throw new ApiError(400, "INVALID_PHONE", "Phone number must be a valid 10-digit number");
  }
  return targetPhone;
}

class SmsProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.status = options.status ?? 0;
    this.code = options.code ?? "SMS_SEND_FAILED";
    // retryable: worth trying again later (network, timeout, 429, 5xx).
    this.retryable = options.retryable ?? false;
    // unknownOutcome: the request may have reached SMSGate (timeout / dropped
    // connection). The caller must verify via GET message state before any
    // re-post, otherwise the member could receive the SMS twice.
    this.unknownOutcome = options.unknownOutcome ?? false;
    // deferRetry: verified nothing, but re-posting right now is unsafe —
    // leave it for the retry sweep instead of risking a duplicate.
    this.deferRetry = options.deferRetry ?? false;
    // failedState: SMSGate verified the earlier post as Failed/Cancelled.
    // The id is burned — the row must record it so the next attempt mints
    // a fresh id instead of re-posting a dead one.
    this.failedState = options.failedState ?? null;
    this.retryAfterMs = options.retryAfterMs ?? 0;
  }
}

export function parseRetryAfterMs(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds, 60) * 1000;
  }
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), 60_000);
  }
  return 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function smsgateAuthHeader(account) {
  return `Basic ${btoa(`${account.username}:${account.password}`)}`;
}

async function smsgateRequest(account, path, options = {}) {
  const method = options.method ?? "GET";
  let response;
  try {
    response = await fetch(`${SMSGATE_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: smsgateAuthHeader(account),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body ? { body: options.body } : {}),
      signal: AbortSignal.timeout(options.timeoutMs ?? SMS_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new SmsProviderError(
      timeout ? "SMSGate did not respond in time" : "Could not reach SMSGate",
      { code: "SMS_SEND_FAILED", retryable: true, unknownOutcome: method === "POST" },
    );
  }

  const data = await safeJson(response);
  if (response.ok) {
    return { status: response.status, data, headers: response.headers };
  }

  const serverMessage = typeof data?.message === "string" && data.message ? data.message : `SMSGate request failed (Status: ${response.status})`;
  if (response.status === 401 || response.status === 403) {
    throw new SmsProviderError("SMSGate rejected the username or password. Re-enter the gym phone's cloud credentials in SMS Setup.", {
      status: response.status, code: "SMS_AUTH_FAILED", retryable: false,
    });
  }
  if (response.status === 404) {
    throw new SmsProviderError(serverMessage, { status: 404, code: "SMS_NOT_FOUND", retryable: false });
  }
  if (response.status === 409) {
    // A re-post with an already-used client message id: the original send is
    // what counts, so callers treat this as "verify state, do not re-post".
    throw new SmsProviderError(serverMessage, { status: 409, code: "SMS_DUPLICATE_ID", retryable: false, unknownOutcome: true });
  }
  if (response.status === 429) {
    throw new SmsProviderError("SMSGate is throttling requests. The message is queued for automatic retry.", {
      status: 429, code: "SMS_RATE_LIMITED", retryable: true, retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
    });
  }
  if (response.status >= 500) {
    throw new SmsProviderError(serverMessage, { status: response.status, code: "SMS_SEND_FAILED", retryable: true });
  }
  throw new SmsProviderError(serverMessage, { status: response.status, code: "SMS_SEND_FAILED", retryable: false });
}

async function postSmsgateMessage(account, payload) {
  const { data } = await smsgateRequest(account, "/messages", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: SMS_FETCH_TIMEOUT_MS,
  });
  return data?.id ?? payload.id ?? "sent";
}

async function getSmsgateMessageState(account, providerMessageId) {
  try {
    const { data } = await smsgateRequest(account, `/messages/${encodeURIComponent(providerMessageId)}`, {
      method: "GET",
      timeoutMs: SMS_STATE_CHECK_TIMEOUT_MS,
    });
    return data;
  } catch (error) {
    if (error instanceof SmsProviderError && error.code === "SMS_NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

// ── WhatsApp channel (self-hosted OpenWA gateway) ───────────────────────────
// API: POST {base}/api/sessions/{sessionId}/messages/send-text with
// {chatId: "<digits>@c.us", text}, X-API-Key auth. 201 {messageId} means
// accepted (same "handed over" semantics as SMSGate Pending).

export function waChatId(targetPhone) {
  const digits = String(targetPhone ?? "").replace(/\D/g, "");
  const msisdn = digits.length === 10 ? `91${digits}` : digits;
  if (!/^\d{11,15}$/.test(msisdn)) {
    throw new ApiError(400, "INVALID_PHONE", "Phone number must be a valid 10-digit number");
  }
  return `${msisdn}@c.us`;
}

async function openwaRequest(plan, path, options = {}) {
  const method = options.method ?? "GET";
  let response;
  try {
    response = await fetch(`${plan.baseUrl}/api${path}`, {
      method,
      headers: {
        "X-API-Key": plan.apiKey,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      ...(options.body ? { body: options.body } : {}),
      signal: AbortSignal.timeout(options.timeoutMs ?? OPENWA_SEND_TIMEOUT_MS),
    });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    // unknownOutcome is FALSE here (unlike SMSGate): every send carries an
    // Idempotency-Key, so OpenWA deduplicates a re-post after a timeout.
    throw new SmsProviderError(
      timeout ? "WhatsApp server did not respond in time" : "Could not reach the WhatsApp server",
      { code: "WA_SEND_FAILED", retryable: true },
    );
  }

  const data = await safeJson(response);
  if (response.ok) {
    return { status: response.status, data, headers: response.headers };
  }
  const serverMessage = typeof data?.message === "string" && data.message ? data.message : `WhatsApp request failed (Status: ${response.status})`;
  if (response.status === 401 || response.status === 403) {
    throw new SmsProviderError("OpenWA rejected the API key. Check the key and its role in Settings → Notifications.", {
      status: response.status, code: "WA_AUTH_FAILED", retryable: false,
    });
  }
  if (response.status === 404) {
    throw new SmsProviderError("OpenWA session not found. Check the session id and that the session exists.", {
      status: 404, code: "WA_SESSION_MISSING", retryable: false,
    });
  }
  if (response.status === 400) {
    throw new SmsProviderError(serverMessage, { status: 400, code: "WA_INVALID_CHAT", retryable: false });
  }
  if (response.status === 409) {
    throw new SmsProviderError("WhatsApp session is not ready. The message is queued for automatic retry.", {
      status: 409, code: "WA_NOT_READY", retryable: true,
    });
  }
  if (response.status === 429) {
    throw new SmsProviderError("WhatsApp server is throttling requests. The message is queued for automatic retry.", {
      status: 429, code: "WA_RATE_LIMITED", retryable: true, retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
    });
  }
  if (response.status >= 500) {
    throw new SmsProviderError(serverMessage, { status: response.status, code: "WA_SEND_FAILED", retryable: true });
  }
  throw new SmsProviderError(serverMessage, { status: response.status, code: "WA_SEND_FAILED", retryable: false });
}

async function postOpenwaText(plan, chatId, text, idempotencyKey) {
  const { data } = await openwaRequest(plan, `/sessions/${encodeURIComponent(plan.sessionId)}/messages/send-text`, {
    method: "POST",
    body: JSON.stringify({ chatId, text, linkPreview: false }),
    idempotencyKey,
    timeoutMs: OPENWA_SEND_TIMEOUT_MS,
  });
  return typeof data?.messageId === "string" && data.messageId ? data.messageId : "sent";
}

export async function attemptOpenwaSend(env, settings, targetPhone, message, providerMessageId) {
  const plan = await resolveWaProvider(env, settings);
  const chatId = waChatId(targetPhone);
  let lastError = null;
  for (let attempt = 1; attempt <= SMS_SEND_MAX_ATTEMPTS; attempt += 1) {
    try {
      const requestId = await postOpenwaText(plan, chatId, message, providerMessageId);
      return { requestId, providerState: "Accepted" };
    } catch (error) {
      lastError = error;
      if (!(error instanceof SmsProviderError) || !error.retryable) {
        break;
      }
      if (attempt < SMS_SEND_MAX_ATTEMPTS) {
        await sleep(error.retryAfterMs > 0 ? error.retryAfterMs : SMS_SEND_BACKOFF_BASE_MS * 2 ** (attempt - 1));
      }
    }
  }
  if (lastError instanceof SmsProviderError) {
    throw lastError;
  }
  throw new SmsProviderError("WhatsApp send failed", { code: "WA_SEND_FAILED", retryable: true });
}

// ── Email channel (owner-deployed Google Apps Script mailer) ────────────────
// Contract (see appsscript/Code.gs): POST {secret, to, subject, text, key}
// → {ok: true} | {ok: false, error}. The script dedupes on `key` for 24h via
// CacheService, so retries after a timeout never double-send.

export function normalizeEmailAddress(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ApiError(400, "INVALID_EMAIL", "A valid member email address is required");
  }
  return email;
}

async function postAppsScriptEmail(plan, to, subject, text, key, opts = {}) {
  let response;
  try {
    response = await fetch(plan.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: plan.secret, to, subject, text, key,
        ...(opts.html ? { html: opts.html, pdfName: opts.pdfName || `Receipt.pdf` } : {}),
      }),
      signal: AbortSignal.timeout(APPSCRIPT_SEND_TIMEOUT_MS),
    });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new SmsProviderError(
      timeout ? "Email server did not respond in time" : "Could not reach the email server",
      { code: "EMAIL_SEND_FAILED", retryable: true },
    );
  }
  const data = await safeJson(response);
  if (response.ok && data?.ok === true) {
    return "sent";
  }
  const serverMessage = typeof data?.error === "string" && data.error ? data.error : `Email request failed (Status: ${response.status})`;
  if (response.status === 401 || response.status === 403) {
    throw new SmsProviderError("Email server rejected the secret. Check the Apps Script secret in Settings → Notifications.", {
      status: response.status, code: "EMAIL_AUTH_FAILED", retryable: false,
    });
  }
  if (response.status === 400) {
    throw new SmsProviderError(serverMessage, { status: 400, code: "EMAIL_INVALID", retryable: false });
  }
  if (response.status === 429) {
    throw new SmsProviderError("Email server is throttling requests. The message is queued for automatic retry.", {
      status: 429, code: "EMAIL_RATE_LIMITED", retryable: true, retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
    });
  }
  if (response.status >= 500 || !response.ok) {
    const retryable = response.status >= 500 || response.status === 0;
    throw new SmsProviderError(serverMessage, { status: response.status, code: "EMAIL_SEND_FAILED", retryable });
  }
  throw new SmsProviderError(serverMessage, { status: response.status, code: "EMAIL_SEND_FAILED", retryable: false });
}

export async function attemptEmailSend(env, settings, toEmail, subject, message, providerMessageId, opts = {}) {
  const plan = await resolveEmailProvider(env, settings);
  const to = normalizeEmailAddress(toEmail);
  let lastError = null;
  for (let attempt = 1; attempt <= SMS_SEND_MAX_ATTEMPTS; attempt += 1) {
    try {
      const requestId = await postAppsScriptEmail(plan, to, subject, message, providerMessageId, opts);
      return { requestId, providerState: "Accepted" };
    } catch (error) {
      lastError = error;
      if (!(error instanceof SmsProviderError) || !error.retryable) {
        break;
      }
      if (attempt < SMS_SEND_MAX_ATTEMPTS) {
        await sleep(error.retryAfterMs > 0 ? error.retryAfterMs : SMS_SEND_BACKOFF_BASE_MS * 2 ** (attempt - 1));
      }
    }
  }
  if (lastError instanceof SmsProviderError) {
    throw lastError;
  }
  throw new SmsProviderError("Email send failed", { code: "EMAIL_SEND_FAILED", retryable: true });
}

// One logical send: retries transient failures with backoff and verifies
// unknown outcomes against SMSGate before any re-post, so retries can never
// double-send. Throws ApiError on failure.
export async function attemptProviderSend(env, settings, targetPhone, message, providerMessageId) {
  const plan = await resolveSmsProviders(env, settings);
  const payload = buildSMSGatePayload(plan.smsgate, targetPhone, message, providerMessageId);

  let lastError = null;
  for (let attempt = 1; attempt <= SMS_SEND_MAX_ATTEMPTS; attempt += 1) {
    try {
      const requestId = await postSmsgateMessage(plan.smsgate, payload);
      return { requestId, smsgateState: "Pending" };
    } catch (error) {
      lastError = error;
      if (error instanceof SmsProviderError && error.code === "SMS_DUPLICATE_ID") {
        // The id is a random UUID we generated, so a 409 means our own
        // earlier post landed. Confirm the state: success states are
        // accepted, but Failed/Cancelled must NEVER read as sent.
        try {
          const state = await getSmsgateMessageState(plan.smsgate, providerMessageId);
          const verified = typeof state?.state === "string" ? state.state : "Pending";
          if (SMSGATE_FAILED_STATES.has(verified)) {
            throw new SmsProviderError("SMSGate reports the earlier post as failed; will retry with a fresh id", {
              code: "SMS_PROVIDER_FAILED", retryable: true, failedState: verified,
            });
          }
          return { requestId: providerMessageId, smsgateState: verified };
        } catch (verifyError) {
          if (verifyError instanceof SmsProviderError && verifyError.failedState) {
            throw verifyError;
          }
          return { requestId: providerMessageId, smsgateState: "Pending" };
        }
      }
      if (error instanceof SmsProviderError && error.failedState) {
        // Burned id: stop re-posting it now; the recorded failed state makes
        // the next attempt mint a fresh id.
        break;
      }
      if (!(error instanceof SmsProviderError) || !error.retryable) {
        break;
      }
      // The POST may have landed despite the failed response: check what
      // SMSGate actually has before deciding to re-post.
      if (error.unknownOutcome) {
        try {
          const state = await getSmsgateMessageState(plan.smsgate, providerMessageId);
          if (state) {
            const verified = typeof state.state === "string" ? state.state : "Pending";
            if (SMSGATE_FAILED_STATES.has(verified)) {
              throw new SmsProviderError("SMSGate reports the earlier post as failed; will retry with a fresh id", {
                code: "SMS_PROVIDER_FAILED", retryable: true, failedState: verified,
              });
            }
            return { requestId: providerMessageId, smsgateState: verified };
          }
          // 404: SMSGate never saw it, safe to re-post below.
        } catch (verifyError) {
          if (verifyError instanceof SmsProviderError && verifyError.failedState) {
            throw verifyError;
          }
          // State check itself failed: outcome still unknown. Stop immediate
          // retries; the outbox sweep will verify and finish this later.
          throw new SmsProviderError("SMS send timed out before confirmation. The message is queued and will be verified automatically.", {
            code: "SMS_SEND_UNKNOWN", retryable: true, unknownOutcome: true, deferRetry: true,
          });
        }
      }
      if (attempt < SMS_SEND_MAX_ATTEMPTS) {
        await sleep(error.retryAfterMs > 0 ? error.retryAfterMs : SMS_SEND_BACKOFF_BASE_MS * 2 ** (attempt - 1));
      }
    }
  }

  if (lastError instanceof SmsProviderError) {
    throw lastError;
  }
  throw new SmsProviderError("SMS send failed", { code: "SMS_SEND_FAILED", retryable: true });
}

function smsProviderErrorToApiError(error) {
  if (error instanceof SmsProviderError) {
    if (error.code === "SMS_AUTH_FAILED") {
      return new ApiError(502, "SMS_AUTH_FAILED", error.message);
    }
    if (error.code === "SMS_RATE_LIMITED") {
      return new ApiError(502, "SMS_RATE_LIMITED", error.message);
    }
    if (error.code === "SMS_SEND_UNKNOWN") {
      return new ApiError(502, "SMS_SEND_UNKNOWN", error.message);
    }
    // WhatsApp / Email channel codes pass through unchanged (WA_AUTH_FAILED,
    // WA_RATE_LIMITED, EMAIL_AUTH_FAILED, ...) so callers can tell channels
    // apart for fallback and early-abort decisions.
    if (typeof error.code === "string" && /^(WA|EMAIL)_/.test(error.code)) {
      return new ApiError(502, error.code, error.message);
    }
    return new ApiError(502, "SMS_SEND_FAILED", error.message);
  }
  return new ApiError(502, "SMS_SEND_FAILED", error instanceof Error ? error.message : "SMS send failed");
}

// Auth/config failures abort a sweep batch: every remaining member would fail
// identically, so stop instead of hammering dead providers.
export function isProviderAbortCode(code) {
  return code === "SMS_AUTH_FAILED" || code === "SMS_NOT_CONFIGURED" || code === "SMS_DISABLED"
    || code === "WA_AUTH_FAILED" || code === "WA_NOT_CONFIGURED" || code === "WA_DISABLED" || code === "WA_SESSION_MISSING"
    || code === "EMAIL_AUTH_FAILED" || code === "EMAIL_NOT_CONFIGURED" || code === "EMAIL_DISABLED";
}

async function sendSms(env, phone, message) {
  const settings = await getSystemSettings(env);
  const targetPhone = normalizeTargetPhone(phone);
  const providerMessageId = crypto.randomUUID();
  try {
    const { requestId } = await attemptProviderSend(env, settings, targetPhone, message, providerMessageId);
    return requestId;
  } catch (err) {
    logError("sms_send_failed", err, { provider: "smsgate" });
    throw smsProviderErrorToApiError(err);
  }
}

// ── SMS dispatch pipeline: persistent outbox + automatic retry ──────────────
// Every send flows through dispatchSms: it dedups (clientRequestId), logs the
// attempt to sms_logs, sends with retry, and queues anything that fails
// transiently so the retry sweep delivers it later. Logging must never break
// sending: if the sms_logs table is missing (migration unapplied) or
// unreachable, sends still go out, only the audit row is skipped.

async function smsLogsEnabled(env) {
  const now = Date.now();
  if (smsLogsProbe.available === true) {
    return true;
  }
  if (smsLogsProbe.available === false && now - smsLogsProbe.checkedAt < 5 * 60 * 1000) {
    return false;
  }
  try {
    await supabaseJson(env, "/sms_logs?select=id&limit=1");
    smsLogsProbe = { available: true, checkedAt: now };
    return true;
  } catch {
    smsLogsProbe = { available: false, checkedAt: now };
    return false;
  }
}

function mapSmsLog(row) {
  return {
    id: row.id,
    memberId: row.member_id ?? null,
    memberName: row.members?.name ?? null,
    phone: row.phone,
    message: row.message,
    kind: row.kind,
    status: row.status,
    provider: row.provider ?? "smsgate",
    providerMessageId: row.provider_message_id ?? null,
    smsgateState: row.smsgate_state ?? null,
    attempts: Number(row.attempts ?? 0),
    lastError: row.last_error ?? null,
    lastErrorCode: row.last_error_code ?? null,
    nextRetryAt: row.next_retry_at ?? null,
    sentAt: row.sent_at ?? null,
    onSentAction: row.on_sent_action ?? null,
    emailHtml: row.email_html ?? null,
    emailPdfName: row.email_pdf_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const emailHtmlProbe = { checkedAt: 0, available: false };

async function emailHtmlAvailable(env) {
  const now = Date.now();
  if (now - emailHtmlProbe.checkedAt < 5 * 60 * 1000) {
    return emailHtmlProbe.available;
  }
  try {
    await supabaseJson(env, "/sms_logs?select=email_html&limit=1");
    emailHtmlProbe.checkedAt = now;
    emailHtmlProbe.available = true;
    return true;
  } catch {
    emailHtmlProbe.checkedAt = now;
    emailHtmlProbe.available = false;
    return false;
  }
}

async function createSmsLog(env, entry) {
  if (!(await smsLogsEnabled(env))) {
    return null;
  }
  try {
    const rows = await supabaseJson(env, "/sms_logs?select=*,members(name)", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(entry),
    });
    return rows?.[0] ? mapSmsLog(rows[0]) : null;
  } catch (error) {
    // 409: a concurrent caller already created this client_request_id (double
    // tap / overlapping run). The existing row is the truth — never a second.
    if (error instanceof ApiError && error.status === 409 && entry.client_request_id) {
      return findSmsLogByClientRequestId(env, entry.client_request_id);
    }
    logError("sms_log_create_failed", error);
    return null;
  }
}

async function updateSmsLog(env, id, patch) {
  if (!(await smsLogsEnabled(env))) {
    return null;
  }
  try {
    const rows = await supabaseJson(env, `/sms_logs?id=eq.${encodeURIComponent(id)}&select=*,members(name)`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    return rows?.[0] ? mapSmsLog(rows[0]) : null;
  } catch (error) {
    logError("sms_log_update_failed", error, { logId: id });
    return null;
  }
}

async function findSmsLogByClientRequestId(env, clientRequestId) {
  if (!clientRequestId || !(await smsLogsEnabled(env))) {
    return null;
  }
  try {
    const rows = await supabaseJson(env, `/sms_logs?select=*,members(name)&client_request_id=eq.${encodeURIComponent(clientRequestId)}&limit=1`);
    return rows?.[0] ? mapSmsLog(rows[0]) : null;
  } catch (error) {
    logError("sms_log_lookup_failed", error);
    return null;
  }
}

async function getSmsLog(env, id) {
  if (!(await smsLogsEnabled(env))) {
    return null;
  }
  try {
    const rows = await supabaseJson(env, `/sms_logs?select=*,members(name)&id=eq.${encodeURIComponent(id)}&limit=1`);
    return rows?.[0] ? mapSmsLog(rows[0]) : null;
  } catch (error) {
    logError("sms_log_lookup_failed", error, { logId: id });
    return null;
  }
}

async function listSmsLogs(env, { status, limit, offset }) {
  if (!(await smsLogsEnabled(env))) {
    return [];
  }
  const params = new URLSearchParams({
    select: "*,members(name)",
    order: "created_at.desc",
    limit: String(limit),
    offset: String(offset),
  });
  if (status && status !== "all") {
    params.set("status", `eq.${status}`);
  }
  const rows = await supabaseJson(env, `/sms_logs?${params.toString()}`);
  return (rows ?? []).map(mapSmsLog);
}

async function claimDueSmsLogs(env, limit) {
  if (!(await smsLogsEnabled(env))) {
    return [];
  }
  const params = new URLSearchParams({
    select: "*",
    status: "eq.queued",
    attempts: `lt.${SMS_RETRY_MAX_ATTEMPTS}`,
    next_retry_at: `lte.${new Date().toISOString()}`,
    order: "next_retry_at.asc",
    limit: String(limit),
  });
  const rows = await supabaseJson(env, `/sms_logs?${params.toString()}`);
  return (rows ?? []).map(mapSmsLog);
}

export function retryDelayForAttempt(attemptsUsed) {
  // attemptsUsed is 1-based (1 = first attempt just failed): the first delay
  // is 5 min, growing to 24 h.
  return SMS_RETRY_DELAYS_MS[Math.min(Math.max(attemptsUsed - 1, 0), SMS_RETRY_DELAYS_MS.length - 1)];
}

async function applyOnSentAction(env, action, memberId) {
  if (!action || !memberId) {
    return;
  }
  try {
    if (action === "reminder_3day") {
      await markReminderSent(env, memberId);
    } else if (action === "winback") {
      await markWinbackSent(env, memberId);
    }
  } catch (error) {
    logError("sms_on_sent_action_failed", error, { action, memberId });
  }
}

async function recordDuedayProgressSent(env, memberId) {
  try {
    const todayIst = isoDateInTimeZone();
    const settings = await getSystemSettings(env);
    let progress = { date: todayIst, sent: [] };
    try {
      const parsed = settings.sms_dueday_progress ? JSON.parse(settings.sms_dueday_progress) : null;
      if (parsed && parsed.date === todayIst && Array.isArray(parsed.sent)) {
        progress = parsed;
      }
    } catch {
      progress = { date: todayIst, sent: [] };
    }
    if (!progress.sent.includes(memberId)) {
      progress.sent.push(memberId);
      await saveSystemSettings(env, { sms_dueday_progress: JSON.stringify({ date: todayIst, sent: progress.sent }) });
    }
  } catch (error) {
    logError("sms_dueday_progress_failed", error, { memberId });
  }
}

function isRetryableSendError(error) {
  if (error instanceof SmsProviderError) {
    return error.retryable;
  }
  if (error instanceof ApiError) {
    return error.code === "SMS_SEND_FAILED" || error.code === "SMS_RATE_LIMITED" || error.code === "SMS_SEND_UNKNOWN";
  }
  return true;
}

// Attempt one outbox row. Returns { requestId, status: "sent"|"queued" }.
// Throws ApiError only for terminal failures (bad credentials, SMS disabled,
// invalid number, attempts exhausted) that need a human to act.
async function attemptSmsLogRow(env, settings, row, targetPhone, message) {
  const attemptsUsed = row.attempts + 1;
  const provider = row.provider ?? "smsgate";
  // A provider-reported failure is terminal for that provider id: the re-post
  // is genuinely a new message, so it gets a fresh id. Every other case
  // reuses the row's id so the provider recognizes retries (SMSGate client
  // id, OpenWA Idempotency-Key, Apps Script dedupe key).
  const providerMessageId = provider === "smsgate" && row.smsgateState && SMSGATE_FAILED_STATES.has(row.smsgateState)
    ? crypto.randomUUID()
    : (row.providerMessageId ?? crypto.randomUUID());
  try {
    let requestId;
    let providerState;
    if (provider === "openwa") {
      ({ requestId, providerState } = await attemptOpenwaSend(env, settings, targetPhone, message, providerMessageId));
    } else if (provider === "appscript") {
      ({ requestId, providerState } = await attemptEmailSend(env, settings, targetPhone, emailSubjectForKind(row.kind), message, providerMessageId, { html: row.emailHtml ?? null, pdfName: row.emailPdfName ?? null }));
    } else {
      const sent = await attemptProviderSend(env, settings, targetPhone, message, providerMessageId);
      requestId = sent.requestId;
      providerState = sent.smsgateState;
    }
    await updateSmsLog(env, row.id, {
      status: "sent",
      provider_message_id: requestId,
      smsgate_state: providerState,
      attempts: attemptsUsed,
      last_error: null,
      last_error_code: null,
      next_retry_at: null,
      sent_at: new Date().toISOString(),
    });
    await applyOnSentAction(env, row.onSentAction, row.memberId);
    if (row.kind === "reminder_dueday" && row.memberId) {
      await recordDuedayProgressSent(env, row.memberId);
    }
    return { requestId, status: "sent", logId: row.id };
  } catch (error) {
    const apiError = error instanceof ApiError ? error : smsProviderErrorToApiError(error);
    const retryable = isRetryableSendError(error) && attemptsUsed < SMS_RETRY_MAX_ATTEMPTS;
    // A provider-verified failure burns this id: record it so the next
    // attempt mints a fresh one instead of re-posting a dead id.
    const failedState = error instanceof SmsProviderError && error.failedState ? error.failedState : null;
    if (retryable) {
      await updateSmsLog(env, row.id, {
        status: "queued",
        provider_message_id: providerMessageId,
        ...(failedState ? { smsgate_state: failedState } : {}),
        attempts: attemptsUsed,
        last_error: apiError.message.slice(0, 500),
        last_error_code: apiError.code,
        next_retry_at: new Date(Date.now() + retryDelayForAttempt(attemptsUsed)).toISOString(),
      });
      logWarn("sms_dispatch_queued", { logId: row.id, attempts: attemptsUsed, code: apiError.code });
      return { requestId: null, status: "queued", logId: row.id, error: apiError.message, code: apiError.code };
    }
    await updateSmsLog(env, row.id, {
      status: "failed",
      provider_message_id: providerMessageId,
      attempts: attemptsUsed,
      last_error: apiError.message.slice(0, 500),
      last_error_code: apiError.code,
      next_retry_at: null,
    });
    logError("sms_dispatch_failed", apiError, { logId: row.id, code: apiError.code });
    throw apiError;
  }
}

export function emailSubjectForKind(kind) {
  switch (kind) {
    case "receipt":
      return "Fitness World payment receipt";
    case "statement":
      return "Fitness World dues statement";
    case "winback":
      return "We miss you at Fitness World";
    case "test":
      return "Fitness World test email";
    case "reminder_3day":
    case "reminder_dueday":
    case "balance_overdue":
      return "Fitness World membership reminder";
    default:
      return "Message from Fitness World";
  }
}

async function dispatchSms(env, { phone, message, kind, memberId = null, clientRequestId = null, onSentAction = null, provider = "smsgate", emailHtml = null, emailPdfName = null }) {
  const settings = await getSystemSettings(env);
  const safeKind = SMS_LOG_KINDS.has(kind) ? kind : "manual";
  const channel = provider === "openwa" ? "openwa" : provider === "appscript" ? "appscript" : "smsgate";

  let targetPhone;
  try {
    targetPhone = channel === "appscript" ? normalizeEmailAddress(phone) : normalizeTargetPhone(phone);
  } catch (error) {
    await createSmsLog(env, {
      member_id: memberId,
      phone: String(phone ?? ""),
      message,
      kind: safeKind,
      provider: channel,
      status: "failed",
      attempts: 0,
      last_error: error.message,
      last_error_code: channel === "appscript" ? "INVALID_EMAIL" : "INVALID_PHONE",
      client_request_id: clientRequestId,
      on_sent_action: onSentAction,
    });
    throw error;
  }

  // Terminal config errors (disabled / not configured) throw before any row.
  let log = clientRequestId ? await findSmsLogByClientRequestId(env, clientRequestId) : null;
  if (log && (log.status === "sent" || log.status === "delivered")) {
    return { requestId: log.providerMessageId ?? "sent", status: "sent", duplicate: true, logId: log.id };
  }
  if (log && log.status === "queued" && log.nextRetryAt && Date.parse(log.nextRetryAt) > Date.now()) {
    return { requestId: log.providerMessageId ?? null, status: "queued", duplicate: true, logId: log.id, error: log.lastError, code: log.lastErrorCode };
  }
  if (!log) {
    // Rich email body rides on the row so retries re-send the PDF too.
    const htmlOn = (emailHtml || emailPdfName) && await emailHtmlAvailable(env);
    log = await createSmsLog(env, {
      member_id: memberId,
      phone: targetPhone,
      message,
      kind: safeKind,
      provider: channel,
      status: "queued",
      attempts: 0,
      provider_message_id: crypto.randomUUID(),
      next_retry_at: new Date().toISOString(),
      client_request_id: clientRequestId,
      on_sent_action: onSentAction,
      ...(htmlOn ? { email_html: emailHtml, email_pdf_name: emailPdfName } : {}),
    });
    if (log && htmlOn) {
      log.emailHtml = emailHtml;
      log.emailPdfName = emailPdfName;
    }
  }

  // No outbox row (migration unapplied / DB hiccup): a direct send still gets
  // one attempt, but a failure must surface as failed, never "queued" — with
  // no row the retry sweep cannot cover it, so "queued" would lose the message
  // while the UI promises an automatic retry.
  if (!log) {
    try {
      const direct = channel === "openwa"
        ? await attemptOpenwaSend(env, settings, targetPhone, message, crypto.randomUUID())
        : channel === "appscript"
          ? await attemptEmailSend(env, settings, targetPhone, emailSubjectForKind(safeKind), message, crypto.randomUUID(), { html: emailHtml, pdfName: emailPdfName })
          : await attemptProviderSend(env, settings, targetPhone, message, crypto.randomUUID());
      return { requestId: direct.requestId, status: "sent", duplicate: false, logId: null };
    } catch (error) {
      throw error instanceof ApiError ? error : smsProviderErrorToApiError(error);
    }
  }

  const duplicate = Boolean(clientRequestId) && (log.attempts > 0 || log.status !== "queued");
  const outcome = await attemptSmsLogRow(env, settings, { ...log, onSentAction: log.onSentAction ?? onSentAction }, targetPhone, message);
  return { ...outcome, duplicate };
}

// Cron-safe wrapper: never throws, always tallies.
async function dispatchReminder(env, input) {
  try {
    return await dispatchSms(env, input);
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "SMS send failed",
      code: error instanceof ApiError ? error.code : "SMS_SEND_FAILED",
    };
  }
}

// Smart dispatch: tries channels in order (explicit channel or the saved
// notify order) with fallback. A channel is abandoned only when it will NEVER
// deliver (terminal failure: bad creds, bad number, not configured); a
// sent/queued outcome stops the chain so the member is never double-messaged.
// Each channel attempt gets its own outbox row (`${key}:${channel}`) so
// per-channel dedup still holds and every attempt stays visible in history.
// Channel policy (owner rule): email carries bills only (receipts,
// statements) plus diagnostics; reminders and manual messages go over
// SMS/WhatsApp only. Enforced here so no client can route around it.
const EMAIL_OK_KINDS = new Set(["receipt", "statement", "test"]);

async function dispatchSmart(env, { phone, email, message, kind, memberId = null, clientRequestId = null, onSentAction = null, channel = "auto", runState = null }) {
  const settings = await getSystemSettings(env);
  if (channel === "email" && !EMAIL_OK_KINDS.has(kind)) {
    throw new ApiError(400, "EMAIL_BILLS_ONLY", "Email is only used for bills. Reminders go by SMS or WhatsApp.");
  }
  const order = (channel && channel !== "auto" && NOTIFY_CHANNELS.has(channel)
    ? [channel]
    : notifyChannelOrder(settings)
  ).filter((entry) => EMAIL_OK_KINDS.has(kind) || entry !== "email");
  const dead = runState && runState.dead instanceof Set ? runState.dead : null;
  let lastOutcome = null;
  let tried = false;
  for (const entry of order) {
    if (dead && dead.has(entry)) {
      continue;
    }
    const target = entry === "email" ? email : phone;
    if (!target) {
      continue;
    }
    tried = true;
    const provider = entry === "whatsapp" ? "openwa" : entry === "email" ? "appscript" : "smsgate";
    const outcome = await dispatchReminder(env, {
      phone: target,
      message,
      kind,
      memberId,
      clientRequestId: clientRequestId ? `${clientRequestId}:${entry}` : null,
      onSentAction,
      provider,
    });
    if (outcome.status === "sent" || outcome.status === "queued") {
      return { ...outcome, channel: entry, provider };
    }
    lastOutcome = outcome;
    // Auth/config failures would fail every remaining member identically:
    // skip this channel for the rest of the run.
    if (dead && outcome.code && isProviderAbortCode(outcome.code)) {
      dead.add(entry);
    }
  }
  if (!tried) {
    return { status: "failed", error: "No delivery channel is available for this member", code: "NO_CHANNEL" };
  }
  return {
    status: "failed",
    error: lastOutcome?.error ?? "Message could not be delivered",
    code: lastOutcome?.code ?? "SEND_FAILED",
    channel: null,
  };
}

// Ask SMSGate what it actually has for this provider id and reconcile the
// row. Returns "accepted" | "failed" | "missing" | "unknown". Read-only except
// for our own bookkeeping — it never sends.
async function observeProviderState(env, account, row) {
  if (!row.providerMessageId) {
    return "missing";
  }
  let state;
  try {
    state = await getSmsgateMessageState(account, row.providerMessageId);
  } catch {
    return "unknown";
  }
  if (!state) {
    return "missing";
  }
  const providerState = typeof state.state === "string" ? state.state : "";
  if (SMSGATE_DELIVERED_STATES.has(providerState)) {
    await updateSmsLog(env, row.id, {
      status: "delivered",
      smsgate_state: providerState,
      last_error: null,
      last_error_code: null,
      next_retry_at: null,
      sent_at: row.sentAt ?? new Date().toISOString(),
    });
    await applyOnSentAction(env, row.onSentAction, row.memberId);
    return "accepted";
  }
  if (SMSGATE_SUCCESS_STATES.has(providerState)) {
    await updateSmsLog(env, row.id, {
      status: "sent",
      smsgate_state: providerState,
      last_error: null,
      last_error_code: null,
      next_retry_at: null,
      sent_at: row.sentAt ?? new Date().toISOString(),
    });
    await applyOnSentAction(env, row.onSentAction, row.memberId);
    if (row.kind === "reminder_dueday" && row.memberId) {
      await recordDuedayProgressSent(env, row.memberId);
    }
    return "accepted";
  }
  if (SMSGATE_FAILED_STATES.has(providerState)) {
    await updateSmsLog(env, row.id, {
      smsgate_state: providerState,
      last_error: "SMSGate reported the message as failed",
      last_error_code: "SMS_PROVIDER_FAILED",
    });
    return "failed";
  }
  // Pending / Cancelling / unrecognized: SMSGate holds it, keep waiting.
  await updateSmsLog(env, row.id, { smsgate_state: providerState || row.smsgateState });
  return "accepted";
}

async function runSmsRetrySweep(env) {
  const result = { processed: 0, sent: 0, queued: 0, failed: 0, refreshed: 0, skipped: "no" };
  const settings = await getSystemSettings(env);
  if (settings.sms_enabled === "false") {
    result.skipped = "disabled";
    return result;
  }
  // Any-provider gate first: WhatsApp/Email rows must retry even when SMS
  // itself is unconfigured.
  if (!smsSendingConfigured(env, settings) && !waSendingConfigured(env, settings) && !emailSendingConfigured(env, settings)) {
    result.skipped = "not-configured";
    return result;
  }
  if (!(await smsLogsEnabled(env))) {
    result.skipped = "no-outbox";
    return result;
  }
  const lastRun = Date.parse(settings.sms_last_retry_run ?? "");
  if (Number.isFinite(lastRun) && Date.now() - lastRun < SMS_RETRY_SWEEP_MIN_INTERVAL_MS) {
    result.skipped = "throttled";
    return result;
  }

  // SMSGate plan is resolved lazily: WhatsApp/Email rows must still retry
  // when SMS itself is unconfigured.
  let smsgatePlan = null;
  let smsgatePlanFailed = false;
  async function smsPlan() {
    if (!smsgatePlan && !smsgatePlanFailed) {
      try {
        smsgatePlan = (await resolveSmsProviders(env, settings)).smsgate;
      } catch {
        smsgatePlanFailed = true;
      }
    }
    return smsgatePlan;
  }

  const due = await claimDueSmsLogs(env, SMS_RETRY_SWEEP_BATCH);
  for (const row of due) {
    result.processed += 1;
    try {
      const rowProvider = row.provider ?? "smsgate";
      // SMSGate rows with a provider id may already be in SMSGate's hands
      // (timeout on the first try): verify before any re-post so a retry
      // never duplicates. WhatsApp/Email rows carry idempotency keys, so
      // re-posting them is safe without a state check.
      if (row.providerMessageId && rowProvider === "smsgate") {
        const account = await smsPlan();
        if (account) {
          const observed = await observeProviderState(env, account, row);
          if (observed === "accepted") {
            result.sent += 1;
            continue;
          }
          if (observed === "unknown") {
            result.queued += 1;
            continue;
          }
        }
      }
      const targetPhone = rowProvider === "appscript" ? normalizeEmailAddress(row.phone) : normalizeTargetPhone(row.phone);
      const outcome = await attemptSmsLogRow(env, settings, row, targetPhone, row.message);
      if (outcome.status === "sent") {
        result.sent += 1;
      } else {
        result.queued += 1;
      }
    } catch (error) {
      result.failed += 1;
      logError("sms_retry_row_failed", error, { logId: row.id });
      if (error instanceof ApiError && error.code && isProviderAbortCode(error.code)) {
        break;
      }
    }
    await sleep(SMS_BULK_PACING_MS);
  }

  // Delivery confirmation pass: refresh recently sent SMSGate rows (read-only,
  // never re-posts) so the log shows true delivery, not just "handed over".
  // WhatsApp/Email rows have no delivery-poll API wired, so they are skipped.
  try {
    const account = await smsPlan();
    result.refreshed = account ? await refreshRecentSentLogs(env, account) : 0;
  } catch (error) {
    logError("sms_refresh_pass_failed", error);
  }

  try {
    await saveSystemSettings(env, { sms_last_retry_run: new Date().toISOString(), sms_last_retry_sent: String(result.sent) });
  } catch (error) {
    logError("save_sms_retry_stats_failed", error);
  }
  return result;
}

async function refreshRecentSentLogs(env, account) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    select: "*",
    status: "eq.sent",
    provider: "eq.smsgate",
    sent_at: `gte.${weekAgo}`,
    order: "sent_at.desc",
    limit: "10",
  });
  // PostgREST neq excludes NULLs, so spell out "not yet confirmed delivered".
  params.set("or", "(smsgate_state.is.null,smsgate_state.neq.Delivered)");
  let rows;
  try {
    rows = await supabaseJson(env, `/sms_logs?${params.toString()}`);
  } catch {
    return 0;
  }
  let refreshed = 0;
  for (const row of rows ?? []) {
    const mapped = mapSmsLog(row);
    if (!mapped.providerMessageId) {
      continue;
    }
    const observed = await observeProviderState(env, account, mapped);
    if (observed === "accepted") {
      refreshed += 1;
    } else if (observed === "failed" && mapped.attempts < SMS_RETRY_MAX_ATTEMPTS) {
      // SMSGate says the send failed after we recorded success: requeue for a
      // genuine recovery post (fresh provider id) on the next sweep.
      await updateSmsLog(env, mapped.id, {
        status: "queued",
        next_retry_at: new Date(Date.now() + retryDelayForAttempt(mapped.attempts)).toISOString(),
      });
      refreshed += 1;
    }
    await sleep(SMS_BULK_PACING_MS);
  }
  return refreshed;
}

async function retrySmsLog(env, logId) {
  const settings = await getSystemSettings(env);
  const row = await getSmsLog(env, logId);
  if (!row) {
    throw new ApiError(404, "SMS_LOG_NOT_FOUND", "Message log not found");
  }
  if (row.status === "sent" || row.status === "delivered") {
    // Never resend a confirmed message from Retry: refresh its delivery state.
    // Only SMSGate rows have a state API; other providers just re-read.
    try {
      if ((row.provider ?? "smsgate") === "smsgate" && row.providerMessageId) {
        const plan = await resolveSmsProviders(env, settings);
        await observeProviderState(env, plan.smsgate, row);
      }
    } catch (error) {
      logWarn("sms_retry_refresh_failed", { logId, code: error instanceof ApiError ? error.code : "unknown" });
    }
    const fresh = (await getSmsLog(env, logId)) ?? row;
    return { requestId: fresh.providerMessageId, status: fresh.status, refreshed: true, log: fresh };
  }
  const targetPhone = (row.provider ?? "smsgate") === "appscript" ? normalizeEmailAddress(row.phone) : normalizeTargetPhone(row.phone);
  const outcome = await attemptSmsLogRow(env, settings, row, targetPhone, row.message);
  const fresh = (await getSmsLog(env, logId)) ?? row;
  return { ...outcome, log: fresh };
}

async function smsOutboxStats(env) {
  const stats = { logsReady: false, queued: 0, failedLast24h: 0, sentToday: 0, deliveredToday: 0 };
  stats.logsReady = await smsLogsEnabled(env);
  if (!stats.logsReady) {
    return stats;
  }
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const istMidnight = `${isoDateInTimeZone()}T00:00:00+05:30`;
    const [queued, failedLast24h, sentToday, deliveredToday] = await Promise.all([
      countRows(env, "sms_logs", [["status", "eq.queued"]]),
      countRows(env, "sms_logs", [["status", "eq.failed"], ["updated_at", `gte.${dayAgo}`]]),
      countRows(env, "sms_logs", [["status", "eq.sent"], ["sent_at", `gte.${istMidnight}`]]),
      countRows(env, "sms_logs", [["status", "eq.delivered"], ["sent_at", `gte.${istMidnight}`]]),
    ]);
    stats.queued = queued;
    stats.failedLast24h = failedLast24h;
    stats.sentToday = sentToday;
    stats.deliveredToday = deliveredToday;
  } catch (error) {
    logWarn("sms_outbox_stats_failed", { message: error instanceof Error ? error.message : "Unknown error" });
  }
  return stats;
}

// Live messaging health: cloud reachability + credential check + gym phone
// last-seen + outbox counts. Sends no SMS. Never throws — every section
async function whatsappHealth(env, settings) {
  const health = { enabled: settings.wa_enabled !== "false", configured: waSendingConfigured(env, settings), reachable: false, sessionStatus: "", error: "" };
  if (!health.enabled) {
    health.error = "WhatsApp sending is disabled";
    return health;
  }
  if (!health.configured) {
    health.error = "WhatsApp is not configured";
    return health;
  }
  let plan;
  try {
    plan = await resolveWaProvider(env, settings);
  } catch (error) {
    health.error = error instanceof Error ? error.message : "WhatsApp is not configured";
    return health;
  }
  try {
    const live = await fetch(`${plan.baseUrl}/api/health/live`, { signal: AbortSignal.timeout(OPENWA_HEALTH_TIMEOUT_MS) });
    health.reachable = live.ok;
    if (!live.ok) {
      health.error = `OpenWA server health check returned ${live.status}`;
      return health;
    }
  } catch {
    health.error = "Could not reach the OpenWA server";
    return health;
  }
  try {
    const { data } = await openwaRequest(plan, `/sessions/${encodeURIComponent(plan.sessionId)}`, {
      method: "GET",
      timeoutMs: OPENWA_HEALTH_TIMEOUT_MS,
    });
    const status = typeof data?.status === "string" ? data.status : "";
    health.sessionStatus = status;
    if (status === "ready") {
      return health;
    }
    health.error = status === "qr_ready"
      ? "Session needs pairing: scan the QR code in the OpenWA dashboard"
      : status
        ? `WhatsApp session is ${status}`
        : "WhatsApp session state is unknown";
  } catch (error) {
    health.error = error instanceof SmsProviderError ? error.message : "WhatsApp session check failed";
  }
  return health;
}

async function emailHealth(env, settings) {
  const health = { enabled: settings.email_enabled !== "false", configured: emailSendingConfigured(env, settings), reachable: false, error: "" };
  if (!health.enabled) {
    health.error = "Email sending is disabled";
    return health;
  }
  if (!health.configured) {
    health.error = "Email is not configured";
    return health;
  }
  let plan;
  try {
    plan = await resolveEmailProvider(env, settings);
  } catch (error) {
    health.error = error instanceof Error ? error.message : "Email is not configured";
    return health;
  }
  // Ping only proves reachability; the secret is verified on the first real
  // send, because it must never travel in a URL.
  try {
    const response = await fetch(`${plan.url}${plan.url.includes("?") ? "&" : "?"}ping=1`, {
      method: "GET",
      signal: AbortSignal.timeout(APPSCRIPT_HEALTH_TIMEOUT_MS),
    });
    const data = await safeJson(response);
    health.reachable = response.ok && data?.ok === true;
    if (!health.reachable) {
      health.error = "Email server did not answer the ping";
    }
  } catch {
    health.error = "Could not reach the email server";
  }
  return health;
}

// degrades to an error string so one failing check can't hide the others.
async function smsHealth(env) {
  const startedAt = Date.now();
  const settings = await getSystemSettings(env);
  const health = {
    configured: smsSendingConfigured(env, settings),
    smsEnabled: settings.sms_enabled !== "false",
    autoPaused: settings.sms_auto_reminder_paused === "true",
    cloud: { reachable: false, latencyMs: null, error: "" },
    auth: { ok: false, error: "" },
    phone: { devices: 0, matched: false, name: "", deviceId: "", lastSeenAt: null, lastSeenAgeMs: null, freshness: "unknown", simCards: [], error: "" },
    whatsapp: { enabled: false, configured: false, reachable: false, sessionStatus: "", error: "" },
    email: { enabled: false, configured: false, reachable: false, error: "" },
    outbox: { logsReady: false, queued: 0, failedLast24h: 0, sentToday: 0, deliveredToday: 0 },
    lastRun: { at: null, sent: 0, failed: 0, queued: 0, error: "" },
    checkedAt: new Date().toISOString(),
    latencyMs: 0,
  };

  try {
    const probeStart = Date.now();
    const probe = await fetch(`${SMSGATE_BASE_URL}/health/live`, { signal: AbortSignal.timeout(SMS_HEALTH_TIMEOUT_MS) });
    health.cloud.latencyMs = Date.now() - probeStart;
    health.cloud.reachable = probe.ok;
    if (!probe.ok) {
      health.cloud.error = `SMSGate cloud health check returned ${probe.status}`;
    }
  } catch {
    health.cloud.error = "Could not reach the SMSGate cloud";
  }

  if (health.configured && health.smsEnabled) {
    try {
      const plan = await resolveSmsProviders(env, settings);
      const response = await fetch(`${SMSGATE_BASE_URL}/devices`, {
        headers: { Authorization: smsgateAuthHeader(plan.smsgate) },
        signal: AbortSignal.timeout(SMS_HEALTH_TIMEOUT_MS + 2000),
      });
      const data = await safeJson(response);
      if (response.status === 401 || response.status === 403) {
        health.auth.error = "SMSGate rejected the username or password";
      } else if (!response.ok) {
        health.auth.error = typeof data?.message === "string" && data.message ? data.message : `Devices check failed (${response.status})`;
      } else {
        health.auth.ok = true;
        const devices = Array.isArray(data) ? data : [];
        health.phone.devices = devices.length;
        const wantId = (settings.smsgate_device_id || env.SMSGATE_DEVICE_ID || "").trim();
        // A wrong saved device id must never silently fall back to devices[0]:
        // every send pins the bad id while health would show green.
        const match = wantId ? devices.find((device) => device?.id === wantId) || null : devices[0] || null;
        if (wantId && !match) {
          health.phone.error = `Saved device id "${wantId}" not found on this SMSGate account`;
        }
        if (match) {
          health.phone.matched = true;
          health.phone.name = typeof match.name === "string" ? match.name : "";
          health.phone.deviceId = typeof match.id === "string" ? match.id : "";
          const lastSeenMs = Date.parse(match.lastSeen ?? "");
          if (Number.isFinite(lastSeenMs)) {
            health.phone.lastSeenAt = new Date(lastSeenMs).toISOString();
            health.phone.lastSeenAgeMs = Math.max(Date.now() - lastSeenMs, 0);
            health.phone.freshness = health.phone.lastSeenAgeMs <= PHONE_ONLINE_FRESH_MS
              ? "online"
              : health.phone.lastSeenAgeMs <= PHONE_ONLINE_RECENT_MS
                ? "recent"
                : "stale";
          }
          const simCards = Array.isArray(match.simCards) ? match.simCards : [];
          health.phone.simCards = simCards.map((sim) => ({
            simNumber: sim?.simNumber ?? null,
            carrierName: typeof sim?.carrierName === "string" ? sim.carrierName : "",
            phoneNumber: sim?.phoneNumber ? maskPhone(sim.phoneNumber) : "",
          }));
        }
      }
    } catch {
      health.auth.error = "Devices check timed out";
    }
  } else if (!health.configured) {
    health.auth.error = "Credentials not configured";
  } else {
    health.auth.error = "SMS sending is disabled";
  }

  try {
    const stats = await smsOutboxStats(env);
    health.outbox = { logsReady: stats.logsReady, queued: stats.queued, failedLast24h: stats.failedLast24h, sentToday: stats.sentToday, deliveredToday: stats.deliveredToday };
  } catch {
    // Outbox stats are informational; the live checks above already ran.
  }

  try {
    health.whatsapp = await whatsappHealth(env, settings);
  } catch (error) {
    health.whatsapp.error = error instanceof Error ? error.message : "WhatsApp check failed";
  }
  try {
    health.email = await emailHealth(env, settings);
  } catch (error) {
    health.email.error = error instanceof Error ? error.message : "Email check failed";
  }

  health.lastRun = {
    at: settings.sms_last_run_at ?? null,
    sent: Number(settings.sms_last_run_sent ?? 0),
    failed: Number(settings.sms_last_run_failed ?? 0),
    queued: Number(settings.sms_last_run_queued ?? 0),
    skipped: Number(settings.sms_last_run_skipped ?? 0),
    error: settings.sms_last_run_error ?? "",
  };
  health.latencyMs = Date.now() - startedAt;
  return health;
}

export function buildSMSGatePayload(account, targetPhone, message, providerMessageId) {
  const payload = {
    textMessage: { text: message },
    phoneNumbers: [`${SMS_DEFAULT_COUNTRY_CODE}${targetPhone}`],
    ttl: SMS_TTL_SECONDS,
    priority: SMS_PRIORITY,
    withDeliveryReport: true,
  };
  // Client-supplied id (max 36 chars): retries and the outbox sweep reuse it,
  // so SMSGate can never mistake a retry for a second message.
  if (providerMessageId) {
    payload.id = providerMessageId;
  }
  if (account.deviceId) {
    payload.deviceId = account.deviceId;
  }
  const simNumber = Number(account.simNumber);
  if (Number.isInteger(simNumber) && simNumber > 0) {
    payload.simNumber = simNumber;
  }
  return payload;
}

export function formatDisplayDateIST(isoDate) {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

export function daysUntilIST(isoDate, fromDate = new Date()) {
  const start = Date.parse(`${isoDateInTimeZone(fromDate)}T00:00:00Z`);
  const end = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0;
  }
  return Math.round((end - start) / ONE_DAY_MS);
}

export function createReminderText(member, fromDate = new Date()) {
  const days = daysUntilIST(member.membershipDue, fromDate);
  const when = days <= 1 ? "tomorrow" : `in ${days} days`;
  return `Hi ${member.name}, your Fitness World membership expires ${when} (${formatDisplayDateIST(member.membershipDue)}). Please renew to continue. - Fitness World`;
}

// Balance still owed by the member (partial or fully unpaid), else 0. Uses the
// stored balance, the same number the desk sees in the follow-up queue.
export function memberBalanceOwed(member) {
  if (!member || (member.paymentStatus !== "Pending" && member.paymentStatus !== "Partially Paid")) {
    return 0;
  }
  const balance = Number(member.balanceAmount);
  return Number.isFinite(balance) && balance > 0 ? balance : 0;
}

// Renewal + balance combined into ONE sms so a half-paid member is reminded of
// the remaining money at the same touchpoints (no extra sms cost, no spam).
// occasion: "3day" | "dueday" | "overdue2day". Amounts use Rs. (the rupee sign
// is not GSM-7 and would shrink every message to 70-char segments).
export function createBalanceReminderText(member, occasion, fromDate = new Date()) {
  const owed = memberBalanceOwed(member);
  const when = formatDisplayDateIST(member.membershipDue);
  if (occasion === "overdue2day") {
    return `Hi ${member.name}, your Fitness World plan ended on ${when} and Rs.${owed} is still pending. Please clear it at the desk. - Fitness World`;
  }
  if (occasion === "dueday") {
    return `Hi ${member.name}, your Fitness World membership expires today (${when}). Rs.${owed} is still pending - please clear it to continue. - Fitness World`;
  }
  const days = daysUntilIST(member.membershipDue, fromDate);
  const soon = days <= 1 ? "tomorrow" : `in ${days} days`;
  return `Hi ${member.name}, your Fitness World membership expires ${soon} (${when}). Rs.${owed} is still pending - please clear it at the desk. - Fitness World`;
}

export function receiptSmsText(member, receipt) {
  const hasSplit = receipt.arrearsApplied != null || receipt.cycleApplied != null || receipt.advanceApplied != null;
  const split = hasSplit
    ? ` (${receiptSplitText({
        arrearsApplied: receipt.arrearsApplied ?? 0,
        cycleApplied: receipt.cycleApplied ?? 0,
        advanceApplied: receipt.advanceApplied ?? 0,
        total: receipt.amount,
      })})`
    : "";
  return `Fitness World: received Rs.${receipt.amount} from ${member.name} (Receipt ${receipt.receiptNo})${split}. Balance: Rs.${member.balanceAmount ?? 0}. Thank you!`;
}

export function receiptEmailText(member, receipt) {
  const lines = [
    "FITNESS WORLD - PAYMENT RECEIPT",
    `Receipt: ${receipt.receiptNo}`,
    `Date: ${receipt.paidOn}`,
    `Member: ${member.name} (${member.regNo})`,
    `Method: ${receipt.method}`,
    "",
  ];
  if (receipt.arrearsApplied != null || receipt.cycleApplied != null || receipt.advanceApplied != null) {
    lines.push(`Old pending: Rs.${receipt.arrearsApplied ?? 0}`);
    lines.push(`This plan: Rs.${receipt.cycleApplied ?? 0}`);
    if ((receipt.advanceApplied ?? 0) > 0) lines.push(`Extra paid: Rs.${receipt.advanceApplied}`);
  }
  lines.push(`Paid now: Rs.${receipt.amount}`);
  lines.push(`Still to get: Rs.${member.balanceAmount ?? 0}`);
  if (receipt.note) lines.push("", `Note: ${receipt.note}`);
  lines.push("", "Thank you for training with us!");
  return lines.join("\n");
}

function escapeReceiptHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export function receiptEmailHtml(member, receipt) {
  const hasSplit = receipt.arrearsApplied != null || receipt.cycleApplied != null || receipt.advanceApplied != null;
  const rows = [
    ["Receipt", receipt.receiptNo],
    ["Date", receipt.paidOn],
    ["Member", `${member.name} (${member.regNo})`],
    ["Method", receipt.method],
  ];
  if (hasSplit) {
    rows.push(["Old pending", `Rs.${receipt.arrearsApplied ?? 0}`]);
    rows.push(["This plan", `Rs.${receipt.cycleApplied ?? 0}`]);
    if ((receipt.advanceApplied ?? 0) > 0) rows.push(["Extra paid", `Rs.${receipt.advanceApplied}`]);
  }
  rows.push(["Paid now", `Rs.${receipt.amount}`]);
  rows.push(["Still to get", `Rs.${member.balanceAmount ?? 0}`]);
  const cells = rows.map(([label, value]) =>
    `<tr><td style="padding:6px 0;color:#4b5563;">${escapeReceiptHtml(label)}</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#111827;">${escapeReceiptHtml(value)}</td></tr>`
  ).join("");
  // Mirrors the app's printed bill (MemberProfile handlePrintReceipt): same
  // header, same lines, same totals — wider page for email instead of 80mm.
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827;">
<h1 style="margin:0;font-size:22px;font-weight:800;letter-spacing:0.05em;color:#db2777;text-align:center;">FITNESS WORLD</h1>
<p style="margin:2px 0;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;text-align:center;">Unisex Gym &amp; Fitness Center</p>
<p style="margin:0 0 12px;font-size:10px;color:#9ca3af;text-align:center;">M.G.R Nagar, Chennai</p>
<hr style="border:none;border-top:1px dashed #e5e7eb;margin:12px 0;" />
<p style="margin:6px 0;font-weight:800;font-size:13px;color:#374151;text-align:center;letter-spacing:0.05em;">PAYMENT RECEIPT</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;">${cells}</table>
${receipt.note ? `<p style="margin:16px 0 0;font-size:12px;color:#4b5563;">Note: ${escapeReceiptHtml(receipt.note)}</p>` : ""}
<hr style="border:none;border-top:1px dashed #e5e7eb;margin:12px 0;" />
<p style="margin:0;text-align:center;font-size:11px;font-weight:600;color:#6b7280;">Thank you for training with us!</p>
<p style="margin:2px 0 0;text-align:center;font-size:10px;color:#9ca3af;">Please keep this receipt for your reference.</p>
</body></html>`;
}

// Receipt delivery: SMS always attempted; email too when the member has an
// address. Independent outbox rows per channel, so each retries alone and
// the UI can show per-channel state. Never throws — money is already saved.
async function sendReceiptNotifications(env, member, receipt) {
  const outcome = { sms: "failed", email: "skipped" };
  try {
    const sms = await dispatchSms(env, {
      phone: member.phone,
      message: receiptSmsText(member, receipt),
      kind: "receipt",
      memberId: member.id,
      clientRequestId: `auto:receipt-sms:${receipt.id}`,
    });
    outcome.sms = sms.status;
  } catch (error) {
    logError("receipt_sms_failed", error, { memberId: member?.id, receiptNo: receipt?.receiptNo });
    outcome.sms = "failed";
  }
  if (member.email) {
    try {
      const email = await dispatchSms(env, {
        phone: member.email,
        message: receiptEmailText(member, receipt),
        kind: "receipt",
        memberId: member.id,
        clientRequestId: `auto:receipt-email:${receipt.id}`,
        provider: "appscript",
        emailHtml: receiptEmailHtml(member, receipt),
        emailPdfName: `Receipt_${receipt.receiptNo}.pdf`,
      });
      outcome.email = email.status;
    } catch (error) {
      logError("receipt_email_failed", error, { memberId: member?.id, receiptNo: receipt?.receiptNo });
      outcome.email = "failed";
    }
  }
  logInfo("receipt_notify", { memberId: member.id, receiptNo: receipt.receiptNo, ...outcome });
  return outcome;
}

async function sendReceiptSms(env, member, receipt) {
  return (await sendReceiptNotifications(env, member, receipt)).sms;
}

// Latest per-channel receipt delivery for a member's bills, matched by
// receipt number inside the logged message. One query, matched in JS.
async function receiptDeliveryByMember(env, memberId) {
  if (!(await smsLogsEnabled(env))) {
    return new Map();
  }
  const params = new URLSearchParams({
    select: "message,provider,status,created_at",
    member_id: `eq.${memberId}`,
    kind: "eq.receipt",
    order: "created_at.desc",
    limit: "200",
  });
  let rows = [];
  try {
    rows = await supabaseJson(env, `/sms_logs?${params.toString()}`);
  } catch {
    return new Map();
  }
  const byReceipt = new Map();
  for (const row of rows) {
    const text = String(row.message || "");
    const match = text.match(/Receipt[:\s]+([A-Za-z0-9/_-]+)/);
    if (!match) continue;
    const key = match[1];
    if (!byReceipt.has(key)) byReceipt.set(key, {});
    const slot = byReceipt.get(key);
    const channel = row.provider === "appscript" ? "email" : "sms";
    // Rows arrive newest-first: first hit per channel wins.
    if (!slot[channel]) slot[channel] = row.status;
  }
  return byReceipt;
}

async function getReceiptForMember(env, user, memberId, receiptId) {
  const member = await getMember(env, user, memberId);
  assertNotDeleted(member);
  const params = new URLSearchParams({
    select: "*",
    id: `eq.${receiptId}`,
    member_id: `eq.${memberId}`,
    owner_user_id: ownerFilter(user),
    limit: "1",
  });
  const rows = await supabaseJson(env, `/payment_receipts?${params.toString()}`);
  if (!rows?.[0]) {
    throw new ApiError(404, "RECEIPT_NOT_FOUND", "Receipt not found for this member");
  }
  return { member, receipt: mapPaymentReceipt(rows[0]) };
}

async function resendReceipt(env, user, memberId, receiptId, channel) {
  const { member, receipt } = await getReceiptForMember(env, user, memberId, receiptId);
  const want = channel === "email" ? ["email"] : channel === "sms" ? ["sms"] : ["sms", "email"];
  const outcome = {};
  // Fresh key per resend so a failed send really retries; but a double-tap
  // right after a WORKING send must not double-message. Only collapse when
  // the recent attempt is still alive (sent/queued/delivered), never on failed.
  const stamp = Date.now();
  let recentRows = [];
  if (await smsLogsEnabled(env)) {
    try {
      const params = new URLSearchParams({
        select: "status,provider,client_request_id,created_at",
        member_id: `eq.${memberId}`,
        kind: "eq.receipt",
        order: "created_at.desc",
        limit: "20",
      });
      recentRows = await supabaseJson(env, `/sms_logs?${params.toString()}`);
    } catch {
      recentRows = [];
    }
  }
  for (const entry of want) {
    if (entry === "email" && !member.email) {
      outcome.email = "skipped";
      continue;
    }
    const live = (recentRows || []).find((row) =>
      String(row.client_request_id || "").startsWith(`resend:${receipt.id}:${entry}:`) &&
      Date.now() - Date.parse(row.created_at) < 60000 &&
      row.status !== "failed",
    );
    if (live) {
      outcome[entry] = live.status;
      continue;
    }
    try {
      const sent = await dispatchSms(env, {
        phone: entry === "email" ? member.email : member.phone,
        message: entry === "email" ? receiptEmailText(member, receipt) : receiptSmsText(member, receipt),
        kind: "receipt",
        memberId: member.id,
        clientRequestId: `resend:${receipt.id}:${entry}:${stamp}`,
        provider: entry === "email" ? "appscript" : "smsgate",
        ...(entry === "email"
          ? { emailHtml: receiptEmailHtml(member, receipt), emailPdfName: `Receipt_${receipt.receiptNo}.pdf` }
          : {}),
      });
      outcome[entry] = sent.status;
    } catch (error) {
      logError("receipt_resend_failed", error, { memberId, receiptId, channel: entry });
      outcome[entry] = "failed";
    }
  }
  return { receiptId: receipt.id, receiptNo: receipt.receiptNo, ...outcome };
}

export function statementText(member, channel) {
  const lines = [
    `Hi ${member.name}, your Fitness World dues:`,
    `Plan ${member.planType} ends ${member.membershipDue}.`,
    `Old pending Rs.${member.arrearsAmount ?? 0}, this plan fee Rs.${member.feesAmount}, still to get Rs.${member.balanceAmount ?? 0}.`,
  ];
  if (channel === "email") {
    lines.push(
      "",
      `Got so far: Rs.${member.partialPaidAmount ?? 0}.`,
      `Extra paid: Rs.${member.advanceAmount ?? 0}.`,
      "",
      "Pay at the gym counter or reply to this email. Thank you!",
    );
  } else {
    lines.push("Please pay at the counter. Thank you!");
  }
  return lines.join(channel === "email" ? "\n" : " ");
}

async function sendStatement(env, user, memberId, channel, dryRun) {
  const member = await getMember(env, user, memberId);
  assertNotDeleted(member);
  const text = (target) => statementText(member, target);
  if (dryRun) {
    return { dryRun: true, sms: text("sms"), email: member.email ? text("email") : null };
  }
  // Double-tap guard: same member+channel within 60s returns the last state.
  if (await smsLogsEnabled(env)) {
    try {
      const params = new URLSearchParams({
        select: "status,provider,created_at",
        member_id: `eq.${memberId}`,
        kind: "eq.statement",
        order: "created_at.desc",
        limit: "5",
      });
      const recent = await supabaseJson(env, `/sms_logs?${params.toString()}`);
      // Collapse only a LIVE send (never a failed one, or retries die) and
      // only the requested channel (an SMS send must not suppress email).
      const wantedProvider = channel === "email" ? "appscript" : channel === "sms" ? "smsgate" : null;
      const fresh = (recent || []).find((row) =>
        Date.now() - Date.parse(row.created_at) < 60000 &&
        row.status !== "failed" &&
        (!wantedProvider || row.provider === wantedProvider || (channel === "auto" && row.provider === "openwa")),
      );
      if (fresh) {
        return { duplicate: true, status: fresh.status, channel: fresh.provider === "appscript" ? "email" : fresh.provider === "openwa" ? "whatsapp" : "sms" };
      }
    } catch {
      // Log lookup failing must not block the send.
    }
  }
  if (channel === "auto") {
    const outcome = await dispatchSmart(env, {
      phone: member.phone,
      email: member.email ?? null,
      message: text("sms"),
      kind: "statement",
      memberId: member.id,
      clientRequestId: `statement:${memberId}:${Date.now()}`,
    });
    return { status: outcome.status, channel: outcome.channel ?? null, error: outcome.error };
  }
  const entry = channel === "email" ? "email" : "sms";
  const target = entry === "email" ? member.email : member.phone;
  if (!target) {
    throw new ApiError(400, entry === "email" ? "MEMBER_EMAIL_MISSING" : "MEMBER_PHONE_MISSING",
      entry === "email" ? "This member has no email address saved" : "This member has no phone number saved");
  }
  try {
    const sent = await dispatchSms(env, {
      phone: target,
      message: text(entry),
      kind: "statement",
      memberId: member.id,
      clientRequestId: `statement:${memberId}:${entry}:${Date.now()}`,
      provider: entry === "email" ? "appscript" : "smsgate",
    });
    return { status: sent.status, channel: entry };
  } catch (error) {
    logError("statement_failed", error, { memberId, channel: entry });
    throw error instanceof ApiError ? error : new ApiError(502, "STATEMENT_FAILED", "Statement could not be sent");
  }
}

async function countRows(env, table, filters = []) {
  const params = new URLSearchParams({ select: "id" });
  for (const [column, value] of filters) params.append(column, value);

  const response = await supabaseRaw(env, `/${table}?${params.toString()}`, {
    method: "HEAD",
    headers: { Prefer: "count=exact" },
  });
  const contentRange = response.headers.get("content-range") ?? "";
  const total = contentRange.split("/")[1];
  const parsed = total && total !== "*" ? Number(total) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

async function supabaseJson(env, path, init = {}) {
  const response = await supabaseRaw(env, path, init);
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(502, "SUPABASE_BAD_RESPONSE", "Supabase returned an invalid response");
  }
}

async function supabaseAuthAdminJson(env, path, init = {}) {
  const serviceKey = supabaseServiceKey(env);
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${serviceKey}`);
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${supabaseUrl(env)}/auth/v1/admin${path}`, {
    ...init,
    headers,
  });

  if (response.status === 204) return null;
  const payload = await safeJson(response);
  if (!response.ok) {
    throw new ApiError(response.status, payload?.code ?? "SUPABASE_AUTH_ADMIN_FAILED", payload?.message ?? "Supabase Auth admin request failed");
  }
  return payload;
}

async function supabaseRaw(env, path, init = {}, retries = 2) {
  const serviceKey = supabaseServiceKey(env);
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${serviceKey}`);
  if (init.body) headers.set("Content-Type", "application/json");

  // POST creates are not idempotent: a retried insert can write a duplicate row
  // (member, receipt, renewal history) or fail confusingly after succeeding.
  const method = String(init.method ?? "GET").toUpperCase();
  const maxAttempts = method === "POST" ? 0 : retries;

  let lastError;
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${supabaseUrl(env)}/rest/v1${path}`, {
        ...init,
        headers,
      });

      // Retry on 5xx server errors (Supabase waking up) but not on 4xx client errors
      if (!response.ok && response.status >= 500 && attempt < maxAttempts) {
        const delay = (attempt + 1) * 1000; // 1s, 2s
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const payload = await safeJson(response);
        throw new ApiError(response.status, payload?.code ?? "SUPABASE_REQUEST_FAILED", payload?.message ?? "Supabase request failed");
      }

      return response;
    } catch (err) {
      // Network errors (connection refused, timeout) — retry if attempts remain
      if (err instanceof ApiError) throw err; // Don't retry known API errors
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = (attempt + 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new ApiError(503, "SUPABASE_UNAVAILABLE", "Supabase is not responding");
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function supabaseUrl(env) {
  if (!env.SUPABASE_URL) {
    throw new ApiError(500, "SUPABASE_URL_MISSING", "Supabase URL is not configured");
  }
  return env.SUPABASE_URL.replace(/\/$/, "");
}

function supabaseServiceKey(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new ApiError(500, "SUPABASE_SERVICE_KEY_MISSING", "Supabase service key is not configured");
  }
  return key;
}

function supabasePublishableKey(env) {
  const key = env.SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) {
    throw new ApiError(500, "SUPABASE_ANON_KEY_MISSING", "Supabase publishable key is not configured");
  }
  return key;
}

function validateMemberInput(body) {
  const input = {
    name: requiredString(body.name, "name"),
    phone: requiredString(body.phone, "phone"),
    email: body.email !== undefined && body.email !== null && String(body.email).trim() !== ""
      ? normalizeEmailAddress(body.email)
      : undefined,
    age: requiredNumber(body.age, "age", 12, 90),
    gender: assertEnum(body.gender, GENDERS, "gender"),
    joinDate: requiredDate(body.joinDate ?? body.join_date, "join date"),
    weightKg: requiredNumber(body.weightKg ?? body.weight_kg, "weight", 20, 250),
    heightCm: requiredNumber(body.heightCm ?? body.height_cm, "height", 90, 240),
    goal: assertEnum(body.goal, GOALS, "goal"),
    goalOther: optionalText(body.goalOther ?? body.goal_other),
    healthProblem: optionalText(body.healthProblem ?? body.health_problem),
    specialInstruction: optionalText(body.specialInstruction ?? body.special_instruction),
    warmupExercises: optionalText(body.warmupExercises ?? body.warmup_exercises),
    flexibilityTraining: optionalText(body.flexibilityTraining ?? body.flexibility_training),
    cardioTraining: optionalText(body.cardioTraining ?? body.cardio_training),
    planType: assertEnum(body.planType ?? body.plan_type, PLAN_TYPES, "plan type"),
    membershipStart: requiredDate(body.membershipStart ?? body.membership_start, "membership start"),
    membershipDue: requiredDate(body.membershipDue ?? body.membership_due, "membership due"),
    feesAmount: requiredNumber(body.feesAmount ?? body.fees_amount, "fees amount", 0),
    paymentStatus: assertEnum(body.paymentStatus ?? body.payment_status, PAYMENT_STATUSES, "payment status"),
    method: body.method !== undefined ? assertEnum(body.method, PAYMENT_METHODS, "payment method") : undefined,
    avatar: typeof body.avatar === "string" ? body.avatar : undefined,
    trainingType: assertEnum(body.trainingType ?? body.training_type ?? "General", TRAINING_TYPES, "training type"),
    address: typeof body.address === "string" ? body.address.trim() : "",
    partialPaidAmount: body.partialPaidAmount !== undefined || body.partial_paid_amount !== undefined
      ? requiredNumber(body.partialPaidAmount ?? body.partial_paid_amount, "partial paid amount", 0)
      : 0,
    balanceAmount: body.balanceAmount !== undefined || body.balance_amount !== undefined
      ? requiredNumber(body.balanceAmount ?? body.balance_amount, "balance amount", 0)
      : 0,
    clientRequestId: optionalClientRequestId(body.clientRequestId ?? body.client_request_id),
  };

  if (!/^\d{10}$/.test(input.phone)) {
    throw new ApiError(400, "INVALID_PHONE", "Phone number must be 10 digits");
  }

  // Balance may exceed the cycle fee when old pending exists (it always
  // includes arrears); only the cycle-paid figure is capped here.
  if (input.partialPaidAmount > input.feesAmount) {
    throw new ApiError(400, "INVALID_AMOUNTS", "Paid amount cannot exceed the fees amount");
  }

  // Never trust client money splits: derive them from status so Paid with a
  // full balance (or any other inconsistent ledger) cannot be stored.
  if (input.paymentStatus === "Paid") {
    input.partialPaidAmount = input.feesAmount;
    input.balanceAmount = 0;
  } else if (input.paymentStatus === "Pending") {
    input.partialPaidAmount = 0;
    input.balanceAmount = input.feesAmount;
  } else {
    input.partialPaidAmount = Math.min(Math.max(input.partialPaidAmount, 0), input.feesAmount);
    input.balanceAmount = Math.max(input.feesAmount - input.partialPaidAmount, 0);
  }

  if (input.planType === "Custom") {
    assertDueDateOrder(input.membershipStart, input.membershipDue);
  } else {
    input.membershipDue = calculatePlanDueDate(input.membershipStart, input.planType);
  }

  if (input.paymentStatus === "Partially Paid") {
    if (input.partialPaidAmount < 1) {
      throw new ApiError(400, "INVALID_PARTIAL_AMOUNT", "Partial amount must be at least 1");
    }
    if (input.partialPaidAmount > input.feesAmount) {
      throw new ApiError(400, "INVALID_PARTIAL_AMOUNT", "Partial amount cannot exceed fees amount");
    }
  }

  return input;
}

export function validateRenewInput(body) {
  const input = {
    membershipStart: requiredDate(body.membershipStart ?? body.membership_start, "membership start"),
    membershipDue: requiredDate(body.membershipDue ?? body.membership_due, "membership due"),
    feesAmount: requiredNumber(body.feesAmount ?? body.fees_amount, "fees amount", 0),
    planType: body.planType ?? body.plan_type ? assertEnum(body.planType ?? body.plan_type, PLAN_TYPES, "plan type") : undefined,
    paymentStatus: body.paymentStatus ?? body.payment_status ? assertEnum(body.paymentStatus ?? body.payment_status, PAYMENT_STATUSES, "payment status") : "Pending",
    // New clients send collectedAmount (total cash incl. possible advance);
    // old clients send partialPaidAmount. Old carryForward flags are ignored:
    // arrears always stay visible now, never merged, never dropped.
    collectedAmount: requiredNumber(
      body.collectedAmount ?? body.collected_amount ?? body.partialPaidAmount ?? body.partial_paid_amount ?? 0,
      "collected amount",
      0,
    ),
    method: body.method !== undefined ? assertEnum(body.method, PAYMENT_METHODS, "payment method") : "Cash",
    clientRequestId: optionalClientRequestId(body.clientRequestId ?? body.client_request_id),
  };
  assertDueDateOrder(input.membershipStart, input.membershipDue);

  // Fixed plans: never trust the client due date (a "1 Month" renew once could
  // store a 1-day or 2-year due). Recalculate like member creation does.
  if (input.planType && input.planType !== "Custom") {
    input.membershipDue = calculatePlanDueDate(input.membershipStart, input.planType);
  }

  if (input.paymentStatus === "Partially Paid" && input.collectedAmount < 1) {
    throw new ApiError(400, "INVALID_PARTIAL_AMOUNT", "Partial amount must be at least 1");
  }
  // Upper bound is checked in renewMember against arrears + new cycle.

  return input;
}

export function validateResendInput(body) {
  return {
    receiptId: assertUuid(body.receiptId ?? body.receipt_id, "receipt id"),
    channel: body.channel ? assertEnum(body.channel, new Set(["auto", "sms", "email"]), "channel") : "auto",
  };
}

export function validateStatementInput(body) {
  return {
    channel: body.channel ? assertEnum(body.channel, new Set(["auto", "sms", "email"]), "channel") : "auto",
    dryRun: body.dryRun === true,
  };
}

export function validatePaymentReceiptInput(body) {
  const receiptNo = optionalText(body.receiptNo ?? body.receipt_no);
  if (receiptNo && !/^[A-Za-z0-9/_-]{3,40}$/.test(receiptNo)) {
    throw new ApiError(400, "INVALID_RECEIPT_NO", "Receipt number can use letters, numbers, slash, underscore, or dash");
  }

  const note = optionalText(body.note);
  if (note && note.length > 180) {
    throw new ApiError(400, "INVALID_PAYMENT_NOTE", "Payment note must be 180 characters or less");
  }

  return {
    paidOn: requiredDate(body.paidOn ?? body.paid_on, "payment date"),
    amount: requiredNumber(body.amount, "payment amount", 1, 1_000_000),
    method: assertEnum(body.method, PAYMENT_METHODS, "payment method"),
    note: note ?? "",
    receiptNo,
    clientRequestId: optionalClientRequestId(body.clientRequestId ?? body.client_request_id),
  };
}

function optionalClientRequestId(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const key = String(value);
  if (key.length < 8 || key.length > 64) {
    throw new ApiError(400, "INVALID_INPUT", "clientRequestId must be 8 to 64 characters");
  }
  return key;
}

// The idempotency columns may not exist yet (migration unapplied): probe once
// and cache, so money writes keep working (without dedup) on old databases.
const idempotencyProbe = {};
async function idempotencyAvailable(env, table) {
  const cached = idempotencyProbe[table];
  const now = Date.now();
  if (cached && now - cached.checkedAt < 5 * 60 * 1000) {
    return cached.available;
  }
  // renewal_history carries two new columns (client_request_id + old_amount):
  // both must exist before either is written.
  const columns = table === "renewal_history" ? "client_request_id,old_amount" : "client_request_id";
  try {
    await supabaseJson(env, `/${table}?select=${columns}&limit=1`);
    idempotencyProbe[table] = { available: true, checkedAt: now };
    return true;
  } catch {
    idempotencyProbe[table] = { available: false, checkedAt: now };
    return false;
  }
}

function isUniqueViolation(error) {
  return error instanceof ApiError && error.status === 409 && error.code === "23505";
}

function assertDueDateOrder(startDate, dueDate) {
  if (dueDate < startDate) {
    throw new ApiError(400, "INVALID_MEMBERSHIP_DATES", "Due date must be on or after the start date");
  }
}

export function calculatePlanDueDate(startDate, planType) {
  const months = FIXED_PLAN_MONTHS.get(planType);
  if (!months) {
    return startDate;
  }
  return addCalendarMonthsIso(startDate, months);
}

function addCalendarMonthsIso(startDate, months) {
  const [year, month, day] = startDate.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const targetMonthIndex = targetMonth % 12;
  const targetDay = Math.min(day, daysInUtcMonth(targetYear, targetMonthIndex));
  return `${targetYear}-${String(targetMonthIndex + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function daysInUtcMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function validateAttendanceInput(body) {
  return {
    memberId: assertUuid(body.memberId ?? body.member_id, "member id"),
    visitDate: requiredDate(body.visitDate ?? body.visit_date, "visit date"),
    weightKg: body.weightKg === undefined && body.weight_kg === undefined ? undefined : requiredNumber(body.weightKg ?? body.weight_kg, "weight", 20, 250),
  };
}

function validateSmsInput(body) {
  const message = requiredString(body.message, "message");
  if (message.length < SMS_MIN_LENGTH || message.length > SMS_MAX_LENGTH) {
    throw new ApiError(400, "INVALID_SMS_MESSAGE", `SMS message must be ${SMS_MIN_LENGTH} to ${SMS_MAX_LENGTH} characters`);
  }
  // Idempotency key for double-tap / network-retry dedup. Optional for
  // backwards compatibility; the frontend always sends one.
  let clientRequestId;
  if (body.clientRequestId !== undefined && body.clientRequestId !== null) {
    clientRequestId = String(body.clientRequestId);
    if (clientRequestId.length < 8 || clientRequestId.length > 64) {
      throw new ApiError(400, "INVALID_INPUT", "clientRequestId must be 8 to 64 characters");
    }
  }
  let channel = "sms";
  if (body.channel !== undefined && body.channel !== null) {
    const value = String(body.channel).trim().toLowerCase();
    if (value !== "auto" && !NOTIFY_CHANNELS.has(value)) {
      throw new ApiError(400, "INVALID_INPUT", "channel must be auto, whatsapp, sms, or email");
    }
    channel = value;
  }
  return {
    memberId: assertUuid(body.memberId ?? body.member_id, "member id"),
    message,
    markReminder: body.markReminder === true,
    clientRequestId,
    channel,
  };
}

function generateReceiptNo(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `FW-R-${stamp}-${suffix}`;
}

function paymentStatusFromAmounts(feesAmount, collectedAmount) {
  if (feesAmount <= 0 || collectedAmount >= feesAmount) {
    return "Paid";
  }
  return collectedAmount > 0 ? "Partially Paid" : "Pending";
}

// Money buckets — server mirror of frontend lib/money.ts. A member's money
// is arrears + current cycle + advance credit, allocated oldest-first.
// Renew never merges old and new money into one number.
export function moneyNum(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function memberBuckets(member) {
  return {
    fees: moneyNum(member.feesAmount),
    partial: moneyNum(member.partialPaidAmount),
    arrears: moneyNum(member.arrearsAmount),
    advance: moneyNum(member.advanceAmount),
  };
}

export function cycleDueOf(buckets) {
  return Math.max(buckets.fees - buckets.partial, 0);
}

export function allocateMoney(arrears, cycleFee, cyclePaid, amount) {
  let rest = moneyNum(amount);
  const arrearsApplied = Math.min(moneyNum(arrears), rest);
  rest -= arrearsApplied;
  const cycleApplied = Math.min(Math.max(moneyNum(cycleFee) - moneyNum(cyclePaid), 0), rest);
  rest -= cycleApplied;
  return { arrearsApplied, cycleApplied, advanceApplied: rest, total: moneyNum(amount) };
}

export function statusFromBuckets(fees, partial, arrears, advance) {
  if (moneyNum(arrears) + Math.max(moneyNum(fees) - moneyNum(partial), 0) <= 0) {
    return "Paid";
  }
  return moneyNum(partial) > 0 || moneyNum(advance) > 0 ? "Partially Paid" : "Pending";
}

export function applyRenewalBuckets(buckets, newFees, collected, totalCollectedBefore) {
  const fees = moneyNum(newFees);
  const arrearsClosed = buckets.arrears + cycleDueOf(buckets);
  const creditUsed = Math.min(buckets.advance, fees);
  const allocation = allocateMoney(arrearsClosed, fees, creditUsed, collected);
  const arrearsAmount = Math.max(arrearsClosed - allocation.arrearsApplied, 0);
  const partialPaidAmount = creditUsed + allocation.cycleApplied;
  const advanceAmount = buckets.advance - creditUsed + allocation.advanceApplied;
  const balanceAmount = arrearsAmount + Math.max(fees - partialPaidAmount, 0);
  return {
    feesAmount: fees,
    partialPaidAmount,
    arrearsAmount,
    advanceAmount,
    balanceAmount,
    totalCollected: moneyNum(totalCollectedBefore) + allocation.total,
    paymentStatus: statusFromBuckets(fees, partialPaidAmount, arrearsAmount, advanceAmount),
    arrearsClosed,
    creditUsed,
    allocation,
  };
}

export function receiptSplitText(allocation) {
  const parts = [];
  if (allocation.arrearsApplied > 0) parts.push(`old pending Rs.${allocation.arrearsApplied}`);
  if (allocation.cycleApplied > 0) parts.push(`this plan Rs.${allocation.cycleApplied}`);
  if (allocation.advanceApplied > 0) parts.push(`extra Rs.${allocation.advanceApplied}`);
  parts.push(`total Rs.${allocation.total}`);
  return parts.join(", ");
}

const bucketProbe = { checkedAt: 0, available: false };

async function bucketColumnsAvailable(env) {
  const now = Date.now();
  if (now - bucketProbe.checkedAt < 5 * 60 * 1000) {
    return bucketProbe.available;
  }
  try {
    await supabaseJson(env, "/members?select=arrears_amount&limit=1");
    await supabaseJson(env, "/payment_receipts?select=arrears_applied&limit=1");
    await supabaseJson(env, "/renewal_history?select=collected_amount,collected_method&limit=1");
    bucketProbe.checkedAt = now;
    bucketProbe.available = true;
    return true;
  } catch {
    bucketProbe.checkedAt = now;
    bucketProbe.available = false;
    return false;
  }
}

function memberInputToDb(input) {
  return {
    name: input.name,
    phone: input.phone,
    // Omit when absent: databases without the email column keep working.
    ...(input.email !== undefined ? { email: input.email } : {}),
    age: input.age,
    gender: input.gender,
    join_date: input.joinDate,
    weight_kg: input.weightKg,
    height_cm: input.heightCm,
    goal: input.goal,
    goal_other: input.goalOther ?? null,
    health_problem: input.healthProblem ?? null,
    special_instruction: input.specialInstruction ?? null,
    warmup_exercises: input.warmupExercises ?? null,
    flexibility_training: input.flexibilityTraining ?? null,
    cardio_training: input.cardioTraining ?? null,
    plan_type: input.planType,
    membership_start: input.membershipStart,
    membership_due: input.membershipDue,
    fees_amount: input.feesAmount,
    payment_status: input.paymentStatus,
    // Omit when no photo: databases without the avatar column keep working,
    // and editing a member no longer wipes their existing photo with null.
    ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
    training_type: input.trainingType,
    address: input.address,
    partial_paid_amount: input.partialPaidAmount,
    balance_amount: input.balanceAmount,
  };
}

function paymentReceiptInputToDb(memberId, ownerUserId, input, receiptNo) {
  return {
    member_id: memberId,
    owner_user_id: ownerUserId,
    receipt_no: receiptNo,
    paid_on: input.paidOn,
    amount: input.amount,
    method: input.method,
    note: input.note ?? "",
  };
}

function mapMember(row) {
  return {
    id: row.id,
    regNo: row.reg_no,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    age: row.age,
    gender: row.gender,
    joinDate: row.join_date,
    weightKg: Number(row.weight_kg),
    heightCm: Number(row.height_cm),
    bmi: Number(row.bmi),
    goal: row.goal,
    goalOther: row.goal_other ?? undefined,
    healthProblem: row.health_problem ?? undefined,
    specialInstruction: row.special_instruction ?? undefined,
    warmupExercises: row.warmup_exercises ?? undefined,
    flexibilityTraining: row.flexibility_training ?? undefined,
    cardioTraining: row.cardio_training ?? undefined,
    planType: row.plan_type,
    membershipStart: row.membership_start,
    membershipDue: row.membership_due,
    feesAmount: Number(row.fees_amount),
    paymentStatus: row.payment_status,
    status: row.status,
    smsSent3days: row.sms_sent_3days,
    ownerUserId: row.owner_user_id ?? undefined,
    avatar: row.avatar ?? undefined,
    trainingType: row.training_type,
    address: row.address,
    partialPaidAmount: Number(row.partial_paid_amount || 0),
    balanceAmount: Number(row.balance_amount || 0),
    arrearsAmount: Number(row.arrears_amount || 0),
    advanceAmount: Number(row.advance_amount || 0),
    totalCollected: Number(row.total_collected || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPaymentReceipt(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    receiptNo: row.receipt_no,
    paidOn: row.paid_on,
    amount: Number(row.amount || 0),
    method: row.method,
    note: row.note || "",
    createdAt: row.created_at,
    arrearsApplied: row.arrears_applied == null ? undefined : Number(row.arrears_applied),
    cycleApplied: row.cycle_applied == null ? undefined : Number(row.cycle_applied),
    advanceApplied: row.advance_applied == null ? undefined : Number(row.advance_applied),
  };
}

function mapRenewalHistory(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    oldPlanType: row.old_plan_type,
    oldAmount: Number(row.old_amount || 0),
    newPlanType: row.new_plan_type,
    oldStartDate: row.old_start_date,
    oldDueDate: row.old_due_date,
    newStartDate: row.new_start_date,
    newDueDate: row.new_due_date,
    amount: Number(row.amount || 0),
    arrearsCarried: Number(row.arrears_carried || 0),
    paymentStatus: row.payment_status,
    renewedOn: row.renewed_on,
    createdAt: row.created_at,
  };
}

function mapAttendance(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    visitDate: row.visit_date,
    weightKg: row.weight_kg ?? undefined,
    createdAt: row.created_at,
  };
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "INVALID_INPUT", `${label} is required`);
  }
  return value.trim();
}

function optionalText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function requiredNumber(value, label, min, max = Number.POSITIVE_INFINITY) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ApiError(400, "INVALID_INPUT", `${label} is invalid`);
  }
  return number;
}

function requiredDate(value, label) {
  if (typeof value !== "string" || !isRealIsoDate(value)) {
    throw new ApiError(400, "INVALID_DATE", `${label} must use yyyy-mm-dd`);
  }
  return value;
}

function isRealIsoDate(value) {
  if (!ISO_DATE_RE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertEnum(value, allowed, label) {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new ApiError(400, "INVALID_INPUT", `${label} is invalid`);
  }
  return value;
}

function assertUuid(value, label) {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new ApiError(400, "INVALID_ID", `${label} is invalid`);
  }
  return value;
}

function numberParam(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function sortOrder(sort) {
  if (!sort) return "created_at.desc";
  const [rawColumn, rawDirection] = sort.split(":");
  const column = toDbColumn(rawColumn);
  const direction = rawDirection === "asc" ? "asc" : "desc";
  return `${column}.${direction}`;
}

function toDbColumn(column) {
  const columns = {
    regNo: "reg_no",
    joinDate: "join_date",
    weightKg: "weight_kg",
    heightCm: "height_cm",
    planType: "plan_type",
    membershipStart: "membership_start",
    membershipDue: "membership_due",
    feesAmount: "fees_amount",
    paymentStatus: "payment_status",
    createdAt: "created_at",
    updatedAt: "updated_at",
  };
  const safe = columns[column];
  return safe ?? "created_at";
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * ONE_DAY_MS);
}

export function isoDateInTimeZone(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function jsonResponse(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function errorResponse(request, env, error) {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  if (!(error instanceof ApiError)) {
    logError("unhandled_request_error", error);
  }

  return jsonResponse(
    request,
    env,
    {
      success: false,
      error: {
        code: apiError.code,
        message: apiError.message,
      },
    },
    apiError.status,
  );
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigins = new Set(
    normalizeOrigins([
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      ...String(env.FRONTEND_URL ?? "").split(","),
      ...String(env.FRONTEND_URLS ?? "").split(","),
    ]),
  );

  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function normalizeOrigins(origins) {
  return origins.map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean);
}

function maskPhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length <= 4 ? "***" : `***${digits.slice(-4)}`;
}

function addLog(level, event, message, details) {
  const timestamp = new Date().toISOString();
  logBuffer.unshift({ timestamp, level, event, message, details });
  if (logBuffer.length > 100) {
    logBuffer.pop();
  }
}

function logInfo(event, details = {}) {
  console.log(JSON.stringify({ level: "info", event, ...details }));
  addLog("info", event, "", details);
}

function logWarn(event, details = {}) {
  console.warn(JSON.stringify({ level: "warn", event, ...details }));
  addLog("warn", event, "", details);
}

function logError(event, error, details = {}) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(
    JSON.stringify({
      level: "error",
      event,
      message,
      ...details,
    }),
  );
  addLog("error", event, message, details);
}

async function getSystemSettings(env) {
  try {
    const rows = await supabaseJson(env, "/system_settings?select=key,value");
    const settings = {};
    for (const row of rows ?? []) {
      if (row && typeof row.key === "string") {
        settings[row.key] = row.value ?? "";
      }
    }
    return settings;
  } catch (err) {
    logError("get_system_settings_failed", err);
  }
  return {};
}

async function saveSystemSettings(env, settings) {
  const keys = [
    "sms_enabled",
    "smsgate_username",
    "smsgate_password",
    "smsgate_device_id",
    "smsgate_sim_number",
    "wa_enabled",
    "wa_base_url",
    "wa_api_key",
    "wa_session_id",
    "email_enabled",
    "appscript_url",
    "appscript_secret",
    "notify_channel_order",
    "db_keep_alive_enabled",
    "sms_auto_reminder_paused",
    "sms_last_dueday_run",
    "sms_dueday_progress",
    "sms_last_run_at",
    "sms_last_run_sent",
    "sms_last_run_failed",
    "sms_last_run_queued",
    "sms_last_run_skipped",
    "sms_last_run_error",
    "sms_last_retry_run",
    "sms_last_retry_sent",
    "expiry_last_run_at",
    "expiry_last_run_changed",
    "trainer_emails_extra",
  ];

  const rows = [];
  for (const key of keys) {
    if (settings[key] !== undefined) {
      rows.push({ key, value: String(settings[key]) });
    }
  }
  if (rows.length === 0) {
    return;
  }

  await supabaseJson(env, "/system_settings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates"
    },
    body: JSON.stringify(rows)
  });
}
