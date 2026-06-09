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
  paymentStatus: z.enum(["Paid", "Pending", "Partially Paid"]),
  avatar: z.string().optional(),
  trainingType: z.enum(["Personal", "General", "Couple"]),
  address: z.string().trim().default(""),
  partialPaidAmount: z.coerce.number().min(0).default(0),
  balanceAmount: z.coerce.number().min(0).default(0),
}).superRefine((value, ctx) => {
  if (value.paymentStatus === "Partially Paid") {
    if (value.partialPaidAmount < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["partialPaidAmount"],
        message: "Partial amount must be at least 1",
      });
    } else if (value.partialPaidAmount > value.feesAmount) {
      ctx.addIssue({
        code: "custom",
        path: ["partialPaidAmount"],
        message: "Partial amount cannot exceed fees amount",
      });
    }
  }
});

export const renewSchema = z.object({
  membershipStart: isoDate,
  membershipDue: isoDate,
  feesAmount: z.coerce.number().min(0),
});

export const paymentSchema = z.object({
  paymentStatus: z.enum(["Paid", "Pending", "Partially Paid"]),
  partialPaidAmount: z.coerce.number().min(0).optional(),
  balanceAmount: z.coerce.number().min(0).optional(),
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
