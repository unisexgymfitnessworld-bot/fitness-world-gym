import { ArrowLeft, Banknote, CalendarCheck, FileText, MessageSquare, Pencil, ReceiptText, RefreshCcw, Scale, TrendingUp, Printer, Trash2, UserCheck, UserX } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { buildAttendanceInsights, buildProgressPoints, summarizeRenewalHistory } from "../../lib/memberInsights";
import { htmlEscape } from "../../lib/escape";
import { bmiCategory, daysUntil, displayGoal, displayMemberStatus, displayPaymentStatus, dueCountdown, formatCurrency, formatDisplayDate, formatPhone, getMemberActionDueDate, todayISO, initials } from "../../lib/utils";
import { paymentMethodOptions, type AttendanceEntry, type BillChannel, type Member, type PaymentMethod, type PaymentReceipt, type PaymentReceiptInput, type PaymentStatus, type RenewalHistoryEntry, type PlanType, type ResendResult, type StatementResult } from "../../types";
import { AttendanceTable } from "../attendance/AttendanceTable";
import { allocatePayment, totalBalance } from "../../lib/money";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ConfirmModal } from "../ui/ConfirmModal";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { RenewModal } from "./RenewModal";
import { StatementModal } from "./StatementModal";

interface MemberProfileProps {
  member: Member;
  attendance: AttendanceEntry[];
  onBack: () => void;
  onEdit: (memberId: string) => void;
  onSms: (memberId: string) => void;
  onSuspend: (memberId: string) => Promise<void>;
  onRestore: (memberId: string) => Promise<void>;
  onDeleteMember: (memberId: string) => Promise<void>;
  onPurgeMember: (memberId: string) => Promise<void>;
  onRenew: (memberId: string, start: string, due: string, feesAmount: number, planType: PlanType, paymentStatus: PaymentStatus, collectedAmount: number, method?: PaymentMethod, clientRequestId?: string) => Promise<void>;
  onAddVisit: (memberId: string, visitDate: string, weightKg?: number) => Promise<void>;
  onDeleteVisit: (attendanceId: string) => void;
  paymentReceipts: PaymentReceipt[];
  renewalHistory: RenewalHistoryEntry[];
  onAddPaymentReceipt: (memberId: string, input: PaymentReceiptInput) => Promise<void>;
  onResendReceipt: (memberId: string, receiptId: string, channel: BillChannel) => Promise<ResendResult>;
  onDeleteReceipt: (memberId: string, receiptId: string) => Promise<void>;
  onSendStatement: (memberId: string, channel: BillChannel, dryRun?: boolean) => Promise<StatementResult>;
}

