import { HelpCircle, Key, Server, User } from "lucide-react";
import { Modal } from "../ui/Modal";
import { apiBaseUrl, isApiConfigured } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import type { Trainer } from "../../types";

interface SettingsModalProps {
  open: boolean;
  trainer: Trainer;
  onClose: () => void;
}

export function SettingsModal({ open, trainer, onClose }: SettingsModalProps) {
  const isSmsConfigured = isApiConfigured;

  return (
    <Modal open={open} title="GymOS Settings" onClose={onClose}>
      <div className="grid gap-5 py-2 text-text-primary">
        {/* Trainer Profile Card */}
        <section className="rounded-lg bg-surface-raised p-4 border border-border-default flex gap-3 items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary-light text-brand-primary font-black text-[16px]">
            <User size={20} />
          </div>
          <div>
            <h3 className="text-[15px] font-black leading-tight">Active Trainer</h3>
            <p className="mt-0.5 text-[14px] font-bold text-text-primary">{trainer.name}</p>
            <p className="text-[12px] text-text-muted font-semibold">{trainer.email}</p>
          </div>
        </section>

        {/* API Connections Card */}
        <section className="grid gap-3">
          <div className="flex items-center gap-2">
            <Server size={16} className="text-brand-primary" />
            <h3 className="text-[14px] font-black uppercase tracking-wider text-text-muted">API Connections</h3>
          </div>
          <div className="grid gap-2 text-[13px] font-semibold">
            <div className="rounded-lg bg-surface-raised p-3 border border-border-default">
              <span className="block text-[11px] uppercase tracking-wider text-text-muted">Backend API Base URL</span>
              <span className="mt-1 block font-mono text-[12px] text-text-primary truncate">{apiBaseUrl || "Not Configured"}</span>
            </div>
            <div className="rounded-lg bg-surface-raised p-3 border border-border-default">
              <span className="block text-[11px] uppercase tracking-wider text-text-muted">Supabase URL</span>
              <span className="mt-1 block font-mono text-[12px] text-text-primary truncate">
                {supabase ? "https://anlkjdlixiwespogdozf.supabase.co" : "Not Configured"}
              </span>
            </div>
          </div>
        </section>

        {/* SMS Gateway Card */}
        <section className="grid gap-3">
          <div className="flex items-center gap-2">
            <Key size={16} className="text-brand-primary" />
            <h3 className="text-[14px] font-black uppercase tracking-wider text-text-muted">SMS Gateway (Fast2SMS)</h3>
          </div>
          <div className="rounded-lg bg-surface-raised p-3 border border-border-default grid gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold">Fast2SMS Service Status</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                  isSmsConfigured ? "bg-green-100 text-status-active" : "bg-red-100 text-status-expired"
                }`}
              >
                {isSmsConfigured ? "Configured" : "Disabled (Using WhatsApp fallbacks)"}
              </span>
            </div>
            <p className="text-[12px] text-text-secondary leading-relaxed font-semibold mt-1">
              Automated renewal notifications are scheduled daily at 9:00 AM IST. In-app manual alerts can also be sent directly to client phones.
            </p>
            <div className="mt-2 border-t border-border-default pt-2.5 flex items-start gap-2 text-[12px] text-text-muted font-semibold">
              <HelpCircle size={15} className="shrink-0 text-brand-primary mt-0.5" />
              <span>
                To configure or update your Fast2SMS credentials, update the <code>FAST2SMS_API_KEY</code> secret in your Cloudflare Worker environment.
              </span>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
