import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  FAST2SMS_API_KEY: z.string().min(1).optional(),
  FRONTEND_URL: z.string().url().optional(),
  TRAINER_EMAILS: z.string().optional(),
  NODE_ENV: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export function requireEnv(name: keyof typeof env): string {
  const value = env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}
