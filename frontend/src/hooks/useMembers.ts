import { useEffect, useMemo, useState } from "react";
import { api, isApiConfigured } from "../lib/api";
import {
  allocatePayment,
  applyAllocation,
  applyRenewal,
  cycleDue,
  receiptLines,
  reverseAllocation,
  statusFromBuckets,
  totalBalance,
  type MoneyBuckets,
} from "../lib/money";
import { sampleAttendance, sampleMembers, samplePaymentReceipts, sampleRenewalHistory } from "../lib/sampleData";
import { calculateBmi, daysUntil, formatCurrency, getMemberActionDueDate, getMembershipStatus, toMember, todayISO } from "../lib/utils";
import type { AttendanceEntry, BillChannel, DashboardStats, Member, MemberInput, PaymentMethod, PaymentReceipt, PaymentReceiptInput, PaymentStatus, RenewalHistoryEntry, PlanType, ResendResult, StatementResult } from "../types";

interface MembersState {
  members: Member[];
  attendance: AttendanceEntry[];
  paymentReceipts: PaymentReceipt[];
  renewalHistory: RenewalHistoryEntry[];
  stats: DashboardStats;
  loading: boolean;
  loadError: string | null;
  retryLoad: () => void;
  isDemo: boolean;
  upsertMember: (input: MemberInput, memberId?: string) => Promise<Member>;
  upsertMembers: (inputs: MemberInput[]) => Promise<Member[]>;
  suspendMember: (memberId: string) => Promise<void>;
  restoreMember: (memberId: string) => Promise<void>;
  deleteMember: (memberId: string) => Promise<void>;
  purgeMember: (memberId: string) => Promise<void>;
  wipeAll: () => Promise<void>;
  renewMember: (memberId: string, start: string, due: string, feesAmount: number, planType?: PlanType, paymentStatus?: PaymentStatus, collectedAmount?: number, method?: PaymentMethod, clientRequestId?: string) => Promise<{ receiptSms?: "sent" | "queued" | "failed" | "skipped"; receiptEmail?: "sent" | "queued" | "failed" | "skipped"; duplicate?: boolean }>;
  addVisit: (memberId: string, visitDate: string, weightKg?: number) => Promise<void>;
  deleteVisit: (attendanceId: string) => Promise<void>;
  addPaymentReceipt: (memberId: string, input: PaymentReceiptInput) => Promise<{ receipt: PaymentReceipt; receiptSms: "sent" | "queued" | "failed" | "skipped" | "demo"; receiptEmail?: "sent" | "queued" | "failed" | "skipped" | "demo"; duplicate?: boolean }>;
  deletePaymentReceipt: (memberId: string, receiptId: string) => Promise<void>;
  resendReceipt: (memberId: string, receiptId: string, channel: BillChannel) => Promise<ResendResult>;
  sendStatement: (memberId: string, channel: BillChannel, dryRun?: boolean) => Promise<StatementResult>;
  markSmsSent: (memberId: string) => Promise<void>;
}

function generateLocalReceiptNo(): string {
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 4).toUpperCase();
  return `FW-R-${stamp}-${suffix}`;
}

const demoAllowed = import.meta.env.DEV;

function bucketsOf(member: Member): MoneyBuckets {
  return {
    feesAmount: member.feesAmount,
    partialPaidAmount: member.partialPaidAmount,
    arrearsAmount: member.arrearsAmount ?? 0,
    advanceAmount: member.advanceAmount ?? 0,
  };
}

function assertWritable(): void {
  if (!isApiConfigured && !demoAllowed) {
    throw new Error("Gym data API is not configured. Changes cannot be saved.");
  }
}

