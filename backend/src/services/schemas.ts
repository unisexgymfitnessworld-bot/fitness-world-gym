import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = z.string().trim().optional();

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6),
});

export const memberInputSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().regex(/^\d{10}$/),
  age: z.coerce.number().int().min(12).max(90),
  gender: z.enum(["Male", "Female", "Other"]),
  joinDate: isoDate,
  weightKg: z.coerce.number().min(20).max(250),
  heightCm: z.coerce.number().min(90).max(240),
  goal: z.enum(["Weight Loss", "Weight Gain", "Muscle Gain", "General Fitness", "Other"]),
  goalOther: optionalText,
  healthProblem: optionalText,
  specialInstruction: optionalText,
  warmupExercises: optionalText,
  flexibilityTraining: optionalText,
  cardioTraining: optionalText,
  planType: z.enum(["1 Month", "3 Months", "6 Months", "1 Year", "Custom"]),
  membershipStart: isoDate,
  membershipDue: isoDate,
  feesAmount: z.coerce.number().min(0),
  paymentStatus: z.enum(["Paid", "Pending"]),
});

export const renewSchema = z.object({
  membershipStart: isoDate,
  membershipDue: isoDate,
  feesAmount: z.coerce.number().min(0),
});

export const paymentSchema = z.object({
  paymentStatus: z.enum(["Paid", "Pending"]),
});

export const attendanceInputSchema = z.object({
  memberId: z.string().uuid(),
  visitDate: isoDate,
  weightKg: z.coerce.number().min(20).max(250).optional(),
});

export const smsInputSchema = z.object({
  member_id: z.string().uuid(),
  message: z.string().trim().min(12).max(320),
});
