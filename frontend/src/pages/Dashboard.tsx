import { AlertTriangle, CalendarClock, IndianRupee, Sparkles, TrendingUp, UsersRound, UserCheck, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FilterBar } from "../components/filters/FilterBar";
import { FollowUpQueue } from "../components/followups/FollowUpQueue";
import { FloatingActionButton } from "../components/layout/FloatingActionButton";
import { Toast } from "../components/layout/Toast";
import { TopBar } from "../components/layout/TopBar";
import { MemberProfile } from "../components/members/MemberProfile";
import { MemberSheet } from "../components/members/MemberSheet";
import { MemberTable } from "../components/members/MemberTable";
import { SmsModal } from "../components/sms/SmsModal";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { SettingsModal } from "../components/layout/SettingsModal";
import { ReportExportModal } from "../components/layout/ReportExportModal";
import { useAuth } from "../hooks/useAuth";
import { useMembers } from "../hooks/useMembers";
import { getMemberCollectedAmount, getMemberPendingAmount, getMembersForAnalyticsRange, summarizeAnalyticsRange, summarizeMemberAnalytics, type AnalyticsRange } from "../lib/analytics";
import { api, isApiConfigured } from "../lib/api";
import { buildTodayFollowUps } from "../lib/followUps";
import type { MessageTemplateId } from "../lib/messageTemplates";
import { daysUntil, formatCurrency, formatDisplayDate, getMemberActionDueDate, getMemberDueKind, isPlanLessThanOneMonth } from "../lib/utils";
import { useAppStore } from "../store/useAppStore";
import type { MemberInput, PaymentReceiptInput, PaymentStatus, PlanType } from "../types";

