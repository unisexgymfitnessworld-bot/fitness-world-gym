import type { User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
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

function SessionSplash({ slow }: { slow?: boolean }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#080A16] px-4 text-center relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(219,39,119,0.12)_0%,transparent_65%)] pointer-events-none" />
      
      <div className="flex flex-col items-center gap-6 relative z-10">
        {/* Glowing Animated Logo Container */}
        <div className="relative flex items-center justify-center">
          {/* Ripple Ring 1 */}
          <motion.div
            className="absolute h-24 w-24 rounded-full border border-pink-500/20 bg-pink-500/5"
            animate={{
              scale: [1, 2],
              opacity: [0.6, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
          {/* Ripple Ring 2 */}
          <motion.div
            className="absolute h-24 w-24 rounded-full border border-pink-500/10 bg-pink-500/2"
            animate={{
              scale: [1, 2.5],
              opacity: [0.4, 0],
            }}
            transition={{
              duration: 2,
              delay: 0.7,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
          
          {/* Logo Card with Breathing Glow */}
          <motion.div
            className="relative h-20 w-20 overflow-hidden rounded-full bg-white p-1.5 shadow-[0_0_30px_rgba(219,39,119,0.3)] ring-2 ring-pink-500/30"
            animate={{
              scale: [0.95, 1.05, 0.95],
              boxShadow: [
                "0 0 20px rgba(219,39,119,0.2)",
                "0 0 40px rgba(219,39,119,0.5)",
                "0 0 20px rgba(219,39,119,0.2)",
              ],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <img
              src="/brand/fitness-world-logo-tight.png"
              alt="Fitness World Logo"
              className="h-full w-full object-contain rounded-full"
            />
          </motion.div>
        </div>

        <div className="space-y-2">
          <motion.h1 
            className="text-[24px] font-black tracking-tight text-white"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            Opening <span className="text-pink-500">Fitness World</span>
          </motion.h1>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            {slow ? (
              <p className="text-[13px] font-semibold text-amber-400 animate-pulse flex items-center justify-center gap-1.5">
                <Loader2 className="animate-spin" size={13} />
                Server waking up from sleep — please wait...
              </p>
            ) : (
              <p className="text-[13px] font-semibold text-white/50">
                Checking your trainer session...
              </p>
            )}
          </motion.div>
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
  const [slowConnection, setSlowConnection] = useState(false);

  useEffect(() => {
    if (path === "/reset-password" || !isSupabaseConfigured || !supabase) {
      setCheckingSession(false);
      return;
    }

    const authClient = supabase;
    let mounted = true;

    // After 8s, show "waking up" message so trainer knows it's not broken
    const slowTimer = window.setTimeout(() => {
      if (mounted) setSlowConnection(true);
    }, 8000);

    // After 15s hard timeout, give up and show login page
    const hardTimeout = window.setTimeout(() => {
      if (mounted) {
        setCheckingSession(false);
        setSlowConnection(false);
        setTrainer(null);
      }
    }, 15000);

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
          window.clearTimeout(slowTimer);
          window.clearTimeout(hardTimeout);
          setSlowConnection(false);
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
      window.clearTimeout(slowTimer);
      window.clearTimeout(hardTimeout);
      subscription.unsubscribe();
    };
  }, [path, setTrainer]);

  if (checkingSession) {
    return (
      <ErrorBoundary>
        <SessionSplash slow={slowConnection} />
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
