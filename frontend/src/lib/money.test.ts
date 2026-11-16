import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allocatePayment,
  applyAllocation,
  applyRenewal,
  cycleDue,
  receiptLines,
  reverseAllocation,
  splitMergedBalance,
  statusFromBuckets,
  totalBalance,
} from "./money";

describe("money buckets", () => {
  it("computes cycle due and total balance", () => {
    assert.equal(cycleDue({ feesAmount: 1800, partialPaidAmount: 500 }), 1300);
    assert.equal(cycleDue({ feesAmount: 1800, partialPaidAmount: 2000 }), 0);
    assert.equal(
      totalBalance({ feesAmount: 1800, partialPaidAmount: 500, arrearsAmount: 700 }),
      2000,
    );
  });

  it("pays old dues only without touching the new cycle", () => {
    // Divya's case: 1800 old dues, fresh 1800 cycle untouched.
    const alloc = allocatePayment(1800, 1800, 0, 1800);
    assert.deepEqual(alloc, {
      arrearsApplied: 1800,
      cycleApplied: 0,
      advanceApplied: 0,
      total: 1800,
    });
    const next = applyAllocation(
      { feesAmount: 1800, partialPaidAmount: 0, arrearsAmount: 1800, advanceAmount: 0 },
      alloc,
      0,
    );
    assert.equal(next.arrearsAmount, 0);
    assert.equal(next.partialPaidAmount, 0);
    assert.equal(next.balanceAmount, 1800);
    assert.equal(next.totalCollected, 1800);
  });

  it("allocates oldest-first across arrears, cycle, advance", () => {
    const alloc = allocatePayment(500, 1800, 0, 3000);
    assert.deepEqual(alloc, {
      arrearsApplied: 500,
      cycleApplied: 1800,
      advanceApplied: 700,
      total: 3000,
    });
  });

  it("derives status from buckets", () => {
    assert.equal(
      statusFromBuckets({ feesAmount: 1800, partialPaidAmount: 1800, arrearsAmount: 0, advanceAmount: 0 }),
      "Paid",
    );
    assert.equal(
      statusFromBuckets({ feesAmount: 1800, partialPaidAmount: 0, arrearsAmount: 0, advanceAmount: 0 }),
      "Pending",
    );
    assert.equal(
      statusFromBuckets({ feesAmount: 1800, partialPaidAmount: 500, arrearsAmount: 0, advanceAmount: 0 }),
      "Partially Paid",
    );
    // Advance credit alone does not mark Paid while dues remain.
    assert.equal(
      statusFromBuckets({ feesAmount: 1800, partialPaidAmount: 0, arrearsAmount: 100, advanceAmount: 5000 }),
      "Partially Paid",
    );
  });

  it("renews without merging: new fee stays pure, arrears stay visible", () => {
    // Divya: 1800 owed on the closing cycle, no prior arrears; pays 3600.
    const before = { feesAmount: 1800, partialPaidAmount: 0, arrearsAmount: 0, advanceAmount: 0 };
    const result = applyRenewal(before, 1800, 3600, 0);
    assert.equal(result.feesAmount, 1800);
    assert.equal(result.arrearsClosed, 1800);
    assert.equal(result.arrearsAmount, 0);
    assert.equal(result.partialPaidAmount, 1800);
    assert.equal(result.advanceAmount, 0);
    assert.equal(result.balanceAmount, 0);
    assert.equal(result.paymentStatus, "Paid");
    assert.deepEqual(result.allocation, {
      arrearsApplied: 1800,
      cycleApplied: 1800,
      advanceApplied: 0,
      total: 3600,
    });
  });

  it("renews pending: unpaid cycle rolls into arrears, never vanishes", () => {
    const before = { feesAmount: 1800, partialPaidAmount: 500, arrearsAmount: 200, advanceAmount: 0 };
    const result = applyRenewal(before, 1800, 0, 500);
    assert.equal(result.feesAmount, 1800);
    assert.equal(result.arrearsAmount, 1500);
    assert.equal(result.partialPaidAmount, 0);
    assert.equal(result.balanceAmount, 3300);
    assert.equal(result.paymentStatus, "Pending");
    assert.equal(result.totalCollected, 500);
  });

  it("applies advance credit to the new fee before fresh cash", () => {
    const before = { feesAmount: 1800, partialPaidAmount: 1800, arrearsAmount: 0, advanceAmount: 1000 };
    const result = applyRenewal(before, 1800, 800, 2800);
    assert.equal(result.creditUsed, 1000);
    assert.equal(result.partialPaidAmount, 1800);
    assert.equal(result.advanceAmount, 0);
    assert.equal(result.balanceAmount, 0);
    assert.equal(result.paymentStatus, "Paid");
  });

  it("collects advance above the total owed", () => {
    const before = { feesAmount: 1800, partialPaidAmount: 1800, arrearsAmount: 0, advanceAmount: 0 };
    const alloc = allocatePayment(0, 1800, 1800, 500);
    const next = applyAllocation(before, alloc, 1800);
    assert.equal(next.advanceAmount, 500);
    assert.equal(next.balanceAmount, 0);
  });

  it("splits a legacy merged balance using history's true fee", () => {
    // Merged 3600, fully paid: new cycle paid, no arrears left.
    assert.deepEqual(splitMergedBalance(3600, 0, 1800), {
      feesAmount: 1800,
      partialPaidAmount: 1800,
      arrearsAmount: 0,
    });
    // Merged 3600, balance 1800: oldest-first paid the old dues; new cycle open.
    assert.deepEqual(splitMergedBalance(3600, 1800, 1800), {
      feesAmount: 1800,
      partialPaidAmount: 0,
      arrearsAmount: 0,
    });
    // Merged 3600, balance 3000: only 600 reached the old dues.
    assert.deepEqual(splitMergedBalance(3600, 3000, 1800), {
      feesAmount: 1800,
      partialPaidAmount: 0,
      arrearsAmount: 1200,
    });
  });

  it("reverses a bill exactly (apply then reverse is identity)", () => {
    const before = { feesAmount: 1800, partialPaidAmount: 500, arrearsAmount: 700, advanceAmount: 0 };
    const alloc = allocatePayment(700, 1800, 500, 1000);
    const applied = applyAllocation(before, alloc, 500);
    const reversed = reverseAllocation(
      { feesAmount: 1800, partialPaidAmount: applied.partialPaidAmount, arrearsAmount: applied.arrearsAmount, advanceAmount: applied.advanceAmount },
      { arrearsApplied: alloc.arrearsApplied, cycleApplied: alloc.cycleApplied, advanceApplied: alloc.advanceApplied, amount: alloc.total },
      applied.totalCollected,
    );
    assert.deepEqual(reversed, {
      partialPaidAmount: 500,
      arrearsAmount: 700,
      advanceAmount: 0,
      balanceAmount: 2000,
      totalCollected: 500,
    });
  });

  it("reverses a legacy bill without a split from the cycle", () => {
    const reversed = reverseAllocation(
      { feesAmount: 1800, partialPaidAmount: 1800, arrearsAmount: 0, advanceAmount: 0 },
      { amount: 1800 },
      1800,
    );
    assert.deepEqual(reversed, {
      partialPaidAmount: 0,
      arrearsAmount: 0,
      advanceAmount: 0,
      balanceAmount: 1800,
      totalCollected: 0,
    });
  });

  it("renders receipt lines for every channel", () => {
    assert.deepEqual(
      receiptLines({ arrearsApplied: 1800, cycleApplied: 0, advanceApplied: 0, total: 1800 }),
      ["Old pending: Rs.1800", "Total: Rs.1800"],
    );
    assert.deepEqual(
      receiptLines({ arrearsApplied: 500, cycleApplied: 1800, advanceApplied: 700, total: 3000 }),
      ["Old pending: Rs.500", "This plan: Rs.1800", "Extra paid: Rs.700", "Total: Rs.3000"],
    );
  });
});
