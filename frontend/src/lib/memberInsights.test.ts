import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAttendanceInsights, buildProgressPoints, summarizeRenewalHistory } from "./memberInsights";
import type { AttendanceEntry, RenewalHistoryEntry } from "../types";

describe("member insight helpers", () => {
  it("summarizes renewal count, latest amount, and total renewed amount", () => {
    const history: RenewalHistoryEntry[] = [
      {
        id: "r-1",
        memberId: "m-1",
        oldPlanType: "1 Month",
        newPlanType: "3 Months",
        oldStartDate: "2026-03-10",
        oldDueDate: "2026-04-10",
        newStartDate: "2026-04-10",
        newDueDate: "2026-07-10",
        amount: 4500,
        paymentStatus: "Paid",
        renewedOn: "2026-04-10",
        createdAt: "2026-04-10T05:00:00.000Z",
      },
      {
        id: "r-2",
        memberId: "m-1",
        oldPlanType: "3 Months",
        newPlanType: "1 Month",
        oldStartDate: "2026-04-10",
        oldDueDate: "2026-07-10",
        newStartDate: "2026-07-10",
        newDueDate: "2026-08-10",
        amount: 1800,
        paymentStatus: "Pending",
        renewedOn: "2026-07-10",
        createdAt: "2026-07-10T05:00:00.000Z",
      },
    ];

    assert.deepEqual(summarizeRenewalHistory(history), {
      count: 2,
      latestPlan: "1 Month",
      latestRenewedOn: "2026-07-10",
      totalAmount: 6300,
      pendingAmount: 1800,
    });
  });

  it("builds progress points in date order and calculates change from first to latest weight", () => {
    const attendance: AttendanceEntry[] = [
      { id: "a-2", memberId: "m-1", visitDate: "2026-06-10", weightKg: 79, createdAt: "2026-06-10T05:00:00.000Z" },
      { id: "a-1", memberId: "m-1", visitDate: "2026-06-01", weightKg: 82, createdAt: "2026-06-01T05:00:00.000Z" },
      { id: "a-3", memberId: "m-1", visitDate: "2026-06-12", createdAt: "2026-06-12T05:00:00.000Z" },
    ];

    const progress = buildProgressPoints(attendance, 82);

    assert.equal(progress.firstWeightKg, 82);
    assert.equal(progress.latestWeightKg, 79);
    assert.equal(progress.weightChangeKg, -3);
    assert.deepEqual(progress.points.map((point) => point.visitDate), ["2026-06-01", "2026-06-10"]);
  });

  it("shows attendance health for recent and inactive members", () => {
    const attendance: AttendanceEntry[] = [
      { id: "a-1", memberId: "m-1", visitDate: "2026-06-09", createdAt: "2026-06-09T05:00:00.000Z" },
      { id: "a-2", memberId: "m-1", visitDate: "2026-06-06", createdAt: "2026-06-06T05:00:00.000Z" },
    ];

    assert.deepEqual(buildAttendanceInsights(attendance, new Date("2026-06-10T09:00:00.000Z")), {
      lastVisitDate: "2026-06-09",
      visitsThisMonth: 2,
      daysSinceLastVisit: 1,
      statusLabel: "Consistent",
    });
    assert.equal(buildAttendanceInsights([], new Date("2026-06-10T09:00:00.000Z")).statusLabel, "No visits");
  });
});
