import { HttpError } from "../lib/httpError.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import type { AttendanceEntry, DbAttendanceEntry } from "../types/index.js";
import { mapAttendance } from "./mappers.js";

export async function listAttendance(memberId: string, month?: string): Promise<AttendanceEntry[]> {
  let query = getSupabaseAdmin().from("attendance").select("*").eq("member_id", memberId).order("visit_date", { ascending: false });
  if (month) {
    query = query.gte("visit_date", `${month}-01`).lt("visit_date", `${month}-32`);
  }
  const { data, error } = await query;
  if (error) {
    throw new HttpError(500, "ATTENDANCE_LIST_FAILED", error.message);
  }
  return ((data ?? []) as DbAttendanceEntry[]).map(mapAttendance);
}

export async function createAttendance(memberId: string, visitDate: string, weightKg?: number): Promise<AttendanceEntry> {
  const { data, error } = await getSupabaseAdmin()
    .from("attendance")
    .insert({
      member_id: memberId,
      visit_date: visitDate,
      weight_kg: weightKg ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new HttpError(500, "ATTENDANCE_CREATE_FAILED", error?.message ?? "Unable to create attendance");
  }
  return mapAttendance(data as DbAttendanceEntry);
}

export async function deleteAttendance(attendanceId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("attendance").delete().eq("id", attendanceId);
  if (error) {
    throw new HttpError(500, "ATTENDANCE_DELETE_FAILED", error.message);
  }
}