export function MemberProfile({ member, attendance, paymentReceipts, renewalHistory, onBack, onEdit, onSms, onRenew, onAddVisit, onDeleteVisit, onAddPaymentReceipt, onResendReceipt, onDeleteReceipt, onSendStatement, onSuspend, onRestore, onDeleteMember, onPurgeMember }: MemberProfileProps) {
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [confirming, setConfirming] = useState<"suspend" | "delete" | "purge" | "restore" | null>(null);
  const [purgeUnderstood, setPurgeUnderstood] = useState(false);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const actionDueDate = getMemberActionDueDate(member);
  const memberAttendance = useMemo(() => attendance.filter((entry) => entry.memberId === member.id), [attendance, member.id]);
  const latestWeighIn = useMemo(
    () => memberAttendance.filter((entry) => entry.weightKg !== undefined).sort((a, b) => b.visitDate.localeCompare(a.visitDate))[0],
    [memberAttendance],
  );
  const memberRenewals = useMemo(() => renewalHistory.filter((entry) => entry.memberId === member.id), [member.id, renewalHistory]);
  const isDeleted = member.status === "Deleted";
  const countdown = dueCountdown(member);
  const remainingDays = daysUntil(member.membershipDue);
  const countdownTone = remainingDays < 0 ? "text-red-300" : remainingDays <= 3 ? "text-amber-300" : "text-green-300";

  return (
    <main className="studio-shell animated-grid relative min-h-screen overflow-hidden">
      <div className="relative mx-auto grid max-w-[1440px] gap-4 px-4 pb-10 pt-4 lg:gap-6 lg:px-8 lg:pt-6">
      <motion.div
        className="flex flex-wrap items-center justify-between gap-3 print:hidden"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft size={18} />
          Back
        </Button>
        <div className="scrollbar-hide flex flex-nowrap gap-2 overflow-x-auto">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={18} />
            <span className="hidden sm:inline">Print / PDF</span>
          </Button>
          {isDeleted ? (
            <>
              <Button variant="secondary" onClick={() => setConfirming("restore")}>
                <UserCheck size={18} />
                <span className="hidden sm:inline">Restore</span>
              </Button>
              <Button variant="secondary" onClick={() => { setPurgeUnderstood(false); setConfirming("purge"); }}>
                <Trash2 size={18} />
                <span className="hidden sm:inline">Delete forever</span>
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onEdit(member.id)}>
                <Pencil size={18} />
                <span className="hidden sm:inline">Edit</span>
              </Button>
              <Button variant="secondary" onClick={() => onSms(member.id)}>
                <MessageSquare size={18} />
                <span className="hidden sm:inline">SMS</span>
              </Button>
              <Button variant="secondary" onClick={() => setIsStatementOpen(true)}>
                <FileText size={18} />
                <span className="hidden sm:inline">Send Bill</span>
              </Button>
              <Button variant="secondary" onClick={() => setConfirming("suspend")}>
                {member.status === "Suspended" ? <UserCheck size={18} /> : <UserX size={18} />}
                <span className="hidden sm:inline">{member.status === "Suspended" ? "Unsuspend" : "Suspend"}</span>
              </Button>
              <Button variant="secondary" onClick={() => setConfirming("delete")}>
                <Trash2 size={18} />
                <span className="hidden sm:inline">Delete</span>
              </Button>
              <Button onClick={() => setIsRenewOpen(true)}>
                <RefreshCcw size={18} />
                Renew
              </Button>
            </>
          )}
        </div>
      </motion.div>

      {isDeleted ? (
        <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-800 print:hidden">
          This member is deleted. Restore them from the members list to edit, message, or renew.
        </div>
      ) : null}

      <motion.section
        className="studio-card overflow-hidden rounded-[var(--radius-card)]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
      >
        <div className="studio-dark grid gap-4 p-4 text-brand-white lg:min-h-56 lg:grid-cols-[1fr_280px] lg:gap-6 lg:p-6">
          <div className="flex items-start gap-4 lg:gap-5">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-white/20 bg-brand-white/10 flex items-center justify-center shadow-[0_8px_20px_rgba(0,0,0,0.25)] lg:h-20 lg:w-20">
              {member.avatar ? (
                <img src={member.avatar} alt={member.name} className="h-full w-full object-cover rounded-full" />
              ) : (
                <span className="text-[20px] font-black text-brand-white lg:text-[24px]">{initials(member.name)}</span>
              )}
            </div>
            <div>
            <p className="font-mono text-[12px] font-semibold text-brand-primary-light lg:text-[13px]">{member.regNo}</p>
            <h1 className="mt-1 text-[26px] font-extrabold leading-tight lg:mt-2 lg:text-[34px]">{member.name}</h1>
            <div className="mt-3 flex flex-wrap gap-1.5 lg:mt-4 lg:gap-2">
              <Badge tone={member.status === "Active" ? "active" : member.status === "Expired" ? "expired" : "neutral"}>{displayMemberStatus(member.status)}</Badge>
              <Badge tone="neutral">{displayGoal(member)}</Badge>
              <Badge tone={member.paymentStatus === "Paid" ? "paid" : member.paymentStatus === "Partially Paid" ? "due" : "pending"}>{displayPaymentStatus(member.paymentStatus)}</Badge>
            </div>
            </div>
          </div>
          <div className="rounded-[var(--radius-card)] border border-white/10 bg-white/10 p-3 lg:p-4">
            <p className="text-[12px] font-bold uppercase tracking-wider text-white/60">Plan Ends</p>
            <p className="mt-1.5 text-[20px] font-black lg:mt-2 lg:text-[22px]">
              {formatDisplayDate(actionDueDate)}
            </p>
            {countdown ? (
              <p className={`mt-1 text-[13px] font-black ${countdownTone}`}>{countdown}</p>
            ) : null}
            <p className="mt-1 text-[12px] font-bold uppercase tracking-wide text-white/60">
              {member.planType} · {displayPaymentStatus(member.paymentStatus)}
            </p>
            {member.paymentStatus === "Paid" ? (
              <p className="mt-2 text-[14px] text-white/70 lg:mt-3 lg:text-[15px]">{formatCurrency(member.feesAmount)} · Fully paid ✓</p>
            ) : (
              <div className="mt-2 space-y-1 text-[13px] text-white/80 border-t border-white/10 pt-2 lg:mt-3">
                <div className="flex justify-between">
                  <span>This cycle fee:</span>
                  <span className="font-bold">{formatCurrency(member.feesAmount)}</span>
                </div>
                {(member.arrearsAmount ?? 0) > 0 ? (
                  <div className="flex justify-between text-amber-300">
                    <span>Old pending:</span>
                    <span className="font-bold">{formatCurrency(member.arrearsAmount ?? 0)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-green-300">
                  <span>Got:</span>
                  <span className="font-bold">{formatCurrency(member.partialPaidAmount)}</span>
                </div>
                <div className="flex justify-between text-amber-300">
                  <span>Still to get:</span>
                  <span className="font-bold">{formatCurrency(member.balanceAmount)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2 lg:gap-6 lg:p-6">
          <motion.section
            className="grid gap-3 lg:gap-4"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            <h2 className="text-[20px] font-black text-text-primary lg:text-[22px]">Member Details</h2>
            <dl className="grid gap-2 lg:gap-3">
              <ProfileRow label="Phone" value={formatPhone(member.phone)} mono />
              <ProfileRow label="Age" value={`${member.age}`} />
              <ProfileRow label="Gender" value={member.gender} />
              <ProfileRow label="Training Type" value={member.trainingType} />
              <ProfileRow label="Address" value={member.address || "None recorded"} />
              <ProfileRow label="Join Date" value={formatDisplayDate(member.joinDate)} />
              <ProfileRow label="Plan" value={member.planType} />
              <ProfileRow label="Membership Start" value={formatDisplayDate(member.membershipStart)} />
              <ProfileRow label="BMI" value={`${member.bmi} · ${bmiCategory(member.bmi)}`} />
              <ProfileRow label="Weight" value={latestWeighIn ? `${member.weightKg} kg · as of ${formatDisplayDate(latestWeighIn.visitDate)}` : `${member.weightKg} kg`} />
              <ProfileRow label="Height" value={`${member.heightCm} cm`} />
            </dl>
          </motion.section>

          <motion.section
            className="grid gap-3 lg:gap-4"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
          >
            <h2 className="text-[20px] font-black text-text-primary lg:text-[22px]">Training Notes</h2>
            <dl className="grid gap-2 lg:gap-3">
              <ProfileRow label="Goal" value={displayGoal(member)} />
              <ProfileRow label="Health Problem" value={member.healthProblem || "None recorded"} />
              <ProfileRow label="Special Instruction" value={member.specialInstruction || "None recorded"} />
              <ProfileRow label="Warmup" value={member.warmupExercises || "Not recorded"} />
              <ProfileRow label="Flexibility" value={member.flexibilityTraining || "Not recorded"} />
              <ProfileRow label="Cardio" value={member.cardioTraining || "Not recorded"} />
            </dl>
          </motion.section>
        </div>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.45 }}
      >
        <MemberInsightPanel member={member} attendance={memberAttendance} renewalHistory={memberRenewals} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        <PaymentReceiptPanel member={member} receipts={paymentReceipts} onAddPaymentReceipt={onAddPaymentReceipt} onResendReceipt={onResendReceipt} onDeleteReceipt={onDeleteReceipt} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.55 }}
      >
        <RenewalHistoryPanel history={memberRenewals} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
      >
        <AttendanceTable memberId={member.id} attendance={attendance} onAddVisit={onAddVisit} onDeleteVisit={onDeleteVisit} />
      </motion.div>
      </div>

      <RenewModal
        key={isRenewOpen ? member.id : "closed"}
        open={isRenewOpen}
        member={member}
        renewalHistory={memberRenewals}
        onClose={() => setIsRenewOpen(false)}
        onConfirm={onRenew}
      />
      <StatementModal
        open={isStatementOpen}
        memberName={member.name}
        memberEmail={member.email}
        onClose={() => setIsStatementOpen(false)}
        onPreview={() => onSendStatement(member.id, "auto", true).then((result) => ({ sms: result.sms ?? null, email: result.email ?? null }))}
        onSend={(channel) => onSendStatement(member.id, channel, false)}
      />

      <ConfirmModal
        open={confirming === "suspend"}
        title={member.status === "Suspended" ? "Unsuspend member?" : "Suspend member?"}
        message={member.status === "Suspended"
          ? `${member.name} will be able to train again. Dues stay as they are.`
          : `${member.name} will be blocked from training until unsuspended. Their record and dues stay.`}
        confirmText={member.status === "Suspended" ? "Unsuspend" : "Suspend"}
        onConfirm={async () => {
          setConfirming(null);
          await onSuspend(member.id);
        }}
        onClose={() => setConfirming(null)}
      />

      <ConfirmModal
        open={confirming === "restore"}
        title="Restore member?"
        message={`Bring ${member.name} back to the gym list? Their bills and visits stay saved.`}
        confirmText="Restore"
        variant="success"
        onConfirm={async () => {
          setConfirming(null);
          await onRestore(member.id);
        }}
        onClose={() => setConfirming(null)}
      />

      <ConfirmModal
        open={confirming === "delete"}
        title="Delete member?"
        message={`${member.name} will be moved to Deleted. Their receipts, renewals, visits, and messages stay in the system, and they can be restored later.`}
        confirmText="Delete"
        onConfirm={async () => {
          setConfirming(null);
          await onDeleteMember(member.id);
        }}
        onClose={() => setConfirming(null)}
      />

      <Modal open={confirming === "purge"} title="Delete forever?" onClose={() => { if (!purgeBusy) setConfirming(null); }}>
        <div className="grid gap-4">
          <p className="text-[14px] font-semibold leading-relaxed text-text-secondary">
            This permanently erases <strong className="text-text-primary">{member.name}</strong> — profile, visits,
            receipts, renewals, and message history. It cannot be undone. Messages already sent to their phone
            cannot be recalled.
          </p>
          <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] font-bold text-red-800">
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 cursor-pointer accent-red-600"
              checked={purgeUnderstood}
              onChange={(event) => setPurgeUnderstood(event.target.checked)}
            />
            I understand this cannot be undone
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={purgeBusy}>
              Cancel
            </Button>
            <Button
              className="!bg-status-expired !text-brand-white hover:!bg-red-700"
              disabled={!purgeUnderstood || purgeBusy}
              onClick={() => {
                setPurgeBusy(true);
                void onPurgeMember(member.id).finally(() => {
                  setPurgeBusy(false);
                  setConfirming(null);
                });
              }}
            >
              {purgeBusy ? "Erasing..." : "Delete forever"}
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}

function MemberInsightPanel({ member, attendance, renewalHistory }: { member: Member; attendance: AttendanceEntry[]; renewalHistory: RenewalHistoryEntry[] }) {
  const attendanceInsights = useMemo(() => buildAttendanceInsights(attendance), [attendance]);
  const progress = useMemo(() => buildProgressPoints(attendance, member.weightKg), [attendance, member.weightKg]);
  const renewalSummary = useMemo(() => summarizeRenewalHistory(renewalHistory), [renewalHistory]);
  const weightChangeText = progress.weightChangeKg === null ? "No change yet" : `${progress.weightChangeKg > 0 ? "+" : ""}${progress.weightChangeKg} kg`;

  return (
    <section className="studio-card grid gap-3 rounded-[var(--radius-card)] p-4 lg:grid-cols-3 lg:gap-4 lg:p-5">
      <InsightCard
        icon={CalendarCheck}
        label="Attendance Health"
        value={attendanceInsights.statusLabel}
        subtext={attendanceInsights.lastVisitDate ? `Last visit ${formatDisplayDate(attendanceInsights.lastVisitDate)}` : "No check-ins recorded"}
        footer={`${attendanceInsights.visitsThisMonth} visits this month`}
      />
      <InsightCard
        icon={Scale}
        label="Progress"
        value={weightChangeText}
        subtext={progress.latestWeightKg === null ? "Add visit weight to track progress" : `Latest ${progress.latestWeightKg} kg`}
        footer={`${progress.points.length} weight entries`}
      />
      <InsightCard
        icon={TrendingUp}
        label="Renewal History"
        value={`${renewalSummary.count}`}
        subtext={renewalSummary.latestRenewedOn ? `${renewalSummary.latestPlan} · ${formatDisplayDate(renewalSummary.latestRenewedOn)}` : "No renewals yet"}
        footer={`${formatCurrency(renewalSummary.totalAmount)} renewed value`}
      />
    </section>
  );
}

function InsightCard({
  icon: Icon,
  label,
  value,
  subtext,
  footer,
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: string;
  subtext: string;
  footer: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border-default bg-brand-white p-3 shadow-sm lg:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wider text-text-muted">{label}</p>
          <p className="mt-2 text-[22px] font-black leading-tight text-text-primary">{value}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-primary-light text-brand-primary">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-2 text-[13px] font-bold text-text-secondary">{subtext}</p>
      <p className="mt-3 rounded-full bg-surface-raised px-3 py-1 text-[12px] font-black text-text-primary">{footer}</p>
    </div>
  );
}

function RenewalHistoryPanel({ history }: { history: RenewalHistoryEntry[] }) {
  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => b.renewedOn.localeCompare(a.renewedOn) || b.createdAt.localeCompare(a.createdAt)),
    [history],
  );

  return (
    <section className="studio-card grid gap-4 rounded-[var(--radius-card)] p-4 lg:grid-cols-[320px_1fr] lg:gap-6 lg:p-6">
      <div>
        <p className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-brand-primary">
          <RefreshCcw size={16} />
          Renewal Desk
        </p>
        <h2 className="mt-1 text-[20px] font-black text-text-primary lg:text-[22px]">Renewal history</h2>
        <p className="mt-1 text-[13px] font-semibold leading-5 text-text-secondary lg:text-[14px]">
          Old plan, renewed period, amount, and payment state are kept for reports.
        </p>
      </div>

      <div className="grid gap-2">
        {sortedHistory.length > 0 ? (
          sortedHistory.map((entry) => <RenewalHistoryRow key={entry.id} entry={entry} />)
        ) : (
          <div className="rounded-[var(--radius-card)] border border-dashed border-border-default bg-surface-raised px-3 py-5 text-center text-[13px] font-bold text-text-muted">
            No renewal history saved yet.
          </div>
        )}
      </div>
    </section>
  );
}

