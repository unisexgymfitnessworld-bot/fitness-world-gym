export const genderOptions = ["Male", "Female", "Other"] as const;
export const goalOptions = ["Weight Loss", "Weight Gain", "Muscle Gain", "General Fitness", "Other"] as const;
export const planOptions = ["1 Month", "3 Months", "6 Months", "1 Year", "Custom"] as const;
export const paymentOptions = ["Paid", "Pending", "Partially Paid"] as const;
export const paymentMethodOptions = ["Cash", "UPI", "Card", "Bank Transfer", "Other"] as const;
export const statusOptions = ["Active", "Expired", "Suspended", "Deleted"] as const;
export const trainingTypeOptions = ["Personal", "General", "Couple"] as const;

export type Gender = (typeof genderOptions)[number];
export type Goal = (typeof goalOptions)[number];
export type PlanType = (typeof planOptions)[number];
export type PaymentStatus = (typeof paymentOptions)[number];
export type PaymentMethod = (typeof paymentMethodOptions)[number];
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
  email?: string;
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
  /** Unpaid amounts from closed periods. Never merged into feesAmount. */
  arrearsAmount: number;
  /** Credit paid ahead; offsets future cycles at renew. */
  advanceAmount: number;
  /** Lifetime cash collected (receipts + legacy). Reconciliation anchor. */
  totalCollected: number;
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

export interface SystemConfigSettings {
  sms_enabled: string;
  smsgate_username: string;
  smsgate_password: string;
  smsgate_device_id: string;
  smsgate_sim_number: string;
  db_keep_alive_enabled: string;
  sms_auto_reminder_paused: string;
}

export interface DeveloperDiagnostics {
  api: "ok";
  supabase: "ok" | "error";
  smsConfigured: boolean;
  smsgateConfigured: boolean;
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
    retrySweep?: string;
  };
  checkedAt: string;
  totalMembers?: number;
  totalAttendance?: number;
  settings?: SystemConfigSettings;
  sms?: SmsReliabilityStats;
}

export type SmsLogStatus = "queued" | "sent" | "delivered" | "failed";
export type SmsLogKind = "manual" | "reminder_3day" | "reminder_dueday" | "winback" | "receipt" | "test" | "balance_overdue";
export type SmsLogProvider = "smsgate" | "openwa" | "appscript";

export interface SmsLog {
  id: string;
  memberId: string | null;
  memberName: string | null;
  phone: string;
  message: string;
  kind: SmsLogKind;
  status: SmsLogStatus;
  provider: SmsLogProvider;
  providerMessageId: string | null;
  smsgateState: string | null;
  attempts: number;
  lastError: string | null;
  lastErrorCode: string | null;
  nextRetryAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SmsSendResult {
  requestId: string | null;
  status: "sent" | "queued";
  duplicate?: boolean;
  channel?: NotifyChannel | null;
}

export interface SmsHealth {
  configured: boolean;
  smsEnabled: boolean;
  autoPaused: boolean;
  cloud: { reachable: boolean; latencyMs: number | null; error: string };
  auth: { ok: boolean; error: string };
  phone: {
    devices: number;
    matched: boolean;
    name: string;
    deviceId: string;
    lastSeenAt: string | null;
    lastSeenAgeMs: number | null;
    freshness: "online" | "recent" | "stale" | "unknown";
    simCards: { simNumber: number | null; carrierName: string; phoneNumber: string }[];
    error: string;
  };
  whatsapp: { enabled: boolean; configured: boolean; reachable: boolean; sessionStatus: string; error: string };
  email: { enabled: boolean; configured: boolean; reachable: boolean; error: string };
  outbox: { logsReady: boolean; queued: number; failedLast24h: number; sentToday: number; deliveredToday: number };
  lastRun: { at: string | null; sent: number; failed: number; queued: number; skipped: number; error: string };
  checkedAt: string;
  latencyMs: number;
}

export interface SmsReliabilityStats {
  logsReady: boolean;
  queued: number;
  failedLast24h: number;
  sentToday: number;
  deliveredToday: number;
  lastRunAt: string | null;
  lastRunSent: number;
  lastRunFailed: number;
  lastRunQueued: number;
  lastRunSkipped: number;
  lastRunError: string;
  lastRetryAt: string | null;
  lastRetrySent: number;
  lastExpiryRunAt: string | null;
  lastExpiryChanged: number;
}

export interface SmsSettingsState {
  sms_enabled: string;
  smsgate_username: string;
  smsgate_password: string;
  smsgate_password_configured?: boolean;
  smsgate_device_id: string;
  smsgate_sim_number: string;
  sms_auto_reminder_paused: string;
  wa_enabled: string;
  wa_base_url: string;
  wa_api_key: string;
  wa_api_key_configured?: boolean;
  wa_session_id: string;
  email_enabled: string;
  appscript_url: string;
  appscript_secret: string;
  appscript_secret_configured?: boolean;
  notify_channel_order: string;
}

export interface SmsStatus {
  smsEnabled: boolean;
  smsConfigured: boolean;
  smsgateConfigured: boolean;
  waEnabled: boolean;
  waConfigured: boolean;
  emailEnabled: boolean;
  emailConfigured: boolean;
  settings: SmsSettingsState;
}

export type NotifyChannel = "whatsapp" | "sms" | "email";
export type NotifyChannelChoice = NotifyChannel | "auto";

/** Receipt/bill sending: SMS + Email (WhatsApp joins when the gym connects it). */
export type BillChannel = "sms" | "email" | "auto";
export type DeliveryStatus = "sent" | "delivered" | "queued" | "failed" | "skipped";

export interface ReceiptDelivery {
  sms?: DeliveryStatus;
  email?: DeliveryStatus;
}

export interface ResendResult {
  receiptId: string;
  receiptNo: string;
  sms?: DeliveryStatus;
  email?: DeliveryStatus;
}

export interface StatementResult {
  status?: DeliveryStatus;
  channel?: NotifyChannel | null;
  error?: string;
  duplicate?: boolean;
  dryRun?: boolean;
  sms?: string | null;
  email?: string | null;
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
  email?: string;
  method?: PaymentMethod;
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
  /** Create idempotency key (one per sheet open; ignored on edit). */
  clientRequestId?: string;
}

export interface AttendanceEntry {
  id: string;
  memberId: string;
  visitDate: string;
  weightKg?: number;
  createdAt: string;
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
  /** Oldest-first allocation lines (absent on pre-bucket receipts). */
  arrearsApplied?: number;
  cycleApplied?: number;
  advanceApplied?: number;
  /** Latest per-channel send state (absent when nothing sent yet). */
  delivery?: ReceiptDelivery;
}

export interface PaymentReceiptInput {
  paidOn: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
  receiptNo?: string;
  clientRequestId?: string;
}

export interface RenewalHistoryEntry {
  id: string;
  memberId: string;
  oldPlanType: PlanType;
  oldAmount: number;
  newPlanType: PlanType;
  oldStartDate: string;
  oldDueDate: string;
  newStartDate: string;
  newDueDate: string;
  amount: number;
  arrearsCarried: number;
  paymentStatus: PaymentStatus;
  renewedOn: string;
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
  trainingType?: "All Training" | TrainingType;
  planType?: "All Plans" | PlanType;
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
