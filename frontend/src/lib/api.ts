import type { ApiEnvelope, AttendanceEntry, DashboardStats, Member, MemberInput, Trainer } from "../types";
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
  renewMember: (id: string, membershipStart: string, membershipDue: string, feesAmount: number) =>
    request<Member>(`/members/${id}/renew`, {
      method: "PATCH",
      body: JSON.stringify({ membershipStart, membershipDue, feesAmount }),
    }),
  suspendMember: (id: string) =>
    request<Member>(`/members/${id}`, {
      method: "DELETE",
    }),
  dashboardStats: () => request<DashboardStats>("/dashboard/stats"),
  attendance: (memberId: string) => request<AttendanceEntry[]>(`/attendance/${memberId}`),
  createAttendance: (memberId: string, visitDate: string, weightKg?: number) =>
    request<AttendanceEntry>("/attendance", {
      method: "POST",
      body: JSON.stringify({ memberId, visitDate, weightKg }),
    }),
  sendSms: (memberId: string, message: string) =>
    request<{ requestId: string }>("/sms/send", {
      method: "POST",
      body: JSON.stringify({ member_id: memberId, message }),
    }),
};
