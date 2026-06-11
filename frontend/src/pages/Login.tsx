import { useState } from "react";
import { ArrowRight, CalendarClock, CheckCircle2, Download, Loader2, MessageCircle, Search, Share2, ShieldCheck, Smartphone } from "lucide-react";
import { motion } from "motion/react";
import { FwMark } from "../components/layout/FwMark";
import { friendlyAuthError } from "../lib/authMessages";
import { useAuth } from "../hooks/useAuth";
import { usePwaInstall } from "../hooks/usePwaInstall";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
};

export function Login() {
  const { signIn, sendPasswordReset, verifyRecoveryCode, clearError, loading, error } = useAuth();
  const { canInstall, install, isIos, isStandalone } = usePwaInstall();
  const [mode, setMode] = useState<"signin" | "forgot" | "verify_reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [installStatus, setInstallStatus] = useState<"idle" | "installed" | "dismissed">("idle");
  const [slowSignIn, setSlowSignIn] = useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (mode === "forgot") {
      void submitPasswordReset();
      return;
    }
    if (mode === "verify_reset") {
      void submitVerifyReset();
      return;
    }
    // Show "waking up" hint after 5s if sign-in is slow (Supabase cold start)
    const slowTimer = window.setTimeout(() => setSlowSignIn(true), 5000);
    void signIn({ email, password }).finally(() => {
      window.clearTimeout(slowTimer);
      setSlowSignIn(false);
    });
  }

  async function submitPasswordReset(): Promise<void> {
    const targetEmail = (resetEmail || email).trim();
    setResetLoading(true);
    setResetError(null);
    setResetNotice(null);
    try {
      await sendPasswordReset(targetEmail);
      setMode("verify_reset");
      setResetNotice(`Security code sent to ${targetEmail}. Enter the 6-digit code and your new password below.`);
    } catch (caught) {
      setResetError(friendlyAuthError(caught));
    } finally {
      setResetLoading(false);
    }
  }

  async function submitVerifyReset(): Promise<void> {
    const targetEmail = (resetEmail || email).trim();
    if (newPassword !== confirmPassword) {
      setResetError("Passwords do not match");
      return;
    }
    setResetLoading(true);
    setResetError(null);
    setResetNotice(null);
    try {
      await verifyRecoveryCode(targetEmail, code, newPassword);
      setResetNotice("Password reset successfully! Please sign in with your new password.");
      setMode("signin");
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
      setPassword("");
    } catch (caught) {
      setResetError(friendlyAuthError(caught));
    } finally {
      setResetLoading(false);
    }
  }

  function switchMode(nextMode: "signin" | "forgot" | "verify_reset"): void {
    setMode(nextMode);
    clearError();
    setResetError(null);
    setResetNotice(null);
    if (nextMode === "forgot" && !resetEmail) {
      setResetEmail(email);
    }
  }

  async function installApp(): Promise<void> {
    const accepted = await install();
    setInstallStatus(accepted ? "installed" : "dismissed");
  }

  return (
    <main className="studio-shell animated-grid relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <section className="relative mx-auto grid min-h-[calc(100vh-32px)] w-full max-w-[1120px] content-center lg:min-h-[calc(100vh-48px)]">
        <motion.div
          className="studio-card grid overflow-hidden rounded-[var(--radius-panel)] lg:grid-cols-[minmax(0,1fr)_420px]"
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Left Dark Panel */}
          <motion.div
            className="studio-dark order-2 grid content-between gap-6 p-5 lg:order-1 lg:min-h-[620px] lg:gap-10 lg:p-8"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div className="flex flex-wrap items-center justify-between gap-4" variants={itemVariants}>
              <FwMark />
              <div className="rounded-full border border-white/[0.14] bg-white/[0.08] px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider text-white/70">
                GymOS
              </div>
            </motion.div>

            <motion.div variants={itemVariants}>
              <h1 className="max-w-[560px] text-[32px] font-black leading-[1.04] text-brand-white sm:text-[48px] lg:text-[64px]">
                Trainer desk, built for{" "}
                <span className="bg-gradient-to-r from-[#FF6B9D] via-[#F0447D] to-[#E8175D] bg-clip-text text-transparent">
                  real gym hours.
                </span>
              </h1>
              <p className="mt-4 max-w-[520px] text-[15px] font-semibold leading-7 text-white/68 lg:mt-5 lg:text-[17px]">
                Manage members, track dues, and send reminders quickly on tablet without making the trainer think about software.
              </p>
              <motion.div
                className="mt-6 grid gap-2 sm:grid-cols-3 lg:mt-8 lg:gap-3"
                variants={containerVariants}
              >
                <SignalCard icon={Search} label="Find" value="Instant search" index={0} />
                <SignalCard icon={CalendarClock} label="Dues" value="Renewal view" index={1} />
                <SignalCard icon={MessageCircle} label="Reach" value="SMS + WhatsApp" index={2} />
              </motion.div>
            </motion.div>

            <motion.div className="grid gap-3 lg:gap-4" variants={itemVariants}>
              <div className="brand-photo-frame hidden rounded-[var(--radius-card)] p-2 lg:block">
                <img className="w-full rounded-lg object-contain" src="/brand/fitness-world-banner.jpeg" alt="Fitness World gym banner" />
              </div>
              <div className="grid grid-cols-3 gap-2 lg:gap-3">
                <MiniMetric value="09" label="AM SMS" />
                <MiniMetric value="FW" label="Reg ID" />
                <MiniMetric value="2" label="Trainers" />
              </div>
            </motion.div>
          </motion.div>

          {/* Right Form Panel */}
          <motion.form
            className="order-1 grid content-center gap-5 bg-brand-white p-5 sm:p-6 lg:order-2 lg:gap-6 lg:p-10"
            onSubmit={submit}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="grid gap-4 lg:gap-5">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border border-border-default bg-brand-white shadow-sm lg:h-28 lg:w-28">
                <img className="safe-logo-img h-full w-full object-contain p-2 rounded-full" src="/brand/fitness-world-logo-tight.png" alt="Fitness World logo" />
              </div>
              <div>
                <h2 className="text-[28px] font-black leading-tight text-text-primary lg:text-[32px]">
                  {mode === "signin" ? "Sign in" : mode === "forgot" ? "Reset password" : "Enter code"}
                </h2>
                <p className="mt-1.5 text-[14px] font-semibold text-text-secondary lg:mt-2 lg:text-[15px]">
                  {mode === "signin" 
                    ? "Open the Fitness World trainer workspace." 
                    : mode === "forgot" 
                    ? "Send a secure 6-digit reset code to a trainer email." 
                    : "Enter the 6-digit code and choose a new password."}
                </p>
              </div>
            </div>

            {mode !== "verify_reset" ? (
              <label className="grid gap-1.5 lg:gap-2">
                <span className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Email</span>
                <input
                  className="studio-input min-h-12 rounded-[var(--radius-card)] px-4 text-[16px] font-semibold lg:min-h-14"
                  value={mode === "signin" ? email : resetEmail}
                  onChange={(event) => {
                    if (mode === "signin") {
                      setEmail(event.target.value);
                    } else {
                      setResetEmail(event.target.value);
                    }
                  }}
                  autoComplete="email"
                  placeholder="trainer@fitnessworld.in"
                />
              </label>
            ) : (
              <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-border-default bg-surface-raised px-4 py-2 text-[14px] font-semibold text-text-secondary">
                <span>Sending to: <strong>{resetEmail || email}</strong></span>
                <button
                  type="button"
                  className="text-brand-primary font-bold hover:underline"
                  onClick={() => switchMode("forgot")}
                >
                  Change
                </button>
              </div>
            )}

            {mode === "verify_reset" ? (
              <>
                <label className="grid gap-1.5 lg:gap-2">
                  <span className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Security Code (6-digits)</span>
                  <input
                    className="studio-input min-h-12 rounded-[var(--radius-card)] px-4 text-[16px] font-semibold lg:min-h-14"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    maxLength={6}
                    autoFocus
                  />
                </label>

                <label className="grid gap-1.5 lg:gap-2">
                  <span className="text-[12px] font-bold uppercase tracking-wider text-text-muted">New Password</span>
                  <input
                    className="studio-input min-h-12 rounded-[var(--radius-card)] px-4 text-[16px] font-semibold lg:min-h-14"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="At least 12 characters"
                  />
                </label>

                <label className="grid gap-1.5 lg:gap-2">
                  <span className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Confirm Password</span>
                  <input
                    className="studio-input min-h-12 rounded-[var(--radius-card)] px-4 text-[16px] font-semibold lg:min-h-14"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Re-enter new password"
                  />
                </label>
              </>
            ) : null}

            {mode === "signin" ? (
              <label className="grid gap-1.5 lg:gap-2">
                <span className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Password</span>
                <input
                  className="studio-input min-h-12 rounded-[var(--radius-card)] px-4 text-[16px] font-semibold lg:min-h-14"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter password"
                />
              </label>
            ) : null}

            {mode === "signin" ? (
              <div className="-mt-2 flex justify-end">
                <button
                  type="button"
                  className="text-[13px] font-black text-brand-primary transition hover:text-brand-primary-hover"
                  onClick={() => switchMode("forgot")}
                >
                  Forgot password?
                </button>
              </div>
            ) : null}

            {(mode === "signin" ? error : resetError) ? (
              <motion.p
                className="rounded-[var(--radius-card)] border border-red-100 bg-red-50 px-4 py-3 text-[14px] font-semibold text-status-expired"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {mode === "signin" ? error : resetError}
              </motion.p>
            ) : null}

            {resetNotice ? (
              <motion.p
                className="rounded-[var(--radius-card)] border border-green-100 bg-green-50 px-4 py-3 text-[14px] font-semibold text-status-active"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {resetNotice}
              </motion.p>
            ) : null}

            <motion.button
              type="submit"
              disabled={mode === "signin" ? loading : resetLoading}
              className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-[var(--radius-card)] bg-gradient-to-r from-brand-primary to-[#F0447D] px-5 py-3 text-[16px] font-black text-brand-white shadow-[0_14px_34px_rgba(232,23,93,0.26)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(232,23,93,0.32)] disabled:cursor-not-allowed disabled:opacity-60 lg:min-h-14"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {(mode === "signin" ? loading : resetLoading) ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  {mode === "signin" ? "Signing In" : mode === "forgot" ? "Sending Code" : "Saving Password"}
                </>
              ) : mode === "forgot" ? (
                <>
                  Send Code
                  <ArrowRight size={20} />
                </>
              ) : mode === "verify_reset" ? (
                <>
                  Save New Password
                  <ArrowRight size={20} />
                </>
              ) : (
                <>
                  Open Trainer Desk
                  <ArrowRight size={20} />
                </>
              )}
            </motion.button>

            {mode === "signin" && loading && slowSignIn && (
              <motion.p
                className="rounded-[var(--radius-card)] border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-700"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                ⏳ Server is waking up from sleep — this is normal and takes 15–20 seconds. Please hold on...
              </motion.p>
            )}

            {mode === "forgot" ? (
              <button
                type="button"
                className="text-center text-[13px] font-black text-text-secondary transition hover:text-brand-primary"
                onClick={() => switchMode("signin")}
              >
                Back to sign in
              </button>
            ) : null}

            {mode === "verify_reset" ? (
              <div className="flex justify-between items-center text-[13px] font-black">
                <button
                  type="button"
                  className="text-text-secondary transition hover:text-brand-primary"
                  onClick={() => switchMode("forgot")}
                >
                  Resend Code
                </button>
                <button
                  type="button"
                  className="text-text-secondary transition hover:text-brand-primary"
                  onClick={() => switchMode("signin")}
                >
                  Back to sign in
                </button>
              </div>
            ) : null}

            <div className="flex items-center gap-2 text-[12px] font-semibold text-text-muted lg:text-[13px]">
              <ShieldCheck size={16} className="text-status-active" />
              Secure trainer access for shared gym data.
            </div>

            <AppInstallPanel
              canInstall={canInstall}
              installStatus={installStatus}
              isIos={isIos}
              isStandalone={isStandalone}
              onInstall={() => void installApp()}
            />
          </motion.form>
        </motion.div>
      </section>
    </main>
  );
}

