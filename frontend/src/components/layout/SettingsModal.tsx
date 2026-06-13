import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Camera, HelpCircle, Key, Loader2, LockKeyhole, Save, ShieldCheck, Upload, User, Maximize2, Minimize2, MessageCircle, Settings } from "lucide-react";
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

  const [activeTab, setActiveTab] = useState<"profile" | "whatsapp" | "status">("profile");
  const [isQrExpanded, setIsQrExpanded] = useState<boolean>(false);

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
  const [qrZoom, setQrZoom] = useState<number>(0.85);

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
      {/* Premium Tabbed Navigation */}
      <div className="sticky top-0 bg-brand-white z-20 flex border-b border-border-default/60 mb-5 pb-0 pt-1">

        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
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
          onClick={() => setActiveTab("whatsapp")}
          className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === "whatsapp"
              ? "border-brand-primary text-brand-primary font-black"
              : "border-transparent text-text-secondary/80 hover:text-text-primary"
          }`}
        >
          <MessageCircle size={13} />
          WhatsApp Link
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("status")}
          className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === "status"
              ? "border-brand-primary text-brand-primary font-black"
              : "border-transparent text-text-secondary/80 hover:text-text-primary"
          }`}
        >
          <Settings size={13} />
          Reminders Status
        </button>
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
          </>
        )}

        {activeTab === "whatsapp" && (
          /* WhatsApp Gateway Session Card */
          <section className="rounded-xl bg-surface-raised/80 p-5 border border-border-default/60 grid gap-4 hover:border-brand-primary/20 transition-all duration-300 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <h3 className="text-[13px] font-black uppercase tracking-wider text-text-muted flex items-center gap-2">
              <span className="p-1 rounded-md bg-brand-primary/10 text-brand-primary">
                <MessageCircle size={14} />
              </span>
              <span>WhatsApp Device Connection</span>
            </h3>

            <p className="text-[12px] text-text-secondary leading-relaxed font-semibold">
              Connect your gym's WhatsApp to dispatch automated reminders. Scan the QR code below using WhatsApp on your mobile phone.
            </p>

            <div className="grid gap-4 items-center justify-center text-center">
              {gatewayStatus === "unavailable" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3.5 text-center text-amber-700 text-[12px] font-bold flex flex-col items-center gap-1.5 max-w-[320px] mx-auto shadow-sm">
                  <span>Warning: Cloud status check failed. If your gateway is running locally, it may still function.</span>
                  <button
                    type="button"
                    className="text-[10px] font-black text-brand-primary underline hover:opacity-80 cursor-pointer"
                    onClick={() => void fetchGatewayStatus()}
                    disabled={loadingGateway}
                  >
                    {loadingGateway ? "Rechecking..." : "Recheck Status"}
                  </button>
                </div>
              )}

              {gatewayUrl && (
                  <div className="flex flex-col items-center">
                    <div className="relative border border-border-default/80 rounded-xl overflow-hidden bg-white shadow-sm mx-auto mb-2" style={{ width: '300px', height: '320px' }}>
                      <iframe
                        key={iframeKey}
                        src={gatewayUrl}
                        title="WhatsApp QR Scanner"
                        className="border-0 w-full h-full"
                        style={{
                          width: `${100 / qrZoom}%`,
                          height: `${100 / qrZoom}%`,
                          transform: `scale(${qrZoom})`,
                          transformOrigin: 'top left',
                        }}
                        sandbox="allow-scripts allow-same-origin"
                      />
                      {/* Hoverable Maximize Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setQrZoom(1.0);
                          setIsQrExpanded(true);
                        }}
                        className="absolute top-2.5 right-2.5 p-2 rounded-lg bg-black/75 hover:bg-black/90 text-white transition-all shadow-md hover:scale-105 cursor-pointer z-10 border border-white/10"
                        title="Expand QR Code"
                      >
                        <Maximize2 size={15} />
                      </button>
                    </div>

                    <div className="flex flex-col items-center gap-1.5 mb-3 w-full max-w-[280px]">
                      <div className="flex items-center justify-between w-full text-[11px] font-bold text-text-secondary">
                        <span>Adjust QR Size:</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setQrZoom(prev => Math.max(0.5, Number((prev - 0.05).toFixed(2))))}
                            className="w-5 h-5 flex items-center justify-center rounded border border-border-default bg-brand-white hover:bg-surface-raised active:bg-border-default transition-all font-black cursor-pointer text-text-primary"
                            title="Zoom Out"
                          >
                            －
                          </button>
                          <span className="min-w-[28px] text-center font-extrabold text-text-primary text-[10px]">
                            {Math.round(qrZoom * 100)}%
                          </span>
                          <button
                            type="button"
                            onClick={() => setQrZoom(prev => Math.min(1.5, Number((prev + 0.05).toFixed(2))))}
                            className="w-5 h-5 flex items-center justify-center rounded border border-border-default bg-brand-white hover:bg-surface-raised active:bg-border-default transition-all font-black cursor-pointer text-text-primary"
                            title="Zoom In"
                          >
                            ＋
                          </button>
                          <button
                            type="button"
                            onClick={() => setQrZoom(0.85)}
                            className="px-1.5 py-0.5 rounded border border-border-default bg-brand-white hover:bg-surface-raised active:bg-border-default text-[9px] font-bold text-text-muted hover:text-text-primary transition-all ml-1 cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="1.5"
                        step="0.05"
                        value={qrZoom}
                        onChange={(e) => setQrZoom(Number(e.target.value))}
                        className="w-full h-1 bg-border-default rounded-lg appearance-none cursor-pointer accent-brand-primary"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-text-secondary">WhatsApp Status:</span>
                    <span className={`text-[11px] font-black uppercase tracking-wider border rounded-full px-2 py-0.5 ${
                      gatewayStatus === "connected" 
                        ? "bg-green-100 border-green-200 text-status-active" 
                        : gatewayStatus === "qr_ready"
                        ? "bg-blue-100 border-blue-200 text-blue-600 animate-pulse"
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
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-8 text-[11px] font-black cursor-pointer bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100"
                          onClick={() => {
                            setQrZoom(1.0);
                            setIsQrExpanded(true);
                          }}
                        >
                          <Maximize2 size={12} className="mr-1 inline-block" />
                          Expand View
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-8 text-[11px] font-black cursor-pointer"
                          onClick={() => window.open(gatewayUrl, "_blank")}
                        >
                          Open in New Tab
                        </Button>
                      </>
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
          </section>
        )}

        {activeTab === "status" && (
          /* Notification Gateways Configuration status */
          <section className="grid gap-4">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-brand-primary/10 text-brand-primary">
                <Key size={14} />
              </span>
              <h3 className="text-[13px] font-black uppercase tracking-wider text-text-muted">System Reminder Services</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Fast2SMS */}
              <div className="rounded-xl bg-surface-raised/80 p-5 border border-border-default/60 grid gap-2 hover:border-brand-primary/20 transition-all duration-300 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-bold text-text-primary">SMS Reminders</span>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider border ${
                      isSupabaseConfigured ? "bg-green-100/80 border-green-200 text-status-active" : "bg-red-100/80 border-red-200 text-status-expired"
                    }`}
                  >
                    {isSupabaseConfigured ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <p className="text-[12px] text-text-secondary leading-relaxed font-semibold mt-1">
                  Sends text messages automatically 3 days before membership renewal.
                </p>
              </div>

              {/* UltraMsg WhatsApp */}
              <div className="rounded-xl bg-surface-raised/80 p-5 border border-border-default/60 grid gap-2 hover:border-brand-primary/20 transition-all duration-300 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-bold text-text-primary">WhatsApp Backups</span>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider border ${
                      isSupabaseConfigured ? "bg-green-100/80 border-green-200 text-status-active" : "bg-red-100/80 border-red-200 text-status-expired"
                    }`}
                  >
                    {isSupabaseConfigured ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <p className="text-[12px] text-text-secondary leading-relaxed font-semibold mt-1">
                  Backup channel WhatsApp reminders sent 3 days before renewal and on the due date.
                </p>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Premium Full-Screen QR Lightbox Overlay */}
      {isQrExpanded && gatewayUrl && createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#090A16] p-6 text-white shadow-2xl flex flex-col items-center">
            
            <header className="w-full flex items-center justify-between border-b border-white/10 pb-3.5 mb-5">
              <div className="flex items-center gap-2">
                <MessageCircle size={20} className="text-brand-primary-light" />
                <h3 className="text-lg font-black tracking-wide">Scan WhatsApp QR Code</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQrExpanded(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
                title="Close Expand"
              >
                <Minimize2 size={20} />
              </button>
            </header>

            <div className="relative border-2 border-brand-primary/30 rounded-2xl overflow-hidden bg-white shadow-2xl mb-5 flex items-center justify-center p-3" style={{ width: '380px', height: '380px', maxWidth: '100%' }}>
              <iframe
                key={`${iframeKey}-large`}
                src={gatewayUrl}
                title="WhatsApp QR Scanner Large"
                className="border-0 w-full h-full rounded-lg"
                style={{
                  width: `${100 / qrZoom}%`,
                  height: `${100 / qrZoom}%`,
                  transform: `scale(${qrZoom})`,
                  transformOrigin: 'top left',
                }}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>

            <div className="flex flex-col items-center gap-2 mb-5 w-full max-w-[320px]">
              <div className="flex items-center justify-between w-full text-[12px] font-bold text-white/60">
                <span>Adjust Code Size:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQrZoom(prev => Math.max(0.5, Number((prev - 0.05).toFixed(2))))}
                    className="w-6 h-6 flex items-center justify-center rounded border border-white/15 bg-white/5 hover:bg-white/10 transition-all font-black text-white cursor-pointer"
                  >
                    －
                  </button>
                  <span className="min-w-[32px] text-center font-mono font-extrabold text-white text-[11px]">
                    {Math.round(qrZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setQrZoom(prev => Math.min(1.5, Number((prev + 0.05).toFixed(2))))}
                    className="w-6 h-6 flex items-center justify-center rounded border border-white/15 bg-white/5 hover:bg-white/10 transition-all font-black text-white cursor-pointer"
                  >
                    ＋
                  </button>
                  <button
                    type="button"
                    onClick={() => setQrZoom(1.0)}
                    className="px-2 py-0.5 rounded border border-white/15 bg-white/5 hover:bg-white/10 text-[10px] font-bold text-white/50 transition-all cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={qrZoom}
                onChange={(e) => setQrZoom(Number(e.target.value))}
                className="w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-brand-primary"
              />
            </div>

            <div className="flex flex-col gap-3.5 w-full">
              <div className="flex items-center justify-between border-t border-b border-white/5 py-2.5 px-1">
                <span className="text-[12px] font-bold text-white/50">WhatsApp Status</span>
                <span className={`text-[11px] font-black uppercase tracking-wider border rounded-full px-2.5 py-0.5 ${
                  gatewayStatus === "connected" 
                    ? "bg-green-500/10 border-green-500/20 text-green-400" 
                    : "bg-blue-500/10 border-blue-500/20 text-blue-400 animate-pulse"
                }`}>
                  {gatewayStatus === "connected" ? "Linked & Active" : "Ready to Link"}
                </span>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 bg-white/5 border border-white/10 text-white hover:bg-white/10 cursor-pointer text-[12px] font-bold"
                  onClick={() => {
                    setIframeKey(prev => prev + 1);
                    void fetchGatewayStatus();
                  }}
                >
                  Refresh QR
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary-light hover:bg-brand-primary/20 cursor-pointer text-[12px] font-bold"
                  onClick={() => setIsQrExpanded(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </Modal>
  );
}