export function Dashboard() {
  const { signOut } = useAuth();
  const { members, attendance, paymentReceipts, renewalHistory, stats, loading, upsertMember, upsertMembers, suspendMember, deleteMember, renewMember, addVisit, addPaymentReceipt, markSmsSent } = useMembers();
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
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [analysisRange, setAnalysisRange] = useState<AnalyticsRange>("2m");
  const [smsTemplateId, setSmsTemplateId] = useState<MessageTemplateId | undefined>(undefined);
  const [activeMetricFilter, setActiveMetricFilter] = useState<string | null>(null);

  const dashboardSummary = useMemo(() => summarizeMemberAnalytics(members), [members]);
  const analysisMembers = useMemo(() => getMembersForAnalyticsRange(members, analysisRange), [analysisRange, members]);
  const selectedAnalysis = useMemo(() => summarizeAnalyticsRange(members, analysisRange), [analysisRange, members]);
  const todayFollowUps = useMemo(() => buildTodayFollowUps(members, attendance), [attendance, members]);
  const planInsight = useMemo(() => {
    const counts = new Map<string, number>();
    analysisMembers.forEach((member) => counts.set(member.planType, (counts.get(member.planType) ?? 0) + 1));
    const [planType = "No plans", count = 0] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0] ?? [];
    return { planType, count };
  }, [analysisMembers]);

  const baseFilteredMembers = useMemo(() => {
    return members.filter((member) => {
      const statusMatch = filters.status === "All" ? member.status !== "Deleted" : member.status === filters.status;
      const goalMatch = filters.goal === "All Goals" || member.goal === filters.goal;
      const paymentMatch = filters.payment === "All Payments" || member.paymentStatus === filters.payment;
      const dueMatch =
        !filters.dueSoon ||
        (member.status === "Active" &&
          !isPlanLessThanOneMonth(member) &&
          daysUntil(getMemberActionDueDate(member)) >= 0 &&
          daysUntil(getMemberActionDueDate(member)) <= 3);
      const monthMatch = filters.month === "All" ||
        (member.membershipStart && member.membershipStart.startsWith(filters.month)) ||
        (member.joinDate && member.joinDate.startsWith(filters.month));
      const trainingTypeMatch =
        !filters.trainingType ||
        filters.trainingType === "All Training" ||
        member.trainingType === filters.trainingType;
      const planTypeMatch =
        !filters.planType ||
        filters.planType === "All Plans" ||
        member.planType === filters.planType;

      let metricMatch = true;
      if (activeMetricFilter === "members_added") {
        const rangeMembers = getMembersForAnalyticsRange(members, analysisRange);
        metricMatch = rangeMembers.some(rm => rm.id === member.id);
      } else if (activeMetricFilter === "money_collected") {
        const rangeMembers = getMembersForAnalyticsRange(members, analysisRange);
        metricMatch = rangeMembers.some(rm => rm.id === member.id) && (member.paymentStatus === "Paid" || member.paymentStatus === "Partially Paid");
      } else if (activeMetricFilter === "pending_fees") {
        metricMatch = member.paymentStatus === "Pending" || member.paymentStatus === "Partially Paid";
      } else if (activeMetricFilter === "active_now") {
        metricMatch = member.status === "Active";
      } else if (activeMetricFilter === "most_used_plan") {
        metricMatch = member.planType === planInsight.planType;
      } else if (activeMetricFilter === "next_renewal") {
        metricMatch = member.status === "Active" && !isPlanLessThanOneMonth(member) && daysUntil(getMemberActionDueDate(member)) >= 0 && daysUntil(getMemberActionDueDate(member)) <= 7;
      }

      return statusMatch && goalMatch && paymentMatch && dueMatch && monthMatch && trainingTypeMatch && planTypeMatch && metricMatch;
    });
  }, [filters.dueSoon, filters.goal, filters.payment, filters.status, filters.month, filters.trainingType, filters.planType, members, activeMetricFilter, analysisRange, planInsight.planType]);

  const monthlyStats = useMemo(() => {
    if (filters.month === "All") return null;

    const monthMembers = members.filter((member) => 
      (member.membershipStart && member.membershipStart.startsWith(filters.month)) ||
      (member.joinDate && member.joinDate.startsWith(filters.month))
    );

    let expected = 0;
    let collected = 0;
    let pending = 0;

    monthMembers.forEach((m) => {
      expected += m.feesAmount;
      collected += getMemberCollectedAmount(m);
      pending += getMemberPendingAmount(m);
    });

    const collectionRate = expected > 0 ? Math.round((collected / expected) * 100) : 0;

    const [year, monthStr] = filters.month.split("-");
    const dateObj = new Date(Number(year), Number(monthStr) - 1, 1);
    const monthLabel = dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    return {
      monthLabel,
      expected,
      collected,
      pending,
      collectionRate,
      count: monthMembers.length
    };
  }, [members, filters.month]);

  const confirmingMember = members.find((member) => member.id === confirmingSuspendId) ?? null;
  const confirmingDeleteMember = members.find((member) => member.id === confirmingDeleteId) ?? null;

  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? null;
  const editingMember = members.find((member) => member.id === editingMemberId) ?? null;
  const smsMember = members.find((member) => member.id === smsMemberId) ?? null;
  const selectedMemberPaymentReceipts = useMemo(
    () => (selectedMember ? paymentReceipts.filter((receipt) => receipt.memberId === selectedMember.id) : []),
    [paymentReceipts, selectedMember],
  );
  const selectedMemberRenewalHistory = useMemo(
    () => (selectedMember ? renewalHistory.filter((entry) => entry.memberId === selectedMember.id) : []),
    [renewalHistory, selectedMember],
  );

  useEffect(() => {
    if (selectedMemberId) {
      window.scrollTo(0, 0);
    }
  }, [selectedMemberId]);

  const urgentMembers = useMemo(() => {
    return members
      .filter((member) =>
        member.status === "Active" &&
        !isPlanLessThanOneMonth(member) &&
        daysUntil(getMemberActionDueDate(member)) >= 0 &&
        daysUntil(getMemberActionDueDate(member)) <= 7
      )
      .sort((a, b) => daysUntil(getMemberActionDueDate(a)) - daysUntil(getMemberActionDueDate(b)))
      .slice(0, 3);
  }, [members]);
  const nextDueMember = urgentMembers[0] ?? null;

  const pendingTotal = useMemo(() => {
    return dashboardSummary.allTime.pendingAmount;
  }, [dashboardSummary.allTime.pendingAmount]);
  const inactiveTotal = Math.max(0, stats.total - stats.active);
  const nextDueDate = nextDueMember ? getMemberActionDueDate(nextDueMember) : null;
  const nextDueDays = nextDueDate ? daysUntil(nextDueDate) : null;
  const nextDueKind = nextDueMember ? getMemberDueKind(nextDueMember) : null;
  const collectionPulse =
    dashboardSummary.allTime.expectedAmount > 0
      ? `${dashboardSummary.allTime.collectionRate}% collected`
      : "No fee target yet";

  function openSms(memberId: string, template?: MessageTemplateId): void {
    setSmsTemplateId(template);
    setSmsMemberId(memberId);
  }

  function closeSms(): void {
    setSmsMemberId(null);
    setSmsTemplateId(undefined);
  }

  async function saveMember(input: MemberInput | MemberInput[], memberId?: string): Promise<void> {
    try {
      if (Array.isArray(input)) {
        const savedMembers = await upsertMembers(input);
        pushToast({
          title: "Couple members added",
          message: savedMembers.map((saved) => saved.name).join(" + "),
          tone: "success",
        });
        return;
      }

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
      throw error;
    }
  }

  async function handleSuspend(memberId: string): Promise<void> {
    const member = members.find((m) => m.id === memberId);
    const wasSuspended = member?.status === "Suspended";
    try {
      await suspendMember(memberId);
      pushToast({
        title: wasSuspended ? "Member restored" : "Member suspended",
        message: wasSuspended ? "Member status was restored based on due date." : "Status changed successfully.",
        tone: "info",
      });
    } catch (error) {
      pushToast({
        title: wasSuspended ? "Unsuspend failed" : "Suspend failed",
        message: error instanceof Error ? error.message : "Unable to change status",
        tone: "error",
      });
    }
  }

  const tableRef = useRef<HTMLDivElement>(null);

  function handleMetricClick(metric: string): void {
    setActiveMetricFilter((current) => {
      const next = current === metric ? null : metric;
      if (next) {
        setTimeout(() => {
          tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
      return next;
    });
  }

  async function handleMessageSend(memberId: string, message: string, type: "sms" | "whatsapp"): Promise<void> {
    try {
      if (isApiConfigured) {
        if (type === "whatsapp") {
          await api.sendWhatsApp(memberId, message);
        } else {
          await api.sendSms(memberId, message);
        }
      }
      await markSmsSent(memberId);
      pushToast({
        title: type === "whatsapp" ? "WhatsApp sent" : "SMS sent",
        message: message.slice(0, 52),
        tone: "success",
      });
    } catch (error) {
      pushToast({
        title: type === "whatsapp" ? "WhatsApp failed" : "SMS failed",
        message: error instanceof Error ? error.message : `${type === "whatsapp" ? "WhatsApp" : "SMS"} could not be sent`,
        tone: "error",
      });
      throw error;
    }
  }

  async function handleRenew(memberId: string, start: string, due: string, feesAmount: number, planType?: PlanType, paymentStatus?: PaymentStatus, partialPaidAmount?: number): Promise<void> {
    try {
      await renewMember(memberId, start, due, feesAmount, planType, paymentStatus, partialPaidAmount);
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

  async function handleAddPaymentReceipt(memberId: string, input: PaymentReceiptInput): Promise<void> {
    try {
      const receipt = await addPaymentReceipt(memberId, input);
      pushToast({
        title: "Payment receipt saved",
        message: `${receipt.receiptNo} · ${formatCurrency(receipt.amount)}`,
        tone: "success",
      });
    } catch (error) {
      pushToast({
        title: "Payment save failed",
        message: error instanceof Error ? error.message : "Unable to record payment",
        tone: "error",
      });
      throw error;
    }
  }

  if (!trainer) {
    return null;
  }

  if (selectedMember) {
    return (
      <>
        <TopBar trainer={trainer} onLogout={() => void signOut()} onSettings={() => setIsSettingsOpen(true)} onReports={() => setIsExportOpen(true)} members={members} onSelectMember={setSelectedMemberId} />
        <MemberProfile
          member={selectedMember}
          attendance={attendance}
          paymentReceipts={selectedMemberPaymentReceipts}
          renewalHistory={selectedMemberRenewalHistory}
          onBack={() => setSelectedMemberId(null)}
          onEdit={setEditingMemberId}
          onSms={(memberId) => openSms(memberId)}
          onRenew={(memberId, start, due, feesAmount, planType, paymentStatus, partialPaidAmount) => handleRenew(memberId, start, due, feesAmount, planType, paymentStatus, partialPaidAmount)}
          onAddVisit={(memberId, visitDate, weightKg) => void handleAddVisit(memberId, visitDate, weightKg)}
          onAddPaymentReceipt={(memberId, input) => handleAddPaymentReceipt(memberId, input)}
        />
        <MemberSheet open={editingMemberId !== null} member={editingMember} onClose={() => setEditingMemberId(null)} onSave={saveMember} />
        <SmsModal member={smsMember} open={smsMember !== null} initialTemplate={smsTemplateId} onClose={closeSms} onSend={handleMessageSend} />
        <SettingsModal open={isSettingsOpen} trainer={trainer} onClose={() => setIsSettingsOpen(false)} />
        <ReportExportModal
          open={isExportOpen}
          members={members}
          attendance={attendance}
          paymentReceipts={paymentReceipts}
          renewalHistory={renewalHistory}
          onClose={() => setIsExportOpen(false)}
        />
        <Toast toast={toast} />
      </>
    );
  }

  return (
    <>
      <TopBar trainer={trainer} onLogout={() => void signOut()} onSettings={() => setIsSettingsOpen(true)} onReports={() => setIsExportOpen(true)} members={members} onSelectMember={setSelectedMemberId} />
      <main className="studio-shell animated-grid relative min-h-screen overflow-hidden">
        <div className="relative mx-auto grid max-w-[1500px] gap-3 px-3 pb-24 pt-3 sm:px-4 lg:gap-5 lg:px-8 lg:pt-6">
          <motion.section
            className="studio-card grid gap-0 overflow-hidden rounded-[var(--radius-panel)] xl:grid-cols-[minmax(0,1fr)_360px]"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="grid gap-5 p-3 sm:p-4 lg:gap-6 lg:p-8">
              <div className="flex flex-wrap items-start justify-between gap-2 lg:gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-primary sm:text-[12px]">Live Trainer Desk</p>
                  <h1 className="mt-1 text-[22px] font-black leading-tight text-text-primary sm:text-[28px] lg:mt-2 lg:text-[36px]">
                    Fitness{" "}
                    <span className="gradient-text">World</span>
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

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:gap-3">
                <CommandMetric
                  icon={UsersRound}
                  label="Total Members"
                  value={`${stats.total}`}
                  tone="neutral"
                  subtext="Registered in system"
                  footer={`${stats.active} active · ${inactiveTotal} expired`}
                  index={0}
                />
                <CommandMetric
                  icon={UserCheck}
                  label="Active Members"
                  value={`${stats.active}`}
                  tone="green"
                  subtext="Can train now"
                  footer={inactiveTotal > 0 ? `${inactiveTotal} need attention` : "All accounts active"}
                  index={1}
                />
                <CommandMetric
                  icon={CalendarClock}
                  label="Renewal Calls"
                  value={`${stats.dueThisWeek}`}
                  tone="amber"
                  subtext={nextDueMember ? `${nextDueKind}: ${nextDueMember.name}` : "No urgent renewals"}
                  footer={nextDueDate ? `${formatDisplayDate(nextDueDate)} · ${nextDueDays}d` : "Next 7 days clear"}
                  index={2}
                />
                <CommandMetric
                  icon={IndianRupee}
                  label="Fees To Collect"
                  value={formatCurrency(pendingTotal)}
                  tone="pink"
                  subtext={`${dashboardSummary.allTime.pendingMembers} payment follow-ups`}
                  footer={collectionPulse}
                  index={3}
                />
                <CommandMetric
                  icon={TrendingUp}
                  label="This Month"
                  value={`${dashboardSummary.thisMonth.memberCount}`}
                  tone="neutral"
                  subtext={`${dashboardSummary.thisMonth.newMembers} new · ${dashboardSummary.thisMonth.renewals} renewal`}
                  footer={`${formatCurrency(dashboardSummary.thisMonth.collectedAmount)} collected`}
                  index={4}
                />
              </div>
            </div>

            <aside className="hidden gap-2 border-l border-border-default bg-surface-raised p-4 xl:grid xl:gap-4 xl:p-5">
              <div className="overflow-hidden rounded-[var(--radius-card)] border border-border-default bg-brand-white p-2">
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
                          <span className="block text-[12px] font-semibold text-text-secondary lg:text-[13px]">
                            {getMemberDueKind(member)} · {formatDisplayDate(getMemberActionDueDate(member))}
                          </span>
                        </span>
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-[12px] font-bold text-status-due">{daysUntil(getMemberActionDueDate(member))}d</span>
                      </motion.button>
                    ))
                  ) : (
                    <p className="rounded-[var(--radius-card)] bg-surface-raised px-3 py-3 text-[14px] font-semibold text-text-secondary lg:text-[15px]">No renewals in the next 7 days.</p>
                  )}
                </div>
              </div>
            </aside>
          </motion.section>

          <motion.section
            className="studio-card grid gap-3 rounded-[var(--radius-panel)] p-3 sm:p-4 lg:grid-cols-[260px_1fr] lg:gap-5 lg:p-5"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15 }}
          >
            <div className="grid content-center gap-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-brand-primary">
                  <Sparkles size={16} />
                  <p className="text-[11px] font-bold uppercase tracking-wider">Analysis Snapshot</p>
                </div>
                <label className="sr-only" htmlFor="analysis-range">Analysis range</label>
                <select
                  id="analysis-range"
                  aria-label="Analysis range"
                  value={analysisRange}
                  onChange={(event) => setAnalysisRange(event.target.value as AnalyticsRange)}
                  className="studio-select min-h-10 px-3 text-[13px] font-black"
                >
                  <option value="1m">1 Month</option>
                  <option value="2m">2 Months</option>
                  <option value="all">All Time</option>
                </select>
              </div>
              <h2 className="text-[18px] font-black leading-tight text-text-primary sm:text-[20px]">Gym data at a glance</h2>
              <p className="text-[12px] font-semibold leading-5 text-text-secondary sm:text-[13px]">
                {selectedAnalysis.label}: members, collections, pending fees, and renewal follow-ups.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6 lg:gap-3">
              <InsightMetric
                label="Members Added"
                value={`${selectedAnalysis.memberCount}`}
                subtext={`${selectedAnalysis.newMembers} new · ${selectedAnalysis.renewals} renewal`}
                footer={selectedAnalysis.label}
                tone="pink"
                onClick={() => handleMetricClick("members_added")}
                active={activeMetricFilter === "members_added"}
              />
              <InsightMetric
                label="Money Collected"
                value={formatCurrency(selectedAnalysis.collectedAmount)}
                subtext={`${selectedAnalysis.collectionRate}% collection rate`}
                footer={formatCurrency(selectedAnalysis.expectedAmount)}
                tone="green"
                onClick={() => handleMetricClick("money_collected")}
                active={activeMetricFilter === "money_collected"}
              />
              <InsightMetric
                label="Pending Fees"
                value={formatCurrency(selectedAnalysis.pendingAmount)}
                subtext={`${selectedAnalysis.pendingMembers} payment follow-ups`}
                footer="Need collection"
                tone="amber"
                onClick={() => handleMetricClick("pending_fees")}
                active={activeMetricFilter === "pending_fees"}
              />
              <InsightMetric
                label="Active Now"
                value={`${selectedAnalysis.activeCount}`}
                subtext={`${selectedAnalysis.coupleMembers} couple records`}
                footer="Running plans"
                tone="green"
                onClick={() => handleMetricClick("active_now")}
                active={activeMetricFilter === "active_now"}
              />
              <InsightMetric
                label="Most Used Plan"
                value={planInsight.planType}
                subtext={`${planInsight.count} members using this plan`}
                footer="Plan demand"
                tone="sky"
                onClick={() => handleMetricClick("most_used_plan")}
                active={activeMetricFilter === "most_used_plan"}
              />
              <InsightMetric
                label="Next Renewal"
                value={nextDueDate ? `${daysUntil(nextDueDate)}d` : "Clear"}
                subtext={nextDueMember ? nextDueMember.name : "No renewals this week"}
                footer={nextDueDate ? `${nextDueKind}: ${formatDisplayDate(nextDueDate)}` : "No follow-up"}
                tone="amber"
                onClick={() => handleMetricClick("next_renewal")}
                active={activeMetricFilter === "next_renewal"}
              />
            </div>
          </motion.section>

          <FollowUpQueue
            items={todayFollowUps}
            onView={setSelectedMemberId}
            onMessage={(memberId, template) => openSms(memberId, template)}
          />

          <FilterBar filters={filters} resultCount={baseFilteredMembers.length} onChange={setFilter} members={members} />
          
          {monthlyStats && (
            <motion.section
              className="studio-card overflow-hidden rounded-[var(--radius-panel)] bg-gradient-to-br from-brand-white/85 to-brand-white/60 border border-border-default shadow-[0_12px_40px_rgba(26,26,46,0.04)] backdrop-blur-md p-4 lg:p-6"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-default pb-3 lg:pb-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-primary">Financial Analysis</p>
                  <h3 className="text-[18px] font-black text-text-primary sm:text-[20px]">
                    Revenue & Profit Report: <span className="gradient-text">{monthlyStats.monthLabel}</span>
                  </h3>
                </div>
                <div className="rounded-full bg-brand-primary-light px-3 py-1 text-[13px] font-bold text-brand-primary shadow-sm">
                  {monthlyStats.count} memberships
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:gap-4">
                {/* Total Expected Card */}
                <div className="rounded-[var(--radius-card)] border border-slate-100 bg-brand-white p-3 lg:p-4 shadow-sm flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Total Invoiced (Expected)</span>
                    <p className="mt-1 text-[20px] font-black text-text-primary lg:text-[24px]">
                      {formatCurrency(monthlyStats.expected)}
                    </p>
                  </div>
                  <p className="mt-2 text-[11px] font-semibold text-text-secondary">Expected total revenue generated</p>
                </div>

                {/* Received / Profit Card */}
                <div className="rounded-[var(--radius-card)] border border-emerald-100 bg-emerald-50/20 p-3 lg:p-4 shadow-sm flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Received Income (Collected)</span>
                    <p className="mt-1 text-[20px] font-black text-status-active lg:text-[24px]">
                      {formatCurrency(monthlyStats.collected)}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-700">Actual profit collected</span>
                    <span className="text-[11px] font-extrabold text-status-active bg-green-50 px-1.5 py-0.5 rounded">
                      {monthlyStats.collectionRate}%
                    </span>
                  </div>
                </div>

                {/* Pending Collection Card */}
                <div className="rounded-[var(--radius-card)] border border-amber-100 bg-amber-50/20 p-3 lg:p-4 shadow-sm flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Pending Collection (Receivable)</span>
                    <p className="mt-1 text-[20px] font-black text-status-due lg:text-[24px]">
                      {formatCurrency(monthlyStats.pending)}
                    </p>
                  </div>
                  <p className="mt-2 text-[11px] font-semibold text-amber-700">Outstanding gym fees balance</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4 lg:mt-5">
                <div className="flex items-center justify-between text-[12px] font-bold text-text-secondary">
                  <span>Collection Progress</span>
                  <span>{monthlyStats.collectionRate}% Completed</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-primary to-status-active transition-all duration-500"
                    style={{ width: `${monthlyStats.collectionRate}%` }}
                  />
                </div>
              </div>
            </motion.section>
          )}

          {activeMetricFilter && (
            <div ref={tableRef} className="flex items-center justify-between rounded-xl border border-brand-primary/20 bg-brand-primary-light/35 px-4 py-3 scroll-mt-4">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-primary"></span>
                </span>
                <span className="text-[14px] font-bold text-brand-primary">
                  Dashboard Filter Active: <span className="underline">{
                    activeMetricFilter === "members_added" ? "Members Added" :
                    activeMetricFilter === "money_collected" ? "Money Collected" :
                    activeMetricFilter === "pending_fees" ? "Pending Fees Dues" :
                    activeMetricFilter === "active_now" ? "Active Members" :
                    activeMetricFilter === "most_used_plan" ? `Most Used Plan (${planInsight.planType})` :
                    "Next Renewal Alerts"
                  }</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveMetricFilter(null)}
                className="text-[12px] font-black uppercase tracking-wider text-brand-primary hover:text-brand-primary-dark transition bg-brand-white px-2.5 py-1 rounded-md border border-brand-primary/10 shadow-sm cursor-pointer"
              >
                Clear Snapshot Filter
              </button>
            </div>
          )}

          <MemberTable
            members={baseFilteredMembers}
            query={filters.query}
            loading={loading}
            onView={setSelectedMemberId}
            onEdit={setEditingMemberId}
            onSms={(memberId) => openSms(memberId)}
            onSuspend={setConfirmingSuspendId}
            onDelete={setConfirmingDeleteId}
            isDbEmpty={members.length === 0}
            onAddClick={() => setEditingMemberId("new")}
            onClearFilters={() => {
              setActiveMetricFilter(null);
              setFilter("query", "");
              setFilter("status", "All");
              setFilter("goal", "All Goals");
              setFilter("payment", "All Payments");
              setFilter("month", "All");
              setFilter("dueSoon", false);
              setFilter("trainingType", "All Training");
              setFilter("planType", "All Plans");
            }}
          />
        </div>
      </main>
      <FloatingActionButton onClick={() => setEditingMemberId("new")} />
      <MemberSheet open={editingMemberId !== null} member={editingMemberId === "new" ? null : editingMember} onClose={() => setEditingMemberId(null)} onSave={saveMember} />
      <SmsModal member={smsMember} open={smsMember !== null} initialTemplate={smsTemplateId} onClose={closeSms} onSend={handleMessageSend} />
      <ConfirmModal
        open={confirmingSuspendId !== null}
        title={confirmingMember?.status === "Suspended" ? "Unsuspend Member" : "Suspend Member"}
        message={
          confirmingMember?.status === "Suspended"
            ? `Are you sure you want to unsuspend ${confirmingMember?.name ?? "this member"}? Their plan status will be restored based on due date.`
            : `Are you sure you want to suspend ${confirmingMember?.name ?? "this member"}? Their active plan status will be updated to Suspended.`
        }
        confirmText={confirmingMember?.status === "Suspended" ? "Unsuspend" : "Suspend"}
        variant={confirmingMember?.status === "Suspended" ? "success" : "danger"}
        onConfirm={async () => {
          if (confirmingSuspendId) {
            await handleSuspend(confirmingSuspendId);
            setConfirmingSuspendId(null);
          }
        }}
        onClose={() => setConfirmingSuspendId(null)}
      />
      <ConfirmModal
        open={confirmingDeleteId !== null}
        title="Delete Member"
        message={`Are you sure you want to delete ${confirmingDeleteMember?.name ?? "this member"}? This will soft-delete the member and keep their history in the system. They can be viewed by selecting the "Deleted" status filter.`}
        confirmText="Delete"
        variant="danger"
        onConfirm={async () => {
          if (confirmingDeleteId) {
            try {
              await deleteMember(confirmingDeleteId);
              pushToast({
                title: "Member Deleted",
                message: `${confirmingDeleteMember?.name ?? "Member"} has been soft-deleted successfully.`,
                tone: "success",
              });
            } catch (error) {
              pushToast({
                title: "Error",
                message: error instanceof Error ? error.message : "Unable to delete member",
                tone: "error",
              });
            }
            setConfirmingDeleteId(null);
          }
        }}
        onClose={() => setConfirmingDeleteId(null)}
      />
      <SettingsModal open={isSettingsOpen} trainer={trainer} onClose={() => setIsSettingsOpen(false)} />
      <ReportExportModal
        open={isExportOpen}
        members={members}
        attendance={attendance}
        paymentReceipts={paymentReceipts}
        renewalHistory={renewalHistory}
        onClose={() => setIsExportOpen(false)}
      />
      <Toast toast={toast} />
    </>
  );
}

