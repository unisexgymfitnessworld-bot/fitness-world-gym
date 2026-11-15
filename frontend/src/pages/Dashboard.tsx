import { AlertTriangle, CalendarClock, IndianRupee, RefreshCw, Sparkles, TrendingUp, UsersRound, UserCheck, type LucideIcon } from "lucide-react";
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
import { endOfMonth, startOfMonth } from "date-fns";
import { getCollectiblePendingAmount, getMembersForAnalyticsRange, summarizeAnalyticsRange, summarizeMemberAnalytics, summarizePeriod, type AnalyticsRange } from "../lib/analytics";
import { api, isApiConfigured } from "../lib/api";
import { buildTodayFollowUps } from "../lib/followUps";
import type { MessageTemplateId } from "../lib/messageTemplates";
import { daysUntil, formatCurrency, formatDisplayDate, getMemberActionDueDate } from "../lib/utils";
import { useAppStore } from "../store/useAppStore";
import type { BillChannel, MemberInput, NotifyChannelChoice, PaymentMethod, PaymentReceiptInput, PaymentStatus, PlanType, ResendResult, SmsSendResult, StatementResult } from "../types";

export function Dashboard() {
  const { signOut } = useAuth();
  const { members, attendance, paymentReceipts, renewalHistory, stats, loading, loadError, retryLoad, isDemo, upsertMember, upsertMembers, suspendMember, restoreMember, deleteMember, purgeMember, wipeAll, renewMember, addVisit, deleteVisit, addPaymentReceipt, resendReceipt, sendStatement, markSmsSent } = useMembers();
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

  const dashboardSummary = useMemo(() => summarizeMemberAnalytics(members, new Date(), paymentReceipts, renewalHistory), [members, paymentReceipts, renewalHistory]);
  const analysisMembers = useMemo(() => getMembersForAnalyticsRange(members, analysisRange), [analysisRange, members]);
  const rangeMemberIds = useMemo(
    () => new Set(analysisMembers.map((member) => member.id)),
    [analysisMembers],
  );
  const collectedToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return paymentReceipts
      .filter((receipt) => receipt.paidOn === today)
      .reduce((sum, receipt) => sum + receipt.amount, 0);
  }, [paymentReceipts]);
  const selectedAnalysis = useMemo(() => summarizeAnalyticsRange(members, analysisRange, new Date(), paymentReceipts, renewalHistory), [analysisRange, members, paymentReceipts, renewalHistory]);
  const todayFollowUps = useMemo(() => buildTodayFollowUps(members, attendance), [attendance, members]);
  const inactiveIds = useMemo(
    () => new Set(todayFollowUps.filter((item) => item.kind === "inactive").map((item) => item.member.id)),
    [todayFollowUps],
  );

  const baseFilteredMembers = useMemo(() => {
    return members.filter((member) => {
      const statusMatch = filters.status === "All" ? member.status !== "Deleted" : member.status === filters.status;
      const goalMatch = filters.goal === "All Goals" || member.goal === filters.goal;
      const paymentMatch = filters.payment === "All Payments" || member.paymentStatus === filters.payment;
      const dueMatch =
        !filters.dueSoon ||
        (member.status === "Active" &&
          daysUntil(getMemberActionDueDate(member)) >= 0 &&
          daysUntil(getMemberActionDueDate(member)) <= 7);
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
      if (activeMetricFilter === "all_members") {
        metricMatch = member.status !== "Deleted";
      } else if (activeMetricFilter === "members_added") {
        metricMatch = rangeMemberIds.has(member.id);
      } else if (activeMetricFilter === "money_collected") {
        metricMatch = rangeMemberIds.has(member.id) && (member.paymentStatus === "Paid" || member.paymentStatus === "Partially Paid");
      } else if (activeMetricFilter === "pending_fees") {
        metricMatch = getCollectiblePendingAmount(member) > 0;
      } else if (activeMetricFilter === "active_now") {
        metricMatch = member.status === "Active";
      } else if (activeMetricFilter === "inactive_now") {
        metricMatch = inactiveIds.has(member.id);
      } else if (activeMetricFilter === "next_renewal") {
        metricMatch = member.status === "Active" && daysUntil(getMemberActionDueDate(member)) >= 0 && daysUntil(getMemberActionDueDate(member)) <= 7;
      }

      return statusMatch && goalMatch && paymentMatch && dueMatch && monthMatch && trainingTypeMatch && planTypeMatch && metricMatch;
    });
  }, [filters.dueSoon, filters.goal, filters.payment, filters.status, filters.month, filters.trainingType, filters.planType, members, activeMetricFilter, rangeMemberIds, inactiveIds]);

  const monthlyStats = useMemo(() => {
    if (filters.month === "All") return null;

    const monthMembers = members.filter((member) =>
      (member.membershipStart && member.membershipStart.startsWith(filters.month)) ||
      (member.joinDate && member.joinDate.startsWith(filters.month))
    );

    const [year, monthStr] = filters.month.split("-");
    const monthStart = startOfMonth(new Date(Number(year), Number(monthStr) - 1, 1));
    const monthEnd = endOfMonth(monthStart);
    const monthLabel = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const summary = summarizePeriod(
      monthLabel,
      monthMembers,
      new Date(),
      { receipts: paymentReceipts, renewals: renewalHistory, period: { start: monthStart, end: monthEnd } },
    );

    return {
      monthLabel,
      expected: summary.expectedAmount,
      collected: summary.collectedAmount,
      pending: summary.pendingAmount,
      collectionRate: summary.collectionRate,
      count: monthMembers.length
    };
  }, [members, filters.month, paymentReceipts, renewalHistory]);

  const confirmingMember = members.find((member) => member.id === confirmingSuspendId) ?? null;
  const confirmingDeleteMember = members.find((member) => member.id === confirmingDeleteId) ?? null;

  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? null;
  const editingMember = members.find((member) => member.id === editingMemberId) ?? null;
  const editingReceiptCount = editingMember ? paymentReceipts.filter((receipt) => receipt.memberId === editingMember.id).length : 0;
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
  const expiredCount = useMemo(() => members.filter((member) => member.status === "Expired").length, [members]);
  const suspendedCount = useMemo(() => members.filter((member) => member.status === "Suspended").length, [members]);
  const nextDueDate = nextDueMember ? getMemberActionDueDate(nextDueMember) : null;
  const nextDueDays = nextDueDate ? daysUntil(nextDueDate) : null;
  const collectionPulse =
    dashboardSummary.allTime.expectedAmount <= 0
      ? "No fee target yet"
      : dashboardSummary.allTime.pendingAmount > 0
        ? `${formatCurrency(dashboardSummary.allTime.pendingAmount)} still to collect`
        : "100% collected";

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

  async function handleRestore(memberId: string): Promise<void> {
    try {
      await restoreMember(memberId);
      pushToast({
        title: "Member restored",
        message: "Member status was restored based on due date.",
        tone: "success",
      });
    } catch (error) {
      pushToast({
        title: "Restore failed",
        message: error instanceof Error ? error.message : "Unable to restore member",
        tone: "error",
      });
    }
  }

  async function handleProfileDelete(memberId: string): Promise<void> {
    const member = members.find((m) => m.id === memberId);
    try {
      await deleteMember(memberId);
      pushToast({
        title: "Member deleted",
        message: `${member?.name ?? "Member"} moved to Deleted. Restore anytime from the Deleted filter.`,
        tone: "info",
      });
      setSelectedMemberId(null);
    } catch (error) {
      pushToast({
        title: "Delete failed",
        message: error instanceof Error ? error.message : "Unable to delete member",
        tone: "error",
      });
    }
  }

  async function handlePurgeMember(memberId: string): Promise<void> {
    const member = members.find((m) => m.id === memberId);
    try {
      await purgeMember(memberId);
      pushToast({
        title: "Member erased",
        message: `${member?.name ?? "Member"} and all their records are gone for good.`,
        tone: "info",
      });
      setSelectedMemberId(null);
    } catch (error) {
      pushToast({
        title: "Erase failed",
        message: error instanceof Error ? error.message : "Unable to erase member",
        tone: "error",
      });
    }
  }

  async function handleWipeAll(): Promise<void> {
    await wipeAll();
    setSelectedMemberId(null);
    setIsSettingsOpen(false);
    pushToast({
      title: "Fresh start ready",
      message: "All gym data was erased. Settings and logins are untouched.",
      tone: "info",
    });
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

  async function handleMessageSend(memberId: string, message: string, markReminder: boolean, channel: NotifyChannelChoice = "sms"): Promise<SmsSendResult | void> {
    const channelLabel = channel === "auto" ? "message" : channel === "whatsapp" ? "WhatsApp" : channel === "email" ? "email" : "SMS";
    try {
      if (!isApiConfigured) {
        if (markReminder) {
          await markSmsSent(memberId);
        }
        pushToast({
          title: "Demo mode",
          message: `${channelLabel} is not actually sent in demo mode.`,
          tone: "info",
        });
        return;
      }
      const member = members.find((candidate) => candidate.id === memberId) ?? null;
      if (channel === "email" && !member?.email) {
        throw new Error("This member has no email address. Add one on their profile first.");
      }
      const result = await api.sendSms(memberId, message, markReminder, crypto.randomUUID(), channel);
      const sentVia = result.channel === "whatsapp" ? "WhatsApp" : result.channel === "email" ? "email" : "SMS";
      if (markReminder && result.status === "sent") {
        await markSmsSent(memberId);
      }
      if (result.status === "queued") {
        pushToast({
          title: `${sentVia} queued`,
          message: channel === "sms" || result.channel === "sms"
            ? "Gym phone unreachable — it will send automatically when back online."
            : "It will send automatically when the service is back.",
          tone: "info",
        });
      } else {
        pushToast({
          title: `${sentVia} sent`,
          message: message.slice(0, 52),
          tone: "success",
        });
      }
      return result;
    } catch (error) {
      pushToast({
        title: `${channelLabel} failed`,
        message: error instanceof Error ? error.message : `${channelLabel} could not be sent`,
        tone: "error",
      });
      throw error;
    }
  }

  async function handleRenew(memberId: string, start: string, due: string, feesAmount: number, planType?: PlanType, paymentStatus?: PaymentStatus, collectedAmount?: number, method?: PaymentMethod, clientRequestId?: string): Promise<void> {
    try {
      const { receiptSms, receiptEmail, duplicate } = await renewMember(memberId, start, due, feesAmount, planType, paymentStatus, collectedAmount, method, clientRequestId);
      if (duplicate) {
        pushToast({
          title: "Already renewed",
          message: "This tap was a duplicate — the plan was renewed only once.",
          tone: "info",
        });
        return;
      }
      const smsNote = receiptSms === "sent" ? " · bill SMS sent" : receiptSms === "queued" ? " · bill SMS queued, auto-retrying" : "";
      const emailNote = receiptEmail === "sent" ? " · bill email sent" : receiptEmail === "queued" ? " · bill email queued, auto-retrying" : "";
      pushToast({
        title: "Membership renewed",
        message: `Plan start: ${formatDisplayDate(start)}${smsNote}${emailNote}`,
        tone: receiptSms === "failed" || receiptEmail === "failed" ? "info" : "success",
      });
      if (receiptSms === "failed" || receiptEmail === "failed") {
        pushToast({
          title: "Bill message failed",
          message: "Renewal is saved. Tap Resend on the bill to try again.",
          tone: "error",
        });
      }
    } catch (error) {
      pushToast({
        title: "Renewal failed",
        message: error instanceof Error ? error.message : "Unable to renew membership",
        tone: "error",
      });
      throw error;
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

  async function handleDeleteVisit(attendanceId: string): Promise<void> {
    try {
      await deleteVisit(attendanceId);
      pushToast({
        title: "Visit removed",
        message: "The check-in entry was removed.",
        tone: "success",
      });
    } catch (error) {
      pushToast({
        title: "Remove visit failed",
        message: error instanceof Error ? error.message : "Unable to remove visit",
        tone: "error",
      });
    }
  }

  async function handleResendReceipt(memberId: string, receiptId: string, channel: BillChannel): Promise<ResendResult> {
    if (!isApiConfigured) {
      pushToast({
        title: "Demo mode",
        message: "Bills are not actually sent in demo mode.",
        tone: "info",
      });
      return resendReceipt(memberId, receiptId, channel);
    }
    const result = await resendReceipt(memberId, receiptId, channel);
    const parts = [
      result.sms ? `SMS ${result.sms}` : null,
      result.email ? `Email ${result.email}` : null,
    ].filter((part): part is string => part !== null);
    const failed = result.sms === "failed" || result.email === "failed";
    pushToast({
      title: failed ? "Resend had a problem" : "Bill resent",
      message: `${result.receiptNo} · ${parts.join(" · ")}`,
      tone: failed ? "error" : "success",
    });
    retryLoad();
    return result;
  }

  async function handleSendStatement(memberId: string, channel: BillChannel, dryRun = false): Promise<StatementResult> {
    if (!isApiConfigured && !dryRun) {
      pushToast({
        title: "Demo mode",
        message: "Bills are not actually sent in demo mode.",
        tone: "info",
      });
      return { status: "failed", error: "Demo mode — bills are not actually sent." };
    }
    return sendStatement(memberId, channel, dryRun);
  }

  async function handleAddPaymentReceipt(memberId: string, input: PaymentReceiptInput): Promise<void> {
    try {
      const { receipt, receiptSms, receiptEmail, duplicate } = await addPaymentReceipt(memberId, input);
      if (duplicate) {
        pushToast({
          title: "Already recorded",
          message: `${receipt.receiptNo} · ${formatCurrency(receipt.amount)} — this tap was a duplicate, nothing charged twice.`,
          tone: "info",
        });
        return;
      }
      const smsNote = receiptSms === "sent" ? " · bill SMS sent" : receiptSms === "queued" ? " · bill SMS queued, auto-retrying" : "";
      const emailNote = receiptEmail === "sent" ? " · bill email sent" : receiptEmail === "queued" ? " · bill email queued, auto-retrying" : "";
      pushToast({
        title: "Payment receipt saved",
        message: `${receipt.receiptNo} · ${formatCurrency(receipt.amount)}${smsNote}${emailNote}`,
        tone: receiptSms === "failed" || receiptEmail === "failed" ? "info" : "success",
      });
      if (receiptSms === "failed" || receiptEmail === "failed") {
        pushToast({
          title: "Bill message failed",
          message: "Payment is saved. Tap Resend on the bill to try again.",
          tone: "error",
        });
      }
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
    return (
      <main className="grid min-h-dvh place-items-center bg-surface-raised px-4 text-center">
        <p className="text-[14px] font-bold text-text-secondary">Loading your desk…</p>
      </main>
    );
  }

  if (selectedMember) {
    return (
      <>
        <TopBar trainer={trainer} onLogout={() => void signOut()} onSettings={() => setIsSettingsOpen(true)} onReports={() => setIsExportOpen(true)} members={members} onSelectMember={setSelectedMemberId} />
        <MemberProfile
          key={selectedMember.id}
          member={selectedMember}
          attendance={attendance}
          paymentReceipts={selectedMemberPaymentReceipts}
          renewalHistory={selectedMemberRenewalHistory}
          onBack={() => setSelectedMemberId(null)}
          onEdit={setEditingMemberId}
          onSms={(memberId) => openSms(memberId)}
          onSuspend={(memberId) => handleSuspend(memberId)}
          onRestore={(memberId) => handleRestore(memberId)}
          onDeleteMember={(memberId) => handleProfileDelete(memberId)}
          onPurgeMember={(memberId) => handlePurgeMember(memberId)}
          onRenew={(memberId, start, due, feesAmount, planType, paymentStatus, collectedAmount, method, clientRequestId) => handleRenew(memberId, start, due, feesAmount, planType, paymentStatus, collectedAmount, method, clientRequestId)}
          onAddVisit={(memberId, visitDate, weightKg) => void handleAddVisit(memberId, visitDate, weightKg)}
          onDeleteVisit={(attendanceId) => void handleDeleteVisit(attendanceId)}
          onAddPaymentReceipt={(memberId, input) => handleAddPaymentReceipt(memberId, input)}
          onResendReceipt={(memberId, receiptId, channel) => handleResendReceipt(memberId, receiptId, channel)}
          onSendStatement={(memberId, channel, dryRun) => handleSendStatement(memberId, channel, dryRun)}
        />
        <MemberSheet open={editingMemberId !== null} member={editingMember} onClose={() => setEditingMemberId(null)} onSave={saveMember} existingReceiptCount={editingReceiptCount} />
        <SmsModal member={smsMember} open={smsMember !== null} initialTemplate={smsTemplateId} onClose={closeSms} onSend={handleMessageSend} />
        <SettingsModal open={isSettingsOpen} trainer={trainer} onClose={() => setIsSettingsOpen(false)} dataCounts={{ members: members.length, receipts: paymentReceipts.length, renewals: renewalHistory.length, visits: attendance.length }} onWipeAll={() => handleWipeAll()} />
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
      <main className="studio-shell animated-grid relative min-h-dvh overflow-hidden">
        <div className="relative mx-auto grid max-w-[1500px] gap-3 px-3 pb-24 pt-3 sm:px-4 lg:gap-5 lg:px-8 lg:pt-6">
          {isDemo ? (
            <div className="flex items-center gap-2.5 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-800">
              <AlertTriangle size={16} className="shrink-0" />
              <span>Practice data — sample members for trying the app. Real gym records appear after setup.</span>
            </div>
          ) : null}
          {loadError && !loading ? (
            <div className="grid gap-3 rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-status-expired" />
                <div>
                  <p className="text-[15px] font-black text-text-primary">Could not load gym data</p>
                  <p className="mt-0.5 text-[13px] font-semibold text-text-secondary">{loadError}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={retryLoad}
                className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-card)] bg-text-primary px-4 text-[14px] font-bold text-brand-white transition hover:opacity-90"
              >
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : null}
          <section aria-label="Today's money" className="studio-dark grid grid-cols-3 overflow-hidden rounded-[var(--radius-panel)] border border-text-primary">
            <div className="border-l-4 border-l-brand-primary px-3 py-2.5 sm:px-4 sm:py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/60 sm:text-[11px]">Got today</p>
              <p className="mt-0.5 truncate text-[16px] font-black text-white sm:text-[20px]">{formatCurrency(collectedToday)}</p>
            </div>
            <button
              type="button"
              onClick={() => handleMetricClick("pending_fees")}
              className="border-l border-white/10 px-3 py-2.5 text-left transition hover:bg-white/5 sm:px-4 sm:py-3"
              aria-label="Show members with pending fees"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/60 sm:text-[11px]">To collect</p>
              <p className="mt-0.5 truncate text-[16px] font-black text-amber-300 sm:text-[20px]">
                {formatCurrency(pendingTotal)} <span className="hidden text-[11px] font-bold text-white/60 sm:inline">· {dashboardSummary.allTime.pendingMembers} member{dashboardSummary.allTime.pendingMembers === 1 ? "" : "s"}</span>
              </p>
            </button>
            <button
              type="button"
              onClick={() => handleMetricClick("next_renewal")}
              className="border-l border-white/10 px-3 py-2.5 text-left transition hover:bg-white/5 sm:px-4 sm:py-3"
              aria-label="Show renewals due this week"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/60 sm:text-[11px]">Plans ending</p>
              <p className="mt-0.5 truncate text-[16px] font-black text-white sm:text-[20px]">
                {stats.dueThisWeek} <span className="text-[11px] font-bold text-white/60">member{stats.dueThisWeek === 1 ? "" : "s"}</span>
              </p>
            </button>
          </section>
          <motion.section
            className="studio-card grid gap-0 overflow-hidden rounded-[var(--radius-panel)] xl:grid-cols-[minmax(0,1fr)_360px]"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="grid gap-5 p-3 sm:p-4 lg:gap-6 lg:p-8">
              <div className="flex flex-wrap items-start justify-between gap-2 lg:gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-primary sm:text-[12px]">Trainer Desk</p>
                  <h1 className="mt-1 text-[22px] font-black leading-tight text-text-primary sm:text-[28px] lg:mt-2 lg:text-[36px]">
                    Fitness <span className="text-brand-primary">World</span>
                  </h1>
                  <p className="mt-1 text-[14px] font-black text-brand-primary sm:text-[15px] lg:mt-2">
                    Today: {pendingTotal > 0 ? (
                      <>collect {formatCurrency(pendingTotal)} from {dashboardSummary.allTime.pendingMembers} member{dashboardSummary.allTime.pendingMembers === 1 ? "" : "s"}</>
                    ) : (
                      <>no money to collect</>
                    )} · {stats.dueThisWeek} plan{stats.dueThisWeek === 1 ? "" : "s"} ending · {todayFollowUps.length} thing{todayFollowUps.length === 1 ? "" : "s"} to do
                  </p>
                </div>
                <motion.div
                  className="hidden rounded-[var(--radius-card)] border border-white/60 bg-brand-white/40 backdrop-blur-md px-3 py-2 sm:block lg:px-4 lg:py-3 shadow-sm"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted sm:text-[12px]">Today</p>
                  <div className="mt-0.5 text-[14px] font-bold text-text-primary lg:mt-1 lg:text-[17px]">
                    {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
                  </div>
                </motion.div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:gap-3">
                <CommandMetric
                  icon={UsersRound}
                  label="Members"
                  value={`${stats.total}`}
                  tone="neutral"
                  subtext="Total in the gym"
                  footer={`${stats.active} training · ${expiredCount} ended${suspendedCount > 0 ? ` · ${suspendedCount} stopped` : ""}`}
                  index={0}
                  metric="all_members"
                  active={activeMetricFilter === "all_members"}
                  onClick={handleMetricClick}
                />
                <CommandMetric
                  icon={UserCheck}
                  label="Training Now"
                  value={`${stats.active}`}
                  tone="green"
                  subtext="Can train today"
                  footer={stats.dueThisWeek > 0 ? `${stats.dueThisWeek} plan${stats.dueThisWeek === 1 ? "" : "s"} ending` : "Nobody ending soon"}
                  index={1}
                  metric="active_now"
                  active={activeMetricFilter === "active_now"}
                  onClick={handleMetricClick}
                />
                <CommandMetric
                  icon={CalendarClock}
                  label="Plans Ending"
                  value={`${stats.dueThisWeek}`}
                  tone="amber"
                  subtext={nextDueMember ? `${nextDueMember.name} first` : "Nobody ending soon"}
                  footer={nextDueDate ? `${formatDisplayDate(nextDueDate)} · ${nextDueDays} days left` : "Next 7 days clear"}
                  index={2}
                  metric="next_renewal"
                  active={activeMetricFilter === "next_renewal"}
                  onClick={handleMetricClick}
                />
                <CommandMetric
                  icon={IndianRupee}
                  label="Money To Get"
                  value={formatCurrency(pendingTotal)}
                  tone="pink"
                  subtext={
                    dashboardSummary.allTime.agedAmount > 0
                      ? `${dashboardSummary.allTime.pendingMembers} members owe · ${formatCurrency(dashboardSummary.allTime.agedAmount)} very late`
                      : `${dashboardSummary.allTime.pendingMembers} member${dashboardSummary.allTime.pendingMembers === 1 ? "" : "s"} owe`
                  }
                  footer={collectionPulse}
                  index={3}
                  metric="pending_fees"
                  active={activeMetricFilter === "pending_fees"}
                  onClick={handleMetricClick}
                />
                <CommandMetric
                  icon={TrendingUp}
                  label="This Month"
                  value={`${dashboardSummary.thisMonth.memberCount}`}
                  tone="neutral"
                  subtext={`${dashboardSummary.thisMonth.newMembers} joined · ${dashboardSummary.thisMonth.renewals} renewed`}
                  footer={`${formatCurrency(dashboardSummary.thisMonth.collectedAmount)} got`}
                  index={4}
                  metric="members_added"
                  active={activeMetricFilter === "members_added"}
                  onClick={handleMetricClick}
                />
              </div>
            </div>

            <aside className="hidden gap-2 border-l border-border-default bg-surface-raised p-4 xl:grid xl:gap-4 xl:p-5">
              <div className="overflow-hidden rounded-[var(--radius-card)] border border-border-default bg-brand-white p-2">
                <img className="w-full rounded-lg object-contain" src="/brand/fitness-world-banner.jpeg" alt="Fitness World exterior banner" />
              </div>
              <div className="rounded-[var(--radius-card)] border border-border-default bg-brand-white p-3 lg:p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Ending soon</p>
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
                            Ends {formatDisplayDate(getMemberActionDueDate(member))}
                          </span>
                        </span>
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-[12px] font-bold text-status-due">{daysUntil(getMemberActionDueDate(member))} days left</span>
                      </motion.button>
                    ))
                  ) : (
                    <p className="rounded-[var(--radius-card)] bg-surface-raised px-3 py-3 text-[14px] font-semibold text-text-secondary lg:text-[15px]">No plans ending in the next 7 days.</p>
                  )}
                </div>
              </div>
            </aside>
          </motion.section>

          <FollowUpQueue
            items={todayFollowUps}
            onView={setSelectedMemberId}
            onMessage={(memberId, template) => openSms(memberId, template)}
          />

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
                  <p className="text-[11px] font-bold uppercase tracking-wider">Money Report</p>
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
              <h2 className="text-[18px] font-black leading-tight text-text-primary sm:text-[20px]">How the gym is doing</h2>
              <p className="text-[12px] font-semibold leading-5 text-text-secondary sm:text-[13px]">
                {selectedAnalysis.label}: who joined, what money came in, and what is still owed.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6 lg:gap-3">
              <InsightMetric
                label="New Members"
                value={`${selectedAnalysis.memberCount}`}
                subtext={`${selectedAnalysis.newMembers} joined · ${selectedAnalysis.renewals} renewed`}
                footer={selectedAnalysis.label}
                tone="pink"
                onClick={() => handleMetricClick("members_added")}
                active={activeMetricFilter === "members_added"}
              />
              <InsightMetric
                label="Money Got"
                value={formatCurrency(selectedAnalysis.collectedAmount)}
                subtext={`Got ${selectedAnalysis.collectionRate}% of expected`}
                footer={`Should get ${formatCurrency(selectedAnalysis.expectedAmount)}`}
                tone="green"
                onClick={() => handleMetricClick("money_collected")}
                active={activeMetricFilter === "money_collected"}
              />
              <InsightMetric
                label="Still To Get"
                value={formatCurrency(selectedAnalysis.pendingAmount)}
                subtext={`${selectedAnalysis.pendingMembers} member${selectedAnalysis.pendingMembers === 1 ? "" : "s"} owe`}
                footer="Go collect"
                tone="amber"
                onClick={() => handleMetricClick("pending_fees")}
                active={activeMetricFilter === "pending_fees"}
              />
              <InsightMetric
                label="Training Now"
                value={`${selectedAnalysis.activeCount}`}
                subtext={`${selectedAnalysis.coupleMembers} joined as couples`}
                footer="Plans running"
                tone="green"
                onClick={() => handleMetricClick("active_now")}
                active={activeMetricFilter === "active_now"}
              />
              <InsightMetric
                label="Not Coming"
                value={`${inactiveIds.size}`}
                subtext="No visit for 7+ days"
                footer="Call them back"
                tone="sky"
                onClick={() => handleMetricClick("inactive_now")}
                active={activeMetricFilter === "inactive_now"}
              />
              <InsightMetric
                label="Next Plan Ending"
                value={nextDueDate ? `${daysUntil(nextDueDate)} days` : "Clear"}
                subtext={nextDueMember ? nextDueMember.name : "Nobody this week"}
                footer={nextDueDate ? `Ends ${formatDisplayDate(nextDueDate)}` : "Nothing to do"}
                tone="amber"
                onClick={() => handleMetricClick("next_renewal")}
                active={activeMetricFilter === "next_renewal"}
              />
            </div>
          </motion.section>

          <FilterBar filters={filters} resultCount={baseFilteredMembers.length} onChange={setFilter} members={members} />
          
          {monthlyStats && (
            <motion.section
              className="studio-card overflow-hidden rounded-[var(--radius-panel)] border border-border-default p-4 lg:p-6"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-default pb-3 lg:pb-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-primary">Month Money</p>
                  <h3 className="text-[18px] font-black text-text-primary sm:text-[20px]">
                    Money In & Out: <span className="text-brand-primary">{monthlyStats.monthLabel}</span>
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
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Should Get (Expected)</span>
                    <p className="mt-1 text-[20px] font-black text-text-primary lg:text-[24px]">
                      {formatCurrency(monthlyStats.expected)}
                    </p>
                  </div>
                  <p className="mt-2 text-[11px] font-semibold text-text-secondary">Total fees for this month</p>
                </div>

                {/* Received / Profit Card */}
                <div className="rounded-[var(--radius-card)] border border-emerald-100 bg-emerald-50/20 p-3 lg:p-4 shadow-sm flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Got (Collected)</span>
                    <p className="mt-1 text-[20px] font-black text-status-active lg:text-[24px]">
                      {formatCurrency(monthlyStats.collected)}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-700">Cash in hand</span>
                    <span className="text-[11px] font-extrabold text-status-active bg-green-50 px-1.5 py-0.5 rounded">
                      {monthlyStats.collectionRate}%
                    </span>
                  </div>
                </div>

                {/* Pending Collection Card */}
                <div className="rounded-[var(--radius-card)] border border-amber-100 bg-amber-50/20 p-3 lg:p-4 shadow-sm flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Still To Get</span>
                    <p className="mt-1 text-[20px] font-black text-status-due lg:text-[24px]">
                      {formatCurrency(monthlyStats.pending)}
                    </p>
                  </div>
                  <p className="mt-2 text-[11px] font-semibold text-amber-700">Members who still owe</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4 lg:mt-5">
                <div className="flex items-center justify-between text-[12px] font-bold text-text-secondary">
                  <span>Money Got So Far</span>
                  <span>{monthlyStats.collectionRate}% Done</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-status-active transition-all duration-500"
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
                  Showing: <span className="underline">{
                    activeMetricFilter === "all_members" ? "All members" :
                    activeMetricFilter === "members_added" ? "New members" :
                    activeMetricFilter === "money_collected" ? "Members who paid" :
                    activeMetricFilter === "pending_fees" ? "Members who owe" :
                    activeMetricFilter === "active_now" ? "Training now" :
                    activeMetricFilter === "inactive_now" ? "Stopped coming (no visit 7+ days)" :
                    "Plans ending soon"
                  }</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveMetricFilter(null)}
                className="text-[12px] font-black uppercase tracking-wider text-brand-primary hover:text-brand-primary-dark transition bg-brand-white px-2.5 py-1 rounded-md border border-brand-primary/10 shadow-sm cursor-pointer"
              >
                Show All
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
            onRestore={(memberId) => void handleRestore(memberId)}
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
      <MemberSheet open={editingMemberId !== null} member={editingMemberId === "new" ? null : editingMember} onClose={() => setEditingMemberId(null)} onSave={saveMember} existingReceiptCount={editingReceiptCount} />
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
        message={`Remove ${confirmingDeleteMember?.name ?? "this member"} from the gym list? Their bills and visits stay saved, and you can bring them back anytime from the Removed filter.`}
        confirmText="Delete"
        variant="danger"
        onConfirm={async () => {
          if (confirmingDeleteId) {
            try {
              await deleteMember(confirmingDeleteId);
              pushToast({
                title: "Member Removed",
                message: `${confirmingDeleteMember?.name ?? "Member"} is removed from the list. Their history stays saved.`,
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
      <SettingsModal open={isSettingsOpen} trainer={trainer} onClose={() => setIsSettingsOpen(false)} dataCounts={{ members: members.length, receipts: paymentReceipts.length, renewals: renewalHistory.length, visits: attendance.length }} onWipeAll={() => handleWipeAll()} />
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
  metric: string;
  active: boolean;
  onClick: (metric: string) => void;
}

function CommandMetric({ icon: Icon, label, value, subtext, footer, tone = "neutral", index, metric, active, onClick }: CommandMetricProps) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50 text-status-due"
      : tone === "pink"
      ? "bg-brand-primary-light text-brand-primary"
      : tone === "green"
      ? "bg-green-50 text-status-active"
      : "bg-sky-50 text-sky-700";

  return (
    <motion.button
      type="button"
      onClick={() => onClick(metric)}
      aria-pressed={active}
      whileTap={{ scale: 0.97 }}
      className={`card-hover flex min-h-[118px] flex-col justify-between rounded-[var(--radius-card)] border bg-brand-white p-2.5 text-left sm:min-h-[126px] sm:p-3 lg:p-4 ${active ? "border-brand-primary ring-2 ring-brand-primary/30" : "border-border-default"}`}
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
    </motion.button>
  );
}
