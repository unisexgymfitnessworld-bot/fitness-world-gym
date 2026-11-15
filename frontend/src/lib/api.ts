import type { ApiEnvelope, AttendanceEntry, BillChannel, DashboardStats, DeveloperDiagnostics, LogEntry, Member, MemberInput, NotifyChannel, NotifyChannelChoice, PaymentReceipt, PaymentReceiptInput, RenewalHistoryEntry, ResendResult, SmsHealth, SmsLog, SmsSendResult, SmsSettingsState, SmsStatus, StatementResult, Trainer, TrainerAccount, SystemConfigSettings } from "../types";
import { supabase } from "./supabase";

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
export const isApiConfigured = apiBaseUrl.length > 0 && supabase !== null;

async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) {
    return {};
  }
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    return {};
  }
  return {
    Authorization: `Bearer ${data.session.access_token}`,
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error("API base URL is not configured");
  }

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const auth = await authHeader();
  Object.entries(auth).forEach(([key, value]) => headers.set(key, value));

  // Every call fails fast on a stalled mobile connection instead of hanging
  // the app forever; callers may pass their own tighter signal.
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30000),
    headers,
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Request failed (server returned ${response.status} ${response.statusText || "with a non-JSON response"})`);
  }
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.success || payload.data === undefined) {
    throw new Error(payload?.error?.message ?? `Request failed (${response.status})`);
  }
  return payload.data;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; trainer: Trainer }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ trainer: Trainer }>("/auth/me"),
  developerDiagnostics: () => request<DeveloperDiagnostics>("/developer/diagnostics"),
  developerLogs: () => request<LogEntry[]>("/developer/logs"),
  pingDb: () => request<{ latency: number; supabase: string; checkedAt: string }>("/developer/ping-db"),
  saveSystemSettings: (input: Partial<SystemConfigSettings>) =>
    request<{ message: string }>("/developer/settings", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  testNotification: (phone: string, message: string) =>
    request<SmsSendResult>("/developer/test-notification", {
      method: "POST",
      body: JSON.stringify({ phone, message }),
    }),
  runDeveloperFix: (action: "expire-members" | "send-sms-reminder") =>
    request<{ message: string; changed?: number; sent?: number; failed?: number; queued?: number }>("/developer/fix", {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  trainerAccounts: () => request<TrainerAccount[]>("/developer/accounts"),
  createTrainerAccount: (input: { email: string; name: string; role: "developer" | "trainer"; password: string }) =>
    request<TrainerAccount>("/developer/accounts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTrainerAccount: (id: string, input: { email?: string; name: string; role: "developer" | "trainer"; password?: string }) =>
    request<TrainerAccount>(`/developer/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteTrainerAccount: (id: string) =>
    request<{ message: string }>(`/developer/accounts/${id}`, {
      method: "DELETE",
    }),
  teamAccounts: () => request<TrainerAccount[]>("/team/accounts"),
  createTeamAccount: (input: { email: string; name: string; password: string }) =>
    request<TrainerAccount>("/team/accounts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTeamAccount: (id: string, input: { name?: string; password?: string }) =>
    request<TrainerAccount>(`/team/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteTeamAccount: (id: string) =>
    request<{ message: string }>(`/team/accounts/${id}`, {
      method: "DELETE",
    }),
  members: (options?: {
    search?: string;
    status?: string;
    goal?: string;
    payment?: string;
    dueSoon?: boolean;
    sort?: string;
    page?: number;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (options) {
      if (options.search) params.append("search", options.search);
      if (options.status) params.append("status", options.status);
      if (options.goal) params.append("goal", options.goal);
      if (options.payment) params.append("payment", options.payment);
      if (options.dueSoon !== undefined) params.append("due_soon", String(options.dueSoon));
      if (options.sort) params.append("sort", options.sort);
      if (options.page !== undefined) params.append("page", String(options.page));
      if (options.limit !== undefined) params.append("limit", String(options.limit));
    }
    const query = params.toString();
    return request<Member[]>(`/members${query ? `?${query}` : ""}`);
  },
  createMember: (input: MemberInput) =>
    request<Member>("/members", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createMembers: (inputs: MemberInput[]) =>
    request<Member[]>("/members/batch", {
      method: "POST",
      body: JSON.stringify({ members: inputs }),
    }),
  updateMember: (id: string, input: MemberInput) =>
    request<Member>(`/members/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  renewMember: (id: string, membershipStart: string, membershipDue: string, feesAmount: number, planType?: string, paymentStatus?: string, collectedAmount?: number, method?: string, clientRequestId?: string) =>
    request<{ member: Member; receipt: PaymentReceipt | null; receiptSms?: "sent" | "queued" | "failed"; receiptEmail?: "sent" | "queued" | "failed" | "skipped"; duplicate?: boolean }>(`/members/${id}/renew`, {
      method: "PATCH",
      body: JSON.stringify({ membershipStart, membershipDue, feesAmount, planType, paymentStatus, collectedAmount, method, clientRequestId }),
    }),
  paymentReceipts: (memberId: string) => request<PaymentReceipt[]>(`/members/${memberId}/payments`),
  allPaymentReceipts: () => request<PaymentReceipt[]>("/members/payments/all"),
  renewalHistory: (memberId: string) => request<RenewalHistoryEntry[]>(`/members/${memberId}/renewals`),
  allRenewalHistory: () => request<RenewalHistoryEntry[]>("/members/renewals/all"),
  createPaymentReceipt: (memberId: string, input: PaymentReceiptInput) =>
    request<{ receipt: PaymentReceipt; member: Member; receiptSms?: "sent" | "queued" | "failed"; receiptEmail?: "sent" | "queued" | "failed" | "skipped"; duplicate?: boolean }>(`/members/${memberId}/payments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  suspendMember: (id: string) =>
    request<Member>(`/members/${id}/suspend`, {
      method: "PATCH",
    }),
  restoreMember: (id: string) =>
    request<Member>(`/members/${id}/restore`, {
      method: "PATCH",
    }),
  deleteMember: (id: string) =>
    request<Member>(`/members/${id}`, {
      method: "DELETE",
    }),
  purgeMember: (id: string) =>
    request<Record<string, number | string>>(`/members/${id}/purge`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  wipeAll: () =>
    request<Record<string, number>>("/admin/wipe-all", {
      method: "POST",
      body: JSON.stringify({ confirm: "ERASE ALL" }),
    }),
  dashboardStats: () => request<DashboardStats>("/dashboard/stats"),
  attendance: (memberId: string) => request<AttendanceEntry[]>(`/attendance/${memberId}`),
  allAttendance: () => request<AttendanceEntry[]>("/attendance"),
  createAttendance: (memberId: string, visitDate: string, weightKg?: number) =>
    request<AttendanceEntry>("/attendance", {
      method: "POST",
      body: JSON.stringify({ memberId, visitDate, weightKg }),
    }),
  deleteAttendance: (attendanceId: string) =>
    request<{ message: string }>(`/attendance/entry/${attendanceId}`, {
      method: "DELETE",
    }),
  sendSms: async (memberId: string, message: string, markReminder = false, clientRequestId = crypto.randomUUID(), channel: NotifyChannelChoice = "sms") => {
    // One automatic retry on network failure only (never on server errors):
    // the same idempotency key lets the server dedup, so a retry can never
    // double-send even if the first request actually landed.
    const body = JSON.stringify({ member_id: memberId, message, markReminder, clientRequestId, channel });
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await request<SmsSendResult>("/sms/send", {
          method: "POST",
          body,
          signal: AbortSignal.timeout(30000),
        });
      } catch (error) {
        if (attempt === 2 || !isNetworkError(error)) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
    throw new Error("SMS could not be sent");
  },
  smsStatus: () => request<SmsStatus>("/sms/status"),
  smsHealth: () => request<SmsHealth>("/sms/health"),
  smsLogs: (options?: { status?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (options?.status) params.append("status", options.status);
    if (options?.limit !== undefined) params.append("limit", String(options.limit));
    if (options?.offset !== undefined) params.append("offset", String(options.offset));
    const query = params.toString();
    return request<SmsLog[]>(`/sms/logs${query ? `?${query}` : ""}`);
  },
  retrySmsLog: (logId: string) =>
    request<{ requestId: string | null; status: string; log?: SmsLog }>(`/sms/retry`, {
      method: "POST",
      body: JSON.stringify({ logId }),
    }),
  saveSmsSettings: (input: Partial<SmsSettingsState>) =>
    request<{ message: string }>("/sms/settings", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  testSms: (phone: string, message: string) =>
    request<SmsSendResult>("/sms/test", {
      method: "POST",
      body: JSON.stringify({ phone, message }),
    }),
  notifyTest: (channel: NotifyChannel, to: string, message: string) =>
    request<SmsSendResult & { channel: NotifyChannel }>("/notify/test", {
      method: "POST",
      body: JSON.stringify({ channel, to, message }),
    }),
  resendReceipt: (memberId: string, receiptId: string, channel: BillChannel) =>
    request<ResendResult>(`/members/${memberId}/resend-receipt`, {
      method: "POST",
      body: JSON.stringify({ receiptId, channel }),
    }),
  sendStatement: (memberId: string, channel: BillChannel, dryRun = false) =>
    request<StatementResult>(`/members/${memberId}/statement`, {
      method: "POST",
      body: JSON.stringify({ channel, dryRun }),
    }),
};

function isNetworkError(error: unknown): boolean {
  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return true;
  }
  if (error instanceof TypeError) {
    return true;
  }
  const message = error instanceof Error ? error.message : "";
  return /failed to fetch|networkerror|load failed|network request failed/i.test(message);
}
