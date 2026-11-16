import { useEffect, useMemo, useReducer, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Save, ShieldCheck, Trash2, UserPlus, Wrench, Terminal, Cpu, Database, RefreshCw, MessageCircle, Clock3 } from "lucide-react";
import { motion } from "motion/react";
import { SmsSettingsPanel } from "../components/sms/SmsSettingsPanel";
import { SettingsModal } from "../components/layout/SettingsModal";
import { ToastStack } from "../components/layout/Toast";
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

const AUTO_REFRESH_MS = 30_000;
const PANEL = "rounded-[var(--radius-panel)] border border-white/10 bg-[#0C0E1D] p-6 lg:p-8";
const DARK_BTN = "bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20 disabled:opacity-50 font-semibold";
const FIELD = "focus-ring w-full rounded-[var(--radius-card)] border border-white/10 bg-[#080913]/60 px-4 py-3 text-[14px] font-semibold text-white focus:border-brand-primary";

interface AttentionItem {
  id: string;
  message: string;
  critical: boolean;
}

function buildAttentionList(d: DeveloperDiagnostics | null): AttentionItem[] {
  if (!d) return [];
  const items: AttentionItem[] = [];
  if (d.supabase !== "ok") items.push({ id: "db", message: "Database is unreachable.", critical: true });
  if (!d.smsConfigured) items.push({ id: "sms", message: "SMS is not configured.", critical: true });
  else if (!d.smsgateConfigured) items.push({ id: "smsgate", message: "SMSGate login is missing.", critical: true });
  if (d.orphanMembers > 0) items.push({ id: "orphan", message: `${d.orphanMembers} member${d.orphanMembers === 1 ? " has" : "s have"} no owner.`, critical: false });
  if (d.expiredActiveMembers > 0) items.push({ id: "expired", message: `${d.expiredActiveMembers} active member${d.expiredActiveMembers === 1 ? " is" : "s are"} past due.`, critical: false });
  if ((d.sms?.queued ?? 0) > 0) items.push({ id: "queued", message: `${d.sms?.queued} message${d.sms?.queued === 1 ? "" : "s"} waiting in the queue.`, critical: false });
  if ((d.sms?.failedLast24h ?? 0) > 0) items.push({ id: "failed", message: `${d.sms?.failedLast24h} SMS failed in the last 24 hours.`, critical: false });
  if ((d.sms?.lastRunFailed ?? 0) > 0) items.push({ id: "lastrun", message: `Last auto-run had ${d.sms?.lastRunFailed} failure${d.sms?.lastRunFailed === 1 ? "" : "s"}.`, critical: false });
  if (d.sms && !d.sms.logsReady) items.push({ id: "logs", message: "SMS history table is missing. Run the migrations.", critical: false });
  if (d.sms?.lastRunError) items.push({ id: "runerror", message: `Last auto-run error: ${d.sms.lastRunError}`, critical: false });
  return items;
}

function Freshness({ at, auto }: { at: Date | null; auto: boolean }) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const id = window.setInterval(force, 5000);
    return () => window.clearInterval(id);
  }, []);
  if (!at) return <span className="text-[12px] font-semibold text-white/40">Not loaded yet</span>;
  const seconds = Math.max(0, Math.round((Date.now() - at.getTime()) / 1000));
  const ago = seconds < 5 ? "just now" : seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/40">
      <Clock3 size={13} />
      Updated {ago}{auto ? " · auto-refresh on" : ""}
    </span>
  );
}

function DarkSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="grid gap-2.5" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded-full bg-white/10" style={{ width: `${100 - i * 18}%` }} />
      ))}
    </div>
  );
}

