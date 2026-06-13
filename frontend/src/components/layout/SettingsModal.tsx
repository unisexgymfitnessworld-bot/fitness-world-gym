import { useState, useEffect, useRef } from "react";
import { Camera, HelpCircle, Key, Loader2, LockKeyhole, Save, ShieldCheck, Upload, User } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useAppStore } from "../../store/useAppStore";
import { friendlyAuthError } from "../../lib/authMessages";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { initials } from "../../lib/utils";
import { passwordChangeSchema } from "../../lib/validations";
import { compressImage } from "../../lib/imageCompression";
import { api } from "../../lib/api";
import type { Trainer } from "../../types";

interface SettingsModalProps {
  open: boolean;
  trainer: Trainer;
  onClose: () => void;
}

export function SettingsModal({ open, trainer, onClose }: SettingsModalProps) {
  const setTrainer = useAppStore((state) => state.setTrainer);
  const pushToast = useAppStore((state) => state.pushToast);

  const [name, setName] = useState(trainer.name);
  const [email, setEmail] = useState(trainer.email);
  const [avatar, setAvatar] = useState(trainer.avatar ?? "");
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // WhatsApp Gateway states
  const [gatewayStatus, setGatewayStatus] = useState<string>("checking");
  const [gatewayUrl, setGatewayUrl] = useState<string>("");
  const [loadingGateway, setLoadingGateway] = useState<boolean>(false);
  const [resettingGateway, setResettingGateway] = useState<boolean>(false);
  const [iframeKey, setIframeKey] = useState<number>(0);

  async function fetchGatewayStatus() {
    setLoadingGateway(true);
    try {
      const res = await api.getWhatsAppGatewayStatus();
      if (res && res.status) {
        setGatewayStatus(res.status);
      }
      if (res && res.gatewayUrl) {
        setGatewayUrl(res.gatewayUrl);
      }
    } catch (err) {
      console.warn("Failed to fetch WhatsApp gateway status:", err);
      setGatewayStatus("unavailable");
    } finally {
      setLoadingGateway(false);
    }
  }

  async function handleResetGateway() {
    if (!window.confirm("Are you sure you want to disconnect the current WhatsApp session? This will force a new QR code scan.")) {
      return;
    }
    setResettingGateway(true);
    try {
      await api.resetWhatsAppGateway();
      pushToast({
        title: "Session Disconnected",
        message: "WhatsApp session cleared. Scan the new QR code to reconnect.",
        tone: "success",
      });
      setIframeKey(prev => prev + 1);
      setTimeout(() => {
        void fetchGatewayStatus();
      }, 1000);
    } catch (err) {
      pushToast({
        title: "Disconnect Failed",
        message: err instanceof Error ? err.message : "Unable to reset WhatsApp gateway.",
        tone: "error",
      });
    } finally {
      setResettingGateway(false);
    }
  }

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
    if (open) {
      void fetchGatewayStatus();
    } else {
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
      <div className="grid gap-6 py-2 text-text-primary">
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
              className="mt-1 w-full bg-gradient-to-r from-brand-primary to-[#F0447D] text-white font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
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
              className="mt-1 w-full bg-gradient-to-r from-brand-primary to-[#F0447D] text-white font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              disabled={changingPassword}
              onClick={handlePasswordChange}
            >
              {changingPassword ? <Loader2 size={16} className="animate-spin mr-2" /> : <ShieldCheck size={16} className="mr-2" />}
              Change Password
            </Button>
          </div>
        </section>

        {/* WhatsApp Gateway Session Card */}
        <section className="rounded-xl bg-surface-raised/80 p-5 border border-border-default/60 grid gap-4 hover:border-brand-primary/20 transition-all duration-300 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <h3 className="text-[13px] font-black uppercase tracking-wider text-text-muted flex items-center gap-2">
            <span className="p-1 rounded-md bg-brand-primary/10 text-brand-primary">
              <Camera size={14} />
            </span>
            <span>WhatsApp Device Connection</span>
          </h3>

          <p className="text-[12px] text-text-secondary leading-relaxed font-semibold">
            Scan the QR code below to connect your gym's WhatsApp. Connected devices can automatically dispatch renewal reminders.
          </p>

          {gatewayStatus === "unavailable" ? (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 text-center text-status-expired text-[12px] font-bold flex flex-col items-center gap-2">
              <span>WhatsApp Gateway URL is not configured or not running.</span>
              <Button
                type="button"
                variant="secondary"
                className="h-8 text-[11px] font-black cursor-pointer bg-white border border-red-200 text-status-expired hover:bg-red-50 mt-1"
                onClick={() => void fetchGatewayStatus()}
                disabled={loadingGateway}
              >
                {loadingGateway ? <Loader2 size={12} className="animate-spin mr-1.5 inline-block" /> : null}
                Retry / Refresh Status
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 items-center justify-center text-center">
              {gatewayUrl && (
                <div className="relative border border-border-default/80 rounded-xl overflow-hidden bg-white shadow-sm mx-auto" style={{ width: '300px', height: '350px' }}>
                  <iframe
                    key={iframeKey}
                    src={gatewayUrl}
                    title="WhatsApp QR Scanner"
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              )}

              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold text-text-secondary">Gateway Status:</span>
                  <span className={`text-[11px] font-black uppercase tracking-wider border rounded-full px-2 py-0.5 ${
                    gatewayStatus === "connected" 
                      ? "bg-green-100 border-green-200 text-status-active" 
                      : gatewayStatus === "qr_ready"
                      ? "bg-blue-100 border-blue-200 text-blue-600"
                      : "bg-amber-100 border-amber-200 text-amber-600"
                  }`}>
                    {gatewayStatus === "connected"
                      ? "Connected"
                      : gatewayStatus === "qr_ready"
                      ? "Ready to Link"
                      : gatewayStatus === "connecting"
                      ? "Connecting..."
                      : gatewayStatus === "disconnected"
                      ? "Disconnected"
                      : gatewayStatus === "unavailable"
                      ? "Offline"
                      : gatewayStatus}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mt-2 justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8 text-[11px] font-black cursor-pointer"
                    onClick={() => {
                      setIframeKey(prev => prev + 1);
                      void fetchGatewayStatus();
                    }}
                    disabled={loadingGateway || resettingGateway}
                  >
                    Refresh Status
                  </Button>

                  {gatewayUrl && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 text-[11px] font-black cursor-pointer bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100"
                      onClick={() => window.open(gatewayUrl, "_blank")}
                    >
                      Open in New Tab
                    </Button>
                  )}
                  
                  <Button
                    type="button"
                    variant="danger"
                    className="h-8 text-[11px] font-black cursor-pointer"
                    onClick={handleResetGateway}
                    disabled={loadingGateway || resettingGateway}
                  >
                    {resettingGateway ? "Disconnecting..." : "Disconnect WhatsApp"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Notification Gateways Configuration status */}
        <section className="grid gap-4">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-brand-primary/10 text-brand-primary">
              <Key size={14} />
            </span>
            <h3 className="text-[13px] font-black uppercase tracking-wider text-text-muted">Notification Gateways Status</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Fast2SMS */}
            <div className="rounded-xl bg-surface-raised/80 p-5 border border-border-default/60 grid gap-2 hover:border-brand-primary/20 transition-all duration-300 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-bold text-text-primary">Fast2SMS (SMS)</span>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider border ${
                    isSupabaseConfigured ? "bg-green-100/80 border-green-200 text-status-active" : "bg-red-100/80 border-red-200 text-status-expired"
                  }`}
                >
                  {isSupabaseConfigured ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="text-[12px] text-text-secondary leading-relaxed font-semibold mt-1">
                Automated SMS alerts sent 3 days before renewal.
              </p>
            </div>

            {/* UltraMsg WhatsApp */}
            <div className="rounded-xl bg-surface-raised/80 p-5 border border-border-default/60 grid gap-2 hover:border-brand-primary/20 transition-all duration-300 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-bold text-text-primary">UltraMsg (WhatsApp)</span>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider border ${
                    isSupabaseConfigured ? "bg-green-100/80 border-green-200 text-status-active" : "bg-red-100/80 border-red-200 text-status-expired"
                  }`}
                >
                  {isSupabaseConfigured ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="text-[12px] text-text-secondary leading-relaxed font-semibold mt-1">
                Automated WhatsApp reminders sent 3 days before renewal and on the due date.
              </p>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
