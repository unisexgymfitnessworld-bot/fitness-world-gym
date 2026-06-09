export const genderOptions = ["Male", "Female", "Other"] as const;
export const goalOptions = ["Weight Loss", "Weight Gain", "Muscle Gain", "General Fitness", "Other"] as const;
export const planOptions = ["1 Month", "3 Months", "6 Months", "1 Year", "Custom"] as const;
export const paymentOptions = ["Paid", "Pending", "Partially Paid"] as const;
export const statusOptions = ["Active", "Expired", "Suspended"] as const;
export const trainingTypeOptions = ["Personal", "General", "Couple"] as const;

export type Gender = (typeof genderOptions)[number];
export type Goal = (typeof goalOptions)[number];
export type PlanType = (typeof planOptions)[number];
export type PaymentStatus = (typeof paymentOptions)[number];
export type MemberStatus = (typeof statusOptions)[number];
export type TrainingType = (typeof trainingTypeOptions)[number];

export interface Trainer {
  id: string;
  name: string;
  email: string;
  role: "developer" | "trainer";
  avatar?: string;
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
  ownerUserId?: string;
  avatar?: string;
  trainingType: TrainingType;
  address: string;
  partialPaidAmount: number;
  balanceAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrainerAccount {
  id: string;
  email: string;
  name: string;
  role: "developer" | "trainer";
  createdAt: string;
  confirmed: boolean;
  currentUser: boolean;
}

export interface DeveloperDiagnostics {
  api: "ok";
  supabase: "ok" | "error";
  smsConfigured: boolean;
  whatsAppConfigured?: boolean;
  memberOwnershipReady: boolean;
  orphanMembers: number;
  expiredActiveMembers: number;
  accounts: {
    total: number;
    developers: number;
    trainers: number;
  };
  cron: {
    expiry: string;
    sms: string;
  };
  checkedAt: string;
  totalMembers?: number;
  totalAttendance?: number;
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  event: string;
  message: string;
  details?: Record<string, unknown>;
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

export interface AttendanceEntry {
  id: string;
  memberId: string;
  visitDate: string;
  weightKg?: number;
  createdAt: string;
}

export interface DashboardStats {
  total: number;
  active: number;
  dueThisWeek: number;
  pendingPayments: number;
}

export interface MemberFilters {
  query: string;
  status: "All" | MemberStatus;
  goal: "All Goals" | Goal;
  payment: "All Payments" | PaymentStatus;
  dueSoon: boolean;
  month: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export type ToastTone = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  tone: ToastTone;
}
