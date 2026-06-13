import { ArrowLeft, Banknote, CalendarCheck, MessageCircle, MessageSquare, Pencil, ReceiptText, RefreshCcw, Scale, TrendingUp, Printer } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState, type FormEvent } from "react";
import { buildAttendanceInsights, buildProgressPoints, summarizeRenewalHistory } from "../../lib/memberInsights";
import { calculateDueDate, createWhatsAppLink, formatCurrency, formatDisplayDate, formatPhone, getMemberActionDueDate, getMemberDueKind, todayISO, isPlanLessThanOneMonth, calculateNextRenewalStart } from "../../lib/utils";
import { paymentMethodOptions, type AttendanceEntry, type Member, type PaymentMethod, type PaymentReceipt, type PaymentReceiptInput, type RenewalHistoryEntry, type PlanType } from "../../types";
import { AttendanceTable } from "../attendance/AttendanceTable";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { RenewModal } from "./RenewModal";

interface MemberProfileProps {
  member: Member;
  attendance: AttendanceEntry[];
  onBack: () => void;
  onEdit: (memberId: string) => void;
  onSms: (memberId: string) => void;
  onRenew: (memberId: string, start: string, due: string, feesAmount: number, planType: PlanType) => Promise<void>;
  onAddVisit: (memberId: string, visitDate: string, weightKg?: number) => void;
  paymentReceipts: PaymentReceipt[];
  renewalHistory: RenewalHistoryEntry[];
  onAddPaymentReceipt: (memberId: string, input: PaymentReceiptInput) => Promise<void>;
}

