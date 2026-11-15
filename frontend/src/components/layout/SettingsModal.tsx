import { useState, useEffect, useRef } from "react";
import { Camera, HelpCircle, Key, Loader2, LockKeyhole, MessageCircle, Save, ShieldCheck, Trash2, Upload, User, Settings, UsersRound } from "lucide-react";
import { SmsSettingsPanel } from "../sms/SmsSettingsPanel";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useAppStore } from "../../store/useAppStore";
import { friendlyAuthError } from "../../lib/authMessages";
import { api, isApiConfigured } from "../../lib/api";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { initials } from "../../lib/utils";
import { passwordChangeSchema } from "../../lib/validations";
import { compressImage } from "../../lib/imageCompression";
import type { SmsHealth, Trainer, TrainerAccount } from "../../types";

interface SettingsModalProps {
  open: boolean;
  trainer: Trainer;
  onClose: () => void;
  dataCounts?: { members: number; receipts: number; renewals: number; visits: number };
  onWipeAll?: () => Promise<void>;
}

export function SettingsModal({ open, trainer, onClose, dataCounts, onWipeAll }: SettingsModalProps) {
  const wipeAvailable = dataCounts !== undefined && onWipeAll !== undefined;
  const setTrainer = useAppStore((state) => state.setTrainer);
  const pushToast = useAppStore((state) => state.pushToast);

  const [activeTab, setActiveTab] = useState<"profile" | "sms" | "status" | "team" | "data">("profile");
  const [wipeText, setWipeText] = useState("");
  const [wipeBackupOk, setWipeBackupOk] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);
  const [statusHealth, setStatusHealth] = useState<SmsHealth | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Live reminder-service status: driven by the real SMS health check
  // (cloud + login + gym phone), never by static config flags.
  useEffect(() => {
    if (!open || activeTab !== "status" || !isApiConfigured) {
      return;
    }
    let mounted = true;
    setStatusLoading(true);
    api.smsHealth()
      .then((health) => {
        if (mounted) setStatusHealth(health);
      })
      .catch(() => {
        if (mounted) setStatusHealth(null);
      })
      .finally(() => {
        if (mounted) setStatusLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [open, activeTab]);

  const [name, setName] = useState(trainer.name);
  const [email, setEmail] = useState(trainer.email);
  const [avatar, setAvatar] = useState(trainer.avatar ?? "");
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setAvatar(compressed);
      } catch (err) {
        console.error("Image compression failed:", err);
        const reader = new FileReader();
        reader.onloadend = () => {
          setAvatar(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // Sync state with prop updates
  useEffect(() => {
    setName(trainer.name);
    setEmail(trainer.email);
    setAvatar(trainer.avatar ?? "");
  }, [trainer]);

  useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [open]);

  async function handleSave() {
    if (!name.trim()) {
      pushToast({
        title: "Validation Error",
        message: "Trainer name cannot be empty.",
        tone: "error",
      });
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      pushToast({
        title: "Validation Error",
        message: "Please enter a valid email address.",
        tone: "error",
      });
      return;
    }

    setSaving(true);
    try {
      let emailChangeTriggered = false;
      if (isSupabaseConfigured && supabase) {
        const updatePayload: any = {
          data: {
            name: name.trim(),
            avatar: avatar || null,
          },
        };

        if (email.trim().toLowerCase() !== trainer.email.toLowerCase()) {
          updatePayload.email = email.trim().toLowerCase();
          emailChangeTriggered = true;
        }

        const { error } = await supabase.auth.updateUser(updatePayload);
        if (error) {
          throw new Error(error.message);
        }
      }

      setTrainer({
        ...trainer,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        avatar: avatar || undefined,
      });

      pushToast({
        title: "Settings Saved",
        message: emailChangeTriggered 
          ? "Profile updated. Please verify the confirmation link sent to your new email."
          : "Your profile details have been successfully updated.",
        tone: "success",
      });
      onClose();
    } catch (err) {
      pushToast({
        title: "Save Failed",
        message: err instanceof Error ? err.message : "Unable to save profile changes.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordChange() {
    const parsed = passwordChangeSchema.safeParse({
      currentPassword,
      password: newPassword,
      confirmPassword,
    });

    if (!parsed.success) {
      pushToast({
        title: "Password Check Failed",
        message: parsed.error.issues[0]?.message ?? "Check the password fields.",
        tone: "error",
      });
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      pushToast({
        title: "Password Change Disabled",
        message: "Supabase auth is not configured for this deployment.",
        tone: "error",
      });
      return;
    }

    setChangingPassword(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: trainer.email,
        password: parsed.data.currentPassword,
      });
      if (verifyError) {
        throw new Error("Current password is incorrect. Try again or use Forgot password from the sign in screen.");
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });
      if (updateError) {
        throw updateError;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      pushToast({
        title: "Password Changed",
        message: "Your new password is active for the next sign in.",
        tone: "success",
      });
    } catch (err) {
      pushToast({
        title: "Password Change Failed",
        message: friendlyAuthError(err),
        tone: "error",
      });
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <Modal open={open} title="Fitness World Settings" onClose={onClose}>
      {/* Premium Tabbed Navigation */}
      <div className="sticky top-0 bg-brand-white z-20 flex overflow-x-auto scrollbar-hide flex-nowrap border-b border-border-default/60 mb-5 pb-0 pt-1 -mx-6 px-6">

        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer shrink-0 ${
            activeTab === "profile"
              ? "border-brand-primary text-brand-primary font-black"
              : "border-transparent text-text-secondary/80 hover:text-text-primary"
          }`}
        >
          <User size={13} />
          Profile
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("sms")}
          className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer shrink-0 ${
            activeTab === "sms"
              ? "border-brand-primary text-brand-primary font-black"
              : "border-transparent text-text-secondary/80 hover:text-text-primary"
          }`}
        >
          <MessageCircle size={13} />
          Notifications
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("status")}
          className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer shrink-0 ${
            activeTab === "status"
              ? "border-brand-primary text-brand-primary font-black"
              : "border-transparent text-text-secondary/80 hover:text-text-primary"
          }`}
        >
          <Settings size={13} />
          Reminders Status
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("team")}
          className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer shrink-0 ${
            activeTab === "team"
              ? "border-brand-primary text-brand-primary font-black"
              : "border-transparent text-text-secondary/80 hover:text-text-primary"
          }`}
        >
          <UsersRound size={13} />
          Team
        </button>
        {wipeAvailable ? (
          <button
            type="button"
            onClick={() => setActiveTab("data")}
            className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer shrink-0 ${
              activeTab === "data"
                ? "border-brand-primary text-brand-primary font-black"
                : "border-transparent text-text-secondary/80 hover:text-text-primary"
            }`}
          >
            <Trash2 size={13} />
            Data
          </button>
        ) : null}
      </div>

      <div className="grid gap-6 py-2 text-text-primary">
        {activeTab === "profile" && (
          <>
            {/* Profile Edit Panel */}
            <section className="rounded-xl bg-surface-raised/80 p-5 border border-border-default/60 grid gap-4 hover:border-brand-primary/20 transition-all duration-300 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
              <h3 className="text-[13px] font-black uppercase tracking-wider text-text-muted flex items-center gap-2">
                <span className="p-1 rounded-md bg-brand-primary/10 text-brand-primary">
                  <User size={14} />
                </span>
                <span>Trainer Profile</span>
              </h3>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                {/* Avatar Uploader */}
                <div 
                  className="relative group flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-default bg-brand-white shadow-sm ring-2 ring-brand-primary/20 cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {avatar ? (
                    <img src={avatar} alt="Profile preview" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[18px] font-black text-text-muted">{initials(name || trainer.name)}</span>
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera size={18} className="text-white mb-0.5" />
                    <span className="text-[10px] font-bold text-white uppercase">Upload</span>
                  </div>
                </div>

                {/* Hidden inputs for gallery selection and direct camera capture */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageFile}
                />
                <input
                  type="file"
                  ref={cameraInputRef}
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={handleImageFile}
                />

                <div className="grid gap-2 w-full text-center sm:text-left">
                  <span className="block text-[13px] text-text-muted font-bold tracking-wide">{trainer.email}</span>
                  
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border-default bg-brand-white text-[11px] font-bold text-text-primary hover:bg-surface-raised shadow-sm transition-all cursor-pointer"
                    >
                      <Upload size={12} className="text-text-secondary" />
                      Upload Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border-default bg-brand-white text-[11px] font-bold text-text-primary hover:bg-surface-raised shadow-sm transition-all cursor-pointer"
                    >
                      <Camera size={12} className="text-brand-primary" />
                      Take Live Photo
                    </button>
                  </div>

                  {avatar && (
                    <button
                      type="button"
                      className="text-center sm:text-left text-[11px] font-extrabold text-status-expired hover:underline mt-0.5"
                      onClick={() => setAvatar("")}
                    >
                      Remove Avatar Photo
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-3">
                <Input
                  label="Trainer Display Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                  placeholder="e.g. Trainer Name"
                />
                <Input
                  label="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={saving}
                  placeholder="trainer@fitnessworld.in"
                />
                <p className="text-[11px] font-semibold text-text-secondary leading-normal italic px-1">
                  Note: Changing your email will send a verification link to confirm the new address before it updates.
                </p>
                <Button
                  className="mt-1 w-full font-bold"
                  disabled={saving}
                  onClick={handleSave}
                >
                  {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
                  Save Profile Details
                </Button>
              </div>
            </section>

            {/* Account Password */}
            <section className="rounded-xl bg-surface-raised/80 p-5 border border-border-default/60 grid gap-4 hover:border-brand-primary/20 transition-all duration-300 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
              <h3 className="text-[13px] font-black uppercase tracking-wider text-text-muted flex items-center gap-2">
                <span className="p-1 rounded-md bg-brand-primary/10 text-brand-primary">
                  <LockKeyhole size={14} />
                </span>
                <span>Account Password</span>
              </h3>
              <div className="grid gap-3">
                <Input
                  label="Current Password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={changingPassword}
                  autoComplete="current-password"
                  placeholder="Enter current password"
                />
                <Input
                  label="New Password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={changingPassword}
                  autoComplete="new-password"
                  placeholder="At least 12 characters"
                />
                <Input
                  label="Confirm New Password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={changingPassword}
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                />
                <Button
                  className="mt-1 w-full font-bold"
                  disabled={changingPassword}
                  onClick={handlePasswordChange}
                >
                  {changingPassword ? <Loader2 size={16} className="animate-spin mr-2" /> : <ShieldCheck size={16} className="mr-2" />}
                  Change Password
                </Button>
              </div>
            </section>
          </>
        )}

        {activeTab === "sms" && <SmsSettingsPanel variant="light" />}

        {activeTab === "status" && (
          /* SMS reminder service status */
          <section className="grid gap-4">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-brand-primary/10 text-brand-primary">
                <Key size={14} />
              </span>
              <h3 className="text-[13px] font-black uppercase tracking-wider text-text-muted">System Reminder Services</h3>
            </div>
            <div className="grid gap-4">
              <StatusRow
                label="Database"
                ok={isSupabaseConfigured}
                detail={isSupabaseConfigured ? "Connected" : "Not configured"}
              />
              <SmsStatusRow
                loading={statusLoading}
                health={statusHealth}
                apiConfigured={isApiConfigured}
                onOpenSmsSetup={() => setActiveTab("sms")}
              />
            </div>
          </section>
        )}

        {activeTab === "team" && (
          <TeamTab pushToast={pushToast} />
        )}

        {activeTab === "data" && wipeAvailable && dataCounts && onWipeAll && (
          <WipeDataTab
            dataCounts={dataCounts}
            wipeText={wipeText}
            setWipeText={setWipeText}
            wipeBackupOk={wipeBackupOk}
            setWipeBackupOk={setWipeBackupOk}
            wiping={wiping}
            setWiping={setWiping}
            wipeError={wipeError}
            setWipeError={setWipeError}
            onWipeAll={onWipeAll}
          />
        )}
      </div>

    </Modal>
  );
}

function WipeDataTab({
  dataCounts,
  wipeText,
  setWipeText,
  wipeBackupOk,
  setWipeBackupOk,
  wiping,
  setWiping,
  wipeError,
  setWipeError,
  onWipeAll,
}: {
  dataCounts: { members: number; receipts: number; renewals: number; visits: number };
  wipeText: string;
  setWipeText: (value: string) => void;
  wipeBackupOk: boolean;
  setWipeBackupOk: (value: boolean) => void;
  wiping: boolean;
  setWiping: (value: boolean) => void;
  wipeError: string | null;
  setWipeError: (value: string | null) => void;
  onWipeAll: () => Promise<void>;
}) {
  return (
    <section className="grid gap-4">
      <div className="flex items-center gap-2">
        <span className="p-1 rounded-md bg-red-500/10 text-status-expired">
          <Trash2 size={14} />
        </span>
        <h3 className="text-[13px] font-black uppercase tracking-wider text-text-muted">Fresh Start — Erase All Gym Data</h3>
      </div>
      <div className="rounded-xl bg-red-50/80 p-5 border border-red-200/70 grid gap-3">
        <p className="text-[13px] font-semibold leading-relaxed text-text-primary">
          This permanently erases <strong>{dataCounts.members} members</strong>, <strong>{dataCounts.receipts} receipts</strong>,{" "}
          <strong>{dataCounts.renewals} renewals</strong>, <strong>{dataCounts.visits} visits</strong>, and all message
          history, then restarts member numbers from FW-001. Settings, notification credentials, and logins stay.
          Messages already sent cannot be recalled.
        </p>
        <p className="text-[12px] font-bold text-red-800">
          First export a backup: close this, open Reports → Backup, download it. There is no undo.
        </p>
        <label className="flex cursor-pointer items-center gap-3 text-[13px] font-bold text-text-primary">
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 cursor-pointer accent-red-600"
            checked={wipeBackupOk}
            onChange={(event) => setWipeBackupOk(event.target.checked)}
          />
          I downloaded a backup of the current data
        </label>
        <Input
          label="Type ERASE ALL to confirm"
          value={wipeText}
          onChange={(event) => setWipeText(event.target.value)}
          placeholder="ERASE ALL"
          autoComplete="off"
        />
        {wipeError ? (
          <p className="text-[13px] font-bold text-status-expired">{wipeError}</p>
        ) : null}
        <div>
          <Button
            className="!bg-status-expired !text-brand-white hover:!bg-red-700"
            disabled={wiping || !wipeBackupOk || wipeText.trim() !== "ERASE ALL"}
            onClick={() => {
              setWiping(true);
              setWipeError(null);
              void onWipeAll()
                .then(() => {
                  setWipeText("");
                  setWipeBackupOk(false);
                })
                .catch((error: unknown) => {
                  setWipeError(error instanceof Error ? error.message : "Unable to erase data");
                })
                .finally(() => {
                  setWiping(false);
                });
            }}
          >
            {wiping ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            {wiping ? "Erasing..." : "Erase everything and start fresh"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="rounded-xl bg-surface-raised/80 p-5 border border-border-default/60 grid gap-2 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-bold text-text-primary">{label}</span>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider border ${
            ok ? "bg-green-100/80 border-green-200 text-status-active" : "bg-red-100/80 border-red-200 text-status-expired"
          }`}
        >
          {ok ? "Connected" : "Offline"}
        </span>
      </div>
      <p className="text-[12px] text-text-secondary leading-relaxed font-semibold mt-1">{detail}</p>
    </div>
  );
}

function SmsStatusRow({ loading, health, apiConfigured, onOpenSmsSetup }: { loading: boolean; health: SmsHealth | null; apiConfigured: boolean; onOpenSmsSetup: () => void }) {
  if (!apiConfigured) {
    return <StatusRow label="Reminder Service (SMS)" ok={false} detail="Backend not connected. SMS reminders cannot run." />;
  }
  if (loading || !health) {
    return (
      <div className="rounded-xl bg-surface-raised/80 p-5 border border-border-default/60 grid gap-2 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-2 text-[13px] font-bold text-text-secondary">
          <Loader2 size={15} className="animate-spin" />
          Checking cloud, login, and gym phone...
        </div>
      </div>
    );
  }
  const wa = health.whatsapp ?? { enabled: false, configured: false, reachable: false, sessionStatus: "", error: "" };
  const email = health.email ?? { enabled: false, configured: false, reachable: false, error: "" };
  const smsOk = health.configured && health.smsEnabled && health.cloud.reachable && health.auth.ok && health.phone.matched && !health.phone.error && health.phone.freshness === "online";
  const waOk = wa.enabled && wa.configured && wa.reachable && wa.sessionStatus === "ready" && !wa.error;
  const emailOk = email.enabled && email.configured && email.reachable && !email.error;
  const liveChannels = [
    waOk ? "WhatsApp" : null,
    smsOk ? "SMS" : null,
    emailOk ? "Email" : null,
  ].filter((entry): entry is string => entry !== null);
  const ok = liveChannels.length > 0 && !health.autoPaused;
  const firstProblem = !health.configured && !wa.configured && !email.configured
    ? "No channel is set up. Open Notifications to configure WhatsApp, SMS, or Email."
    : health.autoPaused
      ? "Automatic reminders are paused. Resume them in Notifications."
      : !waOk && wa.enabled && wa.configured
        ? `WhatsApp: ${wa.error || "not ready."}`
        : !smsOk && health.smsEnabled && health.configured
          ? `SMS: ${smsProblemDetail(health)}`
          : !emailOk && email.enabled && email.configured
            ? `Email: ${email.error || "not ready."}`
            : "No channel is fully ready. Open Notifications for details.";
  const detail = ok
    ? `Live via ${liveChannels.join(" · ")} · last auto-run ${health.lastRun.at ? `${health.lastRun.sent} sent, ${health.lastRun.failed} failed` : "has not run yet"}.`
    : firstProblem;
  return (
    <div className="rounded-xl bg-surface-raised/80 p-5 border border-border-default/60 grid gap-2 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-bold text-text-primary">Reminder Service (SMS)</span>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider border ${
            ok ? "bg-green-100/80 border-green-200 text-status-active" : "bg-red-100/80 border-red-200 text-status-expired"
          }`}
        >
          {ok ? "Live" : "Issue"}
        </span>
      </div>
      <p className="text-[12px] text-text-secondary leading-relaxed font-semibold mt-1">{detail}</p>
      <div>
        <button
          type="button"
          onClick={onOpenSmsSetup}
          className="text-[12px] font-extrabold text-brand-primary hover:underline"
        >
          Open Notifications for details →
        </button>
      </div>
    </div>
  );
}

function smsProblemDetail(health: SmsHealth): string {
  if (!health.configured || !health.smsEnabled) {
    return "not set up.";
  }
  if (!health.cloud.reachable) {
    return `cloud unreachable (${health.cloud.error || "no route"}).`;
  }
  if (!health.auth.ok) {
    return `login rejected (${health.auth.error || "check username/password"}).`;
  }
  if (health.phone.error) {
    return health.phone.error;
  }
  if (!health.phone.matched) {
    return "gym phone not found on this SMSGate account.";
  }
  return `gym phone last seen ${health.phone.lastSeenAt ? new Date(health.phone.lastSeenAt).toLocaleString() : "never"} — open the app on the gym phone.`;
}

function TeamTab({ pushToast }: { pushToast: (message: { title: string; message: string; tone: "success" | "error" | "info" }) => void }) {
  const [accounts, setAccounts] = useState<TrainerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [deleteFor, setDeleteFor] = useState<TrainerAccount | null>(null);

  async function reload(): Promise<void> {
    if (!isApiConfigured) {
      setLoading(false);
      return;
    }
    try {
      setAccounts(await api.teamAccounts());
    } catch (caught) {
      pushToast({ title: "Could not load team", message: caught instanceof Error ? caught.message : "Try again.", tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(): Promise<void> {
    if (busy) return;
    if (!email.includes("@") || !name.trim()) {
      pushToast({ title: "Check details", message: "Enter a name and a valid email.", tone: "error" });
      return;
    }
    if (password.length < 12) {
      pushToast({ title: "Weak password", message: "Password must be at least 12 characters.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      await api.createTeamAccount({ email: email.trim(), name: name.trim(), password });
      setEmail("");
      setName("");
      setPassword("");
      pushToast({ title: "Trainer added", message: "They can log in right away.", tone: "success" });
      await reload();
    } catch (caught) {
      pushToast({ title: "Add failed", message: caught instanceof Error ? caught.message : "Could not add trainer.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(account: TrainerAccount): Promise<void> {
    if (busy) return;
    if (resetPassword.length < 12) {
      pushToast({ title: "Weak password", message: "Password must be at least 12 characters.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      await api.updateTeamAccount(account.id, { password: resetPassword });
      setResetFor(null);
      setResetPassword("");
      pushToast({ title: "Password changed", message: account.email, tone: "success" });
    } catch (caught) {
      pushToast({ title: "Change failed", message: caught instanceof Error ? caught.message : "Could not change password.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteFor || busy) return;
    setBusy(true);
    try {
      await api.deleteTeamAccount(deleteFor.id);
      setDeleteFor(null);
      pushToast({ title: "Trainer removed", message: deleteFor.email, tone: "success" });
      await reload();
    } catch (caught) {
      pushToast({ title: "Remove failed", message: caught instanceof Error ? caught.message : "Could not remove trainer.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (!isApiConfigured) {
    return (
      <section className="grid gap-3">
        <p className="text-[14px] font-semibold text-text-secondary">Team accounts need the live server. This list works on the deployed app.</p>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      <div>
        <h3 className="text-[13px] font-black uppercase tracking-wider text-text-muted">Trainer Logins</h3>
        <p className="mt-1 text-[13px] font-semibold text-text-secondary">Everyone here can open the trainer desk. New logins work immediately.</p>
      </div>

      {loading ? (
        <p className="text-[14px] font-semibold text-text-secondary">Loading team…</p>
      ) : (
        <div className="grid gap-2">
          {accounts.length === 0 ? (
            <p className="rounded-[var(--radius-card)] border border-dashed border-border-default px-4 py-6 text-center text-[13px] font-bold text-text-muted">
              No trainer logins yet. Add the first one below.
            </p>
          ) : (
            accounts.map((account) => (
              <div key={account.id} className="grid gap-2 rounded-[var(--radius-card)] border border-border-default bg-brand-white px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-black text-text-primary">
                      {account.name}
                      {account.currentUser ? <span className="ml-2 text-[11px] font-bold text-brand-primary">(you)</span> : null}
                    </p>
                    <p className="truncate text-[12px] font-semibold text-text-secondary">{account.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="!min-h-11" onClick={() => { setResetFor(resetFor === account.id ? null : account.id); setResetPassword(""); }}>
                      <Key size={15} />
                      Password
                    </Button>
                    {!account.currentUser ? (
                      <Button variant="secondary" className="!min-h-11 !text-status-expired" onClick={() => setDeleteFor(account)}>
                        <Trash2 size={15} />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
                {resetFor === account.id ? (
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Input
                      label="New password (12+ characters)"
                      type="password"
                      value={resetPassword}
                      onChange={(event) => setResetPassword(event.target.value)}
                      autoComplete="new-password"
                    />
                    <Button className="!min-h-11" onClick={() => void handleResetPassword(account)} disabled={busy}>
                      Save
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}

      <div className="grid gap-3 rounded-[var(--radius-card)] border border-border-default bg-surface-raised p-3 lg:p-4">
        <p className="text-[13px] font-black uppercase tracking-wider text-text-primary">Add Trainer Login</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" placeholder="Trainer name" />
          <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" placeholder="trainer@example.com" />
          <Input label="Password (12+ characters)" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
        </div>
        <div>
          <Button onClick={() => void handleCreate()} disabled={busy}>
            {busy ? "Adding..." : "Add Trainer"}
          </Button>
        </div>
      </div>

      <Modal open={deleteFor !== null} title="Remove Trainer?" onClose={() => setDeleteFor(null)}>
        <p className="text-[14px] font-semibold text-text-secondary">
          {deleteFor?.name} ({deleteFor?.email}) will lose access immediately. Gym members and bills stay untouched.
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => setDeleteFor(null)}>
            Keep
          </Button>
          <Button type="button" className="!bg-status-expired hover:!bg-red-700" onClick={() => void handleDelete()} disabled={busy}>
            {busy ? "Removing..." : "Remove"}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
