import { useEffect, useState } from "react";
import type { Member, PaymentStatus, PlanType } from "../../types";
import { calculateDueDate, calculateNextRenewalStart, cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

interface RenewModalProps {
  open: boolean;
  member: Member;
  onClose: () => void;
  onConfirm: (memberId: string, start: string, due: string, feesAmount: number, planType: PlanType, paymentStatus: PaymentStatus, partialPaidAmount: number) => Promise<void>;
}

const planOptions: PlanType[] = ["1 Month", "3 Months", "6 Months", "1 Year", "Custom"];

// Default pricing helper
const defaultPricing: Record<PlanType, number> = {
  "1 Month": 1500,
  "3 Months": 4000,
  "6 Months": 7000,
  "1 Year": 12000,
  "Custom": 1500,
};

export function RenewModal({ open, member, onClose, onConfirm }: RenewModalProps) {
  const [planType, setPlanType] = useState<PlanType>(member.planType);
  const [membershipStart, setMembershipStart] = useState<string>(() => calculateNextRenewalStart(member));
  const [membershipDue, setMembershipDue] = useState<string>(() =>
    calculateDueDate(calculateNextRenewalStart(member), member.planType)
  );
  const [feesAmount, setFeesAmount] = useState<number>(member.feesAmount);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Paid");
  const [partialPaidAmount, setPartialPaidAmount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  // Auto-calculate due date when start date or plan type changes
  useEffect(() => {
    if (planType !== "Custom" && membershipStart) {
      setMembershipDue(calculateDueDate(membershipStart, planType));
    }
  }, [membershipStart, planType]);

  // Reset partial amount when payment status changes away from Partially Paid
  useEffect(() => {
    if (paymentStatus !== "Partially Paid") {
      setPartialPaidAmount(0);
    }
  }, [paymentStatus]);

  // Only set default fees when the modal first opens (not on every plan change)
  // This prevents overwriting custom amounts trainers have entered

  async function handleRenewSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await onConfirm(
        member.id,
        membershipStart,
        membershipDue,
        feesAmount,
        planType,
        paymentStatus,
        paymentStatus === "Partially Paid" ? partialPaidAmount : 0
      );
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const isCustomPlan = planType === "Custom";
  const isPartiallyPaid = paymentStatus === "Partially Paid";

  return (
    <Modal open={open} title="Renew Membership" onClose={onClose}>
      <form onSubmit={handleRenewSubmit} className="flex flex-col gap-4">
        <div className="rounded-[var(--radius-card)] bg-brand-primary-light/40 border border-brand-primary/10 p-3 lg:p-4 text-brand-primary">
          <p className="text-[12px] font-bold uppercase tracking-wider">Current Membership Info</p>
          <div className="mt-2 text-[14px] font-bold grid grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] font-semibold text-text-muted block">REG NO</span>
              {member.regNo}
            </div>
            <div>
              <span className="text-[11px] font-semibold text-text-muted block">MEMBER NAME</span>
              {member.name}
            </div>
            <div>
              <span className="text-[11px] font-semibold text-text-muted block">CURRENT PLAN</span>
              {member.planType} (₹{member.feesAmount})
            </div>
            <div>
              <span className="text-[11px] font-semibold text-text-muted block">EXPIRED ON</span>
              {member.membershipDue}
            </div>
          </div>
        </div>

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

          {/* ── Payment Status ── Trainer must explicitly select; no longer auto-set to Paid */}
          <label className="grid gap-2 text-[14px] font-semibold lg:text-[15px] text-text-primary sm:col-span-2">
            Payment Status
            <select
              className="studio-input w-full px-3 py-2.5 lg:px-4 lg:py-3"
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
            >
              <option value="Paid">✅ Paid – Member has paid in full</option>
              <option value="Pending">⏳ Pending – Payment not yet collected</option>
              <option value="Partially Paid">💰 Partially Paid – Member paid part of the fees</option>
            </select>
            {paymentStatus === "Pending" && (
              <p className="text-[12px] font-normal text-amber-600 mt-1">
                ⚠️ Status will be saved as <strong>Pending</strong>. Update once the member pays.
              </p>
            )}
          </label>

          {/* ── Partial amount input (only shown when Partially Paid) ── */}
          {isPartiallyPaid && (
            <Input
              label={`Amount Collected (₹) — Remaining Balance: ₹${Math.max(feesAmount - partialPaidAmount, 0)}`}
              type="number"
              required
              min="1"
              max={feesAmount - 1}
              step="1"
              value={partialPaidAmount || ""}
              onChange={(e) => setPartialPaidAmount(Number(e.target.value))}
              className="sm:col-span-2"
            />
          )}
        </div>

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
