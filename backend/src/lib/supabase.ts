import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEnv } from "./env.js";

let adminClient: SupabaseClient | null = null;
let authClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        transport: ws,
      },
    });
  }
  return adminClient;
}

export function getSupabaseAuthClient(): SupabaseClient {
  if (!authClient) {
    authClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        transport: ws,
      },
    });
  }
  return authClient;
}
