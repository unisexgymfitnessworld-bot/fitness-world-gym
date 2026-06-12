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

    setSaving(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.auth.updateUser({
          data: {
            name: name.trim(),
            avatar: avatar || null,
          },
        });
        if (error) {
          throw new Error(error.message);
        }
      }

      setTrainer({
        ...trainer,
        name: name.trim(),
        avatar: avatar || undefined,
      });

      pushToast({
        title: "Settings Saved",
        message: "Your profile details have been successfully updated.",
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
    <Modal open={open} title="GymOS Settings" onClose={onClose}>
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
                Automated SMS alerts sent 3 days before renewal. Requires a Fast2SMS API Key and wallet balance.
              </p>
              <div className="mt-2 border-t border-border-default/60 pt-2 text-[11px] text-text-muted font-semibold">
                To configure, set the <code>FAST2SMS_API_KEY</code> secret in the Cloudflare Worker.
              </div>
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
                Automated WhatsApp reminders sent by scanning a QR Code. Flat monthly fee, unlimited messages.
              </p>
              <div className="mt-2 border-t border-border-default/60 pt-2 text-[11px] text-text-muted font-semibold">
                To configure, set <code>WHATSAPP_INSTANCE_ID</code> & <code>WHATSAPP_TOKEN</code> secrets.
              </div>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
