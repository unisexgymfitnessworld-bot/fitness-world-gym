import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizePeriod } from "./analytics";
import type { Member, PaymentReceipt, RenewalHistoryEntry } from "../types";

const PERIOD = { start: new Date(2026, 10, 1), end: new Date(2026, 10, 30) };

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: "m-1",
    status: "Active",
    joinDate: "2026-09-05",
    membershipStart: "2026-11-01",
    membershipDue: "2026-12-01",
    feesAmount: 1000,
    paymentStatus: "Paid",
    partialPaidAmount: 1000,
    balanceAmount: 0,
    arrearsAmount: 0,
    advanceAmount: 0,
    totalCollected: 0,
    trainingType: "General",
    ...overrides,
  } as Member;
}

function receipt(overrides: Partial<PaymentReceipt> = {}): PaymentReceipt {
  return {
    id: "rc-1",
    memberId: "m-1",
    receiptNo: "FW-R-1",
    paidOn: "2026-11-10",
    amount: 1000,
    method: "Cash",
    note: "test",
    createdAt: "2026-11-10T05:00:00.000Z",
    ...overrides,
  } as PaymentReceipt;
}

function renewal(overrides: Partial<RenewalHistoryEntry> = {}): RenewalHistoryEntry {
  return {
    id: "rw-1",
    memberId: "m-1",
    oldPlanType: "1 Month",
    newPlanType: "1 Month",
    oldStartDate: "2026-10-01",
    oldDueDate: "2026-11-01",
    newStartDate: "2026-11-01",
    newDueDate: "2026-12-01",
    amount: 1000,
    arrearsCarried: 0,
    oldAmount: 1000,
    paymentStatus: "Paid",
    renewedOn: "2026-11-01",
    createdAt: "2026-11-01T05:00:00.000Z",
    ...overrides,
  } as RenewalHistoryEntry;
}

describe("summarizePeriod population scoping", () => {
  it("ignores receipts and renewals of members outside the passed set", () => {
    const summary = summarizePeriod("This Month", [member()], new Date(2026, 10, 15), {
      receipts: [receipt(), receipt({ id: "rc-2", memberId: "m-2", amount: 5000 })],
      renewals: [renewal(), renewal({ id: "rw-2", memberId: "m-2", amount: 5000, renewedOn: "2026-10-05" })],
      period: PERIOD,
    });
    assert.equal(summary.collectedAmount, 1000);
    assert.equal(summary.expectedAmount, 1000);
    assert.equal(summary.collectionRate, 100);
  });

  it("reports zero money for an empty member set even with receipts in scope", () => {
    const summary = summarizePeriod("Empty", [], new Date(2026, 10, 15), {
      receipts: [receipt({ memberId: "m-9" })],
      renewals: [],
      period: PERIOD,
    });
    assert.equal(summary.collectedAmount, 0);
    assert.equal(summary.expectedAmount, 0);
    assert.equal(summary.collectionRate, 0);
  });
});
