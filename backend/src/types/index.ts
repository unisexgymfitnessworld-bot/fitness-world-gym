import type { User } from "@supabase/supabase-js";
import type { Request } from "express";

export interface AuthenticatedRequest extends Request {
  authUser?: User;
}

export type Gender = "Male" | "Female" | "Other";
export type Goal = "Weight Loss" | "Weight Gain" | "Muscle Gain" | "General Fitness" | "Other";
export type PlanType = "1 Month" | "3 Months" | "6 Months" | "1 Year" | "Custom";
export type PaymentStatus = "Paid" | "Pending" | "Partially Paid";
export type PaymentMethod = "Cash" | "UPI" | "Card" | "Bank Transfer" | "Other";
export type MemberStatus = "Active" | "Expired" | "Suspended";
export type TrainingType = "Personal" | "General" | "Couple";

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
  training_type: TrainingType;
  address: string;
  partial_paid_amount: number;
  balance_amount: number;
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
  trainingType: TrainingType;
  address: string;
  partialPaidAmount: number;
  balanceAmount: number;
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
  trainingType: TrainingType;
  address: string;
  partialPaidAmount: number;
  balanceAmount: number;
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

export interface DbPaymentReceipt {
  id: string;
  member_id: string;
  owner_user_id: string | null;
  receipt_no: string;
  paid_on: string;
  amount: number | string;
  method: PaymentMethod;
  note: string;
  created_at: string;
}

export interface PaymentReceipt {
  id: string;
  memberId: string;
  receiptNo: string;
  paidOn: string;
  amount: number;
  method: PaymentMethod;
  note: string;
  createdAt: string;
}

export interface PaymentReceiptInput {
  paidOn: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
  receiptNo?: string;
}

export interface DbRenewalHistoryEntry {
  id: string;
  member_id: string;
  owner_user_id: string | null;
  old_plan_type: PlanType;
  new_plan_type: PlanType;
  old_start_date: string;
  old_due_date: string;
  new_start_date: string;
  new_due_date: string;
  amount: number | string;
  payment_status: PaymentStatus;
  renewed_on: string;
  created_at: string;
}

export interface RenewalHistoryEntry {
  id: string;
  memberId: string;
  oldPlanType: PlanType;
  newPlanType: PlanType;
  oldStartDate: string;
  oldDueDate: string;
  newStartDate: string;
  newDueDate: string;
  amount: number;
  paymentStatus: PaymentStatus;
  renewedOn: string;
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
