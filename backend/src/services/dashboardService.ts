import { addDays, format } from "date-fns";
import { HttpError } from "../lib/httpError.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

export interface DashboardStats {
  total_members: number;
  active: number;
  expired: number;
  due_this_week: number;
  pending_payments: number;
  new_this_month: number;
}

async function countMembers(filters: Record<string, string>): Promise<number> {
  let query = getSupabaseAdmin().from("members").select("id", { count: "exact", head: true });
  Object.entries(filters).forEach(([key, value]) => {
    query = query.eq(key, value);
  });
  const { count, error } = await query;
  if (error) {
    throw new HttpError(500, "DASHBOARD_COUNT_FAILED", error.message);
  }
  return count ?? 0;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const today = format(new Date(), "yyyy-MM-dd");
  const weekEnd = format(addDays(new Date(), 7), "yyyy-MM-dd");
  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");

  const [total, active, expired, pending, partiallyPaid] = await Promise.all([
    countMembers({}),
    countMembers({ status: "Active" }),
    countMembers({ status: "Expired" }),
    countMembers({ payment_status: "Pending" }),
    countMembers({ payment_status: "Partially Paid" }),
  ]);

  const { count: dueCount, error: dueError } = await getSupabaseAdmin()
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("status", "Active")
    .gte("membership_due", today)
    .lte("membership_due", weekEnd);

  if (dueError) {
    throw new HttpError(500, "DASHBOARD_DUE_FAILED", dueError.message);
  }

  const { count: newCount, error: newError } = await getSupabaseAdmin().from("members").select("id", { count: "exact", head: true }).gte("created_at", monthStart);
  if (newError) {
    throw new HttpError(500, "DASHBOARD_NEW_FAILED", newError.message);
  }

  return {
    total_members: total,
    active,
    expired,
    due_this_week: dueCount ?? 0,
    pending_payments: pending + partiallyPaid,
    new_this_month: newCount ?? 0,
  };
}
