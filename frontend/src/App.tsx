import type { User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { api, isApiConfigured } from "./lib/api";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { Dashboard } from "./pages/Dashboard";
import { DeveloperDashboard } from "./pages/DeveloperDashboard";
import { Login } from "./pages/Login";
import { ResetPassword } from "./pages/ResetPassword";
import { useAppStore } from "./store/useAppStore";
import type { Trainer } from "./types";

function metadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function trainerFromUser(user: User): Trainer {
  const appMetadata = user.app_metadata as Record<string, unknown>;
  const userMetadata = user.user_metadata as Record<string, unknown>;
  const name =
    metadataString(userMetadata, "name") ??
    metadataString(userMetadata, "full_name") ??
    user.email?.split("@")[0] ??
    "Fitness World Trainer";
  const email = user.email ?? "";

  return {
    id: user.id,
    name,
    email,
    role: (appMetadata.role === "developer" || email.toLowerCase() === "digimartrix26@gmail.com") ? "developer" : "trainer",
    avatar: metadataString(userMetadata, "avatar") ?? metadataString(userMetadata, "avatar_url"),
  };
}

function SessionSplash() {
  return (
    <main className="grid min-h-screen place-items-center bg-surface-base px-4 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-primary-light text-brand-primary">
          <Loader2 className="animate-spin" size={26} />
        </div>
        <div>
          <h1 className="text-[22px] font-black text-text-primary">Opening GymOS</h1>
          <p className="mt-1 text-[14px] font-semibold text-text-secondary">Checking your trainer session...</p>
        </div>
      </div>
    </main>
  );
}

function App() {
  const trainer = useAppStore((state) => state.trainer);
  const setTrainer = useAppStore((state) => state.setTrainer);
  const path = window.location.pathname;
  const [checkingSession, setCheckingSession] = useState(() => isSupabaseConfigured && path !== "/reset-password");

  useEffect(() => {
    if (path === "/reset-password" || !isSupabaseConfigured || !supabase) {
      setCheckingSession(false);
      return;
    }

    const authClient = supabase;
    let mounted = true;

    async function restoreSession(): Promise<void> {
      try {
        const { data: sessionData, error: sessionError } = await authClient.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }

        if (!sessionData.session) {
          if (mounted) {
            setTrainer(null);
          }
          return;
        }

        const { data: userData, error: userError } = await authClient.auth.getUser();
        if (userError || !userData.user) {
          throw userError || new Error("No user found");
        }

        if (isApiConfigured) {
          const { trainer: verifiedTrainer } = await api.me();
          if (mounted) {
            setTrainer(verifiedTrainer);
          }
          return;
        }

        if (mounted && userData.user) {
          setTrainer(trainerFromUser(userData.user));
        }
      } catch {
        await authClient.auth.signOut().catch(() => undefined);
        if (mounted) {
          setTrainer(null);
        }
      } finally {
        if (mounted) {
          setCheckingSession(false);
        }
      }
    }

    void restoreSession();

    const {
      data: { subscription },
    } = authClient.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setTrainer(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [path, setTrainer]);

  if (checkingSession) {
    return (
      <ErrorBoundary>
        <SessionSplash />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      {path === "/reset-password" ? <ResetPassword /> : trainer?.role === "developer" ? <DeveloperDashboard /> : trainer ? <Dashboard /> : <Login />}
    </ErrorBoundary>
  );
}

export default App;