export function useMembers(): MembersState {
  const [members, setMembers] = useState<Member[]>(isApiConfigured || !demoAllowed ? [] : sampleMembers);
  const [attendance, setAttendance] = useState<AttendanceEntry[]>(isApiConfigured || !demoAllowed ? [] : sampleAttendance);
  const [paymentReceipts, setPaymentReceipts] = useState<PaymentReceipt[]>(isApiConfigured || !demoAllowed ? [] : samplePaymentReceipts);
  const [renewalHistory, setRenewalHistory] = useState<RenewalHistoryEntry[]>(isApiConfigured || !demoAllowed ? [] : sampleRenewalHistory);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isApiConfigured) {
      if (!demoAllowed) {
        setLoadError("Gym data API is not configured. Set VITE_API_BASE_URL and redeploy.");
        setLoading(false);
        return;
      }
      const timer = window.setTimeout(() => setLoading(false), 280);
      return () => window.clearTimeout(timer);
    }

    let cancelled = false;
    async function loadLiveData(): Promise<void> {
      setLoading(true);
      setLoadError(null);
      try {
        // Load members first — this clears the loading spinner quickly
        const liveMembers = await api.members();
        if (cancelled) {
          return;
        }
        setMembers(liveMembers);
        setLoading(false); // Show the UI as soon as members are ready

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
          setLoadError(error instanceof Error ? error.message : "Unable to load gym data");
          setLoading(false);
        }
      }
    }
    void loadLiveData();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function retryLoad(): void {
    setReloadKey((key) => key + 1);
  }

  const stats = useMemo<DashboardStats>(() => {
    const dueThisWeek = members.filter((member) => {
      const diff = daysUntil(getMemberActionDueDate(member));
      return member.status === "Active" && diff >= 0 && diff <= 7;
    }).length;

    return {
      total: members.filter((member) => member.status !== "Deleted").length,
      active: members.filter((member) => member.status === "Active").length,
      dueThisWeek,
    };
  }, [members]);

  async function upsertMembers(inputs: MemberInput[]): Promise<Member[]> {
    assertWritable();
    if (isApiConfigured) {
      const savedMembers = await api.createMembers(inputs);
      setMembers((current) => [...savedMembers, ...current]);
      return savedMembers;
    }

    const savedMembers = inputs.reduce<Member[]>((created, input) => {
      const saved = toMember(input, [...created, ...members]);
      created.push(saved);
      return created;
    }, []);
    setMembers((current) => [...savedMembers, ...current]);
    // Mirror the server: join cash gets a receipt row so demo analytics match.
    const joinReceipts: PaymentReceipt[] = [];
    inputs.forEach((input, index) => {
      const saved = savedMembers[index];
      if (!saved) {
        return;
      }
      const collected = input.paymentStatus === "Paid"
        ? input.feesAmount
        : input.paymentStatus === "Partially Paid"
          ? Math.min(Math.max(input.partialPaidAmount ?? 0, 0), input.feesAmount)
          : 0;
      if (collected > 0) {
        joinReceipts.push({
          id: crypto.randomUUID(),
          memberId: saved.id,
          receiptNo: generateLocalReceiptNo(),
          paidOn: input.joinDate,
          amount: collected,
          method: input.method ?? "Cash",
          note: `Join payment: ${input.planType} plan`,
          createdAt: new Date().toISOString(),
        });
      }
    });
    if (joinReceipts.length > 0) {
      setPaymentReceipts((current) => [...joinReceipts, ...current]);
    }
    return savedMembers;
  }

  async function upsertMember(input: MemberInput, memberId?: string): Promise<Member> {
    assertWritable();
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

    // Mirror the server: paid may not drop below saved bills (the correction
    // path is deleting the wrong bill, not editing around it).
    const guardExisting = members.find((candidate) => candidate.id === memberId);
    if (guardExisting) {
      const guardPartial = Math.min(Math.max(input.partialPaidAmount, 0), Math.max(input.feesAmount, 0));
      const receiptedCycle = paymentReceipts
        .filter((entry) => entry.memberId === memberId && entry.createdAt.slice(0, 10) >= guardExisting.membershipStart)
        .reduce((sum, entry) => sum + (entry.cycleApplied ?? entry.amount), 0);
      if (guardPartial < receiptedCycle) {
        throw new Error(`Rs.${receiptedCycle} is already in saved bills — delete the wrong bill first, then edit.`);
      }
    }

    let savedMember: Member;
    const editReceipts: PaymentReceipt[] = [];
    setMembers((current) => {
      const existing = current.find((member) => member.id === memberId);
      if (!existing) {
        savedMember = toMember(input, current);
        return [savedMember, ...current];
      }

      // Mirror the server: editing re-derives the balance WITH stored
      // arrears, and a Paid mark with dues left becomes Partially Paid.
      const editArrears = Math.max(existing.arrearsAmount ?? 0, 0);
      const editPartial = Math.min(Math.max(input.partialPaidAmount, 0), Math.max(input.feesAmount, 0));
      const editBalance = editArrears + Math.max(input.feesAmount - editPartial, 0);
      const editPayment: PaymentStatus = editBalance > 0 && input.paymentStatus === "Paid" ? "Partially Paid" : input.paymentStatus;
      const editCash = editPartial - Math.max(existing.partialPaidAmount ?? 0, 0);
      savedMember = {
        ...existing,
        ...input,
        partialPaidAmount: editPartial,
        balanceAmount: editBalance,
        paymentStatus: editPayment,
        totalCollected: Math.max(existing.totalCollected ?? 0, 0) + Math.max(editCash, 0),
        bmi: toMember(input, current).bmi,
        status: existing.status === "Suspended" ? "Suspended" : getMembershipStatus(input.membershipDue, editPayment),
        smsSent3days: existing.membershipDue === input.membershipDue ? existing.smsSent3days : false,
        updatedAt: new Date().toISOString(),
      };
      // Guarded: updaters must be pure (StrictMode double-invokes in dev).
      if (editCash > 0 && editReceipts.length === 0) {
        editReceipts.push({
          id: crypto.randomUUID(),
          memberId,
          receiptNo: generateLocalReceiptNo(),
          paidOn: todayISO(),
          amount: editCash,
          method: input.method ?? "Cash",
          note: `Payment recorded: ${input.planType} plan`,
          createdAt: new Date().toISOString(),
        });
      }
      return current.map((member) => (member.id === memberId ? savedMember : member));
    });
    if (editReceipts.length > 0) {
      setPaymentReceipts((current) => [...editReceipts, ...current]);
    }
    return savedMember!;
  }

  async function suspendMember(memberId: string): Promise<void> {
    assertWritable();
    if (isApiConfigured) {
      const suspended = await api.suspendMember(memberId);
      setMembers((current) => current.map((member) => (member.id === memberId ? suspended : member)));
      return;
    }

    setMembers((current) =>
      current.map((member) =>
        member.id === memberId && member.status !== "Suspended"
          ? {
              ...member,
              status: "Suspended",
              updatedAt: new Date().toISOString(),
            }
          : member,
      ),
    );
  }

  async function restoreMember(memberId: string): Promise<void> {
    assertWritable();
    if (isApiConfigured) {
      const restored = await api.restoreMember(memberId);
      setMembers((current) => current.map((member) => (member.id === memberId ? restored : member)));
      return;
    }

    const existing = members.find((member) => member.id === memberId);
    if (existing && existing.status !== "Deleted" && existing.status !== "Suspended") {
      throw new Error("Only a deleted or stopped member can be restored");
    }
    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              status: getMembershipStatus(member.membershipDue, member.paymentStatus),
              updatedAt: new Date().toISOString(),
            }
          : member,
      ),
    );
  }

  async function deleteMember(memberId: string): Promise<void> {
    assertWritable();
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

  async function purgeMember(memberId: string): Promise<void> {
    assertWritable();
    if (isApiConfigured) {
      await api.purgeMember(memberId);
    }
    setMembers((current) => current.filter((member) => member.id !== memberId));
    setAttendance((current) => current.filter((entry) => entry.memberId !== memberId));
    setPaymentReceipts((current) => current.filter((receipt) => receipt.memberId !== memberId));
    setRenewalHistory((current) => current.filter((entry) => entry.memberId !== memberId));
  }

  async function wipeAll(): Promise<void> {
    assertWritable();
    if (isApiConfigured) {
      await api.wipeAll();
    }
    setMembers([]);
    setAttendance([]);
    setPaymentReceipts([]);
    setRenewalHistory([]);
  }

  async function renewMember(memberId: string, start: string, due: string, feesAmount: number, planType?: PlanType, paymentStatus: PaymentStatus = "Pending", collectedAmount: number = 0, method: PaymentMethod = "Cash", clientRequestId?: string): Promise<{ receiptSms?: "sent" | "queued" | "failed" | "skipped"; receiptEmail?: "sent" | "queued" | "failed" | "skipped"; duplicate?: boolean }> {
    assertWritable();
    if (isApiConfigured) {
      const result = await api.renewMember(memberId, start, due, feesAmount, planType, paymentStatus, collectedAmount, method, clientRequestId ?? crypto.randomUUID());
      setMembers((current) => current.map((member) => (member.id === memberId ? result.member : member)));
      try {
        const [memberHistory, memberReceipts] = await Promise.all([
          api.renewalHistory(memberId),
          api.paymentReceipts(memberId),
        ]);
        setRenewalHistory((current) => [...memberHistory, ...current.filter((entry) => entry.memberId !== memberId)]);
        setPaymentReceipts((current) => [...memberReceipts, ...current.filter((receipt) => receipt.memberId !== memberId)]);
      } catch (error) {
        console.warn("Unable to refresh renewal history and receipts", error);
      }
      return { receiptSms: result.receiptSms, receiptEmail: result.receiptEmail, duplicate: result.duplicate };
    }

    const oldMember = members.find((member) => member.id === memberId);
    if (!oldMember) {
      throw new Error("Member not found");
    }
    if (due < todayISO()) {
      throw new Error("Plan end date is in the past — pick a future end date.");
    }

    // Bucket math shared with the backend (lib/money.ts): arrears stay
    // visible, the new fee stays pure, collection allocates oldest-first.
    const buckets = bucketsOf(oldMember);
    const arrearsClosed = (oldMember.arrearsAmount ?? 0) + cycleDue(buckets);
    const creditUsed = Math.min(oldMember.advanceAmount ?? 0, Math.max(feesAmount, 0));
    const totalOwed = arrearsClosed + Math.max(feesAmount - creditUsed, 0);
    const collected = Math.max(Math.floor(collectedAmount), 0);
    if (paymentStatus === "Paid" && collected < totalOwed) {
      throw new Error(`Paid needs at least ${formatCurrency(totalOwed)} collected; use Partially Paid instead`);
    }
    if (paymentStatus === "Partially Paid") {
      if (totalOwed < 2) {
        throw new Error("Partial payment needs a total of at least 2; mark Paid or Pending instead");
      }
      if (collected < 1 || collected >= totalOwed) {
        throw new Error(`Partial amount must be between 1 and ${totalOwed - 1}`);
      }
    }
    const result = applyRenewal(buckets, feesAmount, paymentStatus === "Pending" ? 0 : collected, oldMember.totalCollected ?? 0);

    const renewalEntry: RenewalHistoryEntry = {
      id: crypto.randomUUID(),
      memberId,
      oldPlanType: oldMember.planType,
      oldAmount: oldMember.feesAmount,
      newPlanType: planType ?? oldMember.planType,
      oldStartDate: oldMember.membershipStart,
      oldDueDate: oldMember.membershipDue,
      newStartDate: start,
      newDueDate: due,
      amount: result.feesAmount,
      arrearsCarried: result.arrearsClosed,
      paymentStatus: result.paymentStatus,
      collectedAmount: result.paymentStatus === "Pending" ? 0 : collected,
      renewedOn: todayISO(),
      createdAt: new Date().toISOString(),
    };

    const receiptEntry: PaymentReceipt = {
      id: crypto.randomUUID(),
      memberId,
      receiptNo: generateLocalReceiptNo(),
      paidOn: todayISO(),
      amount: result.allocation.total,
      method,
      note: `Membership Renewal: ${planType ?? oldMember.planType} plan (${start} to ${due}) — ${receiptLines(result.allocation).join(", ")}`,
      createdAt: new Date().toISOString(),
      arrearsApplied: result.allocation.arrearsApplied,
      cycleApplied: result.allocation.cycleApplied,
      advanceApplied: result.allocation.advanceApplied,
    };

    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              planType: planType ?? member.planType,
              membershipStart: start,
              membershipDue: due,
              feesAmount: result.feesAmount,
              paymentStatus: result.paymentStatus,
              partialPaidAmount: result.partialPaidAmount,
              balanceAmount: result.balanceAmount,
              arrearsAmount: result.arrearsAmount,
              advanceAmount: result.advanceAmount,
              totalCollected: result.totalCollected,
              status: getMembershipStatus(due, result.paymentStatus),
              smsSent3days: false,
              smsSentWinback: false,
              updatedAt: new Date().toISOString(),
            }
          : member,
      ),
    );
    setRenewalHistory((current) => [renewalEntry, ...current]);
    if (result.allocation.total > 0) {
      setPaymentReceipts((current) => [receiptEntry, ...current]);
    }
    return {};
  }

  async function addVisit(memberId: string, visitDate: string, weightKg?: number): Promise<void> {
    assertWritable();
    if (!isApiConfigured && attendance.some((entry) => entry.memberId === memberId && entry.visitDate === visitDate)) {
      throw new Error("A visit is already logged for this date");
    }
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
    // Mirror the server: a visit weight becomes the member's current weight,
    // unless a later visit already recorded one.
    if (weightKg !== undefined) {
      setMembers((current) =>
        current.map((member) => {
          if (member.id !== memberId) {
            return member;
          }
          const hasLaterWeight = attendance.some(
            (entry) => entry.memberId === memberId && entry.visitDate > visitDate && entry.weightKg !== undefined,
          );
          if (hasLaterWeight) {
            return member;
          }
          return { ...member, weightKg, bmi: calculateBmi(weightKg, member.heightCm), updatedAt: new Date().toISOString() };
        }),
      );
    }
  }

  async function deleteVisit(attendanceId: string): Promise<void> {
    assertWritable();
    if (isApiConfigured) {
      await api.deleteAttendance(attendanceId);
    }
    setAttendance((current) => current.filter((entry) => entry.id !== attendanceId));
  }

  async function addPaymentReceipt(memberId: string, input: PaymentReceiptInput): Promise<{ receipt: PaymentReceipt; receiptSms: "sent" | "queued" | "failed" | "skipped" | "demo"; receiptEmail?: "sent" | "queued" | "failed" | "skipped" | "demo"; duplicate?: boolean }> {
    assertWritable();
    if (isApiConfigured) {
      const result = await api.createPaymentReceipt(memberId, input);
      setPaymentReceipts((current) => [result.receipt, ...current.filter((receipt) => receipt.id !== result.receipt.id)]);
      setMembers((current) => current.map((member) => (member.id === memberId ? result.member : member)));
      return { receipt: result.receipt, receiptSms: result.receiptSms ?? "sent", receiptEmail: result.receiptEmail, duplicate: result.duplicate };
    }

    const member = members.find((candidate) => candidate.id === memberId);
    if (!member) {
      throw new Error("Member not found");
    }

    // Bucket math shared with the backend: oldest-first allocation, and any
    // amount above the balance becomes advance credit (never rejected).
    const buckets = bucketsOf(member);
    const amount = Math.floor(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Enter a valid payment amount.");
    }
    const allocation = allocatePayment(
      buckets.arrearsAmount,
      buckets.feesAmount,
      buckets.partialPaidAmount,
      amount,
    );
    const applied = applyAllocation(buckets, allocation, member.totalCollected ?? 0);
    const receipt: PaymentReceipt = {
      id: crypto.randomUUID(),
      memberId,
      receiptNo: input.receiptNo?.trim() || generateLocalReceiptNo(),
      paidOn: input.paidOn,
      amount: allocation.total,
      method: input.method,
      note: input.note?.trim() ?? "",
      createdAt: new Date().toISOString(),
      arrearsApplied: allocation.arrearsApplied,
      cycleApplied: allocation.cycleApplied,
      advanceApplied: allocation.advanceApplied,
    };

    setPaymentReceipts((current) => [receipt, ...current]);
    setMembers((current) =>
      current.map((candidate) =>
        candidate.id === memberId
          ? {
              ...candidate,
              partialPaidAmount: applied.partialPaidAmount,
              balanceAmount: applied.balanceAmount,
              arrearsAmount: applied.arrearsAmount,
              advanceAmount: applied.advanceAmount,
              totalCollected: applied.totalCollected,
              paymentStatus: statusFromBuckets({
                feesAmount: candidate.feesAmount,
                partialPaidAmount: applied.partialPaidAmount,
                arrearsAmount: applied.arrearsAmount,
                advanceAmount: applied.advanceAmount,
              }),
              updatedAt: new Date().toISOString(),
            }
          : candidate,
      ),
    );
    return { receipt, receiptSms: "demo" as const };
  }

  async function deletePaymentReceipt(memberId: string, receiptId: string): Promise<void> {
    assertWritable();
    if (isApiConfigured) {
      const updated = await api.deleteReceipt(memberId, receiptId);
      setPaymentReceipts((current) => current.filter((entry) => entry.id !== receiptId));
      setMembers((current) => current.map((member) => (member.id === memberId ? updated : member)));
      return;
    }

    const member = members.find((candidate) => candidate.id === memberId);
    const receipt = paymentReceipts.find((entry) => entry.id === receiptId && entry.memberId === memberId);
    if (!member || !receipt) {
      throw new Error("Receipt not found");
    }
    const reversed = reverseAllocation(
      bucketsOf(member),
      { arrearsApplied: receipt.arrearsApplied, cycleApplied: receipt.cycleApplied, advanceApplied: receipt.advanceApplied, amount: receipt.amount },
      member.totalCollected ?? 0,
    );
    setPaymentReceipts((current) => current.filter((entry) => entry.id !== receiptId));
    setMembers((current) =>
      current.map((candidate) =>
        candidate.id === memberId
          ? {
              ...candidate,
              partialPaidAmount: reversed.partialPaidAmount,
              balanceAmount: reversed.balanceAmount,
              arrearsAmount: reversed.arrearsAmount,
              advanceAmount: reversed.advanceAmount,
              totalCollected: reversed.totalCollected,
              paymentStatus: statusFromBuckets({
                feesAmount: candidate.feesAmount,
                partialPaidAmount: reversed.partialPaidAmount,
                arrearsAmount: reversed.arrearsAmount,
                advanceAmount: reversed.advanceAmount,
              }),
              updatedAt: new Date().toISOString(),
            }
          : candidate,
      ),
    );
  }

  async function resendReceipt(memberId: string, receiptId: string, channel: BillChannel): Promise<ResendResult> {
    if (isApiConfigured) {
      return api.resendReceipt(memberId, receiptId, channel);
    }
    const member = members.find((candidate) => candidate.id === memberId);
    const receipt = paymentReceipts.find((entry) => entry.id === receiptId);
    if (!member || !receipt) {
      throw new Error("Member not found");
    }
    return {
      receiptId: receipt.id,
      receiptNo: receipt.receiptNo,
      sms: channel === "email" ? undefined : "sent",
      email: channel === "sms" ? undefined : member.email ? "sent" : "skipped",
    };
  }

  async function sendStatement(memberId: string, channel: BillChannel, dryRun = false): Promise<StatementResult> {
    if (isApiConfigured) {
      return api.sendStatement(memberId, channel, dryRun);
    }
    const member = members.find((candidate) => candidate.id === memberId);
    if (!member) {
      throw new Error("Member not found");
    }
    // Demo preview mirrors the server text (display only; nothing is sent).
    const sms = `Hi ${member.name}, your Fitness World dues: Plan ${member.planType} ends ${member.membershipDue}. Old pending Rs.${member.arrearsAmount ?? 0}, this plan fee Rs.${member.feesAmount}, still to get Rs.${member.balanceAmount ?? 0}. Please pay at the counter. Thank you!`;
    if (dryRun) {
      return { dryRun: true, sms, email: member.email ? `${sms} Got so far: Rs.${member.partialPaidAmount ?? 0}. Extra paid: Rs.${member.advanceAmount ?? 0}.` : null };
    }
    return { status: "sent", channel: channel === "auto" ? "sms" : channel };
  }

  async function markSmsSent(memberId: string): Promise<void> {
    assertWritable();
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
    loadError,
    retryLoad,
    isDemo: !isApiConfigured && demoAllowed,
    upsertMember,
    upsertMembers,
    suspendMember,
    restoreMember,
    deleteMember,
    purgeMember,
    wipeAll,
    renewMember,
    addVisit,
    deleteVisit,
    addPaymentReceipt,
    deletePaymentReceipt,
    resendReceipt,
    sendStatement,
    markSmsSent,
  };
}
