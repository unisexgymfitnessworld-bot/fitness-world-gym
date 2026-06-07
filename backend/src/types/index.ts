import type { User } from "@supabase/supabase-js";
import type { Request } from "express";

export interface AuthenticatedRequest extends Request {
  authUser?: User;
}

export type Gender = "Male" | "Female" | "Other";
export type Goal = "Weight Loss" | "Weight Gain" | "Muscle Gain" | "General Fitness" | "Other";
export type PlanType = "1 Month" | "3 Months" | "6 Months" | "1 Year" | "Custom";
export type PaymentStatus = "Paid" | "Pending";
export type MemberStatus = "Active" | "Expired" | "Suspended";

export interface DbMember {
  id: string;
  reg_no: string;
  name: string;
  phone: string;
  age: number;
  gender: Gender;
  join_date: string;
  weight_kg: number;
  height_cm: number;
  bmi: number;
  goal: Goal;
  goal_other: string | null;
  health_problem: string | null;
  special_instruction: string | null;
  warmup_exercises: string | null;
  flexibility_training: string | null;
  cardio_training: string | null;
  plan_type: PlanType;
  membership_start: string;
  membership_due: string;
  fees_amount: number;
  payment_status: PaymentStatus;
  status: MemberStatus;
  sms_sent_3days: boolean;
  avatar: string | null;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  regNo: string;
  name: string;
  phone: string;
  age: number;
  gender: Gender;
  joinDate: string;
  weightKg: number;
  heightCm: number;
  bmi: number;
  goal: Goal;
  goalOther?: string;
  healthProblem?: string;
  specialInstruction?: string;
  warmupExercises?: string;
  flexibilityTraining?: string;
  cardioTraining?: string;
  planType: PlanType;
  membershipStart: string;
  membershipDue: string;
  feesAmount: number;
  paymentStatus: PaymentStatus;
  status: MemberStatus;
  smsSent3days: boolean;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemberInput {
  name: string;
  phone: string;
  age: number;
  gender: Gender;
  joinDate: string;
  weightKg: number;
  heightCm: number;
  goal: Goal;
  goalOther?: string;
  healthProblem?: string;
  specialInstruction?: string;
  warmupExercises?: string;
  flexibilityTraining?: string;
  cardioTraining?: string;
  planType: PlanType;
  membershipStart: string;
  membershipDue: string;
  feesAmount: number;
  paymentStatus: PaymentStatus;
  avatar?: string;
}

export interface DbAttendanceEntry {
  id: string;
  member_id: string;
  visit_date: string;
  weight_kg: number | null;
  created_at: string;
}

export interface AttendanceEntry {
  id: string;
  memberId: string;
  visitDate: string;
  weightKg?: number;
  createdAt: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
