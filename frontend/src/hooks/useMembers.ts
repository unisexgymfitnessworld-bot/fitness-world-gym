import { useEffect, useMemo, useState } from "react";
import { api, isApiConfigured } from "../lib/api";
import { sampleAttendance, sampleMembers, samplePaymentReceipts, sampleRenewalHistory } from "../lib/sampleData";
import { daysUntil, getMemberActionDueDate, getMembershipStatus, toMember, isPlanLessThanOneMonth } from "../lib/utils";
import type { AttendanceEntry, DashboardStats, Member, MemberInput, PaymentReceipt, PaymentReceiptInput, PaymentStatus, RenewalHistoryEntry, PlanType } from "../types";

interface MembersState {
  members: Member[];
  attendance: AttendanceEntry[];
  paymentReceipts: PaymentReceipt[];
  renewalHistory: RenewalHistoryEntry[];
  stats: DashboardStats;
  loading: boolean;
  upsertMember: (input: MemberInput, memberId?: string) => Promise<Member>;
  upsertMembers: (inputs: MemberInput[]) => Promise<Member[]>;
  suspendMember: (memberId: string) => Promise<void>;
  deleteMember: (memberId: string) => Promise<void>;
  renewMember: (memberId: string, start: string, due: string, feesAmount: number, planType?: PlanType, paymentStatus?: PaymentStatus, partialPaidAmount?: number) => Promise<void>;
  addVisit: (memberId: string, visitDate: string, weightKg?: number) => Promise<void>;
  addPaymentReceipt: (memberId: string, input: PaymentReceiptInput) => Promise<PaymentReceipt>;
  markSmsSent: (memberId: string) => Promise<void>;
}

function generateLocalReceiptNo(): string {
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 4).toUpperCase();
  return `FW-R-${stamp}-${suffix}`;
}

function paymentStatusForAmounts(feesAmount: number, collectedAmount: number): PaymentStatus {
  if (feesAmount <= 0 || collectedAmount >= feesAmount) {
    return "Paid";
  }
  return collectedAmount > 0 ? "Partially Paid" : "Pending";
}