export function MemberProfile({ member, attendance, paymentReceipts, renewalHistory, onBack, onEdit, onSms, onRenew, onAddVisit, onAddPaymentReceipt }: MemberProfileProps) {
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const nextStart = calculateNextRenewalStart(member);
  // For Custom plans, preserve the current plan's duration when suggesting next renewal end date
  const nextDue = member.planType === "Custom"
    ? member.membershipDue  // Keep existing date for custom plans
    : calculateDueDate(nextStart, member.planType);
  const actionDueDate = getMemberActionDueDate(member);
  const actionDueKind = getMemberDueKind(member);
  const memberAttendance = useMemo(() => attendance.filter((entry) => entry.memberId === member.id), [attendance, member.id]);
  const memberRenewals = useMemo(() => renewalHistory.filter((entry) => entry.memberId === member.id), [member.id, renewalHistory]);
  const isShortTerm = isPlanLessThanOneMonth(member);

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
          <Button variant="secondary" onClick={() => onEdit(member.id)}>
            <Pencil size={18} />
            <span className="hidden sm:inline">Edit</span>
          </Button>
          {!isShortTerm && (
            <>
              <Button variant="secondary" onClick={() => onSms(member.id)}>
                <MessageSquare size={18} />
                <span className="hidden sm:inline">SMS</span>
              </Button>
              <a
                className="focus-ring inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-card)] border border-green-200 bg-green-50 px-3 py-2 text-[15px] font-semibold text-status-active lg:px-4 lg:py-3"
                href={createWhatsAppLink(member)}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={18} />
                <span className="hidden sm:inline">WhatsApp</span>
              </a>
            </>
          )}
          <Button onClick={() => setIsRenewOpen(true)}>
            <RefreshCcw size={18} />
            Renew
          </Button>
        </div>
      </motion.div>

      <motion.section
        className="studio-card overflow-hidden rounded-[var(--radius-card)]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
      >
        <div className="studio-dark grid gap-4 p-4 text-brand-white lg:min-h-56 lg:grid-cols-[1fr_280px] lg:gap-6 lg:p-6">
          <div className="flex items-start gap-4 lg:gap-5">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-white/20 bg-brand-white/10 flex items-center justify-center shadow-[0_18px_40px_rgba(232,23,93,0.34)] lg:h-20 lg:w-20">
              {member.avatar ? (
                <img src={member.avatar} alt={member.name} className="h-full w-full object-cover rounded-full" />
              ) : (
                <span className="text-[20px] font-black text-brand-white lg:text-[24px]">{member.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div>
            <p className="font-mono text-[12px] font-semibold text-brand-primary-light lg:text-[13px]">{member.regNo}</p>
            <h1 className="mt-1 text-[26px] font-extrabold leading-tight lg:mt-2 lg:text-[34px]">{member.name}</h1>
            <div className="mt-3 flex flex-wrap gap-1.5 lg:mt-4 lg:gap-2">
              <Badge tone={member.status === "Active" ? "active" : member.status === "Expired" ? "expired" : "neutral"}>{member.status}</Badge>
              <Badge tone="neutral">{member.goal}</Badge>
              <Badge tone={member.paymentStatus === "Paid" ? "paid" : member.paymentStatus === "Partially Paid" ? "due" : "pending"}>{member.paymentStatus}</Badge>
            </div>
            </div>
          </div>
          <div className="rounded-[var(--radius-card)] border border-white/10 bg-white/10 p-3 lg:p-4">
            <p className="text-[12px] font-bold uppercase tracking-wider text-white/60">Renewal Date</p>
            <p className="mt-1.5 text-[20px] font-black lg:mt-2 lg:text-[22px]">
              {isShortTerm ? "N/A" : formatDisplayDate(actionDueDate)}
            </p>
            <p className="mt-1 text-[12px] font-bold uppercase tracking-wide text-white/60">
              {isShortTerm ? "" : `${actionDueKind} · `}Payment {member.paymentStatus}
            </p>
            {member.paymentStatus === "Partially Paid" ? (
              <div className="mt-2 space-y-1 text-[13px] text-white/80 border-t border-white/10 pt-2 lg:mt-3">
                <div className="flex justify-between">
                  <span>Total Fees:</span>
                  <span className="font-bold">{formatCurrency(member.feesAmount)}</span>
                </div>
                <div className="flex justify-between text-green-300">
                  <span>Paid:</span>
                  <span className="font-bold">{formatCurrency(member.partialPaidAmount)}</span>
                </div>
                <div className="flex justify-between text-amber-300">
                  <span>Balance:</span>
                  <span className="font-bold">{formatCurrency(member.balanceAmount)}</span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[14px] text-white/70 lg:mt-3 lg:text-[15px]">{formatCurrency(member.feesAmount)}</p>
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
              <ProfileRow label="BMI" value={`${member.bmi}`} />
              <ProfileRow label="Weight" value={`${member.weightKg} kg`} />
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
        <PaymentReceiptPanel member={member} receipts={paymentReceipts} onAddPaymentReceipt={onAddPaymentReceipt} />
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
        <AttendanceTable memberId={member.id} attendance={attendance} onAddVisit={onAddVisit} />
      </motion.div>
      </div>

      <RenewModal
        open={isRenewOpen}
        member={member}
        onClose={() => setIsRenewOpen(false)}
        onConfirm={onRenew}
      />
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
          {formatDisplayDate(entry.oldDueDate)} renewed to {formatDisplayDate(entry.newDueDate)}
        </p>
        <p className="mt-1 text-[11px] font-black uppercase tracking-wider text-text-muted">Recorded {formatDisplayDate(entry.renewedOn)}</p>
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        <Badge tone={entry.paymentStatus === "Paid" ? "paid" : entry.paymentStatus === "Partially Paid" ? "due" : "pending"}>{entry.paymentStatus}</Badge>
        <strong className="text-[15px] font-black text-text-primary">{formatCurrency(entry.amount)}</strong>
      </div>
    </div>
  );
}

function PaymentReceiptPanel({
  member,
  receipts,
  onAddPaymentReceipt,
}: {
  member: Member;
  receipts: PaymentReceipt[];
  onAddPaymentReceipt: (memberId: string, input: PaymentReceiptInput) => Promise<void>;
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
  const balanceAmount = Math.max(member.balanceAmount, member.feesAmount - member.partialPaidAmount, 0);
  const [paidOn, setPaidOn] = useState(todayISO());
  const [amount, setAmount] = useState(balanceAmount > 0 ? String(balanceAmount) : "");
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [note, setNote] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const numericAmount = Number(amount);
  const isAdvancePayment = balanceAmount === 0 || numericAmount > balanceAmount;

  async function submitReceipt(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }

    setIsSaving(true);
    try {
      const autoNote = isAdvancePayment && !note.trim()
        ? "Advance payment towards next renewal"
        : note;
      await onAddPaymentReceipt(member.id, {
        paidOn,
        amount: numericAmount,
        method,
        note: autoNote,
        receiptNo: receiptNo.trim() || undefined,
      });
      setAmount("");
      setNote("");
      setReceiptNo("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to record payment.");
    } finally {
      setIsSaving(false);
    }
  }

  function handlePrintReceipt(receipt: { receiptNo: string; paidOn: string; amount: number; method: string; note: string }) {
    const receiptHtml = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt_${receipt.receiptNo}</title>
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
              <td class="value">${receipt.receiptNo}</td>
            </tr>
            <tr>
              <td class="label">Date</td>
              <td class="value">${new Date(receipt.paidOn).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
            </tr>
            <tr>
              <td class="label">Member ID</td>
              <td class="value">${member.regNo}</td>
            </tr>
            <tr>
              <td class="label">Name</td>
              <td class="value">${member.name}</td>
            </tr>
            <tr>
              <td class="label">Method</td>
              <td class="value">${receipt.method}</td>
            </tr>
          </table>
          <div class="divider"></div>
          <div class="amount-box">
            PAID: ₹${receipt.amount}
          </div>
          ${receipt.note ? `
            <div class="note-card">
              <strong>Note:</strong> ${receipt.note}
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
    if (printWindow) {
      printWindow.document.write(receiptHtml);
      printWindow.document.close();
    }
  }

  return (
    <section className="studio-card grid gap-4 rounded-[var(--radius-card)] p-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-6 lg:p-6">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-brand-primary">
              <ReceiptText size={16} />
              Payment Desk
            </p>
            <h2 className="mt-1 text-[20px] font-black text-text-primary lg:text-[22px]">Receipt history</h2>
            <p className="mt-1 text-[13px] font-semibold leading-5 text-text-secondary lg:text-[14px]">
              Track every collection without changing plan dates or training details.
            </p>
          </div>
          <Badge tone={member.paymentStatus === "Paid" ? "paid" : member.paymentStatus === "Partially Paid" ? "due" : "pending"}>
            {member.paymentStatus}
          </Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <PaymentMetric label="Plan Fees" value={formatCurrency(member.feesAmount)} />
          <PaymentMetric label="Collected" value={formatCurrency(member.partialPaidAmount)} tone="green" />
          <PaymentMetric label="Balance" value={formatCurrency(balanceAmount)} tone={balanceAmount > 0 ? "amber" : "green"} />
        </div>

        <form className="grid gap-3 rounded-[var(--radius-card)] border border-border-default bg-surface-raised p-3 lg:p-4 print:hidden" onSubmit={submitReceipt}>
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[13px] font-black uppercase tracking-wider text-text-primary">
              <Banknote size={16} className="text-brand-primary" />
              Record Payment
            </p>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-[12px] font-black ${
                balanceAmount > 0 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"
              }`}>
                {balanceAmount > 0 ? `Due ${formatCurrency(balanceAmount)}` : "Fully Paid ✓"}
              </span>
              {balanceAmount === 0 && (
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black text-sky-700">
                  Advance Recording
                </span>
              )}
            </div>
          </div>
          {balanceAmount === 0 && (
            <p className="rounded-[var(--radius-card)] border border-sky-100 bg-sky-50 px-3 py-2 text-[12px] font-bold text-sky-700">
              💡 Member is fully paid. You can still record an advance payment for the next month below.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Amount" type="number" step="1" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={isSaving} />
            <Input label="Paid Date" type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} disabled={isSaving} />
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
          <label className="grid gap-2 text-[14px] font-semibold lg:text-[15px]">
            Note
            <textarea
              className="studio-input min-h-20 w-full px-3 py-2.5 text-[14px] font-normal lg:px-4 lg:py-3 lg:text-[15px]"
              value={note}
              maxLength={180}
              onChange={(event) => setNote(event.target.value)}
              disabled={isSaving}
              placeholder={balanceAmount === 0 ? "Advance for next month (auto-noted if blank)" : "Cash counter, UPI ref, or trainer note"}
            />
          </label>
          {error ? <p className="rounded-[var(--radius-card)] bg-red-50 px-3 py-2 text-[12px] font-bold text-status-expired">{error}</p> : null}
          <Button type="submit" disabled={isSaving}>
            <ReceiptText size={18} />
            {isSaving ? "Saving..." : isAdvancePayment ? "Save Advance Receipt" : "Save Receipt"}
          </Button>
        </form>
      </div>

      <div className="rounded-[var(--radius-card)] border border-border-default bg-brand-white p-3 lg:p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] font-black uppercase tracking-wider text-text-muted">Ledger</p>
          <span className="rounded-full bg-surface-raised px-3 py-1 text-[12px] font-black text-text-secondary">
            {sortedReceipts.length + (recordedOpeningAmount > 0 ? 1 : 0)} entries
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
                onPrint={() => handlePrintReceipt(receipt)}
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
  onPrint,
}: {
  title: string;
  date: string;
  amount: number;
  method: string;
  note: string;
  onPrint?: () => void;
}) {
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
              className="focus-ring flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-brand-white text-slate-600 hover:text-brand-primary hover:border-brand-primary/40 transition print:hidden"
              onClick={onPrint}
              title="Print/Download receipt slip"
            >
              <Printer size={12} />
            </button>
          )}
        </div>
      </div>
      <p className="line-clamp-2 text-[12px] font-semibold leading-5 text-text-secondary">{note}</p>
    </div>
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
