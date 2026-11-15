import { useEffect, useState } from "react";
import { paymentMethodOptions, type Member, type PaymentMethod, type PaymentStatus, type PlanType, type RenewalHistoryEntry } from "../../types";
import { allocatePayment, cycleDue } from "../../lib/money";
import { calculateDueDate, calculateNextRenewalStart, cn, formatCurrency, formatDisplayDate } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

interface RenewModalProps {
  open: boolean;
  member: Member;
  renewalHistory: RenewalHistoryEntry[];
  onClose: () => void;
  onConfirm: (memberId: string, start: string, due: string, feesAmount: number, planType: PlanType, paymentStatus: PaymentStatus, collectedAmount: number, method: PaymentMethod, clientRequestId: string) => Promise<void>;
}

const planOptions: PlanType[] = ["1 Month", "3 Months", "6 Months", "1 Year", "Custom"];

// Base plan fee for the default: the last renewal's fee. member.feesAmount is
// the current cycle fee (arrears live in their own bucket), so for a member
// who never renewed it is the join fee — the right default either way.
function defaultRenewalFee(member: Member, history: RenewalHistoryEntry[]): number {
  const latest = history.reduce<RenewalHistoryEntry | null>(
    (best, entry) => (!best || entry.renewedOn > best.renewedOn ? entry : best),
    null,
  );
  return latest ? latest.amount : member.feesAmount;
}

