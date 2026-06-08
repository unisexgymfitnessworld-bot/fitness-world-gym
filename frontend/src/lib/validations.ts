import { z } from "zod";
import { genderOptions, goalOptions, paymentOptions, planOptions } from "../types";

const requiredText = z.string().trim().min(1, "Required");
const optionalText = z.string().trim().optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const emailOnlySchema = z.object({
  email: z.string().trim().email("Enter a valid trainer email"),
});

const passwordPairSchema = z.object({
  password: z.string().min(12, "Use at least 12 characters for production safety"),
  confirmPassword: z.string().min(12, "Confirm the new password"),
});

export const passwordResetSchema = passwordPairSchema.superRefine((value, ctx) => {
  if (value.password !== value.confirmPassword) {
    ctx.addIssue({
      code: "custom",
      path: ["confirmPassword"],
      message: "Passwords do not match",
    });
  }
});

export const passwordChangeSchema = passwordPairSchema.extend({
  currentPassword: z.string().min(1, "Enter your current password"),
}).superRefine((value, ctx) => {
  if (value.password !== value.confirmPassword) {
    ctx.addIssue({
      code: "custom",
      path: ["confirmPassword"],
      message: "Passwords do not match",
    });
  }
  if (value.currentPassword === value.password) {
    ctx.addIssue({
      code: "custom",
      path: ["password"],
      message: "New password must be different from the current password",
    });
  }
});

export const memberInputSchema = z.object({
  name: requiredText,
  phone: z.string().regex(/^\d{10}$/, "Phone must be exactly 10 digits"),
  age: z.coerce.number().int().min(12, "Age looks too low").max(90, "Age looks too high"),
  gender: z.enum(genderOptions),
  joinDate: isoDate,
  weightKg: z.coerce.number().min(20, "Weight looks too low").max(250, "Weight looks too high"),
  heightCm: z.coerce.number().min(90, "Height looks too low").max(240, "Height looks too high"),
  goal: z.enum(goalOptions),
  goalOther: optionalText,
  healthProblem: optionalText,
  specialInstruction: optionalText,
  warmupExercises: optionalText,
  flexibilityTraining: optionalText,
  cardioTraining: optionalText,
  planType: z.enum(planOptions),
  membershipStart: isoDate,
  membershipDue: isoDate,
  feesAmount: z.coerce.number().min(0, "Fees cannot be negative"),
  paymentStatus: z.enum(paymentOptions),
  avatar: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.goal === "Other" && !value.goalOther) {
    ctx.addIssue({
      code: "custom",
      path: ["goalOther"],
      message: "Describe the custom goal",
    });
  }
});

export const smsSchema = z.object({
  message: z.string().trim().min(12, "Message is too short").max(320, "Message is too long"),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type EmailOnlyValues = z.infer<typeof emailOnlySchema>;
export type PasswordResetValues = z.infer<typeof passwordResetSchema>;
export type PasswordChangeValues = z.infer<typeof passwordChangeSchema>;
export type MemberInputValues = z.infer<typeof memberInputSchema>;
export type SmsValues = z.infer<typeof smsSchema>;
