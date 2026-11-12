import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Save, Send } from "lucide-react";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface SmsSettingsPanelProps {
  variant?: "light" | "dark";
  onSaved?: () => void;
}

interface FormState {
  sms_enabled: boolean;
  smsgate_username: string;
  smsgate_password: string;
  smsgate_device_id: string;
  smsgate_sim_number: string;
  sms_auto_reminder_paused: boolean;
}

const EMPTY_FORM: FormState = {
  sms_enabled: true,
  smsgate_username: "",
  smsgate_password: "",
  smsgate_device_id: "",
  smsgate_sim_number: "",
  sms_auto_reminder_paused: false,
};

const SETUP_STEPS = [
  "Keep the gym phone ON, online, and plugged in, with the SMS Gateway app running and logged in to its cloud account.",
  "Enter the SAME cloud username and password from that app in the fields below.",
  "Press Save, then send yourself a test message from the test box below.",
  "If the test arrives from the gym SIM number, everything is working.",
];

export function SmsSettingsPanel({ variant = "light", onSaved }: SmsSettingsPanelProps) {
  const dark = variant === "dark";
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Test SMS from Fitness World GymOS.");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load(): Promise<void> {
      try {
        const status = await api.smsStatus();
        if (!mounted) return;
        setForm({
          sms_enabled: status.settings.sms_enabled === "true",
          smsgate_username: status.settings.smsgate_username,
          smsgate_password: status.settings.smsgate_password,
          smsgate_device_id: status.settings.smsgate_device_id,
          smsgate_sim_number: status.settings.smsgate_sim_number,
          sms_auto_reminder_paused: status.settings.sms_auto_reminder_paused === "true",
        });
        setReady(status.smsConfigured);
      } catch (error) {
        if (!mounted) return;
        setReady(false);
        setFormMessage({
          tone: "error",
          text: error instanceof Error ? error.message : "Unable to load SMS settings.",
        });
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setFormMessage(null);
    try {
      if (form.sms_enabled && (!form.smsgate_username.trim() || !form.smsgate_password.trim())) {
        throw new Error("Enter the SMSGate cloud username and password, or turn SMS off.");
      }
      await api.saveSmsSettings({
        sms_enabled: String(form.sms_enabled),
        smsgate_username: form.smsgate_username.trim(),
        smsgate_password: form.smsgate_password.trim(),
        smsgate_device_id: form.smsgate_device_id.trim(),
        smsgate_sim_number: form.smsgate_sim_number.trim(),
        sms_auto_reminder_paused: String(form.sms_auto_reminder_paused),
      });
      const status = await api.smsStatus();
      setReady(status.smsConfigured);
      setFormMessage({ tone: "success", text: "SMS settings saved. Send a test below to confirm." });
      onSaved?.();
    } catch (error) {
      setFormMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to save SMS settings.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(): Promise<void> {
    setTesting(true);
    setTestResult(null);
    try {
      const digits = testPhone.replace(/\D/g, "").slice(-10);
      if (digits.length !== 10) {
        throw new Error("Enter a valid 10-digit mobile number.");
      }
      if (!testMessage.trim()) {
        throw new Error("Enter a test message.");
      }
      const result = await api.testSms(digits, testMessage.trim());
      setTestResult({
        tone: "success",
        text: `Test SMS sent from the gym phone. Request ID: ${result.requestId}`,
      });
      onSaved?.();
    } catch (error) {
      setTestResult({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to send test SMS.",
      });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 py-6 text-[14px] font-semibold", dark ? "text-white/70" : "text-text-secondary")}>
        <Loader2 size={16} className="animate-spin" />
        Loading SMS settings...
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border p-4",
          ready
            ? dark
              ? "border-green-500/20 bg-green-500/10"
              : "border-green-200 bg-green-50"
            : dark
              ? "border-amber-500/20 bg-amber-500/10"
              : "border-amber-200 bg-amber-50",
        )}
      >
        {ready ? (
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-green-500" />
        ) : (
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-500" />
        )}
        <div>
          <p className={cn("text-[14px] font-black", dark ? "text-white" : "text-text-primary")}>
            {ready ? "SMS is READY" : "SMS is NOT READY"}
          </p>
          <p className={cn("mt-1 text-[12px] font-semibold leading-relaxed", dark ? "text-white/60" : "text-text-secondary")}>
            {ready
              ? "Messages go out from the gym phone's SIM. Keep that phone on and online."
              : "Enter the gym phone's SMSGate cloud username and password below, save, then send a test."}
          </p>
        </div>
      </div>

      <ol className={cn("grid gap-2 rounded-xl border p-4", dark ? "border-white/10 bg-white/5" : "border-border-default/60 bg-surface-raised/80")}>
        {SETUP_STEPS.map((step, index) => (
          <li key={step} className="flex items-start gap-2.5">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black",
                dark ? "bg-brand-primary text-white" : "bg-brand-primary/10 text-brand-primary",
              )}
            >
              {index + 1}
            </span>
            <span className={cn("text-[12px] font-semibold leading-relaxed", dark ? "text-white/70" : "text-text-secondary")}>{step}</span>
          </li>
        ))}
      </ol>

      <label className={cn("flex cursor-pointer items-center justify-between gap-3 text-[14px] font-bold", dark ? "text-white" : "text-text-primary")}>
        SMS Sending Enabled
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 cursor-pointer accent-pink-600"
          checked={form.sms_enabled}
          onChange={(event) => setForm((current) => ({ ...current, sms_enabled: event.target.checked }))}
        />
      </label>

      <div className="grid gap-4">
        <Input
          label="SMSGate Cloud Username"
          variant={variant}
          disabled={!form.sms_enabled}
          value={form.smsgate_username}
          onChange={(event) => setForm((current) => ({ ...current, smsgate_username: event.target.value }))}
          placeholder="Same username as in the phone app"
          autoComplete="off"
        />
        <Input
          label="SMSGate Cloud Password"
          variant={variant}
          type="password"
          disabled={!form.sms_enabled}
          value={form.smsgate_password}
          onChange={(event) => setForm((current) => ({ ...current, smsgate_password: event.target.value }))}
          placeholder="Same password as in the phone app"
          autoComplete="new-password"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Device ID (optional)"
            variant={variant}
            disabled={!form.sms_enabled}
            value={form.smsgate_device_id}
            onChange={(event) => setForm((current) => ({ ...current, smsgate_device_id: event.target.value }))}
            placeholder="Pin to one phone"
            autoComplete="off"
          />
          <Input
            label="SIM Number (optional)"
            variant={variant}
            disabled={!form.sms_enabled}
            value={form.smsgate_sim_number}
            onChange={(event) => setForm((current) => ({ ...current, smsgate_sim_number: event.target.value }))}
            placeholder="1"
            autoComplete="off"
          />
        </div>
      </div>

      <label className={cn("flex cursor-pointer items-center justify-between gap-3 text-[14px] font-bold", dark ? "text-white" : "text-text-primary")}>
        Pause Automatic 9 AM Reminders
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 cursor-pointer accent-amber-500"
          disabled={!form.sms_enabled}
          checked={form.sms_auto_reminder_paused}
          onChange={(event) => setForm((current) => ({ ...current, sms_auto_reminder_paused: event.target.checked }))}
        />
      </label>

      {formMessage ? (
        <p
          className={cn(
            "rounded-xl border p-3 text-[13px] font-bold",
            formMessage.tone === "success"
              ? dark
                ? "border-green-500/20 bg-green-500/10 text-green-300"
                : "border-green-200 bg-green-50 text-status-active"
              : dark
                ? "border-red-500/20 bg-red-500/10 text-red-300"
                : "border-red-200 bg-red-50 text-status-expired",
          )}
        >
          {formMessage.text}
        </p>
      ) : null}

      <Button onClick={() => void handleSave()} disabled={saving} className="w-full font-bold">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {saving ? "Saving..." : "Save SMS Settings"}
      </Button>

      <div className={cn("border-t pt-5", dark ? "border-white/10" : "border-border-default/60")}>
        <p className={cn("text-[14px] font-black", dark ? "text-white" : "text-text-primary")}>Send a Test SMS</p>
        <p className={cn("mt-1 text-[12px] font-semibold", dark ? "text-white/60" : "text-text-secondary")}>
          Sends from the gym phone to any number. Use your own number first.
        </p>
        <div className="mt-4 grid gap-4">
          <Input
            label="Destination Phone (10 digits)"
            variant={variant}
            value={testPhone}
            onChange={(event) => setTestPhone(event.target.value)}
            placeholder="e.g. 9876543210"
            autoComplete="off"
          />
          <label className={cn("grid gap-2 text-[15px] font-semibold", dark ? "text-white/80" : "text-text-primary")}>
            Test Message
            <textarea
              rows={2}
              value={testMessage}
              onChange={(event) => setTestMessage(event.target.value)}
              placeholder="Enter test message..."
              className={cn(
                "w-full rounded-[var(--radius-card)] px-4 py-3 text-[14px] font-normal outline-none transition-all duration-200",
                dark
                  ? "border border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-brand-primary focus:bg-white/10"
                  : "studio-input text-text-primary placeholder:text-text-muted",
              )}
            />
          </label>
          {testResult ? (
            <p
              className={cn(
                "rounded-xl border p-3 text-[13px] font-bold",
                testResult.tone === "success"
                  ? dark
                    ? "border-green-500/20 bg-green-500/10 text-green-300"
                    : "border-green-200 bg-green-50 text-status-active"
                  : dark
                    ? "border-red-500/20 bg-red-500/10 text-red-300"
                    : "border-red-200 bg-red-50 text-status-expired",
              )}
            >
              {testResult.text}
            </p>
          ) : null}
          <Button onClick={() => void handleTest()} disabled={testing} variant="secondary" className="w-full font-bold">
            {testing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {testing ? "Sending..." : "Send Test SMS"}
          </Button>
        </div>
      </div>
    </div>
  );
}
