import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Save, ShieldCheck, Trash2, UserPlus, Wrench } from "lucide-react";
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
import type { DeveloperDiagnostics, TrainerAccount } from "../types";

type AccountRole = "developer" | "trainer";

export function DeveloperDashboard() {
  const { signOut } = useAuth();
  const trainer = useAppStore((state) => state.trainer);
  const toast = useAppStore((state) => state.toast);
  const pushToast = useAppStore((state) => state.pushToast);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DeveloperDiagnostics | null>(null);
  const [accounts, setAccounts] = useState<TrainerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [deleteAccount, setDeleteAccount] = useState<TrainerAccount | null>(null);
  const [createForm, setCreateForm] = useState<{ email: string; name: string; role: AccountRole; password: string }>({ email: "", name: "", role: "trainer", password: "" });
  const [editForms, setEditForms] = useState<Record<string, { name: string; role: AccountRole; password: string }>>({});

  const statusItems = useMemo(() => {
    if (!diagnostics) return [];
    return [
      { label: "API", ok: diagnostics.api === "ok", value: diagnostics.api.toUpperCase() },
      { label: "Supabase", ok: diagnostics.supabase === "ok", value: diagnostics.supabase.toUpperCase() },
      { label: "Isolation", ok: diagnostics.memberOwnershipReady, value: diagnostics.memberOwnershipReady ? "READY" : "CHECK" },
      { label: "SMS", ok: diagnostics.smsConfigured, value: diagnostics.smsConfigured ? "READY" : "MISSING" },
    ];
  }, [diagnostics]);

  useEffect(() => {
    void loadDeveloperData();
  }, []);

  if (!trainer) return null;

  async function loadDeveloperData(): Promise<void> {
    setLoading(true);
    try {
      const [nextDiagnostics, nextAccounts] = await Promise.all([api.developerDiagnostics(), api.trainerAccounts()]);
      setDiagnostics(nextDiagnostics);
      setAccounts(nextAccounts);
      setEditForms(
        Object.fromEntries(
          nextAccounts.map((account) => [
            account.id,
            {
              name: account.name,
              role: account.role,
              password: "",
            },
          ]),
        ),
      );
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
    const form = editForms[account.id];
    const parsed = accountUpdateSchema.safeParse(form);
    if (!parsed.success) {
      pushToast({ title: "Account check failed", message: parsed.error.issues[0]?.message ?? "Check account details.", tone: "error" });
      return;
    }
    try {
      const password = parsed.data.password || undefined;
      await api.updateTrainerAccount(account.id, {
        name: parsed.data.name,
        role: parsed.data.role,
        password,
      });
      pushToast({ title: "Account saved", message: account.email, tone: "success" });
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

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <IssueCard label="Unassigned Member Records" value={diagnostics?.orphanMembers ?? 0} ok={(diagnostics?.orphanMembers ?? 0) === 0} />
              <IssueCard label="Expired Active Records" value={diagnostics?.expiredActiveMembers ?? 0} ok={(diagnostics?.expiredActiveMembers ?? 0) === 0} />
              <IssueCard label="Managed Accounts" value={diagnostics?.accounts.total ?? accounts.length} ok={accounts.length > 0} />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                onClick={() => void runExpiryFix()}
                disabled={fixing}
                className="bg-gradient-to-r from-brand-primary to-[#F0447D] text-white hover:opacity-95 font-bold shadow-[0_12px_32px_rgba(232,23,93,0.3)] hover:shadow-[0_16px_40px_rgba(232,23,93,0.4)]"
              >
                {fixing ? <Loader2 size={17} className="animate-spin" /> : <Wrench size={17} />}
                Run Expiry Fix
              </Button>
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
                  value={createForm.email}
                  onChange={(event) => setCreateForm((form) => ({ ...form, email: event.target.value }))}
                  placeholder="trainer@fitnessworld.in"
                  className="bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-brand-primary focus:bg-white/10"
                  labelClassName="!text-white/85"
                />
                <Input
                  label="Display Name"
                  value={createForm.name}
                  onChange={(event) => setCreateForm((form) => ({ ...form, name: event.target.value }))}
                  placeholder="Trainer name"
                  className="bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-brand-primary focus:bg-white/10"
                  labelClassName="!text-white/85"
                />
                <label className="grid gap-2 text-[15px] font-semibold text-white/85">
                  Role
                  <select
                    className="focus-ring w-full rounded-card border border-white/10 bg-white/5 px-4 py-3 text-[15px] font-normal text-white focus:border-brand-primary focus:bg-[#101426]"
                    value={createForm.role}
                    onChange={(event) => setCreateForm((form) => ({ ...form, role: event.target.value as "developer" | "trainer" }))}
                  >
                    <option value="trainer" className="bg-[#101426] text-white">Trainer</option>
                    <option value="developer" className="bg-[#101426] text-white">Developer</option>
                  </select>
                </label>
                <Input
                  label="Temporary Password"
                  type="password"
                  value={createForm.password}
                  onChange={(event) => setCreateForm((form) => ({ ...form, password: event.target.value }))}
                  placeholder="At least 12 characters"
                  className="bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-brand-primary focus:bg-white/10"
                  labelClassName="!text-white/85"
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
                  const form = editForms[account.id] ?? { name: account.name, role: account.role, password: "" };
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

                      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)_auto_auto] lg:items-end">
                        <Input
                          label="Name"
                          value={form.name}
                          onChange={(e) => setEditForms((f) => ({ ...f, [account.id]: { ...form, name: e.target.value } }))}
                          className="bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-brand-primary focus:bg-white/10"
                          labelClassName="!text-white/70"
                        />
                        <label className="grid gap-2 text-[15px] font-semibold text-white/70">
                          Role
                          <select
                            className="focus-ring w-full rounded-card border border-white/10 bg-white/5 px-4 py-3 text-[15px] font-normal text-white focus:border-brand-primary focus:bg-[#101426]"
                            value={form.role}
                            onChange={(e) => setEditForms((f) => ({ ...f, [account.id]: { ...form, role: e.target.value as "developer" | "trainer" } }))}
                          >
                            <option value="trainer" className="bg-[#101426] text-white">Trainer</option>
                            <option value="developer" className="bg-[#101426] text-white">Developer</option>
                          </select>
                        </label>
                        <Input
                          label="New Password"
                          type="password"
                          value={form.password}
                          onChange={(e) => setEditForms((f) => ({ ...f, [account.id]: { ...form, password: e.target.value } }))}
                          placeholder="Optional"
                          className="bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-brand-primary focus:bg-white/10"
                          labelClassName="!text-white/70"
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
