import { useState } from "react";
import { friendlyAuthError } from "../lib/authMessages";
import { emailOnlySchema, loginSchema, type LoginValues } from "../lib/validations";
import { api, isApiConfigured } from "../lib/api";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useAppStore } from "../store/useAppStore";

interface AuthResult {
  signIn: (values: LoginValues) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  verifyRecoveryCode: (email: string, code: string, newPassword: string) => Promise<void>;
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
        const email = data.user?.email ?? parsed.data.email;
        setTrainer({
          id: data.user?.id ?? "trainer",
          name: data.user?.user_metadata?.name ?? data.user?.email?.split("@")[0] ?? "Fitness World Trainer",
          email,
          role: (data.user?.app_metadata?.role === "developer" || email.toLowerCase() === "digimartrix26@gmail.com") ? "developer" : "trainer",
          avatar: data.user?.user_metadata?.avatar ?? undefined,
        });
        return;
      }

      setTrainer({
        id: "demo-trainer",
        name: "Fitness World Trainer",
        email: parsed.data.email,
        role: "trainer",
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

  async function verifyRecoveryCode(email: string, code: string, newPassword: string): Promise<void> {
    const emailParsed = emailOnlySchema.safeParse({ email });
    if (!emailParsed.success) {
      throw new Error("Enter a valid trainer email");
    }
    const codeClean = code.trim();
    if (!codeClean || codeClean.length !== 6 || !/^\d+$/.test(codeClean)) {
      throw new Error("Enter a valid 6-digit security code");
    }
    if (!newPassword || newPassword.length < 12) {
      throw new Error("Password must be at least 12 characters");
    }

    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase auth is not configured.");
    }

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: emailParsed.data.email,
      token: codeClean,
      type: "recovery",
    });

    if (verifyError) {
      throw new Error(friendlyAuthError(verifyError));
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      throw new Error(friendlyAuthError(updateError));
    }

    await supabase.auth.signOut().catch(() => undefined);
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

  return { signIn, sendPasswordReset, verifyRecoveryCode, signOut, clearError: () => setError(null), loading, error };
}
