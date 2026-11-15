import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, RotateCcw, Save, Send, Smartphone } from "lucide-react";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store/useAppStore";
import type { NotifyChannel, SmsHealth, SmsLog, SmsLogKind, SmsLogProvider, SmsLogStatus } from "../../types";
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
  wa_enabled: boolean;
  wa_base_url: string;
  wa_api_key: string;
  wa_session_id: string;
  email_enabled: boolean;
  appscript_url: string;
  appscript_secret: string;
  notify_channel_order: string;
}

const EMPTY_FORM: FormState = {
  sms_enabled: true,
  smsgate_username: "",
  smsgate_password: "",
  smsgate_device_id: "",
  smsgate_sim_number: "",
  sms_auto_reminder_paused: false,
  wa_enabled: true,
  wa_base_url: "",
  wa_api_key: "",
  wa_session_id: "",
  email_enabled: true,
  appscript_url: "",
  appscript_secret: "",
  notify_channel_order: "whatsapp,sms,email",
};

const DEFAULT_CHANNEL_ORDER = "whatsapp,sms,email";

const CHANNEL_ORDER_PRESETS: { value: string; label: string }[] = [
  { value: DEFAULT_CHANNEL_ORDER, label: "WhatsApp → SMS → Email (recommended)" },
  { value: "sms,whatsapp,email", label: "SMS → WhatsApp → Email" },
  { value: "whatsapp,sms", label: "WhatsApp → SMS (no email)" },
  { value: "sms", label: "SMS only" },
  { value: "whatsapp", label: "WhatsApp only" },
];

const PROVIDER_LABEL: Record<SmsLogProvider, string> = {
  smsgate: "SMS",
  openwa: "WhatsApp",
  appscript: "Email",
};

const SETUP_STEPS = [
  "Keep the gym phone ON, online, and plugged in, with the SMS Gateway app running and logged in to its cloud account.",
  "Enter the SAME cloud username and password from that app in the fields below.",
  "Press Save, then send yourself a test message from the test box below.",
  "If the test arrives from the gym SIM number, everything is working.",
];