export function DeveloperDashboard() {
  const { signOut } = useAuth();
  const trainer = useAppStore((state) => state.trainer);
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
  const [dbPingAt, setDbPingAt] = useState<Date | null>(null);
  const [dbSleepStatus, setDbSleepStatus] = useState<string>("unknown");
  const [deleteAccount, setDeleteAccount] = useState<TrainerAccount | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [createForm, setCreateForm] = useState<{ email: string; name: string; role: AccountRole; password: string }>({ email: "", name: "", role: "trainer", password: "" });
  const [editForms, setEditForms] = useState<Record<string, { email: string; name: string; role: AccountRole; password: string }>>({});
  const [settingsForm, setSettingsForm] = useState<{ db_keep_alive_enabled: boolean }>({ db_keep_alive_enabled: false });
  const [savingSettings, setSavingSettings] = useState(false);

  const services = useMemo(() => {
    if (!diagnostics) return [];
    return [
      { label: "API", ok: diagnostics.api === "ok", state: diagnostics.api === "ok" ? "Up" : "Down" },
      { label: "Database", ok: diagnostics.supabase === "ok", state: diagnostics.supabase === "ok" ? "Up" : "Down" },
      { label: "SMS", ok: diagnostics.smsConfigured, state: diagnostics.smsConfigured ? "Ready" : "Missing" },
      { label: "SMSGate", ok: diagnostics.smsgateConfigured, state: diagnostics.smsgateConfigured ? "Ready" : "Missing" },
      { label: "Isolation", ok: diagnostics.memberOwnershipReady, state: diagnostics.memberOwnershipReady ? "Ready" : "Check" },
    ];
  }, [diagnostics]);

  const attention = useMemo(() => buildAttentionList(diagnostics), [diagnostics]);
  const allOk = services.length > 0 && services.every((s) => s.ok) && attention.length === 0;

  useEffect(() => {
    void loadDeveloperData();
    void handlePingDb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadDeveloperData(true);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  if (!trainer) return null;

  async function loadDeveloperData(quiet = false): Promise<void> {
    if (!quiet) setLoading(true);
    try {
      const [nextDiagnostics, nextAccounts, nextLogs] = await Promise.all([
        api.developerDiagnostics(),
        api.trainerAccounts(),
        api.developerLogs(),
      ]);
      setDiagnostics(nextDiagnostics);
      if (nextDiagnostics.settings) {
        setSettingsForm({
          db_keep_alive_enabled: nextDiagnostics.settings.db_keep_alive_enabled === "true",
        });
      }
      setAccounts(nextAccounts);
      setLogs(nextLogs);
      setLastRefresh(new Date());
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
    } catch (error) {
      if (!quiet) {
        pushToast({
          title: "Developer check failed",
          message: error instanceof Error ? error.message : "Unable to load developer diagnostics.",
          tone: "error",
        });
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  async function handlePingDb(): Promise<void> {
    setPinging(true);
    try {
      const result = await api.pingDb();
      setDbLatency(result.latency);
      setDbPingAt(new Date());
      setDbSleepStatus(result.latency > 1500 ? "cold-started" : "active");

      // Refresh diagnostics if latency was recorded
      const [nextDiag, nextLogs] = await Promise.all([api.developerDiagnostics(), api.developerLogs()]);
      setDiagnostics(nextDiag);
      setLogs(nextLogs);
      setLastRefresh(new Date());
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
      const failed = result.failed ?? 0;
      const queued = result.queued ?? 0;
      pushToast({
        title: "SMS check completed",
        message: `${result.sent ?? 0} sent · ${queued} queued · ${failed} failed.`,
        tone: failed > 0 ? "error" : "success",
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
        db_keep_alive_enabled: String(settingsForm.db_keep_alive_enabled),
      });
      pushToast({
        title: "Settings Saved",
        message: "Database keep-alive setting saved successfully.",
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

  const smsSentToday = (diagnostics?.sms?.sentToday ?? 0) + (diagnostics?.sms?.deliveredToday ?? 0);

  return (
    <>
      <TopBar trainer={trainer} onLogout={() => void signOut()} onSettings={() => setSettingsOpen(true)} tone="dark" searchEnabled={false} />
      <main className="min-h-screen bg-[#070912] text-white">
        <div className="mx-auto grid max-w-[1500px] gap-6 px-4 pb-24 pt-6 lg:px-8">
          {/* Status overview */}
          <motion.section
            className={PANEL}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-wider text-brand-primary">System Dashboard</p>
                <h1 className="mt-1 text-[26px] font-extrabold leading-tight text-white lg:text-[34px]">
                  GymOS System Health
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Freshness at={lastRefresh} auto={autoRefresh} />
                  <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-white/40">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-[#E8175D]"
                      checked={autoRefresh}
                      onChange={(e) => setAutoRefresh(e.target.checked)}
                    />
                    Auto-refresh every 30s
                  </label>
                </div>
              </div>
              <Button
                onClick={() => void loadDeveloperData()}
                disabled={loading}
                variant="secondary"
                className={DARK_BTN}
              >
                {loading ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
                Refresh Status
              </Button>
            </div>

            {loading && !diagnostics ? (
              <div className="mt-6"><DarkSkeleton lines={4} /></div>
            ) : (
              <>
                <ul className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-3 border-y border-white/10 py-4" aria-label="Service status">
                  {services.map((item) => (
                    <li key={item.label} className="flex items-center gap-2.5">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${item.ok ? "bg-green-500" : "bg-amber-500"}`} aria-hidden="true" />
                      <span className="text-[13px] font-bold text-white/60">{item.label}</span>
                      <span className={`text-[13px] font-extrabold ${item.ok ? "text-white" : "text-amber-400"}`}>{item.state}</span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2.5">
                    <Database size={15} className="text-white/40" aria-hidden="true" />
                    <span className="text-[13px] font-bold text-white/60">DB latency</span>
                    <span className="font-mono text-[13px] font-extrabold text-white">
                      {pinging ? "…" : dbLatency !== null ? `${dbLatency}ms` : "—"}
                    </span>
                  </li>
                </ul>

                {allOk ? (
                  <p className="mt-4 flex items-center gap-2 text-[14px] font-semibold text-white/60">
                    <CheckCircle2 size={17} className="text-green-400" aria-hidden="true" />
                    All clear. Nothing needs you.
                  </p>
                ) : attention.length > 0 ? (
                  <div className="mt-4 grid gap-2">
                    {attention.map((item) => (
                      <p key={item.id} className="flex items-center gap-2.5 text-[14px] font-semibold text-white/85">
                        <AlertTriangle size={17} className={item.critical ? "shrink-0 text-red-400" : "shrink-0 text-amber-400"} aria-hidden="true" />
                        {item.message}
                      </p>
                    ))}
                  </div>
                ) : null}

                <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
                  <KeyNumber label="Members" value={diagnostics?.totalMembers ?? 0} />
                  <KeyNumber label="SMS sent today" value={smsSentToday} />
                  <KeyNumber
                    label="Logins"
                    value={diagnostics?.accounts.total ?? accounts.length}
                    hint={diagnostics ? `${diagnostics.accounts.developers} dev · ${diagnostics.accounts.trainers} trainer` : undefined}
                  />
                  <KeyNumber label="Visits logged" value={diagnostics?.totalAttendance ?? 0} />
                </dl>
              </>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void runExpiryFix()}
                disabled={fixing}
                className="bg-gradient-to-r from-brand-primary to-[#F0447D] font-bold text-white hover:opacity-95 disabled:opacity-50"
              >
                {fixing ? <Loader2 size={17} className="animate-spin" /> : <Wrench size={17} />}
                Run Expiry Fix
              </Button>
              <Button
                onClick={() => void runSmsReminderFix()}
                disabled={smsSending}
                variant="secondary"
                className={DARK_BTN}
              >
                {smsSending ? <Loader2 size={17} className="animate-spin" /> : <MessageCircle size={17} />}
                Run SMS Check
              </Button>
              <Button
                onClick={() => void handlePingDb()}
                disabled={pinging}
                variant="secondary"
                className={DARK_BTN}
              >
                {pinging ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
                Ping Database
              </Button>
            </div>
          </motion.section>

          {/* Messaging & database */}
          <motion.section
            className={PANEL}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
          >
            <div className="flex items-center gap-2.5">
              <Cpu size={20} className="text-brand-primary" aria-hidden="true" />
              <h2 className="text-[18px] font-extrabold text-white">Messaging & Database</h2>
            </div>
            <p className="mt-1 text-[13px] font-semibold text-white/50">
              Same SMS setup trainers see in Settings, plus database controls.
            </p>

            <div className="mt-6">
              <SmsSettingsPanel variant="dark" onSaved={() => void loadDeveloperData()} />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-white/10 bg-white/5 p-5">
              <div className="flex items-center gap-3">
                <Database size={20} className={settingsForm.db_keep_alive_enabled ? "text-[#38BDF8]" : "text-white/30"} aria-hidden="true" />
                <div>
                  <p className="text-[15px] font-bold text-white">Database keep-alive</p>
                  <p className="text-[12px] font-semibold text-white/50">
                    Pings Supabase every 10 minutes so it never sleeps. Currently {settingsForm.db_keep_alive_enabled ? "on" : "off"}.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={settingsForm.db_keep_alive_enabled}
                  aria-label="Database keep-alive"
                  onClick={() => setSettingsForm((form) => ({ ...form, db_keep_alive_enabled: !form.db_keep_alive_enabled }))}
                  className={`focus-ring relative h-8 w-14 shrink-0 rounded-full border transition-colors ${
                    settingsForm.db_keep_alive_enabled ? "border-[#38BDF8] bg-[#38BDF8]" : "border-white/15 bg-slate-800"
                  }`}
                >
                  <span
                    className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow transition-all ${
                      settingsForm.db_keep_alive_enabled ? "left-[calc(100%-1.75rem)]" : "left-1"
                    }`}
                  />
                </button>
                <span className={`w-8 text-[13px] font-extrabold uppercase ${settingsForm.db_keep_alive_enabled ? "text-[#38BDF8]" : "text-white/40"}`}>
                  {settingsForm.db_keep_alive_enabled ? "On" : "Off"}
                </span>
                <Button
                  onClick={() => void handleSaveSettings()}
                  disabled={savingSettings}
                  variant="secondary"
                  className={DARK_BTN}
                >
                  {savingSettings ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
                  Save
                </Button>
              </div>
            </div>
          </motion.section>

          {/* Database ping. SMS testing for developers lives in the
              Messaging section above (SMS-only test box). The old member
              picker is gone on purpose: developers are blocked from gym
              member data by design, so it could never load. */}
          <motion.section
              className={PANEL}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 }}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <Database size={20} className="text-[#38BDF8]" aria-hidden="true" />
                    <h2 className="text-[18px] font-extrabold text-white">Database</h2>
                  </div>
                  <p className="mt-1 text-[13px] font-semibold text-white/50">
                    Last measured query time. Ping again for a fresh sample.
                  </p>
                </div>
                <Button
                  onClick={() => void handlePingDb()}
                  disabled={pinging}
                  variant="secondary"
                  className={DARK_BTN}
                >
                  {pinging ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
                  Ping Again
                </Button>
              </div>

              <div className="mt-6 flex items-center gap-5">
                <p className="font-mono text-[44px] font-extrabold leading-none text-white">
                  {dbLatency !== null ? dbLatency : "—"}
                  <span className="ml-1 text-[16px] font-bold text-white/40">ms</span>
                </p>
                <div className="grid gap-1">
                  <p className={`text-[13px] font-extrabold uppercase ${dbLatency === null ? "text-white/40" : dbLatency < 600 ? "text-green-400" : "text-amber-400"}`}>
                    {dbLatency === null ? "No ping yet" : dbLatency < 150 ? "Fast" : dbLatency < 600 ? "Okay" : "Slow"}
                  </p>
                  <p className="text-[12px] font-semibold text-white/40">
                    {dbPingAt ? `Last ping ${formatAgo(dbPingAt)}` : "Ping to measure"}
                    {" · "}{dbSleepStatus === "active" ? "Active" : dbSleepStatus === "cold-started" ? "Cold start" : dbSleepStatus}
                  </p>
                </div>
              </div>

            </motion.section>

          {/* Worker events */}
          <motion.section
            className={PANEL}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5">
                  <Terminal size={20} className="text-[#38BDF8]" aria-hidden="true" />
                  <h2 className="text-[18px] font-extrabold text-white">Worker Events</h2>
                </div>
                <p className="mt-1 text-[13px] font-semibold text-white/50">
                  Recent events from this server session. The buffer resets often, so it is usually short.
                </p>
              </div>
              <Button
                onClick={() => void api.developerLogs().then(setLogs).catch(() => setLogs([]))}
                variant="ghost"
                className="!h-9 !min-h-0 bg-white/5 hover:bg-white/10 border border-white/10 text-[12px] text-white/80 font-bold uppercase py-1 px-3"
              >
                Refresh
              </Button>
            </div>

            <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-white/10 bg-[#080913] p-4">
              <div className="scrollbar-soft h-64 overflow-y-auto font-mono text-[12px] leading-relaxed text-slate-300">
                {logs.length === 0 ? (
                  <p className="italic text-slate-500">No events in this session yet. Actions you take will appear here.</p>
                ) : (
                  <div className="grid gap-2">
                    {logs.map((log, index) => {
                      const levelColors = {
                        info: "text-green-400",
                        warn: "text-amber-400",
                        error: "text-red-400",
                      };
                      return (
                        <div key={index} className="flex flex-col rounded border-b border-white/5 px-2 py-1 pb-2 transition-colors last:border-0 hover:bg-white/5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-slate-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                            <span className={`font-bold uppercase ${levelColors[log.level]}`}>[{log.level}]</span>
                            <span className="font-semibold text-white">{log.event}</span>
                            {log.message && <span className="ml-1 text-red-300">({log.message})</span>}
                          </div>
                          {log.details && Object.keys(log.details).length > 0 && (
                            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap border-l border-white/10 pl-3 text-[11px] text-slate-400">
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

          {/* Accounts */}
          <section className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
            <div className={PANEL}>
              <h2 className="text-[18px] font-extrabold text-white">Create Account</h2>
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
                    className={FIELD}
                    value={createForm.role}
                    onChange={(event) => setCreateForm((form) => ({ ...form, role: event.target.value as AccountRole }))}
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
                  className="w-full bg-gradient-to-r from-brand-primary to-[#F0447D] font-bold text-white"
                >
                  <UserPlus size={17} />
                  Create Account
                </Button>
              </div>
            </div>

            <div className={PANEL}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[18px] font-extrabold text-white">Account Manager</h2>
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/70">
                  {accounts.length} accounts
                </span>
              </div>
              {loading && accounts.length === 0 ? (
                <div className="mt-5"><DarkSkeleton lines={5} /></div>
              ) : (
                <div className="scrollbar-soft mt-5 grid max-h-[640px] gap-4 overflow-y-auto pr-1">
                  {accounts.map((account) => {
                    const form = editForms[account.id] ?? { email: account.email, name: account.name, role: account.role, password: "" };
                    return (
                      <div key={account.id} className="grid gap-4 rounded-[var(--radius-card)] border border-white/10 bg-white/5 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-all text-[15px] font-bold text-white">{account.email}</p>
                            <p className="mt-0.5 flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full ${account.confirmed ? "bg-green-400" : "bg-amber-400"}`} aria-hidden="true" />
                              <span className="text-[12px] font-semibold text-white/60">
                                {account.currentUser ? "This is you" : account.confirmed ? "Confirmed" : "Unconfirmed"}
                              </span>
                            </p>
                          </div>
                          <span
                            className={`rounded-full border px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider ${
                              account.role === "developer"
                                ? "border-brand-primary/30 bg-brand-primary/10 text-[#F472A5]"
                                : "border-green-500/20 bg-green-500/10 text-green-400"
                            }`}
                          >
                            {account.role}
                          </span>
                        </div>

                        <Input
                          label="Email"
                          variant="dark"
                          value={form.email}
                          onChange={(e) => setEditForms((f) => ({ ...f, [account.id]: { ...form, email: e.target.value } }))}
                        />
                        <div className="grid gap-4 sm:grid-cols-3">
                          <Input
                            label="Name"
                            variant="dark"
                            value={form.name}
                            onChange={(e) => setEditForms((f) => ({ ...f, [account.id]: { ...form, name: e.target.value } }))}
                          />
                          <label className="grid gap-2 text-[15px] font-semibold text-white/80">
                            Role
                            <select
                              className={FIELD}
                              value={form.role}
                              onChange={(e) => setEditForms((f) => ({ ...f, [account.id]: { ...form, role: e.target.value as AccountRole } }))}
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
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <Button
                            variant="secondary"
                            onClick={() => void saveAccount(account)}
                            className={DARK_BTN}
                          >
                            <Save size={16} />
                            Save
                          </Button>
                          {account.currentUser ? (
                            <span className="inline-flex min-h-11 items-center rounded-[var(--radius-card)] border border-white/10 px-4 text-[13px] font-bold text-white/40">
                              You cannot delete your own login
                            </span>
                          ) : (
                            <Button variant="danger" onClick={() => setDeleteAccount(account)}>
                              <Trash2 size={16} />
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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

      <ToastStack />
    </>
  );
}

function KeyNumber({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <dt className="text-[12px] font-bold uppercase tracking-wider text-white/40">{label}</dt>
      <dd className="mt-1 font-mono text-[30px] font-extrabold leading-none text-white">{value.toLocaleString("en-IN")}</dd>
      {hint ? <dd className="mt-1 text-[12px] font-semibold text-white/40">{hint}</dd> : null}
    </div>
  );
}

function formatAgo(at: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - at.getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

