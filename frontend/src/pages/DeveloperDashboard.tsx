import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Save, ShieldCheck, Trash2, UserPlus, Wrench, Terminal, Cpu, Database, RefreshCw, MessageCircle, Maximize2, Minimize2 } from "lucide-react";
import { motion } from "motion/react";
import { SettingsModal } from "../components/layout/SettingsModal";
import { Toast } from "../components/layout/Toast";
import { TopBar } from "../components/layout/TopBar";
import { Button } from "../components/ui/Button";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { Input } from "../components/ui/Input";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { accountCreateSchema, accountUpdateSchema } from "../lib/validations";
import { useAppStore } from "../store/useAppStore";
import type { DeveloperDiagnostics, TrainerAccount, LogEntry } from "../types";

type AccountRole = "developer" | "trainer";

export function DeveloperDashboard() {
  const { signOut } = useAuth();
  const trainer = useAppStore((state) => state.trainer);
  const toast = useAppStore((state) => state.toast);
  const pushToast = useAppStore((state) => state.pushToast);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DeveloperDiagnostics | null>(null);
  const [accounts, setAccounts] = useState<TrainerAccount[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [dbLatency, setDbLatency] = useState<number | null>(null);
  const [dbSleepStatus, setDbSleepStatus] = useState<string>("unknown");
  const [deleteAccount, setDeleteAccount] = useState<TrainerAccount | null>(null);
  const [createForm, setCreateForm] = useState<{ email: string; name: string; role: AccountRole; password: string }>({ email: "", name: "", role: "trainer", password: "" });
  const [editForms, setEditForms] = useState<Record<string, { email: string; name: string; role: AccountRole; password: string }>>({});
  const [settingsForm, setSettingsForm] = useState<{
    sms_enabled: boolean;
    whatsapp_enabled: boolean;
    whatsapp_provider: "none" | "ultramsg" | "self_hosted";
    whatsapp_gateway_url: string;
    whatsapp_gateway_token: string;
    whatsapp_instance_id: string;
    whatsapp_token: string;
    fast2sms_api_key: string;
    db_keep_alive_enabled: boolean;
    sms_auto_reminder_paused: boolean;
    whatsapp_auto_reminder_paused: boolean;
  }>({
    sms_enabled: true,
    whatsapp_enabled: true,
    whatsapp_provider: "none",
    whatsapp_gateway_url: "",
    whatsapp_gateway_token: "",
    whatsapp_instance_id: "",
    whatsapp_token: "",
    fast2sms_api_key: "",
    db_keep_alive_enabled: false,
    sms_auto_reminder_paused: false,
    whatsapp_auto_reminder_paused: false,
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // WhatsApp Gateway states
  const [gatewayStatus, setGatewayStatus] = useState<string>("checking");
  const [gatewayUrl, setGatewayUrl] = useState<string>("");
  const [loadingGateway, setLoadingGateway] = useState<boolean>(false);
  const [resettingGateway, setResettingGateway] = useState<boolean>(false);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [qrZoom, setQrZoom] = useState<number>(0.8);
  const [isQrExpanded, setIsQrExpanded] = useState<boolean>(false);

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

  // Playground Sandbox state
  const [testType, setTestType] = useState<"sms" | "whatsapp">("sms");
  const [testPhone, setTestPhone] = useState<string>("");
  const [testMessage, setTestMessage] = useState<string>("Hello from GymOS Developer Playground!");
  const [testingNotification, setTestingNotification] = useState<boolean>(false);

  const statusItems = useMemo(() => {
    if (!diagnostics) return [];
    return [
      { label: "API", ok: diagnostics.api === "ok", value: diagnostics.api.toUpperCase() },
      { label: "Supabase", ok: diagnostics.supabase === "ok", value: diagnostics.supabase.toUpperCase() },
      { label: "Isolation", ok: diagnostics.memberOwnershipReady, value: diagnostics.memberOwnershipReady ? "READY" : "CHECK" },
      { label: "SMS", ok: diagnostics.smsConfigured, value: diagnostics.smsConfigured ? "READY" : "MISSING" },
      { label: "WhatsApp", ok: Boolean(diagnostics.whatsAppConfigured), value: diagnostics.whatsAppConfigured ? "READY" : "MISSING" },
    ];
  }, [diagnostics]);

  useEffect(() => {
    void loadDeveloperData();
    void handlePingDb();
    void fetchGatewayStatus();
  }, []);

  if (!trainer) return null;

  async function loadDeveloperData(): Promise<void> {
    setLoading(true);
    try {
      const [nextDiagnostics, nextAccounts, nextLogs] = await Promise.all([
        api.developerDiagnostics(),
        api.trainerAccounts(),
        api.developerLogs(),
      ]);
      setDiagnostics(nextDiagnostics);
      if (nextDiagnostics.settings) {
        setSettingsForm({
          sms_enabled: nextDiagnostics.settings.sms_enabled === "true",
          whatsapp_enabled: nextDiagnostics.settings.whatsapp_enabled === "true",
          whatsapp_provider: nextDiagnostics.settings.whatsapp_provider,
          whatsapp_gateway_url: nextDiagnostics.settings.whatsapp_gateway_url,
          whatsapp_gateway_token: nextDiagnostics.settings.whatsapp_gateway_token,
          whatsapp_instance_id: nextDiagnostics.settings.whatsapp_instance_id,
          whatsapp_token: nextDiagnostics.settings.whatsapp_token,
          fast2sms_api_key: nextDiagnostics.settings.fast2sms_api_key,
          db_keep_alive_enabled: nextDiagnostics.settings.db_keep_alive_enabled === "true",
          sms_auto_reminder_paused: nextDiagnostics.settings.sms_auto_reminder_paused === "true",
          whatsapp_auto_reminder_paused: nextDiagnostics.settings.whatsapp_auto_reminder_paused === "true",
        });
      }
      setAccounts(nextAccounts);
      setLogs(nextLogs);
      setEditForms(
        Object.fromEntries(
          nextAccounts.map((account) => [
            account.id,
            {
              email: account.email,
              name: account.name,
              role: account.role,
              password: "",
            },
          ]),
        ),
      );
      void fetchGatewayStatus();
    } catch (error) {
      pushToast({
        title: "Developer check failed",
        message: error instanceof Error ? error.message : "Unable to load developer diagnostics.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handlePingDb(): Promise<void> {
    setPinging(true);
    try {
      const result = await api.pingDb();
      setDbLatency(result.latency);
      setDbSleepStatus(result.latency > 1500 ? "cold-started" : "active");
      
      // Refresh diagnostics if latency was recorded
      const [nextDiag, nextLogs] = await Promise.all([api.developerDiagnostics(), api.developerLogs()]);
      setDiagnostics(nextDiag);
      setLogs(nextLogs);
    } catch (error) {
      setDbSleepStatus("error");
      pushToast({
        title: "Database connection failed",
        message: error instanceof Error ? error.message : "Unable to reach database",
        tone: "error",
      });
    } finally {
      setPinging(false);
    }
  }

  async function runExpiryFix(): Promise<void> {
    setFixing(true);
    try {
      const result = await api.runDeveloperFix("expire-members");
      pushToast({
        title: "Fix completed",
        message: `${result.changed} member records updated.`,
        tone: "success",
      });
      await loadDeveloperData();
    } catch (error) {
      pushToast({
        title: "Fix failed",
        message: error instanceof Error ? error.message : "Unable to run maintenance fix.",
        tone: "error",
      });
    } finally {
      setFixing(false);
    }
  }

  async function runSmsReminderFix(): Promise<void> {
    setSmsSending(true);
    try {
      const result = await api.runDeveloperFix("send-sms-reminder");
      pushToast({
        title: "SMS check completed",
        message: `${result.sent ?? 0} SMS reminders sent.`,
        tone: "success",
      });
      await loadDeveloperData();
    } catch (error) {
      pushToast({
        title: "SMS check failed",
        message: error instanceof Error ? error.message : "Unable to run SMS check.",
        tone: "error",
      });
    } finally {
      setSmsSending(false);
    }
  }

  async function handleSaveSettings(): Promise<void> {
    setSavingSettings(true);
    try {
      await api.saveSystemSettings({
        sms_enabled: String(settingsForm.sms_enabled),
        whatsapp_enabled: String(settingsForm.whatsapp_enabled),
        whatsapp_provider: settingsForm.whatsapp_provider,
        whatsapp_gateway_url: settingsForm.whatsapp_gateway_url,
        whatsapp_gateway_token: settingsForm.whatsapp_gateway_token,
        whatsapp_instance_id: settingsForm.whatsapp_instance_id,
        whatsapp_token: settingsForm.whatsapp_token,
        fast2sms_api_key: settingsForm.fast2sms_api_key,
        db_keep_alive_enabled: String(settingsForm.db_keep_alive_enabled),
        sms_auto_reminder_paused: String(settingsForm.sms_auto_reminder_paused),
        whatsapp_auto_reminder_paused: String(settingsForm.whatsapp_auto_reminder_paused),
      });
      pushToast({
        title: "Settings Saved",
        message: "System notifications settings saved successfully.",
        tone: "success",
      });
      await loadDeveloperData();
    } catch (error) {
      pushToast({
        title: "Save Failed",
        message: error instanceof Error ? error.message : "Unable to save system settings.",
        tone: "error",
      });
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSendTestNotification(): Promise<void> {
    if (!testPhone) {
      pushToast({
        title: "Validation Error",
        message: "Please enter a destination phone number.",
        tone: "error",
      });
      return;
    }
    setTestingNotification(true);
    try {
      const res = await api.testNotification(testType, testPhone, testMessage);
      pushToast({
        title: "Test Sent",
        message: `Notification dispatch triggered successfully. Request ID: ${res.requestId}`,
        tone: "success",
      });
      await loadDeveloperData();
    } catch (error) {
      pushToast({
        title: "Test Dispatch Failed",
        message: error instanceof Error ? error.message : "Notification test dispatch failed.",
        tone: "error",
      });
    } finally {
      setTestingNotification(false);
    }
  }

  async function createAccount(): Promise<void> {
    const parsed = accountCreateSchema.safeParse(createForm);
    if (!parsed.success) {
      pushToast({ title: "Account check failed", message: parsed.error.issues[0]?.message ?? "Check account details.", tone: "error" });
      return;
    }
    try {
      await api.createTrainerAccount(parsed.data);
      setCreateForm({ email: "", name: "", role: "trainer", password: "" });
      pushToast({ title: "Account created", message: parsed.data.email, tone: "success" });
      await loadDeveloperData();
    } catch (error) {
      pushToast({ title: "Create failed", message: error instanceof Error ? error.message : "Unable to create account.", tone: "error" });
    }
  }

  async function saveAccount(account: TrainerAccount): Promise<void> {
    const form = editForms[account.id] ?? { email: account.email, name: account.name, role: account.role, password: "" };
    const parsed = accountUpdateSchema.safeParse(form);
    if (!parsed.success) {
      pushToast({ title: "Account check failed", message: parsed.error.issues[0]?.message ?? "Check account details.", tone: "error" });
      return;
    }
    try {
      const password = parsed.data.password || undefined;
      await api.updateTrainerAccount(account.id, {
        email: parsed.data.email,
        name: parsed.data.name,
        role: parsed.data.role,
        password,
      });
      pushToast({ title: "Account saved", message: parsed.data.email, tone: "success" });
      await loadDeveloperData();
    } catch (error) {
      pushToast({ title: "Save failed", message: error instanceof Error ? error.message : "Unable to save account.", tone: "error" });
    }
  }

  async function confirmDeleteAccount(): Promise<void> {
    if (!deleteAccount) return;
    try {
      await api.deleteTrainerAccount(deleteAccount.id);
      pushToast({ title: "Account deleted", message: deleteAccount.email, tone: "info" });
      setDeleteAccount(null);
      await loadDeveloperData();
    } catch (error) {
      pushToast({ title: "Delete failed", message: error instanceof Error ? error.message : "Unable to delete account.", tone: "error" });
    }
  }

  return (
    <>
      <TopBar trainer={trainer} onLogout={() => void signOut()} onSettings={() => setSettingsOpen(true)} />
      <main className="ink-panel min-h-screen relative overflow-hidden">
        {/* Glowing grids */}
        <div className="absolute inset-0 future-grid pointer-events-none opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#090A16]/60 via-transparent to-[#060813]/90 pointer-events-none" />

        <div className="mx-auto grid max-w-[1500px] gap-6 px-4 pb-24 pt-6 lg:px-8 relative z-10">
          {/* System Health Overview */}
          <motion.section
            className="neon-panel rounded-[var(--radius-panel)] p-6 lg:p-8"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-black uppercase tracking-wider text-brand-primary">System Dashboard</p>
                <h1 className="mt-2 text-[28px] font-black leading-tight text-white lg:text-[40px] bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent">
                  GymOS System Health
                </h1>
              </div>
              <Button
                onClick={() => void loadDeveloperData()}
                disabled={loading}
                variant="secondary"
                className="bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20 shadow-sm transition-all duration-300"
              >
                {loading ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
                Refresh Status
              </Button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {statusItems.map((item) => (
                <StatusCard key={item.label} {...item} />
              ))}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <IssueCard label="Unassigned Members" value={diagnostics?.orphanMembers ?? 0} ok={(diagnostics?.orphanMembers ?? 0) === 0} />
              <IssueCard label="Expired Active Members" value={diagnostics?.expiredActiveMembers ?? 0} ok={(diagnostics?.expiredActiveMembers ?? 0) === 0} />
              <IssueCard label="Managed Accounts" value={diagnostics?.accounts.total ?? accounts.length} ok={accounts.length > 0} />
              <IssueCard label="Total Members" value={diagnostics?.totalMembers ?? 0} ok={true} />
              <IssueCard label="Total Attendance Visits" value={diagnostics?.totalAttendance ?? 0} ok={true} />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button
                onClick={() => void runExpiryFix()}
                disabled={fixing}
                className="bg-gradient-to-r from-brand-primary to-[#F0447D] text-white hover:opacity-95 font-bold shadow-[0_12px_32px_rgba(232,23,93,0.3)] hover:shadow-[0_16px_40px_rgba(232,23,93,0.4)]"
              >
                {fixing ? <Loader2 size={17} className="animate-spin" /> : <Wrench size={17} />}
                Run Expiry Fix
              </Button>

              <Button
                onClick={() => void runSmsReminderFix()}
                disabled={smsSending}
                variant="secondary"
                className="bg-white/5 border border-white/10 text-green-400 hover:bg-white/10 hover:border-white/20 shadow-sm font-bold flex items-center gap-2"
              >
                {smsSending ? <Loader2 size={17} className="animate-spin" /> : <MessageCircle size={17} />}
                Run SMS Check
              </Button>

              <Button
                onClick={() => void handlePingDb()}
                disabled={pinging}
                variant="secondary"
                className="bg-white/5 border border-white/10 text-[#38BDF8] hover:bg-white/10 hover:border-white/20 shadow-sm font-bold flex items-center gap-2"
              >
                {pinging ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
                Ping & Wake Database
              </Button>

              {dbLatency !== null && (
                <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 border border-white/10">
                  <Database size={15} className="text-[#38BDF8]" />
                  <span className="text-[13px] font-mono text-white/80">
                    DB Latency: <strong className="text-white">{dbLatency}ms</strong>
                  </span>
                  <span className={`h-1.5 w-1.5 rounded-full ${dbSleepStatus === "active" ? "bg-green-400" : "bg-amber-400"}`} />
                  <span className="text-[11px] font-bold text-white/60 uppercase">
                    {dbSleepStatus === "active" ? "Active" : dbSleepStatus === "cold-started" ? "Waking Cold Start" : dbSleepStatus}
                  </span>
                </div>
              )}
            </div>
          </motion.section>

          {/* System Configuration & Gateways Panel */}
          <motion.section
            className="neon-panel rounded-[var(--radius-panel)] p-6 lg:p-8"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
          >
            <div className="flex items-center gap-2.5">
              <Cpu size={20} className="text-brand-primary" />
              <h2 className="text-[18px] font-black text-white">Alert Gateways & Feature Toggles</h2>
            </div>
            <p className="mt-1 text-[13px] font-semibold text-text-secondary">
              Dynamically switch messaging gates, turn alerts ON/OFF, and configure self-hosted/cloud gateways in real-time.
            </p>

            <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* SMS Config Card */}
              <div className="rounded-[var(--radius-card)] border border-white/5 bg-white/5 p-5">
                <div className="flex items-center justify-between">
                  <span className="block text-[15px] font-black text-white">SMS Notifications (Fast2SMS)</span>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={settingsForm.sms_enabled}
                      onChange={(e) => setSettingsForm((form) => ({ ...form, sms_enabled: e.target.checked }))}
                    />
                    <div className="peer h-6 w-11 rounded-full bg-slate-800 border border-white/10 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-slate-400 after:transition-all after:content-[''] peer-checked:bg-brand-primary peer-checked:after:translate-x-full peer-checked:after:bg-white peer-focus:outline-none" />
                  </label>
                </div>
                <p className="mt-1.5 text-[12px] font-semibold leading-normal text-text-secondary">
                  Enable or disable automated text reminders. Requires active Fast2SMS API key.
                </p>

                <div className="mt-4">
                  <Input
                    label="Fast2SMS API Key"
                    variant="dark"
                    type="password"
                    disabled={!settingsForm.sms_enabled}
                    value={settingsForm.fast2sms_api_key}
                    onChange={(e) => setSettingsForm((form) => ({ ...form, fast2sms_api_key: e.target.value }))}
                    placeholder="Enter Fast2SMS API key"
                  />
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                  <span className="text-[13px] font-semibold text-white/80">Pause Auto Reminders</span>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      disabled={!settingsForm.sms_enabled}
                      checked={settingsForm.sms_auto_reminder_paused}
                      onChange={(e) => setSettingsForm((form) => ({ ...form, sms_auto_reminder_paused: e.target.checked }))}
                    />
                    <div className="peer h-5 w-9 rounded-full bg-slate-800 border border-white/10 after:absolute after:top-[2px] after:left-[2px] after:h-3.5 after:w-3.5 after:rounded-full after:bg-slate-400 after:transition-all after:content-[''] peer-checked:bg-amber-500 peer-checked:after:translate-x-full peer-checked:after:bg-white peer-focus:outline-none" />
                  </label>
                </div>
              </div>

              {/* WhatsApp Config Card */}
              <div className="rounded-[var(--radius-card)] border border-white/5 bg-white/5 p-5">
                <div className="flex items-center justify-between">
                  <span className="block text-[15px] font-black text-white">WhatsApp Alert Service</span>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={settingsForm.whatsapp_enabled}
                      onChange={(e) => setSettingsForm((form) => ({ ...form, whatsapp_enabled: e.target.checked }))}
                    />
                    <div className="peer h-6 w-11 rounded-full bg-slate-800 border border-white/10 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-slate-400 after:transition-all after:content-[''] peer-checked:bg-green-500 peer-checked:after:translate-x-full peer-checked:after:bg-white peer-focus:outline-none" />
                  </label>
                </div>
                <p className="mt-1.5 text-[12px] font-semibold leading-normal text-text-secondary">
                  Configure dynamic chat reminders. Supports UltraMsg API cloud provider or self-hosted gateway.
                </p>

                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2 text-[14px] font-semibold text-white/80">
                    WhatsApp Gateway Provider
                    <select
                      disabled={!settingsForm.whatsapp_enabled}
                      className="focus-ring w-full rounded-[var(--radius-card)] border border-white/10 bg-[#080913]/40 px-4 py-2.5 text-[14px] font-normal text-white focus:border-brand-primary focus:bg-[#101426] disabled:opacity-50"
                      value={settingsForm.whatsapp_provider}
                      onChange={(e) => setSettingsForm((form) => ({ ...form, whatsapp_provider: e.target.value as any }))}
                    >
                      <option value="none" className="bg-[#101426] text-white">Disabled / None</option>
                      <option value="self_hosted" className="bg-[#101426] text-white">GymOS Self-Hosted (Render / local)</option>
                      <option value="ultramsg" className="bg-[#101426] text-white">UltraMsg Cloud Service</option>
                    </select>
                  </label>

                  {settingsForm.whatsapp_provider === "self_hosted" && (
                    <div className="grid gap-3 pt-1">
                      <Input
                        label="Gateway URL"
                        variant="dark"
                        disabled={!settingsForm.whatsapp_enabled}
                        value={settingsForm.whatsapp_gateway_url}
                        onChange={(e) => setSettingsForm((form) => ({ ...form, whatsapp_gateway_url: e.target.value }))}
                        placeholder="https://gymos-whatsapp-gateway.onrender.com"
                      />
                      <Input
                        label="Gateway Access Token"
                        variant="dark"
                        type="password"
                        disabled={!settingsForm.whatsapp_enabled}
                        value={settingsForm.whatsapp_gateway_token}
                        onChange={(e) => setSettingsForm((form) => ({ ...form, whatsapp_gateway_token: e.target.value }))}
                        placeholder="Bearer token configured in Render variables"
                      />
                    </div>
                  )}

                  {settingsForm.whatsapp_provider === "ultramsg" && (
                    <div className="grid gap-3 pt-1">
                      <Input
                        label="UltraMsg Instance ID"
                        variant="dark"
                        disabled={!settingsForm.whatsapp_enabled}
                        value={settingsForm.whatsapp_instance_id}
                        onChange={(e) => setSettingsForm((form) => ({ ...form, whatsapp_instance_id: e.target.value }))}
                        placeholder="instanceXXXXXX"
                      />
                      <Input
                        label="UltraMsg Token"
                        variant="dark"
                        type="password"
                        disabled={!settingsForm.whatsapp_enabled}
                        value={settingsForm.whatsapp_token}
                        onChange={(e) => setSettingsForm((form) => ({ ...form, whatsapp_token: e.target.value }))}
                        placeholder="Instance authentication token"
                      />
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                  <span className="text-[13px] font-semibold text-white/80">Pause Auto Reminders</span>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      disabled={!settingsForm.whatsapp_enabled}
                      checked={settingsForm.whatsapp_auto_reminder_paused}
                      onChange={(e) => setSettingsForm((form) => ({ ...form, whatsapp_auto_reminder_paused: e.target.checked }))}
                    />
                    <div className="peer h-5 w-9 rounded-full bg-slate-800 border border-white/10 after:absolute after:top-[2px] after:left-[2px] after:h-3.5 after:w-3.5 after:rounded-full after:bg-slate-400 after:transition-all after:content-[''] peer-checked:bg-amber-500 peer-checked:after:translate-x-full peer-checked:after:bg-white peer-focus:outline-none" />
                  </label>
                </div>
              </div>

              {/* Database Keep-Alive Card */}
              <div className="rounded-[var(--radius-card)] border border-white/5 bg-white/5 p-5">
                <div className="flex items-center justify-between">
                  <span className="block text-[15px] font-black text-white">DB Sleep Preventer (Keep-Alive)</span>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={settingsForm.db_keep_alive_enabled}
                      onChange={(e) => setSettingsForm((form) => ({ ...form, db_keep_alive_enabled: e.target.checked }))}
                    />
                    <div className="peer h-6 w-11 rounded-full bg-slate-800 border border-white/10 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-slate-400 after:transition-all after:content-[''] peer-checked:bg-[#38BDF8] peer-checked:after:translate-x-full peer-checked:after:bg-white peer-focus:outline-none" />
                  </label>
                </div>
                <p className="mt-1.5 text-[12px] font-semibold leading-normal text-text-secondary">
                  Automatically query Supabase every 30 minutes. Prevents database from entering inactivity pause/sleep mode.
                </p>
                <div className="mt-6 flex items-center justify-center p-4 border border-dashed border-white/10 rounded-lg bg-[#080913]/30">
                  <div className="text-center">
                    <Database size={24} className={`mx-auto ${settingsForm.db_keep_alive_enabled ? "text-[#38BDF8] animate-pulse" : "text-white/30"}`} />
                    <span className="mt-2 block text-[11px] font-bold uppercase tracking-wider text-white/50">
                      Auto-Ping: {settingsForm.db_keep_alive_enabled ? "Active Loop" : "Deactivated"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => void handleSaveSettings()}
                disabled={savingSettings}
                className="bg-[#38BDF8] text-black hover:bg-[#38BDF8]/90 font-bold px-6 py-2.5 flex items-center gap-2 shadow-[0_12px_24px_rgba(56,189,248,0.2)]"
              >
                {savingSettings ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
                Save Configurations
              </Button>
            </div>
          </motion.section>

          {/* Gateway Playground, DB Performance & WhatsApp Gateway Section */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Gateway Testing Sandbox */}
            <motion.section
              className="neon-panel rounded-[var(--radius-panel)] p-6"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 }}
            >
              <div className="flex items-center gap-2.5">
                <Terminal size={20} className="text-brand-primary" />
                <h2 className="text-[18px] font-black text-white">Gateway Playground</h2>
              </div>
              <p className="mt-1 text-[13px] font-semibold text-text-secondary">
                Dispatch manual test SMS or WhatsApp alerts to check gateway credentials instantly.
              </p>

              <div className="mt-5 grid gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTestType("sms")}
                    className={`rounded-lg border px-4 py-3 text-[13px] font-bold transition-all duration-300 ${
                      testType === "sms"
                        ? "bg-brand-primary/10 border-brand-primary text-brand-primary-light"
                        : "bg-white/5 border-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    SMS (Fast2SMS)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestType("whatsapp")}
                    className={`rounded-lg border px-4 py-3 text-[13px] font-bold transition-all duration-300 ${
                      testType === "whatsapp"
                        ? "bg-green-500/10 border-green-500 text-green-400"
                        : "bg-white/5 border-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    WhatsApp Alert
                  </button>
                </div>

                <Input
                  label="Destination Phone (with country code for WhatsApp)"
                  variant="dark"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="e.g. 919876543210"
                />

                <label className="grid gap-2 text-[14px] font-semibold text-white/80">
                  Test Message
                  <textarea
                    rows={3}
                    className="focus-ring w-full rounded-[var(--radius-card)] border border-white/10 bg-[#080913]/40 px-4 py-3 text-[14px] font-normal text-white focus:border-brand-primary focus:bg-[#101426]"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    placeholder="Enter test alert message content..."
                  />
                </label>

                <Button
                  onClick={() => void handleSendTestNotification()}
                  disabled={testingNotification}
                  variant="secondary"
                  className="w-full bg-gradient-to-r from-[#38BDF8] to-[#0369A1] text-black font-bold shadow-[0_12px_32px_rgba(56,189,248,0.2)]"
                >
                  {testingNotification ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
                  Send Test Notification
                </Button>
              </div>
            </motion.section>

            {/* DB Health Speedometer */}
            <motion.section
              className="neon-panel rounded-[var(--radius-panel)] p-6"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.09 }}
            >
              <div className="flex items-center gap-2.5">
                <Database size={20} className="text-[#38BDF8]" />
                <h2 className="text-[18px] font-black text-white">Database Performance</h2>
              </div>
              <p className="mt-1 text-[13px] font-semibold text-text-secondary">
                Real-time query performance latency diagnostics and waking state indexes.
              </p>

              <div className="mt-6 flex flex-col items-center justify-center">
                {/* Visual Latency Ring */}
                <div className="relative flex items-center justify-center h-32 w-32 rounded-full border-4 border-white/5 bg-[#080913]/40 shadow-inner">
                  {/* Gauge indicator */}
                  <div className={`absolute inset-1 rounded-full border-4 border-dashed animate-[spin_10s_linear_infinite] ${
                    dbLatency === null ? "border-slate-600" : dbLatency < 150 ? "border-green-500" : dbLatency < 600 ? "border-yellow-500" : "border-red-500"
                  }`} />
                  <div className="text-center z-10">
                    <span className="block text-[24px] font-black text-white font-mono">
                      {dbLatency !== null ? `${dbLatency}ms` : "N/A"}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Latency</span>
                  </div>
                </div>

                <div className="mt-6 w-full space-y-3">
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-[12px] font-bold text-white/50">Performance Status</span>
                    <span className={`text-[12px] font-black uppercase ${
                      dbLatency === null ? "text-slate-400" : dbLatency < 150 ? "text-green-400" : dbLatency < 600 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {dbLatency === null ? "Not Verified" : dbLatency < 150 ? "Optimal (Hot)" : dbLatency < 600 ? "Moderate" : "Slow (Cold Start)"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-[12px] font-bold text-white/50">Keep-Alive Status</span>
                    <span className={`text-[12px] font-black uppercase ${settingsForm.db_keep_alive_enabled ? "text-[#38BDF8]" : "text-white/40"}`}>
                      {settingsForm.db_keep_alive_enabled ? "Automatic 30m Ping" : "Disabled"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[12px] font-bold text-white/50">Instance Wake State</span>
                    <span className={`text-[12px] font-black uppercase ${dbSleepStatus === "active" ? "text-green-400" : "text-amber-400"}`}>
                      {dbSleepStatus}
                    </span>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* WhatsApp Gateway Live Session */}
            <motion.section
              className="neon-panel rounded-[var(--radius-panel)] p-6 flex flex-col justify-between"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1 }}
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <MessageCircle size={20} className="text-[#22C55E]" />
                  <h2 className="text-[18px] font-black text-white">WhatsApp Live Gateway</h2>
                </div>
                <p className="mt-1 text-[13px] font-semibold text-text-secondary">
                  Scan QR or manage connection state for the active self-hosted gateway.
                </p>

                {gatewayStatus === "unavailable" ? (
                  <div className="mt-6 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center text-red-400 text-[12px] font-bold leading-relaxed flex flex-col items-center gap-2">
                    <span>WhatsApp Gateway is offline or not configured as "GymOS Self-Hosted".</span>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 text-[11px] font-bold bg-white/5 border border-white/10 text-white hover:bg-white/10 mt-1"
                      onClick={() => void fetchGatewayStatus()}
                      disabled={loadingGateway}
                    >
                      {loadingGateway ? <Loader2 size={12} className="animate-spin mr-1.5 inline-block" /> : null}
                      Retry / Check Status
                    </Button>
                  </div>
                ) : (
                  <div className="mt-6 grid gap-4 items-center justify-center text-center">
                    {gatewayUrl && (
                      <div className="flex flex-col items-center">
                        <div className="relative border border-white/10 rounded-xl overflow-hidden bg-white shadow-[0_0_20px_rgba(0,0,0,0.3)] mx-auto mb-2" style={{ width: '200px', height: '220px' }}>
                          <iframe
                            key={iframeKey}
                            src={gatewayUrl}
                            title="WhatsApp QR Scanner Developer"
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
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/80 hover:bg-black/95 text-white/90 hover:text-white transition-all shadow-md hover:scale-105 cursor-pointer z-10 border border-white/10"
                            title="Maximize QR Code"
                          >
                            <Maximize2 size={13} />
                          </button>
                        </div>
                        <div className="flex flex-col items-center gap-1.5 mb-3 w-full max-w-[200px]">
                          <div className="flex items-center justify-between w-full text-[10px] font-bold text-white/60">
                            <span>Zoom:</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setQrZoom(prev => Math.max(0.4, Number((prev - 0.05).toFixed(2))))}
                                className="w-4 h-4 flex items-center justify-center rounded border border-white/10 bg-white/5 hover:bg-white/10 active:bg-white/20 transition-all font-black text-white cursor-pointer"
                                title="Zoom Out"
                              >
                                －
                              </button>
                              <span className="min-w-[24px] text-center font-extrabold text-white">
                                {Math.round(qrZoom * 100)}%
                              </span>
                              <button
                                type="button"
                                onClick={() => setQrZoom(prev => Math.min(1.2, Number((prev + 0.05).toFixed(2))))}
                                className="w-4 h-4 flex items-center justify-center rounded border border-white/10 bg-white/5 hover:bg-white/10 active:bg-white/20 transition-all font-black text-white cursor-pointer"
                                title="Zoom In"
                              >
                                ＋
                              </button>
                              <button
                                type="button"
                                onClick={() => setQrZoom(0.8)}
                                className="px-1 py-0.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 active:bg-white/20 text-[8px] font-bold text-white/40 hover:text-white transition-all ml-0.5 cursor-pointer"
                              >
                                Reset
                              </button>
                            </div>
                          </div>
                          <input
                            type="range"
                            min="0.4"
                            max="1.2"
                            step="0.05"
                            value={qrZoom}
                            onChange={(e) => setQrZoom(Number(e.target.value))}
                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-white/60">Status:</span>
                        <span className={`text-[11px] font-black uppercase tracking-wider border rounded-full px-2.5 py-0.5 ${
                          gatewayStatus === "connected" 
                            ? "bg-green-500/10 border-green-500/20 text-green-400" 
                            : "bg-amber-500/10 border-amber-200/20 text-amber-400"
                        }`}>
                          {gatewayStatus}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-2 justify-center">
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-8 text-[11px] font-bold bg-white/5 border border-white/10 text-white hover:bg-white/10"
                          onClick={() => {
                            setIframeKey(prev => prev + 1);
                            void fetchGatewayStatus();
                          }}
                          disabled={loadingGateway || resettingGateway}
                        >
                          {loadingGateway ? <Loader2 size={12} className="animate-spin" /> : "Refresh"}
                        </Button>

                        {gatewayUrl && (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              className="h-8 text-[11px] font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20"
                              onClick={() => {
                                setQrZoom(1.0);
                                setIsQrExpanded(true);
                              }}
                            >
                              <Maximize2 size={12} className="mr-1 inline-block" />
                              Maximize
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              className="h-8 text-[11px] font-bold bg-white/5 border border-white/10 text-[#38BDF8] hover:bg-white/10"
                              onClick={() => window.open(gatewayUrl, "_blank")}
                            >
                              Open in New Tab
                            </Button>
                          </>
                        )}
                        
                        <Button
                          type="button"
                          variant="danger"
                          className="h-8 text-[11px] font-bold"
                          onClick={handleResetGateway}
                          disabled={loadingGateway || resettingGateway}
                        >
                          {resettingGateway ? "Disconnecting..." : "Disconnect"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.section>
          </div>

          {/* Live System Logs Console */}
          <motion.section
            className="neon-panel rounded-[var(--radius-panel)] p-6"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Terminal size={20} className="text-[#38BDF8]" />
                <h2 className="text-[18px] font-black text-white">Live System Logs</h2>
              </div>
              <Button
                onClick={() => void loadDeveloperData()}
                variant="ghost"
                className="!h-9 !min-h-0 bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] text-white/80 font-bold uppercase py-1 px-3"
              >
                Refresh Buffer
              </Button>
            </div>
            
            <div className="mt-4 overflow-hidden rounded-lg border border-white/5 bg-[#080913] p-4 shadow-inner">
              <div className="scrollbar-soft h-64 overflow-y-auto font-mono text-[12px] leading-relaxed text-slate-300">
                {logs.length === 0 ? (
                  <p className="text-slate-500 italic">No system logs in this isolate session yet. Perform actions to generate logs.</p>
                ) : (
                  <div className="grid gap-2">
                    {logs.map((log, index) => {
                      const levelColors = {
                        info: "text-green-400",
                        warn: "text-amber-400",
                        error: "text-red-400",
                      };
                      return (
                        <div key={index} className="flex flex-col border-b border-white/5 pb-2 last:border-0 hover:bg-white/5 px-2 py-1 rounded transition-colors">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-slate-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                            <span className={`font-bold uppercase ${levelColors[log.level]}`}>[{log.level}]</span>
                            <span className="text-white font-semibold">{log.event}</span>
                            {log.message && <span className="text-red-300 ml-1">({log.message})</span>}
                          </div>
                          {log.details && Object.keys(log.details).length > 0 && (
                            <pre className="mt-1 text-[11px] text-slate-400 overflow-x-auto whitespace-pre-wrap pl-6 border-l border-white/5">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.section>

          {/* Action Sections */}
          <section className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
            {/* Create Account Panel */}
            <div className="neon-panel rounded-[var(--radius-panel)] p-6">
              <h2 className="text-[18px] font-black text-white">Create Account</h2>
              <div className="mt-5 grid gap-4">
                <Input
                  label="Email"
                  variant="dark"
                  value={createForm.email}
                  onChange={(event) => setCreateForm((form) => ({ ...form, email: event.target.value }))}
                  placeholder="trainer@fitnessworld.in"
                />
                <Input
                  label="Display Name"
                  variant="dark"
                  value={createForm.name}
                  onChange={(event) => setCreateForm((form) => ({ ...form, name: event.target.value }))}
                  placeholder="Trainer name"
                />
                <label className="grid gap-2 text-[15px] font-semibold text-white/80">
                  Role
                  <select
                    className="focus-ring w-full rounded-[var(--radius-card)] border border-white/10 bg-white/5 px-4 py-3 text-[15px] font-normal text-white focus:border-brand-primary focus:bg-[#101426]"
                    value={createForm.role}
                    onChange={(event) => setCreateForm((form) => ({ ...form, role: event.target.value as "developer" | "trainer" }))}
                  >
                    <option value="trainer" className="bg-[#101426] text-white">Trainer</option>
                    <option value="developer" className="bg-[#101426] text-white">Developer</option>
                  </select>
                </label>
                <Input
                  label="Temporary Password"
                  variant="dark"
                  type="password"
                  value={createForm.password}
                  onChange={(event) => setCreateForm((form) => ({ ...form, password: event.target.value }))}
                  placeholder="At least 12 characters"
                />
                <Button
                  onClick={() => void createAccount()}
                  className="w-full bg-gradient-to-r from-brand-primary to-[#F0447D] text-white font-bold"
                >
                  <UserPlus size={17} />
                  Create Account
                </Button>
              </div>
            </div>

            {/* Account Manager List */}
            <div className="neon-panel rounded-[var(--radius-panel)] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[18px] font-black text-white">Account Manager</h2>
                <span className="rounded-full bg-white/10 border border-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white/70">
                  {accounts.length} accounts
                </span>
              </div>
              <div className="mt-5 grid gap-4 max-h-[600px] overflow-y-auto scrollbar-soft pr-1">
                {accounts.map((account) => {
                  const form = editForms[account.id] ?? { email: account.email, name: account.name, role: account.role, password: "" };
                  return (
                    <div
                      key={account.id}
                      className="rounded-[var(--radius-card)] border border-white/5 bg-white/5 hover:bg-white/8 hover:border-white/10 transition-all duration-300 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[16px] font-black text-white">{account.email}</p>
                          <p className="mt-0.5 flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${account.confirmed ? "bg-green-400" : "bg-amber-400"}`} />
                            <span className={`text-[12px] font-semibold tracking-wider ${
                              account.currentUser ? "text-brand-primary-light" : account.confirmed ? "text-green-400/80" : "text-amber-400/80"
                            }`}>
                              {account.currentUser ? "Current Account" : account.confirmed ? "Confirmed Account" : "Unconfirmed"}
                            </span>
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider border ${
                            account.role === "developer"
                              ? "bg-brand-primary/10 border-brand-primary/20 text-brand-primary-light"
                              : "bg-green-500/10 border-green-500/20 text-green-400"
                          }`}
                        >
                          {account.role}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_120px_minmax(0,1fr)_auto_auto] lg:items-end">
                        <Input
                          label="Email"
                          variant="dark"
                          value={form.email}
                          onChange={(e) => setEditForms((f) => ({ ...f, [account.id]: { ...form, email: e.target.value } }))}
                        />
                        <Input
                          label="Name"
                          variant="dark"
                          value={form.name}
                          onChange={(e) => setEditForms((f) => ({ ...f, [account.id]: { ...form, name: e.target.value } }))}
                        />
                        <label className="grid gap-2 text-[15px] font-semibold text-white/80">
                          Role
                          <select
                            className="focus-ring w-full rounded-[var(--radius-card)] border border-white/10 bg-white/5 px-4 py-3 text-[15px] font-normal text-white focus:border-brand-primary focus:bg-[#101426]"
                            value={form.role}
                            onChange={(e) => setEditForms((f) => ({ ...f, [account.id]: { ...form, role: e.target.value as "developer" | "trainer" } }))}
                          >
                            <option value="trainer" className="bg-[#101426] text-white">Trainer</option>
                            <option value="developer" className="bg-[#101426] text-white">Developer</option>
                          </select>
                        </label>
                        <Input
                          label="New Password"
                          variant="dark"
                          type="password"
                          value={form.password}
                          onChange={(e) => setEditForms((f) => ({ ...f, [account.id]: { ...form, password: e.target.value } }))}
                          placeholder="Optional"
                        />
                        <Button
                          variant="secondary"
                          onClick={() => void saveAccount(account)}
                          className="w-full lg:w-auto bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20 transition-all duration-300"
                        >
                          <Save size={16} />
                          Save
                        </Button>
                        <Button
                          variant="danger"
                          disabled={account.currentUser}
                          onClick={() => setDeleteAccount(account)}
                          className="w-full lg:w-auto"
                        >
                          <Trash2 size={16} />
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </main>

      <SettingsModal open={settingsOpen} trainer={trainer} onClose={() => setSettingsOpen(false)} />
      <ConfirmModal
        open={deleteAccount !== null}
        title="Delete Account"
        message={`Delete ${deleteAccount?.email ?? "this account"}? This removes login access.`}
        confirmText="Delete"
        onConfirm={() => void confirmDeleteAccount()}
        onClose={() => setDeleteAccount(null)}
      />

      {/* Full-Screen QR Lightbox Overlay */}
      {isQrExpanded && gatewayUrl && (
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
                    onClick={() => setQrZoom(prev => Math.max(0.4, Number((prev - 0.05).toFixed(2))))}
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
                min="0.4"
                max="1.5"
                step="0.05"
                value={qrZoom}
                onChange={(e) => setQrZoom(Number(e.target.value))}
                className="w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-blue-500"
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
                  className="flex-1 bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 cursor-pointer text-[12px] font-bold"
                  onClick={() => setIsQrExpanded(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </>
  );
}

function StatusCard({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <div className="holo-card rounded-[var(--radius-card)] p-4 hover:border-white/20 transition-all duration-300 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-black uppercase tracking-wider text-white/50">{label}</p>
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-green-500 animate-pulse shadow-[0_0_10px_#22c55e]" : "bg-amber-500 animate-pulse shadow-[0_0_10px_#f59e0b]"}`} />
          <Icon size={16} className={ok ? "text-green-400" : "text-amber-400"} />
        </span>
      </div>
      <p className="mt-3 font-mono text-[24px] font-black text-white">{value}</p>
    </div>
  );
}

function IssueCard({ label, value, ok }: { label: string; value: number; ok: boolean }) {
  return (
    <div className="holo-card rounded-[var(--radius-card)] p-4 hover:border-white/20 transition-all duration-300 hover:-translate-y-0.5">
      <p className="text-[12px] font-black uppercase tracking-wider text-white/50">{label}</p>
      <div className="mt-3 flex items-baseline justify-between">
        <p className={`font-mono text-[28px] font-black ${ok ? "text-green-400" : "text-amber-400"}`}>{value}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${ok ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"}`}>
          {ok ? "Healthy" : "Attention"}
        </span>
      </div>
    </div>
  );
}
