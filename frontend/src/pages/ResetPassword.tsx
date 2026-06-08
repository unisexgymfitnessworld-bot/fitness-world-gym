import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { FwMark } from "../components/layout/FwMark";
import { friendlyAuthError } from "../lib/authMessages";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { passwordResetSchema } from "../lib/validations";

export function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setCheckingSession(false);
      setError("Supabase auth is not configured. Add the Supabase URL and publishable key first.");
      return;
    }

    let mounted = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) {
        return;
      }
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(true);
        setCheckingSession(false);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }
      setHasRecoverySession(Boolean(data.session));
      setCheckingSession(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsed = passwordResetSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the new password");
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase auth is not configured. Add the Supabase URL and publishable key first.");
      return;
    }

    if (!hasRecoverySession) {
      setError("This reset link is expired or already used. Request a new Forgot password link.");
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });
      if (updateError) {
        throw updateError;
      }

      await supabase.auth.signOut();
      window.history.replaceState({}, "", "/reset-password");
      setDone(true);
      setPassword("");
      setConfirmPassword("");
    } catch (caught) {
      setError(friendlyAuthError(caught));
    } finally {
      setSaving(false);
    }
  }

  function backToLogin(): void {
    window.location.assign("/");
  }

  return (
    <main className="studio-shell animated-grid grid min-h-screen place-items-center px-4 py-6">
      <motion.section
        className="studio-card grid w-full max-w-[520px] gap-6 rounded-[var(--radius-panel)] bg-brand-white p-6 shadow-[0_28px_80px_rgba(26,26,46,0.16)] sm:p-8"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center justify-between gap-4">
          <FwMark />
          <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-primary-light text-brand-primary">
            <KeyRound size={21} />
          </span>
        </div>

        <div>
          <h1 className="text-[30px] font-black leading-tight text-text-primary">Set new password</h1>
          <p className="mt-2 text-[14px] font-semibold leading-6 text-text-secondary">
            Create a stronger GymOS password for this trainer account.
          </p>
        </div>

        {checkingSession ? (
          <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border-default bg-surface-raised px-4 py-3 text-[14px] font-bold text-text-secondary">
            <Loader2 size={18} className="animate-spin text-brand-primary" />
            Checking reset link
          </div>
        ) : null}

        {done ? (
          <div className="rounded-[var(--radius-card)] border border-green-100 bg-green-50 px-4 py-4 text-status-active">
            <div className="flex items-center gap-2 text-[15px] font-black">
              <CheckCircle2 size={19} />
              Password changed
            </div>
            <p className="mt-1 text-[13px] font-semibold leading-5">Use the new password on the sign in screen.</p>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={submit}>
            <label className="grid gap-2">
              <span className="text-[12px] font-bold uppercase tracking-wider text-text-muted">New Password</span>
              <input
                className="studio-input min-h-12 rounded-[var(--radius-card)] px-4 text-[16px] font-semibold"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="At least 12 characters"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Confirm Password</span>
              <input
                className="studio-input min-h-12 rounded-[var(--radius-card)] px-4 text-[16px] font-semibold"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="Re-enter new password"
              />
            </label>

            {error ? (
              <p className="rounded-[var(--radius-card)] border border-red-100 bg-red-50 px-4 py-3 text-[14px] font-semibold text-status-expired">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={saving || checkingSession}
              className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-[var(--radius-card)] bg-gradient-to-r from-brand-primary to-[#F0447D] px-5 py-3 text-[16px] font-black text-brand-white shadow-[0_14px_34px_rgba(232,23,93,0.26)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 size={20} className="animate-spin" /> : <ShieldCheck size={20} />}
              Save New Password
            </button>
          </form>
        )}

        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-card)] border border-border-default bg-surface-raised px-4 py-2 text-[14px] font-black text-text-secondary transition hover:border-brand-primary/40 hover:text-brand-primary"
          onClick={backToLogin}
        >
          <ArrowLeft size={18} />
          Back to sign in
        </button>
      </motion.section>
    </main>
  );
}
