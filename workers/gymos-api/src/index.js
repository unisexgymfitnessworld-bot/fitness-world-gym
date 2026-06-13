const EXPIRY_CRON = "30 18 * * *"; // 00:00 Asia/Kolkata, Cloudflare cron is UTC.
const SMS_CRON = "30 3 * * *"; // 09:00 Asia/Kolkata, Cloudflare cron is UTC.
const ONE_DAY_MS = 86_400_000;
const TIME_ZONE = "Asia/Kolkata";

const GENDERS = new Set(["Male", "Female", "Other"]);
const GOALS = new Set(["Weight Loss", "Weight Gain", "Muscle Gain", "General Fitness", "Other"]);
const PLAN_TYPES = new Set(["1 Month", "3 Months", "6 Months", "1 Year", "Custom"]);
const PAYMENT_STATUSES = new Set(["Paid", "Pending", "Partially Paid"]);
const PAYMENT_METHODS = new Set(["Cash", "UPI", "Card", "Bank Transfer", "Other"]);
const STATUS_VALUES = new Set(["Active", "Expired", "Suspended", "Deleted"]);
const TRAINING_TYPES = new Set(["Personal", "General", "Couple"]);
const DEFAULT_TRAINER_EMAILS = [
  "digimartrix26@gmail.com",
  "vijayfitnessworld@gmail.com",
  "jaiga9655@gmail.com",
  "vedasaradhiv@gmail.com"
];
const rateLimitStore = new Map();
const logBuffer = [];
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
    await keepSupabaseAlive(env);
    return jsonResponse(request, env, {
      status: "ok",
      timestamp: new Date().toISOString(),
      runtime: "cloudflare-worker",
    });
  }

  const path = normalizeApiPath(url.pathname);

  if (path === "/auth/login" && method === "POST") {
    applyRateLimit(request, "login", 15 * 60 * 1000, 10);
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

  if (path === "/whatsapp-gateway/status" && method === "GET") {
    assertTrainer(authUser);
    const settings = await getSystemSettings(env);
    const waGatewayUrl = settings.whatsapp_gateway_url || env.WHATSAPP_GATEWAY_URL;
    const waGatewayToken = settings.whatsapp_gateway_token || env.WHATSAPP_GATEWAY_TOKEN;
    if (!waGatewayUrl) {
      return jsonResponse(request, env, { success: false, error: "WhatsApp Gateway URL is not configured. Please check developer settings." }, 400);
    }
    try {
      const response = await fetch(`${waGatewayUrl.replace(/\/$/, "")}/status`);
      const data = await response.json();
      return jsonResponse(request, env, { success: true, data: { ...data, gatewayUrl: waGatewayUrl } });
    } catch (err) {
      return jsonResponse(request, env, { success: false, error: "Unable to reach WhatsApp gateway service. Make sure it is running." }, 502);
    }
  }

  if (path === "/whatsapp-gateway/reset" && method === "POST") {
    assertTrainer(authUser);
    const settings = await getSystemSettings(env);
    const waGatewayUrl = settings.whatsapp_gateway_url || env.WHATSAPP_GATEWAY_URL;
    const waGatewayToken = settings.whatsapp_gateway_token || env.WHATSAPP_GATEWAY_TOKEN;
    if (!waGatewayUrl || !waGatewayToken) {
      return jsonResponse(request, env, { success: false, error: "WhatsApp Gateway URL or Access Token is not configured." }, 400);
    }
    try {
      const response = await fetch(`${waGatewayUrl.replace(/\/$/, "")}/reset`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${waGatewayToken}`
        }
      });
      const data = await response.json();
      return jsonResponse(request, env, { success: true, data });
    } catch (err) {
      return jsonResponse(request, env, { success: false, error: "Unable to reach WhatsApp gateway service to disconnect." }, 502);
    }
  }

  if (path === "/developer/diagnostics" && method === "GET") {
    assertDeveloper(authUser);
    return jsonResponse(request, env, { success: true, data: await developerDiagnostics(env) });
  }

  if (path === "/developer/settings" && method === "POST") {
    assertDeveloper(authUser);
    const body = await parseJsonBody(request);
    await saveSystemSettings(env, body);
    return jsonResponse(request, env, { success: true, data: { message: "Settings saved successfully" } });
  }

  if (path === "/developer/test-notification" && method === "POST") {
    assertDeveloper(authUser);
    const body = await parseJsonBody(request);
    const type = requiredString(body.type, "notification type");
    const phone = requiredString(body.phone, "phone number");
    const message = requiredString(body.message, "test message");

    let requestId;
    if (type === "sms") {
      requestId = await sendSms(env, phone, message);
    } else if (type === "whatsapp") {
      requestId = await sendWhatsApp(env, phone, message);
    } else {
      throw new ApiError(400, "INVALID_NOTIFICATION_TYPE", "Notification type must be sms or whatsapp");
    }

    logInfo("developer_test_notification", { type, phone, requestId });
    return jsonResponse(request, env, { success: true, data: { requestId } });
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
    const body = await parseJsonBody(request);
    return jsonResponse(request, env, { success: true, data: await runDeveloperFix(env, body) });
  }

  if (path === "/developer/accounts" && method === "GET") {
    assertDeveloper(authUser);
    return jsonResponse(request, env, { success: true, data: await listTrainerAccounts(env, authUser) });
  }

  if (path === "/developer/accounts" && method === "POST") {
    assertDeveloper(authUser);
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
    return jsonResponse(request, env, { success: true, data: await createMember(env, authUser, body) }, 201);
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

    if (action === "payment" && method === "PATCH") {
      const body = await parseJsonBody(request);
      const paymentStatus = assertEnum(body.paymentStatus ?? body.payment_status, PAYMENT_STATUSES, "payment status");
      return jsonResponse(request, env, { success: true, data: await updatePayment(env, authUser, memberId, paymentStatus) });
    }

    if (action === "payments" && method === "GET") {
      return jsonResponse(request, env, { success: true, data: await listPaymentReceipts(env, authUser, memberId) });
    }

    if (action === "renewals" && method === "GET") {
      return jsonResponse(request, env, { success: true, data: await listRenewalHistory(env, authUser, memberId) });
    }

    if (action === "payments" && method === "POST") {
      const body = validatePaymentReceiptInput(await parseJsonBody(request));
      return jsonResponse(request, env, { success: true, data: await createPaymentReceipt(env, authUser, memberId, body) }, 201);
    }

    if (action === "renew" && method === "PATCH") {
      const body = validateRenewInput(await parseJsonBody(request));
      return jsonResponse(request, env, {
        success: true,
        data: await renewMember(env, authUser, memberId, body.membershipStart, body.membershipDue, body.feesAmount, body.planType),
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

  const attendanceDeleteMatch = path.match(/^\/attendance\/([^/]+)$/);
  if (attendanceDeleteMatch && method === "DELETE") {
    const attendanceId = assertUuid(attendanceDeleteMatch[1], "attendance id");
    await deleteAttendance(env, authUser, attendanceId);
    return jsonResponse(request, env, { success: true, data: { message: "Deleted" } });
  }

  if (path === "/dashboard/stats" && method === "GET") {
    return jsonResponse(request, env, { success: true, data: await getDashboardStats(env, authUser) });
  }

  if (path === "/sms/send" && method === "POST") {
    applyRateLimit(request, "sms", 15 * 60 * 1000, 10);
    const body = validateSmsInput(await parseJsonBody(request));
    const member = await getMember(env, authUser, body.memberId);
    
    let requestId = "skipped";
    let sentSMS = false;
    let sentWA = false;

    const settings = await getSystemSettings(env);
    const fast2SmsKey = settings.fast2sms_api_key || env.FAST2SMS_API_KEY;
    const waInstanceId = settings.whatsapp_instance_id || env.WHATSAPP_INSTANCE_ID;
    const waToken = settings.whatsapp_token || env.WHATSAPP_TOKEN;
    const waGatewayUrl = settings.whatsapp_gateway_url || env.WHATSAPP_GATEWAY_URL;
    const waGatewayToken = settings.whatsapp_gateway_token || env.WHATSAPP_GATEWAY_TOKEN;

    const smsEnabled = settings.sms_enabled !== "false";
    const whatsappEnabled = settings.whatsapp_enabled !== "false";

    if (fast2SmsKey && smsEnabled) {
      requestId = await sendSms(env, member.phone, body.message);
      sentSMS = true;
    }

    const isWhatsAppConfigured = Boolean(
      (waInstanceId && waToken) ||
      (waInstanceId === "self_hosted" && waGatewayUrl)
    );

    if (isWhatsAppConfigured && whatsappEnabled) {
      const waId = await sendWhatsApp(env, member.phone, body.message);
      if (!sentSMS || requestId === "skipped_disabled") requestId = waId;
      sentWA = true;
    }

    if (!sentSMS && !sentWA) {
      throw new ApiError(503, "NOTIFICATIONS_NOT_CONFIGURED", "Neither SMS nor WhatsApp is configured or enabled");
    }

    await markReminderSent(env, member.id);
    return jsonResponse(request, env, { success: true, data: { requestId } });
  }

  if (path === "/sms/whatsapp-link" && method === "POST") {
    const body = validateSmsMemberInput(await parseJsonBody(request));
    const member = await getMember(env, authUser, body.memberId);
    const text = encodeURIComponent(`Hi ${member.name}, your Fitness World membership update is ready. - Fitness World`);
    return jsonResponse(request, env, { success: true, data: { url: `https://wa.me/91${member.phone}?text=${text}` } });
  }

  throw new ApiError(404, "NOT_FOUND", "Route not found");
}

async function handleScheduled(controller, env) {
  const startedAt = new Date().toISOString();
  try {
    if (controller.cron === "*/30 * * * *") {
      const settings = await getSystemSettings(env);
      if (settings.db_keep_alive_enabled === "true") {
        await keepSupabaseAlive(env);
        logInfo("scheduled_keep_alive_complete", { startedAt });
      }
      return;
    }

    if (controller.cron === EXPIRY_CRON) {
      const expired = await runExpireStatus(env);
      logInfo("scheduled_expiry_complete", { startedAt, expired });
      return;
    }

    if (controller.cron === SMS_CRON) {
      const sent = await runSmsReminder(env);
      logInfo("scheduled_sms_complete", { startedAt, sent });
      return;
    }

    const [expired, sent] = await Promise.all([runExpireStatus(env), runSmsReminder(env)]);
    logInfo("scheduled_maintenance_complete", { startedAt, expired, sent });
  } catch (error) {
    logError("scheduled_job_failed", error);
  }
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
  assertTrainerAllowed(env, user);
  return user;
}

async function loginTrainer(env, body) {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email.includes("@") || password.length < 6) {
    throw new ApiError(400, "INVALID_LOGIN", "Email and password are required");
  }

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
    throw new ApiError(401, "LOGIN_FAILED", payload?.msg ?? payload?.message ?? "Unable to sign in");
  }
  assertTrainerAllowed(env, payload.user);

  return {
    token: payload.access_token,
    trainer: trainerFromUser(payload.user),
  };
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

function assertTrainerAllowed(env, user) {
  const email = normalizeEmail(user?.email);
  const role = explicitRoleFromUser(user);
  if (!email || (!allowedTrainerEmails(env).has(email) && role !== "developer" && role !== "trainer")) {
    throw new ApiError(403, "TRAINER_NOT_ALLOWED", "This trainer account is not allowed to access GymOS");
  }
}

function roleFromUser(user) {
  return explicitRoleFromUser(user) ?? "trainer";
}

function explicitRoleFromUser(user) {
  const email = normalizeEmail(user?.email);
  if (email === "digimartrix26@gmail.com") {
    return "developer";
  }
  const role = user?.app_metadata?.role ?? user?.user_metadata?.role;
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

  const fast2SmsKey = settings.fast2sms_api_key || env.FAST2SMS_API_KEY;
  const waInstanceId = settings.whatsapp_instance_id || env.WHATSAPP_INSTANCE_ID;
  const waToken = settings.whatsapp_token || env.WHATSAPP_TOKEN;
  const waGatewayUrl = settings.whatsapp_gateway_url || env.WHATSAPP_GATEWAY_URL;
  const waGatewayToken = settings.whatsapp_gateway_token || env.WHATSAPP_GATEWAY_TOKEN;

  const smsEnabled = settings.sms_enabled !== "false";
  const whatsappEnabled = settings.whatsapp_enabled !== "false";
  const whatsAppConfigured = Boolean(
    (waInstanceId && waToken) ||
    (waInstanceId === "self_hosted" && waGatewayUrl)
  );

  return {
    api: "ok",
    supabase,
    smsConfigured: Boolean(fast2SmsKey) && smsEnabled,
    whatsAppConfigured: whatsAppConfigured && whatsappEnabled,
    memberOwnershipReady,
    orphanMembers,
    expiredActiveMembers,
    totalMembers,
    totalAttendance,
    accounts: {
      total: accounts.length,
      developers: accounts.filter((account) => account.role === "developer").length,
      trainers: accounts.filter((account) => account.role === "trainer").length,
    },
    cron: {
      expiry: "00:00 IST daily",
      sms: "09:00 IST daily",
    },
    settings: {
      sms_enabled: settings.sms_enabled ?? "true",
      whatsapp_enabled: settings.whatsapp_enabled ?? "true",
      whatsapp_provider: settings.whatsapp_provider ?? (env.WHATSAPP_INSTANCE_ID === "self_hosted" ? "self_hosted" : env.WHATSAPP_INSTANCE_ID ? "ultramsg" : "none"),
      whatsapp_gateway_url: settings.whatsapp_gateway_url ?? (env.WHATSAPP_GATEWAY_URL ?? ""),
      whatsapp_gateway_token: settings.whatsapp_gateway_token ?? (env.WHATSAPP_GATEWAY_TOKEN ?? ""),
      whatsapp_instance_id: settings.whatsapp_instance_id ?? (env.WHATSAPP_INSTANCE_ID ?? ""),
      whatsapp_token: settings.whatsapp_token ?? (env.WHATSAPP_TOKEN ?? ""),
      fast2sms_api_key: settings.fast2sms_api_key ?? (env.FAST2SMS_API_KEY ?? ""),
      db_keep_alive_enabled: settings.db_keep_alive_enabled ?? "false",
      sms_auto_reminder_paused: settings.sms_auto_reminder_paused ?? "false",
      whatsapp_auto_reminder_paused: settings.whatsapp_auto_reminder_paused ?? "false",
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
    const sent = await runSmsReminder(env);
    return {
      message: "SMS reminder sweep completed",
      sent,
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
  const allowed = allowedTrainerEmails(env);
  return users
    .filter((user) => {
      const role = explicitRoleFromUser(user);
      return role === "developer" || role === "trainer" || allowed.has(normalizeEmail(user.email));
    })
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
  const update = {
    app_metadata: { role: input.role },
    user_metadata: { name: input.name },
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
  await supabaseAuthAdminJson(env, `/users/${encodeURIComponent(accountId)}`, {
    method: "DELETE",
  });
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

function allowedTrainerEmails(env) {
  const configured = String(env.TRAINER_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
  return new Set(configured.length > 0 ? configured : DEFAULT_TRAINER_EMAILS);
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function applyRateLimit(request, scope, windowMs, maxRequests) {
  const now = Date.now();
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${scope}:${ip}`;
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
    const clean = search.replace(/[(),]/g, " ").trim();
    restParams.set("or", `(name.ilike.*${clean}*,phone.ilike.*${clean}*,reg_no.ilike.*${clean}*)`);
  }
  if (status && status !== "All" && STATUS_VALUES.has(status)) restParams.set("status", `eq.${status}`);
  if (goal && goal !== "All Goals" && GOALS.has(goal)) restParams.set("goal", `eq.${goal}`);
  if (payment && payment !== "All Payments" && PAYMENT_STATUSES.has(payment)) restParams.set("payment_status", `eq.${payment}`);
  if (dueSoon) {
    restParams.set("status", "eq.Active");
    restParams.set("membership_due", `gte.${isoDateInTimeZone()}`);
    restParams.append("membership_due", `lte.${isoDateInTimeZone(addDays(new Date(), 3))}`);
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

async function createMember(env, user, input) {
  const rows = await supabaseJson(env, "/members?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...memberInputToDb(input), owner_user_id: user.id }),
  });
  return mapMember(rows[0]);
}

async function updateMember(env, user, memberId, input) {
  const rows = await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberId)}&owner_user_id=${ownerFilter(user)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(memberInputToDb(input)),
  });
  if (!rows[0]) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");
  return mapMember(rows[0]);
}

async function updatePayment(env, user, memberId, paymentStatus) {
  const rows = await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberId)}&owner_user_id=${ownerFilter(user)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ payment_status: paymentStatus }),
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
  return rows.map(mapPaymentReceipt);
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

async function createPaymentReceipt(env, user, memberId, input) {
  const member = await getMember(env, user, memberId);
  const existingReceiptTotal = await paymentReceiptTotal(env, user, memberId, member.membershipStart);
  const legacyCollectedAmount = Math.max(0, Math.min(member.partialPaidAmount - existingReceiptTotal, member.feesAmount));
  const collectedBeforeReceipt = legacyCollectedAmount + existingReceiptTotal;
  const currentBalance = Math.max(member.feesAmount - collectedBeforeReceipt, 0);

  if (member.feesAmount <= 0) {
    throw new ApiError(400, "PAYMENT_NOT_REQUIRED", "This member has no fees to collect");
  }
  if (currentBalance <= 0) {
    throw new ApiError(400, "PAYMENT_ALREADY_SETTLED", "This member has no pending balance");
  }
  if (input.amount > currentBalance) {
    throw new ApiError(400, "PAYMENT_EXCEEDS_BALANCE", `Payment cannot exceed the pending balance of ₹${currentBalance}`);
  }

  const receiptNo = input.receiptNo || generateReceiptNo();
  const rows = await supabaseJson(env, "/payment_receipts?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(paymentReceiptInputToDb(memberId, user.id, input, receiptNo)),
  });
  const receipt = rows[0];
  if (!receipt) throw new ApiError(500, "PAYMENT_RECEIPT_CREATE_FAILED", "Unable to create payment receipt");

  const collectedAmount = collectedBeforeReceipt + input.amount;
  const safeCollected = Math.min(Math.max(collectedAmount, 0), member.feesAmount);
  const balanceAmount = Math.max(member.feesAmount - safeCollected, 0);
  const paymentStatus = paymentStatusFromAmounts(member.feesAmount, safeCollected);
  const memberRows = await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberId)}&owner_user_id=${ownerFilter(user)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      partial_paid_amount: safeCollected,
      balance_amount: balanceAmount,
      payment_status: paymentStatus,
    }),
  });
  if (!memberRows[0]) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");

  const result = {
    receipt: mapPaymentReceipt(receipt),
    member: mapMember(memberRows[0]),
  };

  // Automatically send receipt via WhatsApp
  await sendReceiptWhatsApp(env, result.member, result.receipt);

  return result;
}

async function renewMember(env, user, memberId, membershipStart, membershipDue, feesAmount, planType) {
  const member = await getMember(env, user, memberId);
  const newPlan = planType ?? member.planType;
  
  await supabaseJson(env, "/renewal_history?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      member_id: memberId,
      owner_user_id: user.id,
      old_plan_type: member.planType,
      new_plan_type: newPlan,
      old_start_date: member.membershipStart,
      old_due_date: member.membershipDue,
      new_start_date: membershipStart,
      new_due_date: membershipDue,
      amount: feesAmount,
      payment_status: "Paid",
      renewed_on: isoDateInTimeZone(),
    }),
  });

  // Automatically create a payment receipt for the renewal
  const receiptNo = generateReceiptNo(new Date(membershipStart));
  const receiptRows = await supabaseJson(env, "/payment_receipts?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      member_id: memberId,
      owner_user_id: user.id,
      receipt_no: receiptNo,
      paid_on: membershipStart,
      amount: feesAmount,
      method: "Cash",
      note: `Membership Renewal: ${newPlan} plan (${membershipStart} to ${membershipDue})`,
    }),
  });

  const rows = await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberId)}&owner_user_id=${ownerFilter(user)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      membership_start: membershipStart,
      membership_due: membershipDue,
      fees_amount: feesAmount,
      plan_type: newPlan,
      payment_status: "Paid",
      partial_paid_amount: feesAmount,
      balance_amount: 0,
      status: "Active",
      sms_sent_3days: false,
    }),
  });
  if (!rows[0]) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");

  const updatedMember = mapMember(rows[0]);
  const receipt = receiptRows && receiptRows[0] ? mapPaymentReceipt(receiptRows[0]) : {
    receiptNo,
    paidOn: membershipStart,
    amount: feesAmount,
    method: "Cash",
    note: `Membership Renewal: ${newPlan} plan (${membershipStart} to ${membershipDue})`,
  };

  // Automatically send receipt via WhatsApp
  await sendReceiptWhatsApp(env, updatedMember, receipt);

  return updatedMember;
}

async function suspendMember(env, user, memberId) {
  const member = await getMember(env, user, memberId);
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
  await getMember(env, user, memberId);
  const rows = await supabaseJson(env, "/attendance?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      member_id: memberId,
      visit_date: visitDate,
      weight_kg: weightKg ?? null,
    }),
  });
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
  const rows = await supabaseJson(env, `/members?status=eq.Active&membership_due=lt.${today}&select=id`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "Expired" }),
  });
  return rows.length;
}

function isMemberPlanLessThanOneMonth(member) {
  if (member.planType !== "Custom") return false;
  if (!member.membershipStart || !member.membershipDue) return false;
  const start = new Date(member.membershipStart);
  const due = new Date(member.membershipDue);
  const diffTime = due.getTime() - start.getTime();
  const diffDays = Math.round(diffTime / ONE_DAY_MS);
  return diffDays < 30;
}

async function runSmsReminder(env) {
  const settings = await getSystemSettings(env);
  const fast2SmsKey = settings.fast2sms_api_key || env.FAST2SMS_API_KEY;
  const waInstanceId = settings.whatsapp_instance_id || env.WHATSAPP_INSTANCE_ID;
  const waToken = settings.whatsapp_token || env.WHATSAPP_TOKEN;
  const waGatewayUrl = settings.whatsapp_gateway_url || env.WHATSAPP_GATEWAY_URL;
  const waGatewayToken = settings.whatsapp_gateway_token || env.WHATSAPP_GATEWAY_TOKEN;

  const smsEnabled = settings.sms_enabled !== "false";
  const whatsappEnabled = settings.whatsapp_enabled !== "false";

  const smsAutoPaused = settings.sms_auto_reminder_paused === "true";
  const whatsappAutoPaused = settings.whatsapp_auto_reminder_paused === "true";

  const hasSms = Boolean(fast2SmsKey) && smsEnabled && !smsAutoPaused;
  const hasWhatsApp = Boolean(
    (waInstanceId && waToken) ||
    (waInstanceId === "self_hosted" && waGatewayUrl)
  ) && whatsappEnabled && !whatsappAutoPaused;

  let sent = 0;

  // 1. Process 3-Day Alerts (SMS + WhatsApp)
  const threeDayMembers = await membersDueInThreeDays(env);
  if (threeDayMembers.length > 0 && (hasSms || hasWhatsApp)) {
    for (const member of threeDayMembers) {
      if (isMemberPlanLessThanOneMonth(member)) {
        continue;
      }
      try {
        let sentSMS = false;
        let sentWA = false;
        const messageText = createReminderText(member);

        if (hasSms) {
          try {
            await sendSms(env, member.phone, messageText);
            sentSMS = true;
          } catch (error) {
            logError("sms_3day_reminder_failed", error, { memberId: member.id });
          }
        }

        if (hasWhatsApp) {
          try {
            await sendWhatsApp(env, member.phone, messageText);
            sentWA = true;
          } catch (error) {
            logError("whatsapp_3day_reminder_failed", error, { memberId: member.id });
          }
        }

        if (sentSMS || sentWA) {
          await markReminderSent(env, member.id);
          sent += 1;
        }
      } catch (error) {
        logError("reminder_3day_general_failed", error, { memberId: member.id });
      }
    }
  }

  // 2. Process Due Day Alerts (WhatsApp ONLY)
  if (hasWhatsApp) {
    const todayMembers = await membersDueToday(env);
    for (const member of todayMembers) {
      if (isMemberPlanLessThanOneMonth(member)) {
        continue;
      }
      try {
        const messageText = createDueDayReminderText(member);
        await sendWhatsApp(env, member.phone, messageText);
        sent += 1;
      } catch (error) {
        logError("whatsapp_dueday_reminder_failed", error, { memberId: member.id });
      }
    }
  }

  if (!hasSms && !hasWhatsApp) {
    logWarn("notifications_not_configured", { threeDayMembers: threeDayMembers.length });
  }

  return sent;
}

async function membersDueInThreeDays(env) {
  const targetDate = isoDateInTimeZone(addDays(new Date(), 3));
  const params = new URLSearchParams({
    select: "*",
    membership_due: `eq.${targetDate}`,
    sms_sent_3days: "eq.false",
    status: "eq.Active",
  });
  const rows = await supabaseJson(env, `/members?${params.toString()}`);
  return rows.map(mapMember);
}

async function membersDueToday(env) {
  const today = isoDateInTimeZone();
  const params = new URLSearchParams({
    select: "*",
    membership_due: `eq.${today}`,
    status: "eq.Active",
  });
  const rows = await supabaseJson(env, `/members?${params.toString()}`);
  return rows.map(mapMember);
}

function createDueDayReminderText(member) {
  return `Hi ${member.name}, your Fitness World membership expires today (${member.membershipDue}). Please renew to continue. - Fitness World`;
}

async function markReminderSent(env, memberId) {
  await supabaseJson(env, `/members?id=eq.${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    body: JSON.stringify({ sms_sent_3days: true }),
  });
}

async function keepSupabaseAlive(env) {
  await supabaseJson(env, "/members?select=id&limit=1");
}

async function sendSms(env, phone, message) {
  const settings = await getSystemSettings(env);
  if (settings.sms_enabled === "false") {
    logInfo("sms_disabled_skipping", { phone });
    return "skipped_disabled";
  }
  const fast2SmsKey = settings.fast2sms_api_key || env.FAST2SMS_API_KEY;
  if (!fast2SmsKey) {
    throw new ApiError(503, "SMS_NOT_CONFIGURED", "Fast2SMS API key is not configured");
  }

  // Clean phone number: remove all non-digits and keep the last 10 digits
  const cleanPhone = phone.replace(/\D/g, "");
  const targetPhone = cleanPhone.slice(-10);

  if (targetPhone.length !== 10) {
    throw new ApiError(400, "INVALID_PHONE", `Phone number must be a valid 10-digit number (got: ${phone})`);
  }

  const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
    method: "POST",
    headers: {
      authorization: env.FAST2SMS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      route: "q",
      message,
      language: "english",
      numbers: targetPhone,
      flash: 0,
    }),
  });

  const payload = await safeJson(response);
  if (!response.ok || payload?.return !== true) {
    const errorMsg = typeof payload?.message === "string"
      ? payload.message
      : Array.isArray(payload?.message)
        ? payload.message.join(", ")
        : `Fast2SMS request failed (Status: ${response.status})`;
    throw new ApiError(502, "FAST2SMS_FAILED", errorMsg);
  }

  return payload.request_id ?? "sent";
}

async function sendWhatsApp(env, phone, message) {
  const settings = await getSystemSettings(env);
  if (settings.whatsapp_enabled === "false") {
    logInfo("whatsapp_disabled_skipping", { phone });
    return "skipped_disabled";
  }
  
  const provider = settings.whatsapp_provider || (env.WHATSAPP_INSTANCE_ID === "self_hosted" ? "self_hosted" : env.WHATSAPP_INSTANCE_ID ? "ultramsg" : "none");
  if (provider === "none") {
    throw new ApiError(503, "WHATSAPP_NOT_CONFIGURED", "WhatsApp alerts are disabled or not configured");
  }
  
  const formattedPhone = phone.startsWith("91") && phone.length === 12 ? phone : `91${phone}`;

  if (provider === "self_hosted") {
    const waGatewayUrl = settings.whatsapp_gateway_url || env.WHATSAPP_GATEWAY_URL;
    const waGatewayToken = settings.whatsapp_gateway_token || env.WHATSAPP_GATEWAY_TOKEN;
    
    if (!waGatewayUrl || !waGatewayToken) {
      throw new ApiError(503, "WHATSAPP_NOT_CONFIGURED", "Self-hosted WhatsApp URL or Token is not configured");
    }

    const response = await fetch(`${waGatewayUrl.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${waGatewayToken}`
      },
      body: JSON.stringify({
        to: formattedPhone,
        message: message
      })
    });

    const payload = await safeJson(response);
    if (!response.ok || payload?.success !== true) {
      const errorMsg = payload?.error ?? "Self-hosted WhatsApp request failed";
      throw new ApiError(502, "WHATSAPP_SEND_FAILED", errorMsg);
    }

    return payload.messageId ?? "sent";
  }

  // Fallback to UltraMsg
  const waInstanceId = settings.whatsapp_instance_id || env.WHATSAPP_INSTANCE_ID;
  const waToken = settings.whatsapp_token || env.WHATSAPP_TOKEN;
  if (!waInstanceId || !waToken) {
    throw new ApiError(503, "WHATSAPP_NOT_CONFIGURED", "WhatsApp instance ID or token is not configured");
  }

  const params = new URLSearchParams({
    token: waToken,
    to: formattedPhone,
    body: message,
    priority: "10"
  });

  const response = await fetch(`https://api.ultramsg.com/${waInstanceId}/messages/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const payload = await safeJson(response);
  if (!response.ok || (payload?.sent !== "true" && payload?.sent !== true)) {
    const errorMsg = payload?.error?.message ?? payload?.error ?? "WhatsApp request failed";
    throw new ApiError(502, "WHATSAPP_SEND_FAILED", errorMsg);
  }

  return payload.id ?? "sent";
}

function createReminderText(member) {
  return `Hi ${member.name}, your Fitness World membership expires in 3 days on ${member.membershipDue}. Please renew to continue. - Fitness World`;
}

async function sendReceiptWhatsApp(env, member, receipt) {
  try {
    const amount = receipt.amount;
    const receiptNo = receipt.receiptNo;
    const dateObj = new Date(receipt.paidOn);
    const dateFormatted = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        })
      : receipt.paidOn;

    const method = receipt.method;
    const note = receipt.note || "";
    const balance = member.balanceAmount ?? 0;
    
    const dueObj = member.membershipDue ? new Date(member.membershipDue) : null;
    const dueFormatted = dueObj && !isNaN(dueObj.getTime())
      ? dueObj.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        })
      : member.membershipDue || "N/A";

    const message = `💪 *FITNESS WORLD* 🧾
Unisex Gym & Fitness Center

Dear *${member.name}*,
Thank you for your payment! Here is your payment receipt:

🧾 *Receipt No:* ${receiptNo}
📅 *Date:* ${dateFormatted}
💰 *Amount Paid:* ₹${amount}
💳 *Method:* ${method}
📅 *Membership Due:* ${dueFormatted}
💵 *Pending Balance:* ₹${balance}
${note ? `📝 *Note:* ${note}\n` : ""}
Thank you for training with us! Keep up the hard work! 💪🔥`;

    await sendWhatsApp(env, member.phone, message);
    logInfo("receipt_whatsapp_sent", { memberId: member.id, receiptNo });
  } catch (error) {
    logError("receipt_whatsapp_send_failed", error, { memberId: member?.id, receiptNo: receipt?.receiptNo });
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
  return JSON.parse(text);
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

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${supabaseUrl(env)}/rest/v1${path}`, {
        ...init,
        headers,
      });

      // Retry on 5xx server errors (Supabase waking up) but not on 4xx client errors
      if (!response.ok && response.status >= 500 && attempt < retries) {
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
      if (attempt < retries) {
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
    avatar: typeof body.avatar === "string" ? body.avatar : undefined,
    trainingType: assertEnum(body.trainingType ?? body.training_type ?? "General", TRAINING_TYPES, "training type"),
    address: typeof body.address === "string" ? body.address.trim() : "",
    partialPaidAmount: body.partialPaidAmount !== undefined || body.partial_paid_amount !== undefined
      ? requiredNumber(body.partialPaidAmount ?? body.partial_paid_amount, "partial paid amount", 0)
      : 0,
    balanceAmount: body.balanceAmount !== undefined || body.balance_amount !== undefined
      ? requiredNumber(body.balanceAmount ?? body.balance_amount, "balance amount", 0)
      : 0,
  };

  if (!/^\d{10}$/.test(input.phone)) {
    throw new ApiError(400, "INVALID_PHONE", "Phone number must be 10 digits");
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

function validateRenewInput(body) {
  const input = {
    membershipStart: requiredDate(body.membershipStart ?? body.membership_start, "membership start"),
    membershipDue: requiredDate(body.membershipDue ?? body.membership_due, "membership due"),
    feesAmount: requiredNumber(body.feesAmount ?? body.fees_amount, "fees amount", 0),
    planType: body.planType ?? body.plan_type ? assertEnum(body.planType ?? body.plan_type, PLAN_TYPES, "plan type") : undefined,
  };
  assertDueDateOrder(input.membershipStart, input.membershipDue);
  return input;
}

function validatePaymentReceiptInput(body) {
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
  };
}

function assertDueDateOrder(startDate, dueDate) {
  if (dueDate < startDate) {
    throw new ApiError(400, "INVALID_MEMBERSHIP_DATES", "Due date must be on or after the start date");
  }
}

function calculatePlanDueDate(startDate, planType) {
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
  if (message.length < 12 || message.length > 320) {
    throw new ApiError(400, "INVALID_SMS_MESSAGE", "SMS message must be 12 to 320 characters");
  }
  return {
    memberId: assertUuid(body.memberId ?? body.member_id, "member id"),
    message,
  };
}

function validateSmsMemberInput(body) {
  return {
    memberId: assertUuid(body.memberId ?? body.member_id, "member id"),
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

function memberInputToDb(input) {
  return {
    name: input.name,
    phone: input.phone,
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
    avatar: input.avatar ?? null,
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
  };
}

function mapRenewalHistory(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    oldPlanType: row.old_plan_type,
    newPlanType: row.new_plan_type,
    oldStartDate: row.old_start_date,
    oldDueDate: row.old_due_date,
    newStartDate: row.new_start_date,
    newDueDate: row.new_due_date,
    amount: Number(row.amount || 0),
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
  const safe = columns[column] ?? column;
  return /^[a-z_]+$/.test(safe) ? safe : "created_at";
}

function addDays(date, days) {
  return new Date(date.getTime() + days * ONE_DAY_MS);
}

function isoDateInTimeZone(date = new Date()) {
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
  const apiError = error instanceof ApiError ? error : new ApiError(500, "INTERNAL_ERROR", "Internal server error");
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
    const rows = await supabaseJson(env, "/system_settings?select=*");
    const settings = {};
    if (rows && Array.isArray(rows)) {
      for (const row of rows) {
        settings[row.key] = row.value;
      }
      return settings;
    }
  } catch (error) {
    logWarn("get_system_settings_failed_trying_fallback", { message: error instanceof Error ? error.message : "Unknown error" });
  }

  // Fallback to whatsapp_sessions table
  try {
    const rows = await supabaseJson(env, "/whatsapp_sessions?key=eq.system_config_settings&select=value");
    if (rows && rows[0] && rows[0].value) {
      return typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
    }
  } catch (err) {
    logError("get_system_settings_fallback_failed", err);
  }
  return {};
}

async function saveSystemSettings(env, settings) {
  const keys = [
    "sms_enabled",
    "whatsapp_enabled",
    "whatsapp_provider",
    "whatsapp_gateway_url",
    "whatsapp_gateway_token",
    "whatsapp_instance_id",
    "whatsapp_token",
    "fast2sms_api_key",
    "db_keep_alive_enabled",
    "sms_auto_reminder_paused",
    "whatsapp_auto_reminder_paused",
  ];

  let useFallback = false;
  try {
    // Probe if system_settings is accessible
    await supabaseJson(env, "/system_settings?select=key&limit=1");
  } catch (e) {
    useFallback = true;
  }

  if (!useFallback) {
    for (const key of keys) {
      if (settings[key] !== undefined) {
        await supabaseJson(env, `/system_settings?key=eq.${encodeURIComponent(key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value: String(settings[key]) })
        });
      }
    }
    return;
  }

  // Fallback: save to whatsapp_sessions table under 'system_config_settings'
  const currentSettings = await getSystemSettings(env);
  const updatedSettings = { ...currentSettings };
  for (const key of keys) {
    if (settings[key] !== undefined) {
      updatedSettings[key] = String(settings[key]);
    }
  }

  await supabaseJson(env, "/whatsapp_sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates"
    },
    body: JSON.stringify({
      key: "system_config_settings",
      value: updatedSettings
    })
  });
}
