import { AlertTriangle, CalendarClock, IndianRupee, Sparkles, UsersRound } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "../components/filters/FilterBar";
import { FloatingActionButton } from "../components/layout/FloatingActionButton";
import { Toast } from "../components/layout/Toast";
import { TopBar } from "../components/layout/TopBar";
import { MemberProfile } from "../components/members/MemberProfile";
import { MemberSheet } from "../components/members/MemberSheet";
import { MemberTable } from "../components/members/MemberTable";
import { SmsModal } from "../components/sms/SmsModal";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { useAuth } from "../hooks/useAuth";
import { useMembers } from "../hooks/useMembers";
import { api, isApiConfigured } from "../lib/api";
import { daysUntil, formatCurrency, formatDisplayDate } from "../lib/utils";
import { useAppStore } from "../store/useAppStore";
import type { MemberInput } from "../types";

export function Dashboard() {
  const { signOut } = useAuth();
  const { members, attendance, stats, loading, upsertMember, suspendMember, renewMember, addVisit, markSmsSent } = useMembers();
  const trainer = useAppStore((state) => state.trainer);
  const filters = useAppStore((state) => state.filters);
  const selectedMemberId = useAppStore((state) => state.selectedMemberId);
  const editingMemberId = useAppStore((state) => state.editingMemberId);
  const smsMemberId = useAppStore((state) => state.smsMemberId);
  const toast = useAppStore((state) => state.toast);
  const setFilter = useAppStore((state) => state.setFilter);
  const setSelectedMemberId = useAppStore((state) => state.setSelectedMemberId);
  const setEditingMemberId = useAppStore((state) => state.setEditingMemberId);
  const setSmsMemberId = useAppStore((state) => state.setSmsMemberId);
  const pushToast = useAppStore((state) => state.pushToast);
  const [confirmingSuspendId, setConfirmingSuspendId] = useState<string | null>(null);

  const baseFilteredMembers = useMemo(() => {
    return members.filter((member) => {
      const statusMatch = filters.status === "All" || member.status === filters.status;
      const goalMatch = filters.goal === "All Goals" || member.goal === filters.goal;
      const paymentMatch = filters.payment === "All Payments" || member.paymentStatus === filters.payment;
      const dueMatch = !filters.dueSoon || (member.status === "Active" && daysUntil(member.membershipDue) >= 0 && daysUntil(member.membershipDue) <= 3);
      return statusMatch && goalMatch && paymentMatch && dueMatch;
    });
  }, [filters.dueSoon, filters.goal, filters.payment, filters.status, members]);

  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? null;
  const editingMember = members.find((member) => member.id === editingMemberId) ?? null;
  const smsMember = members.find((member) => member.id === smsMemberId) ?? null;

  useEffect(() => {
    if (selectedMemberId) {
      window.scrollTo(0, 0);
    }
  }, [selectedMemberId]);

  const urgentMembers = useMemo(() => {
    return members
      .filter((member) => member.status === "Active" && daysUntil(member.membershipDue) >= 0 && daysUntil(member.membershipDue) <= 7)
      .sort((a, b) => daysUntil(a.membershipDue) - daysUntil(b.membershipDue))
      .slice(0, 3);
  }, [members]);

  const pendingTotal = useMemo(() => {
    return members.filter((member) => member.paymentStatus === "Pending").reduce((total, member) => total + member.feesAmount, 0);
  }, [members]);

  async function saveMember(input: MemberInput, memberId?: string): Promise<void> {
    try {
      const saved = await upsertMember(input, memberId);
      pushToast({
        title: memberId ? "Member updated" : "Member added",
        message: `${saved.regNo} ${saved.name}`,
        tone: "success",
      });
    } catch (error) {
      pushToast({
        title: "Save failed",
        message: error instanceof Error ? error.message : "Unable to save member details",
        tone: "error",
      });
    }
  }

  async function handleSuspend(memberId: string): Promise<void> {
    try {
      await suspendMember(memberId);
      pushToast({
        title: "Member suspended",
        message: "Status changed successfully.",
        tone: "info",
      });
    } catch (error) {
      pushToast({
        title: "Suspend failed",
        message: error instanceof Error ? error.message : "Unable to suspend member",
        tone: "error",
      });
    }
  }

  async function handleSms(memberId: string, message: string): Promise<void> {
    try {
      if (isApiConfigured) {
        await api.sendSms(memberId, message);
      }
      await markSmsSent(memberId);
      pushToast({
        title: "SMS sent",
        message: message.slice(0, 52),
        tone: "success",
      });
    } catch (error) {
      pushToast({
        title: "SMS failed",
        message: error instanceof Error ? error.message : "Fast2SMS API failed to send SMS",
        tone: "error",
      });
    }
  }

  async function handleRenew(memberId: string, start: string, due: string, feesAmount: number): Promise<void> {
    try {
      await renewMember(memberId, start, due, feesAmount);
      pushToast({
        title: "Membership renewed",
        message: `Plan start: ${formatDisplayDate(start)}`,
        tone: "success",
      });
    } catch (error) {
      pushToast({
        title: "Renewal failed",
        message: error instanceof Error ? error.message : "Unable to renew membership",
        tone: "error",
      });
    }
  }

  async function handleAddVisit(memberId: string, visitDate: string, weightKg?: number): Promise<void> {
    try {
      await addVisit(memberId, visitDate, weightKg);
      pushToast({
        title: "Visit logged",
        message: `Date: ${formatDisplayDate(visitDate)}`,
        tone: "success",
      });
    } catch (error) {
      pushToast({
        title: "Log visit failed",
        message: error instanceof Error ? error.message : "Unable to log visit",
        tone: "error",
      });
    }
  }

  if (!trainer) {
    return null;
  }

  if (selectedMember) {
    return (
      <>
        <TopBar trainer={trainer} onLogout={() => void signOut()} />
        <MemberProfile
          member={selectedMember}
          attendance={attendance}
          onBack={() => setSelectedMemberId(null)}
          onEdit={setEditingMemberId}
          onSms={setSmsMemberId}
          onRenew={(memberId, start, due, feesAmount) => void handleRenew(memberId, start, due, feesAmount)}
          onAddVisit={(memberId, visitDate, weightKg) => void handleAddVisit(memberId, visitDate, weightKg)}
        />
        <MemberSheet open={editingMemberId !== null} member={editingMember} onClose={() => setEditingMemberId(null)} onSave={saveMember} />
        <SmsModal member={smsMember} open={smsMember !== null} onClose={() => setSmsMemberId(null)} onSend={handleSms} />
        <Toast toast={toast} />
      </>
    );
  }

  return (
    <>
      <TopBar trainer={trainer} onLogout={() => void signOut()} />
      <main className="studio-shell animated-grid relative min-h-screen overflow-hidden">
        <div className="relative mx-auto grid max-w-[1500px] gap-3 px-3 pb-24 pt-3 sm:px-4 lg:gap-5 lg:px-8 lg:pt-6">
          <motion.section
            className="studio-card grid gap-4 overflow-hidden rounded-[var(--radius-panel)] lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="grid content-between gap-4 p-3 sm:p-4 lg:gap-8 lg:p-8">
              <div className="flex flex-wrap items-start justify-between gap-2 lg:gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-primary sm:text-[12px]">Live Trainer Desk</p>
                  <h1 className="mt-1 text-[22px] font-black leading-tight text-text-primary sm:text-[28px] lg:mt-2 lg:text-[36px]">
                    Fitness World{" "}
                    <span className="gradient-text">GymOS</span>
                  </h1>
                  <p className="mt-1 hidden text-[14px] font-semibold text-text-secondary sm:block lg:mt-2 lg:text-[15px]">Today's members, renewals, payments, and outreach in one clean work view.</p>
                </div>
                <motion.div
                  className="hidden rounded-[var(--radius-card)] border border-white/60 bg-brand-white/40 backdrop-blur-md px-3 py-2 sm:block lg:px-4 lg:py-3 shadow-sm"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted sm:text-[12px]">Floor Status</p>
                  <div className="mt-0.5 flex items-center gap-2 text-[14px] font-bold text-text-primary lg:mt-1 lg:text-[17px]">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-active opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-status-active"></span>
                    </span>
                    Open Desk
                  </div>
                </motion.div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">
                <CommandMetric icon={UsersRound} label="Members" value={`${stats.total}`} subtext="Registered" index={0} />
                <CommandMetric icon={UsersRound} label="Active" value={`${stats.active}`} tone="green" subtext="Active plans" index={1} />
                <CommandMetric icon={CalendarClock} label="Due Soon" value={`${stats.dueThisWeek}`} tone="amber" subtext="Next 7 days" index={2} />
                <CommandMetric icon={IndianRupee} label="Pending" value={formatCurrency(pendingTotal)} tone="pink" subtext={`${stats.pendingPayments} members`} index={3} />
              </div>
            </div>

            <aside className="grid gap-2 bg-surface-raised p-3 sm:gap-3 sm:p-4 lg:gap-4 lg:border-l lg:border-border-default lg:p-5">
              <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-border-default bg-brand-white p-2 lg:block">
                <img className="w-full rounded-lg object-contain" src="/brand/fitness-world-banner.jpeg" alt="Fitness World exterior banner" />
              </div>
              <div className="rounded-[var(--radius-card)] border border-border-default bg-brand-white p-3 lg:p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Renewal Radar</p>
                  <AlertTriangle size={16} className="text-amber-300" />
                </div>
                <div className="mt-2 grid gap-1.5 lg:mt-3 lg:gap-2">
                  {urgentMembers.length > 0 ? (
                    urgentMembers.map((member, i) => (
                      <motion.button
                        key={member.id}
                        type="button"
                        className="focus-ring relative overflow-hidden grid min-h-12 grid-cols-[1fr_auto] items-center gap-3 rounded-[var(--radius-card)] border border-border-default bg-surface-raised pl-4 pr-3 py-2 text-left transition-all hover:border-brand-primary/40 hover:bg-brand-white hover:shadow-[0_4px_12px_rgba(232,23,93,0.04)]"
                        onClick={() => setSelectedMemberId(member.id)}
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.4 + i * 0.1 }}
                        whileHover={{ x: 3 }}
                      >
                        <span className="absolute left-0 inset-y-0 w-1 bg-amber-500" />
                        <span>
                          <span className="block text-[14px] font-bold text-text-primary lg:text-[15px]">{member.name}</span>
                          <span className="block text-[12px] font-semibold text-text-secondary lg:text-[13px]">{formatDisplayDate(member.membershipDue)}</span>
                        </span>
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-[12px] font-bold text-status-due">{daysUntil(member.membershipDue)}d</span>
                      </motion.button>
                    ))
                  ) : (
                    <p className="rounded-[var(--radius-card)] bg-surface-raised px-3 py-3 text-[14px] font-semibold text-text-secondary lg:text-[15px]">No renewals in the next 7 days.</p>
                  )}
                </div>
              </div>
            </aside>
          </motion.section>

          <FilterBar filters={filters} resultCount={baseFilteredMembers.length} onChange={setFilter} />
          <MemberTable
            members={baseFilteredMembers}
            query={filters.query}
            loading={loading}
            onView={setSelectedMemberId}
            onEdit={setEditingMemberId}
            onSms={setSmsMemberId}
            onSuspend={setConfirmingSuspendId}
            isDbEmpty={members.length === 0}
            onAddClick={() => setEditingMemberId("new")}
            onClearFilters={() => {
              setFilter("query", "");
              setFilter("status", "All");
              setFilter("goal", "All Goals");
              setFilter("payment", "All Payments");
              setFilter("dueSoon", false);
            }}
          />
        </div>
      </main>
      <FloatingActionButton onClick={() => setEditingMemberId("new")} />
      <MemberSheet open={editingMemberId !== null} member={editingMemberId === "new" ? null : editingMember} onClose={() => setEditingMemberId(null)} onSave={saveMember} />
      <SmsModal member={smsMember} open={smsMember !== null} onClose={() => setSmsMemberId(null)} onSend={handleSms} />
      <ConfirmModal
        open={confirmingSuspendId !== null}
        title="Suspend Member"
        message="Are you sure you want to suspend this member? Their active plan status will be updated to Suspended."
        confirmText="Suspend"
        onConfirm={async () => {
          if (confirmingSuspendId) {
            await handleSuspend(confirmingSuspendId);
            setConfirmingSuspendId(null);
          }
        }}
        onClose={() => setConfirmingSuspendId(null)}
      />
      <Toast toast={toast} />
    </>
  );
}

