import { useState } from "react";
import { loginSchema, type LoginValues } from "../lib/validations";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useAppStore } from "../store/useAppStore";

interface AuthResult {
  signIn: (values: LoginValues) => Promise<void>;
  signOut: () => Promise<void>;
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
      const message = caught instanceof Error ? caught.message : "Unable to sign in";
      setError(message);
    } finally {
      setLoading(false);
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

  return { signIn, signOut, loading, error };
}