function RenewalHistoryRow({ entry }: { entry: RenewalHistoryEntry }) {
  return (
    <div className="grid gap-2 rounded-[var(--radius-card)] border border-border-default bg-brand-white px-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center lg:px-4">
      <div>
        <p className="text-[14px] font-black text-text-primary">
          {entry.oldPlanType} to {entry.newPlanType}
        </p>
        <p className="mt-1 text-[12px] font-bold text-text-secondary">
          New period {formatDisplayDate(entry.newStartDate)} → {formatDisplayDate(entry.newDueDate)}
        </p>
        <p className="mt-1 text-[11px] font-black uppercase tracking-wider text-text-muted">Recorded {formatDisplayDate(entry.renewedOn)}</p>
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        <Badge tone={entry.paymentStatus === "Paid" ? "paid" : entry.paymentStatus === "Partially Paid" ? "due" : "pending"}>{displayPaymentStatus(entry.paymentStatus)}</Badge>
        <strong className="text-[15px] font-black text-text-primary">
          {formatCurrency(entry.amount)}
          {entry.arrearsCarried > 0 && (
            <span className="ml-1 text-[11px] font-bold text-status-due">+{formatCurrency(entry.arrearsCarried)} old dues</span>
          )}
        </strong>
      </div>
    </div>
  );
}

