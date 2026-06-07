import { useState, useEffect } from "react";
import { Camera, HelpCircle, Key, Loader2, Save, User } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useAppStore } from "../../store/useAppStore";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { initials } from "../../lib/utils";
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

  // Sync state with prop updates
  useEffect(() => {
    setName(trainer.name);
    setAvatar(trainer.avatar ?? "");
  }, [trainer]);

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

  return (
    <Modal open={open} title="GymOS Settings" onClose={onClose}>
      <div className="grid gap-5 py-2 text-text-primary">
        {/* Profile Edit Panel */}
        <section className="rounded-lg bg-surface-raised p-4 border border-border-default grid gap-4">
          <h3 className="text-[14px] font-black uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <User size={15} className="text-brand-primary" />
            <span>Trainer Profile</span>
          </h3>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Avatar Uploader */}
            <div className="relative group flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-default bg-brand-white shadow-sm ring-2 ring-brand-primary/20">
              {avatar ? (
                <img src={avatar} alt="Profile preview" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[18px] font-black text-text-muted">{initials(name || trainer.name)}</span>
              )}
              <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera size={18} className="text-white mb-0.5" />
                <span className="text-[10px] font-bold text-white uppercase">Upload</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setAvatar(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </label>
            </div>

            <div className="grid gap-1 w-full">
              <span className="block text-[12px] text-text-muted font-semibold">{trainer.email}</span>
              {avatar && (
                <button
                  type="button"
                  className="text-left text-[11px] font-bold text-status-expired hover:underline mt-0.5"
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
              className="mt-1 w-full bg-gradient-to-r from-brand-primary to-[#F0447D] text-white font-bold"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
              Save Profile Details
            </Button>
          </div>
        </section>

        {/* SMS Gateway Configuration status */}
        <section className="grid gap-3">
          <div className="flex items-center gap-2">
            <Key size={16} className="text-brand-primary" />
            <h3 className="text-[14px] font-black uppercase tracking-wider text-text-muted">SMS Gateway Status</h3>
          </div>
          <div className="rounded-lg bg-surface-raised p-3 border border-border-default grid gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold">Fast2SMS Service Gateway</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                  isSupabaseConfigured ? "bg-green-100 text-status-active" : "bg-red-100 text-status-expired"
                }`}
              >
                {isSupabaseConfigured ? "Configured" : "Disabled (Using WhatsApp fallbacks)"}
              </span>
            </div>
            <p className="text-[12px] text-text-secondary leading-relaxed font-semibold mt-1">
              Automated renewal notifications are scheduled daily at 9:00 AM IST. In-app manual alerts can also be sent directly to client phones.
            </p>
            <div className="mt-2 border-t border-border-default pt-2.5 flex items-start gap-2 text-[12px] text-text-muted font-semibold">
              <HelpCircle size={15} className="shrink-0 text-brand-primary mt-0.5" />
              <span>
                To configure your Fast2SMS credentials, update the <code>FAST2SMS_API_KEY</code> secret in your Cloudflare Worker environment.
              </span>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
