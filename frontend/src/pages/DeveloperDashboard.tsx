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
      <main className="studio-shell animated-grid min-h-screen">
        <div className="mx-auto grid max-w-[1500px] gap-5 px-4 pb-24 pt-5 lg:px-8">
          <motion.section
            className="studio-card rounded-[var(--radius-panel)] p-5 lg:p-8"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-black uppercase tracking-wider text-brand-primary">Developer Console</p>
                <h1 className="mt-2 text-[28px] font-black leading-tight text-text-primary lg:text-[40px]">GymOS System Health</h1>
              </div>
              <Button onClick={() => void loadDeveloperData()} disabled={loading} variant="secondary">
                {loading ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
                Refresh Checks
              </Button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {statusItems.map((item) => (
                <StatusCard key={item.label} {...item} />
              ))}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <IssueCard label="Unassigned Member Records" value={diagnostics?.orphanMembers ?? 0} ok={(diagnostics?.orphanMembers ?? 0) === 0} />
              <IssueCard label="Expired Active Records" value={diagnostics?.expiredActiveMembers ?? 0} ok={(diagnostics?.expiredActiveMembers ?? 0) === 0} />
              <IssueCard label="Managed Accounts" value={diagnostics?.accounts.total ?? accounts.length} ok={accounts.length > 0} />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={() => void runExpiryFix()} disabled={fixing}>
                {fixing ? <Loader2 size={17} className="animate-spin" /> : <Wrench size={17} />}
                Run Expiry Fix
              </Button>
            </div>
          </motion.section>

          <section className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
            <div className="studio-card rounded-[var(--radius-panel)] p-5">
              <h2 className="text-[18px] font-black text-text-primary">Create Account</h2>
              <div className="mt-4 grid gap-3">
                <Input label="Email" value={createForm.email} onChange={(event) => setCreateForm((form) => ({ ...form, email: event.target.value }))} placeholder="trainer@fitnessworld.in" />
                <Input label="Display Name" value={createForm.name} onChange={(event) => setCreateForm((form) => ({ ...form, name: event.target.value }))} placeholder="Trainer name" />
                <label className="grid gap-2 text-[15px] font-semibold text-text-primary">
                  Role
                  <select
                    className="focus-ring w-full rounded-card border border-transparent bg-surface-overlay px-4 py-3 text-[15px] font-normal text-text-primary"
                    value={createForm.role}
                    onChange={(event) => setCreateForm((form) => ({ ...form, role: event.target.value as "developer" | "trainer" }))}
                  >
                    <option value="trainer">Trainer</option>
                    <option value="developer">Developer</option>
                  </select>
                </label>
                <Input label="Temporary Password" type="password" value={createForm.password} onChange={(event) => setCreateForm((form) => ({ ...form, password: event.target.value }))} placeholder="At least 12 characters" />
                <Button onClick={() => void createAccount()}>
                  <UserPlus size={17} />
                  Create Account
                </Button>
              </div>
            </div>

            <div className="studio-card rounded-[var(--radius-panel)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[18px] font-black text-text-primary">Account Manager</h2>
                <span className="rounded-full bg-surface-overlay px-3 py-1 text-[12px] font-black uppercase tracking-wider text-text-muted">{accounts.length} accounts</span>
              </div>
              <div className="mt-4 grid gap-3">
                {accounts.map((account) => {
                  const form = editForms[account.id] ?? { name: account.name, role: account.role, password: "" };
                  return (
                    <div key={account.id} className="rounded-[var(--radius-card)] border border-border-default bg-surface-raised p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[15px] font-black text-text-primary">{account.email}</p>
                          <p className="text-[12px] font-bold uppercase tracking-wider text-text-muted">{account.currentUser ? "Current account" : account.confirmed ? "Confirmed" : "Unconfirmed"}</p>
                        </div>
                        <span className={account.role === "developer" ? "rounded-full bg-brand-primary-light px-3 py-1 text-[11px] font-black uppercase text-brand-primary" : "rounded-full bg-green-50 px-3 py-1 text-[11px] font-black uppercase text-status-active"}>{account.role}</span>
                      </div>
                      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)_auto_auto] lg:items-end">
                        <Input label="Name" value={form.name} onChange={(event) => setEditForms((forms) => ({ ...forms, [account.id]: { ...form, name: event.target.value } }))} />
                        <label className="grid gap-2 text-[15px] font-semibold text-text-primary">
                          Role
                          <select
                            className="focus-ring w-full rounded-card border border-transparent bg-surface-overlay px-4 py-3 text-[15px] font-normal text-text-primary"
                            value={form.role}
                            onChange={(event) => setEditForms((forms) => ({ ...forms, [account.id]: { ...form, role: event.target.value as "developer" | "trainer" } }))}
                          >
                            <option value="trainer">Trainer</option>
                            <option value="developer">Developer</option>
                          </select>
                        </label>
                        <Input label="New Password" type="password" value={form.password} onChange={(event) => setEditForms((forms) => ({ ...forms, [account.id]: { ...form, password: event.target.value } }))} placeholder="Optional" />
                        <Button variant="secondary" onClick={() => void saveAccount(account)}>
                          <Save size={16} />
                          Save
                        </Button>
                        <Button variant="danger" disabled={account.currentUser} onClick={() => setDeleteAccount(account)}>
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
    <div className="rounded-[var(--radius-card)] border border-border-default bg-brand-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-black uppercase tracking-wider text-text-muted">{label}</p>
        <Icon size={19} className={ok ? "text-status-active" : "text-status-due"} />
      </div>
      <p className="mt-3 text-[24px] font-black text-text-primary">{value}</p>
    </div>
  );
}

function IssueCard({ label, value, ok }: { label: string; value: number; ok: boolean }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border-default bg-brand-white p-4">
      <p className="text-[12px] font-black uppercase tracking-wider text-text-muted">{label}</p>
      <p className={ok ? "mt-2 text-[28px] font-black text-status-active" : "mt-2 text-[28px] font-black text-status-due"}>{value}</p>
    </div>
  );
}
