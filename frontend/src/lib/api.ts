import type { ApiEnvelope, AttendanceEntry, DashboardStats, DeveloperDiagnostics, LogEntry, Member, MemberInput, PaymentReceipt, PaymentReceiptInput, RenewalHistoryEntry, Trainer, TrainerAccount, SystemConfigSettings } from "../types";
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

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
  });
  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.error?.message ?? "Request failed");
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
  getWhatsAppGatewayStatus: () =>
    request<{ success: boolean; status: string; qrReady: boolean; qrRetries: number; gatewayUrl?: string }>("/whatsapp-gateway/status"),
  resetWhatsAppGateway: () =>
    request<{ success: boolean; message: string }>("/whatsapp-gateway/reset", {
      method: "POST",
    }),
  developerDiagnostics: () => request<DeveloperDiagnostics>("/developer/diagnostics"),
  developerLogs: () => request<LogEntry[]>("/developer/logs"),
  pingDb: () => request<{ latency: number; supabase: string; checkedAt: string }>("/developer/ping-db"),
  saveSystemSettings: (input: Partial<SystemConfigSettings>) =>
    request<{ message: string }>("/developer/settings", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  testNotification: (type: "sms" | "whatsapp", phone: string, message: string) =>
    request<{ requestId: string }>("/developer/test-notification", {
      method: "POST",
      body: JSON.stringify({ type, phone, message }),
    }),
  runDeveloperFix: (action: "expire-members" | "send-sms-reminder") =>
    request<{ message: string; changed?: number; sent?: number }>("/developer/fix", {
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
  updateMember: (id: string, input: MemberInput) =>
    request<Member>(`/members/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  renewMember: (id: string, membershipStart: string, membershipDue: string, feesAmount: number, planType?: string, paymentStatus?: string, partialPaidAmount?: number) =>
    request<Member>(`/members/${id}/renew`, {
      method: "PATCH",
      body: JSON.stringify({ membershipStart, membershipDue, feesAmount, planType, paymentStatus, partialPaidAmount }),
    }),
  paymentReceipts: (memberId: string) => request<PaymentReceipt[]>(`/members/${memberId}/payments`),
  allPaymentReceipts: () => request<PaymentReceipt[]>("/members/payments/all"),
  renewalHistory: (memberId: string) => request<RenewalHistoryEntry[]>(`/members/${memberId}/renewals`),
  allRenewalHistory: () => request<RenewalHistoryEntry[]>("/members/renewals/all"),
  createPaymentReceipt: (memberId: string, input: PaymentReceiptInput) =>
    request<{ receipt: PaymentReceipt; member: Member }>(`/members/${memberId}/payments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  suspendMember: (id: string) =>
    request<Member>(`/members/${id}/suspend`, {
      method: "PATCH",
    }),
  deleteMember: (id: string) =>
    request<Member>(`/members/${id}`, {
      method: "DELETE",
    }),
  dashboardStats: () => request<DashboardStats>("/dashboard/stats"),
  attendance: (memberId: string) => request<AttendanceEntry[]>(`/attendance/${memberId}`),
  allAttendance: () => request<AttendanceEntry[]>("/attendance"),
  createAttendance: (memberId: string, visitDate: string, weightKg?: number) =>
    request<AttendanceEntry>("/attendance", {
      method: "POST",
      body: JSON.stringify({ memberId, visitDate, weightKg }),
    }),
  sendSms: (memberId: string, message: string) =>
    request<{ requestId: string }>("/sms/send", {
      method: "POST",
      body: JSON.stringify({ member_id: memberId, message, type: "sms" }),
    }),
  sendWhatsApp: (memberId: string, message: string) =>
    request<{ requestId: string }>("/sms/send", {
      method: "POST",
      body: JSON.stringify({ member_id: memberId, message, type: "whatsapp" }),
    }),
};