function PaymentReceiptPanel({
  member,
  receipts,
  onAddPaymentReceipt,
  onResendReceipt,
  onDeleteReceipt,
}: {
  member: Member;
  receipts: PaymentReceipt[];
  onAddPaymentReceipt: (memberId: string, input: PaymentReceiptInput) => Promise<void>;
  onResendReceipt: (memberId: string, receiptId: string, channel: BillChannel) => Promise<ResendResult>;
  onDeleteReceipt: (memberId: string, receiptId: string) => Promise<void>;
}) {
  const sortedReceipts = useMemo(
    () =>
      [...receipts].sort((a, b) => {
        const dateCompare = b.paidOn.localeCompare(a.paidOn);
        return dateCompare !== 0 ? dateCompare : b.createdAt.localeCompare(a.createdAt);
      }),
    [receipts],
  );
  const receiptTotal = useMemo(() => sortedReceipts.reduce((sum, receipt) => sum + receipt.amount, 0), [sortedReceipts]);
  const recordedOpeningAmount = Math.max(0, Math.min(member.partialPaidAmount - receiptTotal, member.feesAmount));
  const arrearsAmount = Math.max(member.arrearsAmount ?? 0, 0);
  const advanceAmount = Math.max(member.advanceAmount ?? 0, 0);
  const balanceAmount = Math.max(
    member.balanceAmount,
    totalBalance({
      feesAmount: member.feesAmount,
      partialPaidAmount: member.partialPaidAmount,
      arrearsAmount,
    }),
    0,
  );
  const [paidOn, setPaidOn] = useState(todayISO());
  const [amount, setAmount] = useState(balanceAmount > 0 ? String(balanceAmount) : "");
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [note, setNote] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  // One idempotency key per receipt attempt: double-taps and timeout-retaps
  // share it, so the server dedups instead of double-charging. Regenerated
  // after every success so the next receipt is a new operation.
  const requestKeyRef = useRef(crypto.randomUUID());
  const numericAmount = Number(amount);
  const amountPreview =
    Number.isFinite(numericAmount) && numericAmount > 0
      ? allocatePayment(arrearsAmount, member.feesAmount, member.partialPaidAmount, Math.floor(numericAmount))
      : null;
  const fullyPaid = balanceAmount <= 0;
  const memberDeleted = member.status === "Deleted";
  const noFees = member.feesAmount <= 0;
  // Fully-paid members can still pay: overflow becomes advance credit.
  const formLocked = memberDeleted || noFees;

  async function submitReceipt(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSaving) {
      return;
    }
    setError("");
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }
    if (!paidOn || paidOn > todayISO()) {
      setError("Paid date cannot be in the future.");
      return;
    }

    setIsSaving(true);
    try {
      await onAddPaymentReceipt(member.id, {
        paidOn,
        amount: Math.floor(numericAmount),
        method,
        note,
        receiptNo: receiptNo.trim() || undefined,
        clientRequestId: requestKeyRef.current,
      });
      setAmount("");
      setNote("");
      setReceiptNo("");
      requestKeyRef.current = crypto.randomUUID();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to record payment.");
    } finally {
      setIsSaving(false);
    }
  }

  function handlePrintReceipt(receipt: { receiptNo: string; paidOn: string; amount: number; method: string; note: string; arrearsApplied?: number; cycleApplied?: number; advanceApplied?: number }) {
    const inr = (value: number): string => `₹${Math.round(value).toLocaleString("en-IN")}`;
    const splitRows =
      receipt.arrearsApplied !== undefined || receipt.cycleApplied !== undefined || receipt.advanceApplied !== undefined
        ? `<table>
            <tr><td class="label">Old pending</td><td class="value">${inr(receipt.arrearsApplied ?? 0)}</td></tr>
            <tr><td class="label">This plan</td><td class="value">${inr(receipt.cycleApplied ?? 0)}</td></tr>
            ${(receipt.advanceApplied ?? 0) > 0 ? `<tr><td class="label">Extra paid</td><td class="value">${inr(receipt.advanceApplied ?? 0)}</td></tr>` : ""}
          </table>
          <div class="divider"></div>`
        : "";
    const receiptHtml = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt_${htmlEscape(receipt.receiptNo)}</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            body {
              font-family: system-ui, -apple-system, sans-serif;
              width: 74mm;
              margin: 0 auto;
              padding: 15px 5px;
              color: #1f2937;
              background: #ffffff;
              font-size: 11px;
              line-height: 1.5;
            }
            .text-center { text-align: center; }
            .header h1 {
              margin: 0;
              font-size: 18px;
              font-weight: 800;
              letter-spacing: 0.05em;
              color: #db2777;
            }
            .header p {
              margin: 2px 0;
              font-size: 9px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: #6b7280;
              font-weight: 600;
            }
            .header .address {
              margin-top: 1px;
              font-size: 9px;
              color: #9ca3af;
              text-transform: none;
              letter-spacing: normal;
              font-weight: normal;
            }
            .divider {
              border-top: 1px dashed #e5e7eb;
              margin: 12px 0;
            }
            .title {
              font-weight: 800;
              font-size: 12px;
              margin: 6px 0;
              color: #374151;
              letter-spacing: 0.05em;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 10px 0;
            }
            td {
              padding: 5px 0;
              vertical-align: middle;
            }
            .label {
              color: #4b5563;
              font-weight: 500;
              text-align: left;
              width: 40%;
            }
            .value {
              text-align: right;
              font-weight: 600;
              color: #111827;
            }
            .amount-box {
              background: #fdf2f8;
              border: 1px solid #fbcfe8;
              border-radius: 8px;
              padding: 12px;
              text-align: center;
              font-size: 15px;
              font-weight: 800;
              color: #db2777;
              margin: 15px 0;
              letter-spacing: 0.02em;
            }
            .note-card {
              background: #f9fafb;
              border-left: 3px solid #db2777;
              padding: 8px 10px;
              border-radius: 4px;
              margin: 12px 0;
              font-size: 10px;
              color: #4b5563;
              line-height: 1.4;
              text-align: left;
            }
            .note-card strong {
              color: #374151;
            }
            .footer {
              font-size: 9px;
              color: #9ca3af;
              margin-top: 15px;
              line-height: 1.4;
            }
          </style>
        </head>
        <body>
          <div class="header text-center">
            <h1>FITNESS WORLD</h1>
            <p>Unisex Gym & Fitness Center</p>
            <p class="address">M.G.R Nagar, Chennai</p>
          </div>
          <div class="divider"></div>
          <div class="title text-center">PAYMENT RECEIPT</div>
          <table>
            <tr>
              <td class="label">Receipt No</td>
              <td class="value">${htmlEscape(receipt.receiptNo)}</td>
            </tr>
            <tr>
              <td class="label">Date</td>
              <td class="value">${new Date(receipt.paidOn).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
            </tr>
            <tr>
              <td class="label">Member ID</td>
              <td class="value">${htmlEscape(member.regNo)}</td>
            </tr>
            <tr>
              <td class="label">Name</td>
              <td class="value">${htmlEscape(member.name)}</td>
            </tr>
            <tr>
              <td class="label">Method</td>
              <td class="value">${htmlEscape(receipt.method)}</td>
            </tr>
            <tr>
              <td class="label">Plan period</td>
              <td class="value">${formatDisplayDate(member.membershipStart)} → ${formatDisplayDate(member.membershipDue)}</td>
            </tr>
            <tr>
              <td class="label">Plan fee</td>
              <td class="value">${inr(member.feesAmount)}</td>
            </tr>
            <tr>
              <td class="label">Still to get</td>
              <td class="value">${inr(balanceAmount)}</td>
            </tr>
          </table>
          <div class="divider"></div>
          ${splitRows}
          <div class="amount-box">
            PAID: ${inr(receipt.amount)}
          </div>
          ${receipt.note ? `
            <div class="note-card">
              <strong>Note:</strong> ${htmlEscape(receipt.note)}
            </div>
          ` : ''}
          <div class="divider"></div>
          <div class="footer text-center">
            <p style="margin: 0; font-weight: 600; color: #6b7280;">Thank you for training with us!</p>
            <p style="margin: 2px 0 0 0;">Please keep this receipt for your reference.</p>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Popup blocked — allow popups to print the slip.");
      return;
    }
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
  }

  return (
    <section className="studio-card grid gap-4 rounded-[var(--radius-card)] p-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-6 lg:p-6">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-brand-primary">
              <ReceiptText size={16} />
              Money
            </p>
            <h2 className="mt-1 text-[20px] font-black text-text-primary lg:text-[22px]">Bills & Payments</h2>
            <p className="mt-1 text-[13px] font-semibold leading-5 text-text-secondary lg:text-[14px]">
              Take money and give bills here. Plan dates stay as they are.
            </p>
          </div>
          <Badge tone={member.paymentStatus === "Paid" ? "paid" : member.paymentStatus === "Partially Paid" ? "due" : "pending"}>
            {displayPaymentStatus(member.paymentStatus)}
          </Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <PaymentMetric label="This Plan Fee" value={formatCurrency(member.feesAmount)} />
          <PaymentMetric label="Old Pending" value={formatCurrency(arrearsAmount)} tone={arrearsAmount > 0 ? "amber" : "green"} />
          <PaymentMetric label="Extra Paid" value={formatCurrency(advanceAmount)} tone={advanceAmount > 0 ? "green" : "neutral"} />
          <PaymentMetric label="Got (This Plan)" value={formatCurrency(member.partialPaidAmount)} tone="green" />
          <PaymentMetric label="Still To Get" value={formatCurrency(balanceAmount)} tone={balanceAmount > 0 ? "amber" : "green"} />
        </div>

        <form className="grid gap-3 rounded-[var(--radius-card)] border border-border-default bg-surface-raised p-3 lg:p-4 print:hidden" onSubmit={submitReceipt}>
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[13px] font-black uppercase tracking-wider text-text-primary">
              <Banknote size={16} className="text-brand-primary" />
              Take Payment
            </p>
            <span className={`rounded-full px-3 py-1 text-[12px] font-black ${
              balanceAmount > 0 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"
            }`}>
              {balanceAmount > 0 ? `Due ${formatCurrency(balanceAmount)}` : "Fully Paid ✓"}
            </span>
          </div>
          {memberDeleted ? (
            <p className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800">
              This member is deleted. Restore them from the members list before recording payments.
            </p>
          ) : noFees ? (
            <p className="rounded-[var(--radius-card)] border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-bold text-slate-600">
              No fees set for this plan. Edit the member to set fees before recording payments.
            </p>
          ) : fullyPaid ? (
            <p className="rounded-[var(--radius-card)] border border-green-200 bg-green-50 px-3 py-2 text-[12px] font-bold text-green-800">
              Fully paid. Any amount collected now becomes advance credit for the next cycle.
            </p>
          ) : null}
          <fieldset disabled={formLocked} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Amount (extra money = next plan)" type="number" step="1" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={isSaving} />
            <Input label="Paid Date" type="date" max={todayISO()} value={paidOn} onChange={(event) => setPaidOn(event.target.value)} disabled={isSaving} />
            <label className="grid gap-2 text-[14px] font-semibold lg:text-[15px]">
              Method
              <select className="studio-input w-full px-3 py-2.5 lg:px-4 lg:py-3" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)} disabled={isSaving}>
                {paymentMethodOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <Input label="Receipt No" placeholder="Auto if empty" value={receiptNo} onChange={(event) => setReceiptNo(event.target.value)} disabled={isSaving} />
          </div>
          {amountPreview ? (
            <p className="rounded-[var(--radius-card)] border border-green-200 bg-green-50 px-3 py-2 text-[12px] font-bold text-green-800">
              Split: {formatCurrency(amountPreview.arrearsApplied)} old pending ·{" "}
              {formatCurrency(amountPreview.cycleApplied)} this plan
              {amountPreview.advanceApplied > 0 ? <> · {formatCurrency(amountPreview.advanceApplied)} extra</> : null}
            </p>
          ) : null}
          <label className="grid gap-2 text-[14px] font-semibold lg:text-[15px]">
            Note
            <textarea
              className="studio-input min-h-20 w-full px-3 py-2.5 text-[14px] font-normal lg:px-4 lg:py-3 lg:text-[15px]"
              value={note}
              maxLength={180}
              onChange={(event) => setNote(event.target.value)}
              disabled={isSaving}
              placeholder="Cash counter, UPI ref, or trainer note"
            />
          </label>
          </fieldset>
          {error ? <p className="rounded-[var(--radius-card)] bg-red-50 px-3 py-2 text-[12px] font-bold text-status-expired">{error}</p> : null}
          <Button type="submit" disabled={isSaving || formLocked}>
            <ReceiptText size={18} />
            {isSaving ? "Saving..." : "Take & Save Bill"}
          </Button>
        </form>
      </div>

      <div className="rounded-[var(--radius-card)] border border-border-default bg-brand-white p-3 lg:p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] font-black uppercase tracking-wider text-text-muted">Old Bills</p>
          <span className="rounded-full bg-surface-raised px-3 py-1 text-[12px] font-black text-text-secondary">
            {(() => {
              const count = sortedReceipts.length + (recordedOpeningAmount > 0 ? 1 : 0);
              return `${count} ${count === 1 ? "entry" : "entries"}`;
            })()}
          </span>
        </div>
        <div className="mt-3 grid gap-2">
          {recordedOpeningAmount > 0 ? (
            <ReceiptRow
              title="Recorded before receipt log"
              date={formatDisplayDate(member.membershipStart)}
              amount={recordedOpeningAmount}
              method="Opening"
              note="Existing paid amount kept from the member record"
            />
          ) : null}
          {sortedReceipts.length > 0 ? (
            sortedReceipts.map((receipt) => (
              <ReceiptRow
                key={receipt.id}
                title={receipt.receiptNo}
                date={formatDisplayDate(receipt.paidOn)}
                amount={receipt.amount}
                method={receipt.method}
                note={receipt.note || "No note"}
                split={
                  receipt.arrearsApplied !== undefined ||
                  receipt.cycleApplied !== undefined ||
                  receipt.advanceApplied !== undefined
                    ? `Split: ${formatCurrency(receipt.arrearsApplied ?? 0)} old pending · ${formatCurrency(receipt.cycleApplied ?? 0)} this plan${(receipt.advanceApplied ?? 0) > 0 ? ` · ${formatCurrency(receipt.advanceApplied ?? 0)} extra` : ""}`
                    : undefined
                }
                onPrint={() => handlePrintReceipt(receipt)}
                delivery={receipt.delivery}
                onResend={(channel) => onResendReceipt(member.id, receipt.id, channel)}
                onDelete={() => onDeleteReceipt(member.id, receipt.id)}
              />
            ))
          ) : recordedOpeningAmount <= 0 ? (
            <div className="rounded-[var(--radius-card)] border border-dashed border-border-default bg-surface-raised px-3 py-5 text-center text-[13px] font-bold text-text-muted">
              No receipts saved yet.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PaymentMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "green" | "amber" }) {
  const toneClass = tone === "green" ? "text-status-active" : tone === "amber" ? "text-status-due" : "text-text-primary";
  return (
    <div className="rounded-[var(--radius-card)] border border-border-default bg-brand-white px-3 py-2.5 lg:px-4 lg:py-3">
      <p className="text-[11px] font-black uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`mt-1 text-[20px] font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function ReceiptRow({
  title,
  date,
  amount,
  method,
  note,
  split,
  onPrint,
  delivery,
  onResend,
  onDelete,
}: {
  title: string;
  date: string;
  amount: number;
  method: string;
  note: string;
  split?: string;
  onPrint?: () => void;
  delivery?: { sms?: string; email?: string };
  onResend?: (channel: BillChannel) => Promise<unknown>;
  onDelete?: () => Promise<void>;
}) {
  const [sending, setSending] = useState<BillChannel | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  async function handleResend(channel: BillChannel): Promise<void> {
    if (!onResend || sending) return;
    setSendError(null);
    setSending(channel);
    try {
      await onResend(channel);
    } catch (caught) {
      setSendError(caught instanceof Error ? caught.message : "Could not resend");
    } finally {
      setSending(null);
    }
  }
  return (
    <div className="grid gap-2 rounded-[var(--radius-card)] border border-border-default bg-surface-raised px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-[12px] font-black text-text-primary">{title}</p>
          <p className="mt-0.5 text-[12px] font-bold text-text-muted">{date} · {method}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <strong className="text-[15px] text-status-active">{formatCurrency(amount)}</strong>
          {onPrint && (
            <button
              type="button"
              className="focus-ring flex h-11 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-brand-white px-3 text-[12px] font-black text-slate-600 hover:text-brand-primary hover:border-brand-primary/40 transition print:hidden"
              onClick={onPrint}
              title="Print/Download receipt slip"
              aria-label="Print receipt slip"
            >
              <Printer size={16} />
              Slip
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="focus-ring flex h-11 w-11 items-center justify-center rounded-md border border-slate-200 bg-brand-white text-slate-500 transition hover:border-red-300 hover:text-status-expired disabled:opacity-50 print:hidden"
              onClick={() => setConfirmingDelete(true)}
              title="Delete this bill (wrong entry)"
              aria-label={`Delete bill ${title}`}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
      <p className="line-clamp-2 text-[12px] font-semibold leading-5 text-text-secondary">{note}</p>
      {split ? <p className="text-[11px] font-bold text-green-700">{split}</p> : null}
      {onResend ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <DeliveryChip label="SMS" status={delivery?.sms} />
          <DeliveryChip label="Email" status={delivery?.email} />
          <button
            type="button"
            disabled={sending !== null}
            onClick={() => void handleResend("sms")}
            title="Send this bill again by SMS"
            className="focus-ring min-h-11 rounded-md border border-border-default bg-brand-white px-3 py-2 text-[12px] font-black text-text-secondary transition hover:border-brand-primary/50 hover:text-brand-primary disabled:opacity-50"
          >
            {sending === "sms" ? "Sending..." : "Resend SMS"}
          </button>
          <button
            type="button"
            disabled={sending !== null}
            onClick={() => void handleResend("email")}
            title="Send this bill again by email"
            className="focus-ring min-h-11 rounded-md border border-border-default bg-brand-white px-3 py-2 text-[12px] font-black text-text-secondary transition hover:border-brand-primary/50 hover:text-brand-primary disabled:opacity-50"
          >
            {sending === "email" ? "Sending..." : "Resend Email"}
          </button>
          {sendError ? <span className="text-[11px] font-bold text-status-expired">{sendError}</span> : null}
        </div>
      ) : null}
      {deleteError ? <p className="text-[11px] font-bold text-status-expired">{deleteError}</p> : null}
      {onDelete ? (
        <ConfirmModal
          open={confirmingDelete}
          title="Delete this bill?"
          message={`Remove bill ${title} (${formatCurrency(amount)})? The member's paid totals go back down. Use this only for wrong entries.`}
          confirmText="Delete Bill"
          variant="danger"
          onConfirm={async () => {
            if (!onDelete) return;
            setDeleteError(null);
            try {
              await onDelete();
              setConfirmingDelete(false);
            } catch (caught: unknown) {
              setDeleteError(caught instanceof Error ? caught.message : "Could not delete bill");
            }
          }}
          onClose={() => setConfirmingDelete(false)}
        />
      ) : null}
    </div>
  );
}

function DeliveryChip({ label, status }: { label: string; status?: string }) {
  if (!status) {
    return (
      <span className="rounded-md bg-surface-overlay px-2 py-1 text-[10px] font-black uppercase tracking-wide text-text-muted">
        {label} · not sent
      </span>
    );
  }
  const good = status === "sent" || status === "delivered";
  const waiting = status === "queued";
  return (
    <span
      className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
        good ? "bg-green-50 text-green-700" : waiting ? "bg-amber-50 text-amber-700" : status === "skipped" ? "bg-surface-overlay text-text-muted" : "bg-red-50 text-status-expired"
      }`}
    >
      {label} · {good ? "sent ✓" : waiting ? "sending…" : status === "skipped" ? "no address" : "failed !"}
    </span>
  );
}

function ProfileRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 rounded-lg bg-surface-raised px-3 py-2.5 lg:grid-cols-[148px_1fr] lg:gap-3 lg:px-4 lg:py-3">
      <dt className="text-[14px] font-semibold text-text-muted lg:text-[15px]">{label}</dt>
      <dd className={mono ? "font-mono text-[12px] text-text-primary lg:text-[13px]" : "text-[14px] font-semibold text-text-primary lg:text-[15px]"}>{value}</dd>
    </div>
  );
}