export function SmsSettingsPanel({ variant = "light", onSaved }: SmsSettingsPanelProps) {
  const dark = variant === "dark";
  // Connection secrets are developer-only: trainers see status + tests +
  // the reminder pause, never the usernames, passwords, keys, or URLs.
  const trainer = useAppStore((state) => state.trainer);
  const isDeveloper = trainer?.role === "developer";
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [passwordConfigured, setPasswordConfigured] = useState(false);
  const [waKeyConfigured, setWaKeyConfigured] = useState(false);
  const [appscriptSecretConfigured, setAppscriptSecretConfigured] = useState(false);
  const [ready, setReady] = useState<{ sms: boolean; whatsapp: boolean; email: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [testChannel, setTestChannel] = useState<NotifyChannel>("whatsapp");
  const [testTo, setTestTo] = useState("");
  const [testMessage, setTestMessage] = useState("Test message from Fitness World GymOS.");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [health, setHealth] = useState<SmsHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      setHealth(await api.smsHealth());
    } catch (error) {
      setHealthError(error instanceof Error ? error.message : "Unable to check delivery health.");
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      setLogs(await api.smsLogs({ limit: 10 }));
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load(): Promise<void> {
      try {
        const status = await api.smsStatus();
        if (!mounted) return;
        setForm({
          sms_enabled: status.settings.sms_enabled === "true",
          smsgate_username: status.settings.smsgate_username,
          smsgate_password: "",
          smsgate_device_id: status.settings.smsgate_device_id,
          smsgate_sim_number: status.settings.smsgate_sim_number,
          sms_auto_reminder_paused: status.settings.sms_auto_reminder_paused === "true",
          wa_enabled: status.settings.wa_enabled !== "false",
          wa_base_url: status.settings.wa_base_url ?? "",
          wa_api_key: "",
          wa_session_id: status.settings.wa_session_id ?? "",
          email_enabled: status.settings.email_enabled !== "false",
          appscript_url: status.settings.appscript_url ?? "",
          appscript_secret: "",
          notify_channel_order: status.settings.notify_channel_order || "whatsapp,sms,email",
        });
        setPasswordConfigured(status.settings.smsgate_password_configured === true);
        setWaKeyConfigured(status.settings.wa_api_key_configured === true);
        setAppscriptSecretConfigured(status.settings.appscript_secret_configured === true);
        setReady({ sms: status.smsConfigured, whatsapp: status.waConfigured === true, email: status.emailConfigured === true });
      } catch (error) {
        if (!mounted) return;
        setReady({ sms: false, whatsapp: false, email: false });
        setFormMessage({
          tone: "error",
          text: error instanceof Error ? error.message : "Unable to load SMS settings.",
        });
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    void loadHealth();
    void loadLogs();
    return () => {
      mounted = false;
    };
  }, [loadHealth, loadLogs]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setFormMessage(null);
    try {
      // Trainers save the reminder pause only; connection fields stay
      // developer-only on the server too.
      if (!isDeveloper) {
        await api.saveSmsSettings({ sms_auto_reminder_paused: String(form.sms_auto_reminder_paused) });
        setFormMessage({ tone: "success", text: "Reminder setting saved." });
        onSaved?.();
        return;
      }
      if (form.sms_enabled && !form.smsgate_username.trim()) {
        throw new Error("Enter the SMSGate cloud username, or turn SMS off.");
      }
      const password = form.smsgate_password.trim();
      if (form.sms_enabled && !password && !passwordConfigured) {
        throw new Error("Enter the SMSGate cloud password, or turn SMS off.");
      }
      if (form.wa_enabled && (!form.wa_base_url.trim() || !form.wa_session_id.trim())) {
        throw new Error("Enter the OpenWA server URL and session id, or turn WhatsApp off.");
      }
      const waKey = form.wa_api_key.trim();
      if (form.wa_enabled && !waKey && !waKeyConfigured) {
        throw new Error("Enter the OpenWA API key, or turn WhatsApp off.");
      }
      if (form.email_enabled && !form.appscript_url.trim()) {
        throw new Error("Enter the Apps Script mailer URL, or turn Email off.");
      }
      const appscriptSecret = form.appscript_secret.trim();
      if (form.email_enabled && !appscriptSecret && !appscriptSecretConfigured) {
        throw new Error("Enter the Apps Script secret, or turn Email off.");
      }
      await api.saveSmsSettings({
        sms_enabled: String(form.sms_enabled),
        smsgate_username: form.smsgate_username.trim(),
        ...(password ? { smsgate_password: password } : {}),
        smsgate_device_id: form.smsgate_device_id.trim(),
        smsgate_sim_number: form.smsgate_sim_number.trim(),
        sms_auto_reminder_paused: String(form.sms_auto_reminder_paused),
        wa_enabled: String(form.wa_enabled),
        wa_base_url: form.wa_base_url.trim(),
        ...(waKey ? { wa_api_key: waKey } : {}),
        wa_session_id: form.wa_session_id.trim(),
        email_enabled: String(form.email_enabled),
        appscript_url: form.appscript_url.trim(),
        ...(appscriptSecret ? { appscript_secret: appscriptSecret } : {}),
        notify_channel_order: form.notify_channel_order,
      });
      if (password) {
        setPasswordConfigured(true);
      }
      if (waKey) {
        setWaKeyConfigured(true);
      }
      if (appscriptSecret) {
        setAppscriptSecretConfigured(true);
      }
      setForm((current) => ({ ...current, smsgate_password: "", wa_api_key: "", appscript_secret: "" }));
      const status = await api.smsStatus();
      setReady({ sms: status.smsConfigured, whatsapp: status.waConfigured === true, email: status.emailConfigured === true });
      setFormMessage({ tone: "success", text: "Notification settings saved. Send a test below to confirm each channel." });
      onSaved?.();
    } catch (error) {
      setFormMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to save notification settings.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(): Promise<void> {
    setTesting(true);
    setTestResult(null);
    try {
      const channelLabel = testChannel === "whatsapp" ? "WhatsApp" : testChannel === "email" ? "Email" : "SMS";
      let to: string;
      if (testChannel === "email") {
        to = testTo.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
          throw new Error("Enter a valid email address.");
        }
      } else {
        const digits = testTo.replace(/\D/g, "").slice(-10);
        if (digits.length !== 10) {
          throw new Error("Enter a valid 10-digit mobile number.");
        }
        to = digits;
      }
      if (!testMessage.trim()) {
        throw new Error("Enter a test message.");
      }
      const result = await api.notifyTest(testChannel, to, testMessage.trim());
      setTestResult({
        tone: "success",
        text:
          result.status === "sent"
            ? `Test ${channelLabel} accepted.${result.requestId ? ` Request ID: ${result.requestId}` : ""}`
            : `Test ${channelLabel} queued — it will send automatically when the service is back.`,
      });
      void loadLogs();
      onSaved?.();
    } catch (error) {
      setTestResult({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to send test message.",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleRetry(logId: string): Promise<void> {
    setRetryingId(logId);
    try {
      await api.retrySmsLog(logId);
      await loadLogs();
      await loadHealth();
      onSaved?.();
    } catch (error) {
      setTestResult({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to retry this message.",
      });
    } finally {
      setRetryingId(null);
    }
  }

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 py-6 text-[14px] font-semibold", dark ? "text-white/70" : "text-text-secondary")}>
        <Loader2 size={16} className="animate-spin" />
        Loading notification settings...
      </div>
    );
  }

  const readyChannels = ready
    ? [
        ready.whatsapp ? "WhatsApp" : null,
        ready.sms ? "SMS" : null,
        ready.email ? "Email" : null,
      ].filter((entry): entry is string => entry !== null)
    : [];
  const anyReady = readyChannels.length > 0;

  return (
    <div className="grid gap-5">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border p-4",
          anyReady
            ? dark
              ? "border-green-500/20 bg-green-500/10"
              : "border-green-200 bg-green-50"
            : dark
              ? "border-amber-500/20 bg-amber-500/10"
              : "border-amber-200 bg-amber-50",
        )}
      >
        {anyReady ? (
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-green-500" />
        ) : (
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-500" />
        )}
        <div>
          <p className={cn("text-[14px] font-black", dark ? "text-white" : "text-text-primary")}>
            {anyReady ? `Notifications READY (${readyChannels.join(" · ")})` : "NO CHANNEL READY"}
          </p>
          <p className={cn("mt-1 text-[12px] font-semibold leading-relaxed", dark ? "text-white/60" : "text-text-secondary")}>
            {anyReady
              ? "Automatic reminders use the first ready channel below, with fallback. SMS needs the gym phone on and online."
              : "Configure at least one channel below, save, then send a test."}
          </p>
        </div>
      </div>

      <div className={cn("grid gap-3 rounded-xl border p-4", dark ? "border-white/10 bg-white/5" : "border-border-default/60 bg-surface-raised/80")}>
        <div className="flex items-center justify-between gap-3">
          <p className={cn("flex items-center gap-2 text-[14px] font-black", dark ? "text-white" : "text-text-primary")}>
            <Smartphone size={16} />
            Live Delivery Health
          </p>
          <button
            type="button"
            onClick={() => {
              void loadHealth();
              void loadLogs();
            }}
            disabled={healthLoading}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition-colors",
              dark ? "bg-white/10 text-white/80 hover:bg-white/15" : "bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/15",
            )}
          >
            <RefreshCw size={13} className={healthLoading ? "animate-spin" : ""} />
            {healthLoading ? "Checking..." : "Refresh"}
          </button>
        </div>

        {healthError ? (
          <p className={cn("text-[12px] font-bold", dark ? "text-red-300" : "text-status-expired")}>{healthError}</p>
        ) : !health ? (
          <p className={cn("flex items-center gap-2 text-[12px] font-semibold", dark ? "text-white/60" : "text-text-secondary")}>
            <Loader2 size={14} className="animate-spin" />
            Checking cloud, login, and gym phone...
          </p>
        ) : (
          <div className="grid gap-2.5">
            <HealthRow
              dark={dark}
              ok={health.cloud.reachable}
              label="SMSGate cloud"
              detail={health.cloud.reachable ? `Reachable${health.cloud.latencyMs !== null ? ` (${health.cloud.latencyMs} ms)` : ""}` : health.cloud.error || "Unreachable"}
            />
            <HealthRow
              dark={dark}
              ok={health.auth.ok}
              label="Cloud login"
              detail={health.auth.ok ? "Username and password accepted" : health.auth.error || "Not verified"}
            />
            <HealthRow
              dark={dark}
              ok={health.phone.freshness === "online" && !health.phone.error}
              warn={health.phone.freshness === "recent" && !health.phone.error}
              label="Gym phone"
              detail={phoneHealthDetail(health)}
            />
            <HealthRow
              dark={dark}
              ok={(health.whatsapp?.reachable ?? false) && (health.whatsapp?.sessionStatus ?? "") === "ready" && !(health.whatsapp?.error ?? "")}
              label="WhatsApp"
              detail={whatsappHealthDetail(health)}
            />
            <HealthRow
              dark={dark}
              ok={(health.email?.reachable ?? false) && !(health.email?.error ?? "")}
              label="Email"
              detail={emailHealthDetail(health)}
            />
            <HealthRow
              dark={dark}
              ok={health.outbox.queued === 0 && health.outbox.failedLast24h === 0}
              label="Message queue"
              detail={
                !health.outbox.logsReady
                  ? "Delivery history unavailable — apply the latest database migration."
                  : health.outbox.queued === 0 && health.outbox.failedLast24h === 0
                    ? `Clear · ${health.outbox.sentToday + health.outbox.deliveredToday} sent today`
                    : `${health.outbox.queued} waiting · ${health.outbox.failedLast24h} failed in 24h · auto-retry active`
              }
            />
            <HealthRow
              dark={dark}
              ok={health.lastRun.at !== null && health.lastRun.failed === 0}
              warn={health.lastRun.at === null}
              label="Last 9 AM auto-run"
              detail={
                !health.lastRun.at
                  ? "No automatic run yet"
                  : `${new Date(health.lastRun.at).toLocaleString()} · ${health.lastRun.sent} sent · ${health.lastRun.queued} queued · ${health.lastRun.failed} failed · ${health.lastRun.skipped ?? 0} skipped${health.lastRun.error ? ` · ${health.lastRun.error}` : ""}`
              }
            />
          </div>
        )}
      </div>

      {isDeveloper ? (
        <>
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
          label={passwordConfigured ? "SMSGate Cloud Password (saved)" : "SMSGate Cloud Password"}
          variant={variant}
          type="password"
          disabled={!form.sms_enabled}
          value={form.smsgate_password}
          onChange={(event) => setForm((current) => ({ ...current, smsgate_password: event.target.value }))}
          placeholder={passwordConfigured ? "Leave blank to keep saved password" : "Same password as in the phone app"}
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

      <div className={cn("grid gap-3 rounded-xl border p-4", dark ? "border-white/10 bg-white/5" : "border-border-default/60 bg-surface-raised/80")}>
        <label className={cn("flex cursor-pointer items-center justify-between gap-3 text-[14px] font-black", dark ? "text-white" : "text-text-primary")}>
          WhatsApp (OpenWA server)
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 cursor-pointer accent-pink-600"
            checked={form.wa_enabled}
            onChange={(event) => setForm((current) => ({ ...current, wa_enabled: event.target.checked }))}
          />
        </label>
        <p className={cn("-mt-1 text-[12px] font-semibold", dark ? "text-white/60" : "text-text-secondary")}>
          Self-hosted gateway. Needs the OpenWA server running with a paired session (see deployment guide).
        </p>
        <div className="grid gap-4">
          <Input
            label="Server URL"
            variant={variant}
            disabled={!form.wa_enabled}
            value={form.wa_base_url}
            onChange={(event) => setForm((current) => ({ ...current, wa_base_url: event.target.value }))}
            placeholder="https://wa.yourserver.com"
            autoComplete="off"
          />
          <Input
            label={waKeyConfigured ? "API Key (saved)" : "API Key"}
            variant={variant}
            type="password"
            disabled={!form.wa_enabled}
            value={form.wa_api_key}
            onChange={(event) => setForm((current) => ({ ...current, wa_api_key: event.target.value }))}
            placeholder={waKeyConfigured ? "Leave blank to keep saved key" : "Operator key from the OpenWA dashboard"}
            autoComplete="new-password"
          />
          <Input
            label="Session ID"
            variant={variant}
            disabled={!form.wa_enabled}
            value={form.wa_session_id}
            onChange={(event) => setForm((current) => ({ ...current, wa_session_id: event.target.value }))}
            placeholder="e.g. gym"
            autoComplete="off"
          />
        </div>
      </div>

      <div className={cn("grid gap-3 rounded-xl border p-4", dark ? "border-white/10 bg-white/5" : "border-border-default/60 bg-surface-raised/80")}>
        <label className={cn("flex cursor-pointer items-center justify-between gap-3 text-[14px] font-black", dark ? "text-white" : "text-text-primary")}>
          Email (Apps Script mailer)
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 cursor-pointer accent-pink-600"
            checked={form.email_enabled}
            onChange={(event) => setForm((current) => ({ ...current, email_enabled: event.target.checked }))}
          />
        </label>
        <p className={cn("-mt-1 text-[12px] font-semibold", dark ? "text-white/60" : "text-text-secondary")}>
          Deploy appsscript/Code.gs in your Google account, then paste its web-app URL and secret. Only members with an email address receive emails.
        </p>
        <div className="grid gap-4">
          <Input
            label="Apps Script Web-App URL"
            variant={variant}
            disabled={!form.email_enabled}
            value={form.appscript_url}
            onChange={(event) => setForm((current) => ({ ...current, appscript_url: event.target.value }))}
            placeholder="https://script.google.com/.../exec"
            autoComplete="off"
          />
          <Input
            label={appscriptSecretConfigured ? "Secret (saved)" : "Secret"}
            variant={variant}
            type="password"
            disabled={!form.email_enabled}
            value={form.appscript_secret}
            onChange={(event) => setForm((current) => ({ ...current, appscript_secret: event.target.value }))}
            placeholder={appscriptSecretConfigured ? "Leave blank to keep saved secret" : "Same SECRET as in Code.gs"}
            autoComplete="new-password"
          />
        </div>
      </div>

      <label className={cn("grid gap-2 text-[14px] font-bold", dark ? "text-white" : "text-text-primary")}>
        Automatic Reminder Channel Order
        <select
          className={cn(
            "w-full rounded-[var(--radius-card)] px-4 py-3 text-[14px] font-semibold outline-none",
            dark ? "border border-white/10 bg-white/5 text-white" : "studio-input text-text-primary",
          )}
          value={CHANNEL_ORDER_PRESETS.some((preset) => preset.value === form.notify_channel_order) ? form.notify_channel_order : DEFAULT_CHANNEL_ORDER}
          onChange={(event) => setForm((current) => ({ ...current, notify_channel_order: event.target.value }))}
        >
          {CHANNEL_ORDER_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>
        <span className={cn("text-[12px] font-semibold", dark ? "text-white/60" : "text-text-secondary")}>
          First ready channel sends; the rest are automatic fallback.
        </span>
      </label>
        </>
      ) : null}

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
        {saving ? "Saving..." : "Save Notification Settings"}
      </Button>

      <div className={cn("border-t pt-5", dark ? "border-white/10" : "border-border-default/60")}>
        <p className={cn("text-[14px] font-black", dark ? "text-white" : "text-text-primary")}>Send a Test Message</p>
        <p className={cn("mt-1 text-[12px] font-semibold", dark ? "text-white/60" : "text-text-secondary")}>
          Tests one channel at a time. Use your own number or email first.
        </p>
        <div className="mt-4 grid gap-4">
          <label className={cn("grid gap-2 text-[14px] font-bold", dark ? "text-white" : "text-text-primary")}>
            Channel
            <select
              className={cn(
                "w-full rounded-[var(--radius-card)] px-4 py-3 text-[14px] font-semibold outline-none",
                dark ? "border border-white/10 bg-white/5 text-white" : "studio-input text-text-primary",
              )}
              value={testChannel}
              onChange={(event) => setTestChannel(event.target.value as NotifyChannel)}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>
          </label>
          <Input
            label={testChannel === "email" ? "Destination Email" : "Destination Phone (10 digits)"}
            variant={variant}
            value={testTo}
            onChange={(event) => setTestTo(event.target.value)}
            placeholder={testChannel === "email" ? "you@example.com" : "e.g. 9876543210"}
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
            {testing ? "Sending..." : `Send Test ${testChannel === "whatsapp" ? "WhatsApp" : testChannel === "email" ? "Email" : "SMS"}`}
          </Button>
        </div>
      </div>

      <div className={cn("border-t pt-5", dark ? "border-white/10" : "border-border-default/60")}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={cn("flex items-center gap-2 text-[14px] font-black", dark ? "text-white" : "text-text-primary")}>
              <Clock3 size={15} />
              Recent Messages
            </p>
            <p className={cn("mt-1 text-[12px] font-semibold", dark ? "text-white/60" : "text-text-secondary")}>
              Last 10 sends. Queued messages retry automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadLogs()}
            disabled={logsLoading}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition-colors",
              dark ? "bg-white/10 text-white/80 hover:bg-white/15" : "bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/15",
            )}
          >
            <RefreshCw size={13} className={logsLoading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          {logsLoading && logs.length === 0 ? (
            <p className={cn("flex items-center gap-2 py-2 text-[12px] font-semibold", dark ? "text-white/60" : "text-text-secondary")}>
              <Loader2 size={14} className="animate-spin" />
              Loading message history...
            </p>
          ) : logs.length === 0 ? (
            <p className={cn("py-2 text-[12px] font-semibold", dark ? "text-white/60" : "text-text-secondary")}>
              No messages yet. Test and reminder sends will appear here.
            </p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "grid gap-1.5 rounded-xl border p-3",
                  dark ? "border-white/10 bg-white/5" : "border-border-default/60 bg-surface-raised/80",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={cn("text-[13px] font-black", dark ? "text-white" : "text-text-primary")}>
                    {log.memberName ?? log.phone}
                    <span className={cn("ml-2 text-[11px] font-bold", dark ? "text-white/50" : "text-text-muted")}>
                      {PROVIDER_LABEL[log.provider] ?? "SMS"} · {kindLabel(log.kind)} · {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide", statusPillClass(log.status, dark))}>
                    {log.status}
                  </span>
                </div>
                <p className={cn("text-[12px] font-semibold leading-relaxed", dark ? "text-white/70" : "text-text-secondary")}>
                  {log.message.length > 140 ? `${log.message.slice(0, 140)}…` : log.message}
                </p>
                {log.status === "failed" || log.status === "queued" ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={cn("text-[11px] font-bold", dark ? "text-amber-300/90" : "text-amber-700")}>
                      {log.lastError ?? "Waiting for automatic retry"}
                      {log.nextRetryAt ? ` · retries ${new Date(log.nextRetryAt).toLocaleTimeString()}` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRetry(log.id)}
                      disabled={retryingId === log.id}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition-colors disabled:opacity-60",
                        dark ? "bg-white/10 text-white hover:bg-white/15" : "bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/15",
                      )}
                    >
                      {retryingId === log.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                      {retryingId === log.id ? "Retrying..." : "Retry now"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function HealthRow({ dark, ok, warn, label, detail }: { dark: boolean; ok: boolean; warn?: boolean; label: string; detail: string }) {
  const Icon = ok ? CheckCircle2 : warn ? Clock3 : AlertTriangle;
  const iconClass = ok ? "text-green-500" : warn ? "text-amber-500" : "text-red-500";
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={16} className={cn("mt-0.5 shrink-0", iconClass)} />
      <div className="min-w-0">
        <p className={cn("text-[12px] font-black uppercase tracking-wide", dark ? "text-white/80" : "text-text-primary")}>{label}</p>
        <p className={cn("mt-0.5 break-words text-[12px] font-semibold leading-relaxed", dark ? "text-white/60" : "text-text-secondary")}>
          {detail}
        </p>
      </div>
    </div>
  );
}

function whatsappHealthDetail(health: SmsHealth): string {
  const wa = health.whatsapp ?? { enabled: true, configured: false, reachable: false, sessionStatus: "", error: "" };
  if (!wa.enabled) {
    return "Turned off.";
  }
  if (!wa.configured) {
    return "Not configured — enter the OpenWA server URL, API key, and session id below.";
  }
  if (wa.error) {
    return wa.error;
  }
  if (wa.reachable && wa.sessionStatus === "ready") {
    return "Server reachable · session connected · ready.";
  }
  return "Checking…";
}

function emailHealthDetail(health: SmsHealth): string {
  const email = health.email ?? { enabled: true, configured: false, reachable: false, error: "" };
  if (!email.enabled) {
    return "Turned off.";
  }
  if (!email.configured) {
    return "Not configured — deploy the Apps Script mailer and enter its URL and secret below.";
  }
  if (email.error) {
    return email.error;
  }
  if (email.reachable) {
    return "Server reachable · ready (secret is verified on the first send).";
  }
  return "Checking…";
}

function phoneHealthDetail(health: SmsHealth): string {
  if (!health.auth.ok) {
    return "Cannot check the phone until the cloud login works.";
  }
  if (health.phone.error) {
    return `${health.phone.error} — fix the device ID above, every send uses it.`;
  }
  if (health.phone.devices === 0) {
    return "No phone registered on this cloud account. Open the SMS Gateway app on the gym phone and log in.";
  }
  if (!health.phone.matched || health.phone.lastSeenAgeMs === null) {
    return `${health.phone.devices} phone(s) registered · last-seen unknown — send a test SMS to verify.`;
  }
  const age = formatAge(health.phone.lastSeenAgeMs);
  const sims = health.phone.simCards.length > 0
    ? ` · SIM ${health.phone.simCards.map((sim) => sim.simNumber ?? "?").join(", ")}${health.phone.simCards[0]?.carrierName ? ` (${health.phone.simCards[0].carrierName})` : ""}`
    : "";
  if (health.phone.freshness === "online") {
    return `${health.phone.name || "Gym phone"} seen ${age} ago · ready${sims}.`;
  }
  if (health.phone.freshness === "recent") {
    return `${health.phone.name || "Gym phone"} last seen ${age} ago · should still receive messages${sims}.`;
  }
  return `${health.phone.name || "Gym phone"} last seen ${age} ago · open the app on the gym phone and keep it online${sims}.`;
}

function formatAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

function kindLabel(kind: SmsLogKind): string {
  switch (kind) {
    case "manual":
      return "Manual";
    case "reminder_3day":
      return "3-day reminder";
    case "reminder_dueday":
      return "Due-day reminder";
    case "winback":
      return "Win-back";
    case "receipt":
      return "Receipt";
    case "test":
      return "Test";
    case "balance_overdue":
      return "Balance nudge";
  }
}

function statusPillClass(status: SmsLogStatus, dark: boolean): string {
  if (status === "delivered" || status === "sent") {
    return dark ? "bg-green-500/15 text-green-300" : "bg-green-100 text-status-active";
  }
  if (status === "queued") {
    return dark ? "bg-amber-500/15 text-amber-300" : "bg-amber-100 text-amber-700";
  }
  return dark ? "bg-red-500/15 text-red-300" : "bg-red-100 text-status-expired";
}
