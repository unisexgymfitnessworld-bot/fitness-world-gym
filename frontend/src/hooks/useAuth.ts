import { useState } from "react";
import { friendlyAuthError } from "../lib/authMessages";
import { emailOnlySchema, loginSchema, type LoginValues } from "../lib/validations";
import { api, isApiConfigured } from "../lib/api";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useAppStore } from "../store/useAppStore";

interface AuthResult {
  signIn: (values: LoginValues) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  loading: boolean;
  error: string | null;
}

export function useAuth(): AuthResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setTrainer = useAppStore((state) => state.setTrainer);

  async function signIn(values: LoginValues): Promise<void> {
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the sign in details");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error: authError } = await supabase.auth.signInWithPassword(parsed.data);
        if (authError) {
          throw new Error(authError.message);
        }
        if (isApiConfigured) {
          try {
            const { trainer } = await api.me();
            setTrainer(trainer);
            return;
          } catch (apiError) {
            await supabase.auth.signOut();
            throw apiError;
          }
        }
        setTrainer({
          id: data.user?.id ?? "trainer",
          name: data.user?.user_metadata?.name ?? data.user?.email?.split("@")[0] ?? "Fitness World Trainer",
          email: data.user?.email ?? parsed.data.email,
          avatar: data.user?.user_metadata?.avatar ?? undefined,
        });
        return;
      }

      setTrainer({
        id: "demo-trainer",
        name: "Fitness World Trainer",
        email: parsed.data.email,
      });
    } catch (caught) {
      setError(friendlyAuthError(caught));
    } finally {
      setLoading(false);
    }
  }

  async function sendPasswordReset(email: string): Promise<void> {
    const parsed = emailOnlySchema.safeParse({ email });
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Enter a valid trainer email");
    }

    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase auth is not configured. Add the Supabase URL and publishable key first.");
    }

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo,
    });

    if (resetError) {
      throw new Error(friendlyAuthError(resetError));
    }
  }

  async function signOut(): Promise<void> {
    setLoading(true);
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
      setTrainer(null);
    } finally {
      setLoading(false);
    }
  }

  return { signIn, sendPasswordReset, signOut, clearError: () => setError(null), loading, error };
}