export function useMembers(): MembersState {
  const [members, setMembers] = useState<Member[]>(isApiConfigured ? [] : sampleMembers);
  const [attendance, setAttendance] = useState<AttendanceEntry[]>(isApiConfigured ? [] : sampleAttendance);
  const [paymentReceipts, setPaymentReceipts] = useState<PaymentReceipt[]>(isApiConfigured ? [] : samplePaymentReceipts);
  const [renewalHistory, setRenewalHistory] = useState<RenewalHistoryEntry[]>(isApiConfigured ? [] : sampleRenewalHistory);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isApiConfigured) {
      let cancelled = false;
      async function loadLiveData(): Promise<void> {
        setLoading(true);
        try {
          // Load members first — this clears the loading spinner quickly
          const liveMembers = await api.members();
          if (!cancelled) {
            setMembers(liveMembers);
            setLoading(false); // Show the UI as soon as members are ready
          }

          // Load secondary data in the background without blocking the UI
          const [liveAttendance, livePaymentReceipts, liveRenewalHistory] = await Promise.all([
            api.allAttendance(),
            api.allPaymentReceipts(),
            api.allRenewalHistory(),
          ]);
          if (!cancelled) {
            setAttendance(liveAttendance);
            setPaymentReceipts(livePaymentReceipts);
            setRenewalHistory(liveRenewalHistory);
          }
        } catch (error) {
          console.error("Unable to load live member data", error);
          if (!cancelled) {
            setMembers(sampleMembers);
            setAttendance(sampleAttendance);
            setPaymentReceipts(samplePaymentReceipts);
            setRenewalHistory(sampleRenewalHistory);
            setLoading(false);
          }
        }
      }
      void loadLiveData();
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(() => setLoading(false), 280);
    return () => window.clearTimeout(timer);
  }, []);

  const stats = useMemo<DashboardStats>(() => {
    const dueThisWeek = members.filter((member) => {
      const diff = daysUntil(getMemberActionDueDate(member));
      return member.status === "Active" && !isPlanLessThanOneMonth(member) && diff >= 0 && diff <= 7;
    }).length;

    return {
      total: members.filter((member) => member.status !== "Deleted").length,
      active: members.filter((member) => member.status === "Active").length,
      dueThisWeek,
      pendingPayments: members.filter((member) => member.status !== "Deleted" && (member.paymentStatus === "Pending" || member.paymentStatus === "Partially Paid")).length,
    };
  }, [members]);

  async function upsertMembers(inputs: MemberInput[]): Promise<Member[]> {
    if (isApiConfigured) {
      const savedMembers: Member[] = [];
      for (const input of inputs) {
        savedMembers.push(await api.createMember(input));
      }
      setMembers((current) => [...savedMembers, ...current]);
      return savedMembers;
    }

    const savedMembers = inputs.reduce<Member[]>((created, input) => {
      const saved = toMember(input, [...created, ...members]);
      created.push(saved);
      return created;
    }, []);
    setMembers((current) => [...savedMembers, ...current]);
    return savedMembers;
  }

  async function upsertMember(input: MemberInput, memberId?: string): Promise<Member> {
    if (isApiConfigured) {
      const savedMember = memberId ? await api.updateMember(memberId, input) : await api.createMember(input);
      setMembers((current) => (memberId ? current.map((member) => (member.id === memberId ? savedMember : member)) : [savedMember, ...current]));
      return savedMember;
    }

    if (!memberId) {
      const [savedMember] = await upsertMembers([input]);
      if (!savedMember) {
        throw new Error("Unable to create member");
      }
      return savedMember;
    }

    let savedMember: Member;
    setMembers((current) => {
      const existing = current.find((member) => member.id === memberId);
      if (!existing) {
        savedMember = toMember(input, current);
        return [savedMember, ...current];
      }

      savedMember = {
        ...existing,
        ...input,
        bmi: toMember(input, current).bmi,
        smsSent3days: existing.membershipDue === input.membershipDue ? existing.smsSent3days : false,
        updatedAt: new Date().toISOString(),
      };
      return current.map((member) => (member.id === memberId ? savedMember : member));
    });
    return savedMember!;
  }

  async function suspendMember(memberId: string): Promise<void> {
    if (isApiConfigured) {
      const suspended = await api.suspendMember(memberId);
      setMembers((current) => current.map((member) => (member.id === memberId ? suspended : member)));
      return;
    }

    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              status: member.status === "Suspended" ? getMembershipStatus(member.membershipDue, member.paymentStatus) : "Suspended",
              updatedAt: new Date().toISOString(),
            }
          : member,
      ),
    );
  }

  async function deleteMember(memberId: string): Promise<void> {
    if (isApiConfigured) {
      const deleted = await api.deleteMember(memberId);
      setMembers((current) => current.map((member) => (member.id === memberId ? deleted : member)));
      return;
    }

    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              status: "Deleted" as const,
              updatedAt: new Date().toISOString(),
            }
          : member,
      ),
    );
  }

  async function renewMember(memberId: string, start: string, due: string, feesAmount: number, planType?: PlanType, paymentStatus: PaymentStatus = "Pending", partialPaidAmount: number = 0): Promise<void> {
    if (isApiConfigured) {
      const renewed = await api.renewMember(memberId, start, due, feesAmount, planType, paymentStatus, partialPaidAmount);
      setMembers((current) => current.map((member) => (member.id === memberId ? renewed : member)));
      try {
        const [updatedHistory, updatedReceipts] = await Promise.all([
          api.allRenewalHistory(),
          api.allPaymentReceipts(),
        ]);
        setRenewalHistory(updatedHistory);
        setPaymentReceipts(updatedReceipts);
      } catch (error) {
        console.warn("Unable to refresh renewal history and receipts", error);
      }
      return;
    }

    const oldMember = members.find((member) => member.id === memberId);
    if (!oldMember) {
      throw new Error("Member not found");
    }

    // Derive local partial/balance amounts matching the backend logic
    let safePartial: number;
    let balanceAmount: number;
    if (paymentStatus === "Paid") {
      safePartial = feesAmount;
      balanceAmount = 0;
    } else if (paymentStatus === "Partially Paid") {
      safePartial = Math.min(Math.max(partialPaidAmount, 0), feesAmount);
      balanceAmount = Math.max(feesAmount - safePartial, 0);
    } else {
      safePartial = 0;
      balanceAmount = feesAmount;
    }

    const renewalEntry: RenewalHistoryEntry = {
      id: crypto.randomUUID(),
      memberId,
      oldPlanType: oldMember.planType,
      newPlanType: planType ?? oldMember.planType,
      oldStartDate: oldMember.membershipStart,
      oldDueDate: oldMember.membershipDue,
      newStartDate: start,
      newDueDate: due,
      amount: feesAmount,
      paymentStatus,
      renewedOn: start,
      createdAt: new Date().toISOString(),
    };

    const receiptEntry: PaymentReceipt = {
      id: crypto.randomUUID(),
      memberId,
      receiptNo: generateLocalReceiptNo(),
      paidOn: start,
      amount: safePartial,
      method: "Cash",
      note: `Membership Renewal: ${planType ?? oldMember.planType} plan (${start} to ${due})`,
      createdAt: new Date().toISOString(),
    };

    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              planType: planType ?? member.planType,
              membershipStart: start,
              membershipDue: due,
              feesAmount,
              paymentStatus,
              partialPaidAmount: safePartial,
              balanceAmount,
              status: "Active",
              smsSent3days: false,
              updatedAt: new Date().toISOString(),
            }
          : member,
      ),
    );
    setRenewalHistory((current) => [renewalEntry, ...current]);
    if (safePartial > 0) {
      setPaymentReceipts((current) => [receiptEntry, ...current]);
    }
  }

  async function addVisit(memberId: string, visitDate: string, weightKg?: number): Promise<void> {
    const visit = isApiConfigured
      ? await api.createAttendance(memberId, visitDate, weightKg)
      : {
          id: crypto.randomUUID(),
          memberId,
          visitDate,
          weightKg,
          createdAt: new Date().toISOString(),
        };
    setAttendance((current) => [visit, ...current]);
  }

  async function addPaymentReceipt(memberId: string, input: PaymentReceiptInput): Promise<PaymentReceipt> {
    if (isApiConfigured) {
      const result = await api.createPaymentReceipt(memberId, input);
      setPaymentReceipts((current) => [result.receipt, ...current.filter((receipt) => receipt.id !== result.receipt.id)]);
      setMembers((current) => current.map((member) => (member.id === memberId ? result.member : member)));
      return result.receipt;
    }

    const member = members.find((candidate) => candidate.id === memberId);
    if (!member) {
      throw new Error("Member not found");
    }

    const existingReceiptTotal = paymentReceipts
      .filter((receipt) => receipt.memberId === memberId && receipt.paidOn >= member.membershipStart)
      .reduce((sum, receipt) => sum + receipt.amount, 0);
    const legacyCollectedAmount = Math.max(0, Math.min(member.partialPaidAmount - existingReceiptTotal, member.feesAmount));
    const collectedBeforeReceipt = legacyCollectedAmount + existingReceiptTotal;
    const currentBalance = Math.max(member.feesAmount - collectedBeforeReceipt, 0);

    if (member.feesAmount <= 0) {
      throw new Error("This member has no fees to collect");
    }
    if (currentBalance <= 0) {
      throw new Error("This member has no pending balance");
    }
    if (input.amount > currentBalance) {
      throw new Error(`Payment cannot exceed the pending balance of ₹${currentBalance}`);
    }

    const collectedAmount = collectedBeforeReceipt + input.amount;
    const receipt: PaymentReceipt = {
      id: crypto.randomUUID(),
      memberId,
      receiptNo: input.receiptNo?.trim() || generateLocalReceiptNo(),
      paidOn: input.paidOn,
      amount: input.amount,
      method: input.method,
      note: input.note?.trim() ?? "",
      createdAt: new Date().toISOString(),
    };

    setPaymentReceipts((current) => [receipt, ...current]);
    setMembers((current) =>
      current.map((candidate) =>
        candidate.id === memberId
          ? {
              ...candidate,
              partialPaidAmount: Math.min(collectedAmount, candidate.feesAmount),
              balanceAmount: Math.max(candidate.feesAmount - collectedAmount, 0),
              paymentStatus: paymentStatusForAmounts(candidate.feesAmount, collectedAmount),
              updatedAt: new Date().toISOString(),
            }
          : candidate,
      ),
    );
    return receipt;
  }

  async function markSmsSent(memberId: string): Promise<void> {
    setMembers((current) =>
      current.map((member) => (member.id === memberId ? { ...member, smsSent3days: true, updatedAt: new Date().toISOString() } : member)),
    );
  }

  return {
    members,
    attendance,
    paymentReceipts,
    renewalHistory,
    stats,
    loading,
    upsertMember,
    upsertMembers,
    suspendMember,
    deleteMember,
    renewMember,
    addVisit,
    addPaymentReceipt,
    markSmsSent,
  };
}
