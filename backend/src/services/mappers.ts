import type { AttendanceEntry, DbAttendanceEntry, DbMember, DbPaymentReceipt, DbRenewalHistoryEntry, Member, MemberInput, PaymentReceipt, PaymentReceiptInput, RenewalHistoryEntry } from "../types/index.js";

export function mapMember(row: DbMember): Member {
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
    avatar: row.avatar ?? undefined,
    trainingType: row.training_type,
    address: row.address,
    partialPaidAmount: Number(row.partial_paid_amount),
    balanceAmount: Number(row.balance_amount),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function memberInputToDb(input: MemberInput) {
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

export function mapAttendance(row: DbAttendanceEntry): AttendanceEntry {
  return {
    id: row.id,
    memberId: row.member_id,
    visitDate: row.visit_date,
    weightKg: row.weight_kg ?? undefined,
    createdAt: row.created_at,
  };
}

export function paymentReceiptInputToDb(memberId: string, ownerUserId: string | null, input: PaymentReceiptInput, receiptNo: string) {
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

export function mapPaymentReceipt(row: DbPaymentReceipt): PaymentReceipt {
  return {
    id: row.id,
    memberId: row.member_id,
    receiptNo: row.receipt_no,
    paidOn: row.paid_on,
    amount: Number(row.amount),
    method: row.method,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function mapRenewalHistory(row: DbRenewalHistoryEntry): RenewalHistoryEntry {
  return {
    id: row.id,
    memberId: row.member_id,
    oldPlanType: row.old_plan_type,
    newPlanType: row.new_plan_type,
    oldStartDate: row.old_start_date,
    oldDueDate: row.old_due_date,
    newStartDate: row.new_start_date,
    newDueDate: row.new_due_date,
    amount: Number(row.amount),
    paymentStatus: row.payment_status,
    renewedOn: row.renewed_on,
    createdAt: row.created_at,
  };
}