export function RenewModal({ open, member, renewalHistory, onClose, onConfirm }: RenewModalProps) {
  const [planType, setPlanType] = useState<PlanType>(member.planType);
  const [membershipStart, setMembershipStart] = useState<string>(() => calculateNextRenewalStart(member));
  const [membershipDue, setMembershipDue] = useState<string>(() =>
    calculateDueDate(calculateNextRenewalStart(member), member.planType)
  );
  const [feesAmount, setFeesAmount] = useState<number>(() => defaultRenewalFee(member, renewalHistory));
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Pending");
  const [collectedAmount, setCollectedAmount] = useState<number>(0);
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per modal open (the modal remounts every open): every
  // submit attempt of this renewal shares it, so double-taps and timeout
  // retaps hit the server dedup instead of renewing twice.
  const [requestKey] = useState(() => crypto.randomUUID());

  // Old dues close into arrears at renew; advance credit offsets the new fee.
  // Shown as three numbers, never one opaque total.
  const arrears = Math.max(member.arrearsAmount ?? 0, 0);
  const advance = Math.max(member.advanceAmount ?? 0, 0);
  const closingDue = cycleDue({ feesAmount: member.feesAmount, partialPaidAmount: member.partialPaidAmount });
  const arrearsClosed = arrears + closingDue;
  const safeFees = Number.isFinite(feesAmount) ? Math.max(Math.floor(feesAmount), 0) : 0;
  const creditUsed = Math.min(advance, safeFees);
  const totalOwed = arrearsClosed + Math.max(safeFees - creditUsed, 0);
  const collected = Number.isFinite(collectedAmount) ? Math.max(Math.floor(collectedAmount), 0) : 0;
  const preview = allocatePayment(arrearsClosed, safeFees, creditUsed, paymentStatus === "Pending" ? 0 : collected);
  const advanceAfter = advance - creditUsed + preview.advanceApplied;

  // Auto-calculate due date when start date or plan type changes
  useEffect(() => {
    if (planType !== "Custom" && membershipStart) {
      setMembershipDue(calculateDueDate(membershipStart, planType));
    }
  }, [membershipStart, planType]);

  // Reset collected amount when payment status changes to Pending
  useEffect(() => {
    if (paymentStatus === "Pending") {
      setCollectedAmount(0);
    } else if (paymentStatus === "Paid") {
      setCollectedAmount(totalOwed);
    }
    // totalOwed is derived; sync only on status flip to avoid clobbering typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentStatus]);

  async function handleRenewSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!membershipStart || !membershipDue) {
      setError("Pick the plan start and end dates.");
      return;
    }
    if (membershipDue < membershipStart) {
      setError("Plan end date cannot be before the start date.");
      return;
    }
    if (!Number.isFinite(feesAmount) || feesAmount < 0) {
      setError("Renewal fees must be zero or more.");
      return;
    }
    if (paymentStatus === "Paid" && collected < totalOwed) {
      setError(`Paid needs at least ${formatCurrency(totalOwed)} collected; use Half Paid instead.`);
      return;
    }
    if (paymentStatus === "Partially Paid" && (collected < 1 || collected >= totalOwed)) {
      setError(`Collected amount must be between ₹1 and ${formatCurrency(Math.max(totalOwed - 1, 0))}.`);
      return;
    }
    setLoading(true);
    try {
      await onConfirm(
        member.id,
        membershipStart,
        membershipDue,
        safeFees,
        planType,
        paymentStatus,
        paymentStatus === "Pending" ? 0 : collected,
        method,
        requestKey
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to renew membership");
    } finally {
      setLoading(false);
    }
  }

  const isCustomPlan = planType === "Custom";
  const showCollected = paymentStatus !== "Pending";

  return (
    <Modal open={open} title="Renew Membership" onClose={onClose}>
      <form onSubmit={handleRenewSubmit} className="flex flex-col gap-4">
        <div className="rounded-[var(--radius-card)] bg-brand-primary-light/40 border border-brand-primary/10 p-3 lg:p-4 text-brand-primary">
          <p className="text-[12px] font-bold uppercase tracking-wider">Where The Money Goes</p>
          <div className="mt-2 text-[14px] font-bold grid grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] font-semibold text-text-muted block">MEMBER</span>
              {member.name} · {member.regNo}
            </div>
            <div>
              <span className="text-[11px] font-semibold text-text-muted block">CURRENT DUE DATE</span>
              {formatDisplayDate(member.membershipDue)}
            </div>
            <div>
              <span className="text-[11px] font-semibold text-text-muted block">OLD PENDING (STAYS SEPARATE)</span>
              {arrearsClosed > 0 ? formatCurrency(arrearsClosed) : "Clear"}
            </div>
            <div>
              <span className="text-[11px] font-semibold text-text-muted block">NEW PLAN FEE</span>
              {formatCurrency(safeFees)}
              {creditUsed > 0 ? ` (−${formatCurrency(creditUsed)} advance credit)` : ""}
            </div>
            {advance > 0 ? (
              <div>
                <span className="text-[11px] font-semibold text-text-muted block">EXTRA PAID BEFORE</span>
                {formatCurrency(advance)}
              </div>
            ) : null}
            <div>
              <span className="text-[11px] font-semibold text-text-muted block">TOTAL TO COLLECT</span>
              {formatCurrency(totalOwed)}
            </div>
          </div>
        </div>

        {arrearsClosed > 0 ? (
          <p className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] font-bold text-amber-800">
            {formatCurrency(arrearsClosed)} old pending stays separate — it is
            collected first and never disappears.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-[14px] font-semibold lg:text-[15px] text-text-primary">
            New Plan Type
            <select
              className="studio-input w-full px-3 py-2.5 lg:px-4 lg:py-3"
              value={planType}
              onChange={(e) => setPlanType(e.target.value as PlanType)}
            >
              {planOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <Input
            label="Plan Start Date"
            type="date"
            required
            value={membershipStart}
            onChange={(e) => setMembershipStart(e.target.value)}
          />

          <Input
            label={isCustomPlan ? "Plan End Date (Custom)" : "Plan End Date (Auto)"}
            type="date"
            required
            readOnly={!isCustomPlan}
            value={membershipDue}
            min={isCustomPlan ? membershipStart : undefined}
            onChange={(e) => setMembershipDue(e.target.value)}
            className={cn(!isCustomPlan && "bg-slate-50 cursor-not-allowed text-text-muted")}
          />

          <Input
            label="Renewal Fees (₹)"
            type="number"
            required
            min="0"
            step="1"
            value={feesAmount}
            onChange={(e) => setFeesAmount(Number(e.target.value))}
          />

          {/* ── Payment Status ── Trainer must explicitly select */}
          <label className="grid gap-2 text-[14px] font-semibold lg:text-[15px] text-text-primary sm:col-span-2">
            Payment Status
            <select
              className="studio-input w-full px-3 py-2.5 lg:px-4 lg:py-3"
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
            >
              <option value="Paid">Paid – Member has paid in full</option>
              <option value="Pending">Not Paid – Money not yet collected</option>
              <option value="Partially Paid" disabled={totalOwed < 2}>
                Half Paid – Member paid part of the fees{totalOwed < 2 ? " (needs total ≥ ₹2)" : ""}
              </option>
            </select>
            {paymentStatus === "Pending" && (
              <p className="text-[12px] font-normal text-amber-600 mt-1">
                Status will be saved as <strong>Not Paid</strong>. Update once the member pays.
              </p>
            )}
          </label>

          {/* ── Collected amount (Paid may exceed the total: overflow = advance) ── */}
          {showCollected ? (
            <Input
              label={`Amount Collected (₹)${paymentStatus === "Paid" ? " — extra money = next plan" : ` — Remaining: ${formatCurrency(Math.max(totalOwed - collected, 0))}`}`}
              type="number"
              required
              min={paymentStatus === "Paid" ? totalOwed : 1}
              max={paymentStatus === "Paid" ? undefined : Math.max(totalOwed - 1, 1)}
              step="1"
              value={collectedAmount || ""}
              onChange={(e) => setCollectedAmount(Number(e.target.value))}
              className="sm:col-span-2"
            />
          ) : null}

          {/* ── Allocation preview: exactly where each rupee lands ── */}
          {showCollected && collected > 0 ? (
            <p className="rounded-[var(--radius-card)] border border-green-200 bg-green-50 px-3 py-2.5 text-[13px] font-bold text-green-800 sm:col-span-2">
              Split: {formatCurrency(preview.arrearsApplied)} old pending ·{" "}
              {formatCurrency(preview.cycleApplied)} new plan
              {preview.advanceApplied > 0 ? <> · {formatCurrency(preview.advanceApplied)} extra</> : null}
              {advanceAfter > 0 ? <> (credit after: {formatCurrency(advanceAfter)})</> : null}
            </p>
          ) : null}

          {/* ── Payment method (only matters when money is collected now) ── */}
          {paymentStatus !== "Pending" && (
            <label className="grid gap-2 text-[14px] font-semibold lg:text-[15px] text-text-primary sm:col-span-2">
              Payment Method
              <select
                className="studio-input w-full px-3 py-2.5 lg:px-4 lg:py-3"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {paymentMethodOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          )}

          {member.status === "Suspended" && (
            <p className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] font-bold text-amber-800 sm:col-span-2">
              This member is Suspended — confirming will also unsuspend them.
            </p>
          )}
        </div>

        {error ? <p className="text-[13px] font-semibold text-status-expired">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-3 border-t border-border-default pt-4">
          <Button variant="secondary" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="!bg-brand-primary hover:!bg-brand-primary/90">
            {loading ? "Renewing..." : "Confirm Renewal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