interface CommandMetricProps {
  icon: typeof UsersRound;
  label: string;
  value: string;
  subtext?: string;
  tone?: "neutral" | "amber" | "pink" | "green";
  index: number;
}

function CommandMetric({ icon: Icon, label, value, subtext, tone = "neutral", index }: CommandMetricProps) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50 text-status-due"
      : tone === "pink"
      ? "bg-brand-primary-light text-brand-primary"
      : tone === "green"
      ? "bg-green-50 text-status-active"
      : "bg-sky-50 text-sky-700";

  return (
    <motion.div
      className="card-hover rounded-[var(--radius-card)] border border-border-default bg-brand-white p-2.5 sm:p-3 lg:p-4 flex flex-col justify-between"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 + index * 0.1 }}
    >
      <div>
        <div className="flex items-start justify-between gap-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-text-muted sm:text-[10px] lg:text-[11px]">{label}</span>
          <div className={`grid h-6 w-6 shrink-0 place-items-center rounded transition-transform duration-300 sm:h-7 sm:w-7 sm:rounded-md lg:h-8 lg:w-8 ${toneClass}`}>
            <Icon size={13} className="sm:hidden" />
            <Icon size={15} className="hidden sm:block" />
          </div>
        </div>
        <p className="mt-1.5 truncate text-[16px] font-black leading-tight text-text-primary sm:text-[18px] lg:text-[20px]">{value}</p>
      </div>
      {subtext && (
        <p className="mt-1.5 text-[9px] font-bold text-text-secondary sm:text-[10px] lg:text-[11px] opacity-80">{subtext}</p>
      )}
    </motion.div>
  );
}