interface InsightMetricProps {
  label: string;
  value: string;
  subtext: string;
  footer: string;
  tone: "pink" | "sky" | "green" | "amber";
  onClick?: () => void;
  active?: boolean;
}

function InsightMetric({ label, value, subtext, footer, tone, onClick, active }: InsightMetricProps) {
  const toneClass = active
    ? "border-brand-primary bg-brand-primary-light/80 text-brand-primary ring-2 ring-brand-primary/20 scale-[1.02]"
    : tone === "green"
    ? "border-emerald-100 bg-emerald-50/40 text-status-active hover:border-emerald-300 hover:bg-emerald-50/60"
    : tone === "amber"
    ? "border-amber-100 bg-amber-50/50 text-status-due hover:border-amber-300 hover:bg-amber-50/70"
    : tone === "sky"
    ? "border-sky-100 bg-sky-50/50 text-sky-700 hover:border-sky-300 hover:bg-sky-50/70"
    : "border-pink-100 bg-brand-primary-light/50 text-brand-primary hover:border-pink-300 hover:bg-brand-primary-light/70";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={`rounded-[var(--radius-card)] border p-3 shadow-sm text-left transition-all duration-200 cursor-pointer ${toneClass}`}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      <p className="text-[10px] font-black uppercase tracking-wider opacity-80">{label}</p>
      <p className="mt-1 text-[18px] font-black leading-tight text-text-primary sm:text-[20px] lg:text-[22px]">{value}</p>
      <p className="mt-1 min-h-8 text-[11px] font-bold leading-4 text-text-secondary">{subtext}</p>
      <p className="mt-2 rounded-full bg-brand-white/70 px-2 py-1 text-[11px] font-black text-text-primary w-fit">{footer}</p>
    </motion.button>
  );
}

interface CommandMetricProps {
  icon: LucideIcon;
  label: string;
  value: string;
  subtext?: string;
  footer?: string;
  tone?: "neutral" | "amber" | "pink" | "green";
  index: number;
}

function CommandMetric({ icon: Icon, label, value, subtext, footer, tone = "neutral", index }: CommandMetricProps) {
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
      className="card-hover flex min-h-[118px] flex-col justify-between rounded-[var(--radius-card)] border border-border-default bg-brand-white p-2.5 sm:min-h-[126px] sm:p-3 lg:p-4"
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
        <p className="mt-1.5 min-h-[28px] text-[9px] font-bold leading-4 text-text-secondary opacity-80 sm:text-[10px] lg:text-[11px]">{subtext}</p>
      )}
      {footer && (
        <p className="mt-2 truncate rounded-full bg-surface-raised px-2 py-1 text-[9px] font-black text-text-primary sm:text-[10px] lg:text-[11px]">
          {footer}
        </p>
      )}
    </motion.div>
  );
}