interface AppInstallPanelProps {
  canInstall: boolean;
  installStatus: "idle" | "installed" | "dismissed";
  isIos: boolean;
  isStandalone: boolean;
  onInstall: () => void;
}

function AppInstallPanel({ canInstall, installStatus, isIos, isStandalone, onInstall }: AppInstallPanelProps) {
  if (isStandalone || installStatus === "installed") {
    return (
      <div className="mt-2 flex items-center gap-3 rounded-[var(--radius-card)] border border-green-100 bg-green-50 px-4 py-3 text-[13px] font-bold text-status-active">
        <CheckCircle2 size={18} />
        GymOS is ready as an installed app.
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-border-default pt-4">
      <p className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Mobile & Tablet App</p>
      {canInstall ? (
        <button
          type="button"
          className="focus-ring inline-flex min-h-11 items-center justify-center gap-2.5 rounded-[var(--radius-card)] border border-border-default bg-surface-raised px-4 py-2 text-[14px] font-bold text-text-primary shadow-sm transition-all hover:border-brand-primary/40 hover:bg-brand-white"
          onClick={onInstall}
        >
          <Download size={18} className="text-brand-primary" />
          Install GymOS
        </button>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-border-default bg-surface-raised px-4 py-3">
          <div className="flex items-center gap-2.5 text-[14px] font-bold text-text-primary">
            {isIos ? <Share2 size={18} className="text-brand-primary" /> : <Smartphone size={18} className="text-brand-primary" />}
            {isIos ? "Add GymOS from Safari Share" : "Install GymOS from browser menu"}
          </div>
          <p className="mt-1 text-[12px] font-semibold leading-5 text-text-muted">
            {isIos ? "Choose Add to Home Screen to open it like a tablet app." : "After deploy, supported browsers show the install option automatically."}
          </p>
        </div>
      )}
      {installStatus === "dismissed" ? <p className="text-[12px] font-semibold text-text-muted">Install skipped. You can add GymOS later from the browser menu.</p> : null}
    </div>
  );
}

interface SignalCardProps {
  icon: typeof Search;
  label: string;
  value: string;
  index: number;
}

function SignalCard({ icon: Icon, label, value }: SignalCardProps) {
  return (
    <motion.div
      className="card-hover rounded-[var(--radius-card)] border border-white/[0.12] bg-white/[0.08] p-3"
      variants={itemVariants}
    >
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/[0.10] text-brand-primary-light lg:h-10 lg:w-10">
        <Icon size={17} />
      </span>
      <span className="mt-3 block text-[11px] font-bold uppercase tracking-wider text-white/48 lg:mt-4 lg:text-[12px]">{label}</span>
      <span className="mt-0.5 block text-[14px] font-black text-brand-white lg:mt-1 lg:text-[15px]">{value}</span>
    </motion.div>
  );
}

interface MiniMetricProps {
  value: string;
  label: string;
}

function MiniMetric({ value, label }: MiniMetricProps) {
  return (
    <div className="rounded-[var(--radius-card)] border border-white/[0.12] bg-white/[0.08] p-2.5 lg:p-3">
      <p className="font-mono text-[20px] font-black leading-none text-brand-white lg:text-[22px]">{value}</p>
      <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-white/48 lg:mt-1 lg:text-[12px]">{label}</p>
    </div>
  );
}
