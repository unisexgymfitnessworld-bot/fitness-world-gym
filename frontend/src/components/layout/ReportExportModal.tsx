import { useMemo, useState } from "react";
import { AlertTriangle, Calendar, CheckCircle2, Coins, Download, FileSpreadsheet, FileText, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { getMemberCollectedAmount, getMemberPendingAmount } from "../../lib/analytics";
import { compareRegistrationNumbers, formatCurrency, formatDisplayDate, formatPhone, getMemberActionDueDate, getMemberDueDatesForMonth, getMemberDueKind, isPlanLessThanOneMonth } from "../../lib/utils";
import type { AttendanceEntry, Member, PaymentReceipt, RenewalHistoryEntry } from "../../types";

interface ReportExportModalProps {
  open: boolean;
  members: Member[];
  attendance?: AttendanceEntry[];
  paymentReceipts?: PaymentReceipt[];
  renewalHistory?: RenewalHistoryEntry[];
  onClose: () => void;
}

type ReportType = "all" | "payments" | "dues" | "expired" | "active" | "registrations" | "renewals";
type ReportPeriod = "all" | "month";

const months = [
  { value: 0, label: "January" },
  { value: 1, label: "February" },
  { value: 2, label: "March" },
  { value: 3, label: "April" },
  { value: 4, label: "May" },
  { value: 5, label: "June" },
  { value: 6, label: "July" },
  { value: 7, label: "August" },
  { value: 8, label: "September" },
  { value: 9, label: "October" },
  { value: 10, label: "November" },
  { value: 11, label: "December" },
];

const typeDetails = {
  all: {
    title: "Full Member Register",
    desc: "Complete member list in registration number order.",
    icon: FileSpreadsheet,
    period: "all",
  },
  payments: {
    title: "Payment Follow-ups",
    desc: "Pending and partial balances that need collection.",
    icon: Coins,
    period: "all",
  },
  dues: {
    title: "Renewals Due",
    desc: "Members whose renewal or plan end date falls in the selected month.",
    icon: Calendar,
    period: "month",
  },
  expired: {
    title: "Expired Members",
    desc: "Members whose plan already ended and need a renewal call.",
    icon: AlertTriangle,
    period: "all",
  },
  active: {
    title: "Active Members",
    desc: "Current running memberships with plan and payment status.",
    icon: CheckCircle2,
    period: "all",
  },
  registrations: {
    title: "New Registrations",
    desc: "Members who registered and joined during the selected month.",
    icon: Users,
    period: "month",
  },
  renewals: {
    title: "Renewals Started",
    desc: "Existing members whose renewed plan started in the selected month.",
    icon: TrendingUp,
    period: "month",
  },
} as const satisfies Record<ReportType, { title: string; desc: string; icon: LucideIcon; period: ReportPeriod }>;

const reportTypeOrder = ["all", "payments", "dues", "expired", "active", "registrations", "renewals"] as const satisfies readonly ReportType[];

function monthMatches(date: string, selectedMonth: number, selectedYear: number): boolean {
  const parsed = new Date(date);
  return parsed.getMonth() === selectedMonth && parsed.getFullYear() === selectedYear;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return text.includes(",") || text.includes('"') || text.includes("\n") ? `"${text.replace(/"/g, '""')}"` : text;
}

function htmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function reportFileName(reportType: ReportType, selectedYear: number, selectedMonth: number, period: ReportPeriod, extension: "csv" | "pdf", trainingType: string): string {
  const formattedMonth = String(selectedMonth + 1).padStart(2, "0");
  const datePart = period === "month" ? `${selectedYear}_${formattedMonth}` : "all_time";
  const trainingPart = trainingType === "All" ? "" : `_${trainingType.toLowerCase()}`;
  return `GymOS_Report_${reportType}${trainingPart}_${datePart}.${extension}`;
}

function backupFileName(): string {
  return `GymOS_Backup_${new Date().toISOString().slice(0, 10)}.json`;
}

function downloadBlob(content: string, type: string, fileName: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function memberMatchesReport(member: Member, reportType: ReportType, selectedMonth: number, selectedYear: number): boolean {
  switch (reportType) {
    case "all":
      return true;
    case "payments":
      return getMemberPendingAmount(member) > 0;
    case "expired":
      return member.status === "Expired";
    case "active":
      return member.status === "Active";
    case "registrations":
      return monthMatches(member.joinDate, selectedMonth, selectedYear);
    case "renewals":
      return member.joinDate !== member.membershipStart && monthMatches(member.membershipStart, selectedMonth, selectedYear);
    case "dues":
      return getMemberDueDatesForMonth(member, selectedYear, selectedMonth).length > 0;
  }
}

export function ReportExportModal({ open, members, attendance = [], paymentReceipts = [], renewalHistory = [], onClose }: ReportExportModalProps) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, i) => currentYear - i);

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedTrainingType, setSelectedTrainingType] = useState<"All" | "General" | "Personal" | "Couple">("All");
  const [reportType, setReportType] = useState<ReportType>("payments");
  const selectedDetails = typeDetails[reportType];
  const monthLabel = `${months[selectedMonth]?.label ?? "Month"} ${selectedYear}`;
  const periodLabel = selectedDetails.period === "month" ? monthLabel : "All Time";

  const filteredMembers = useMemo(() => {
    return members
      .filter((member) => {
        const matchesReport = memberMatchesReport(member, reportType, selectedMonth, selectedYear);
        const matchesTraining = selectedTrainingType === "All" || member.trainingType === selectedTrainingType;
        return matchesReport && matchesTraining;
      })
      .sort((a, b) => compareRegistrationNumbers(a.regNo, b.regNo));
  }, [members, reportType, selectedMonth, selectedYear, selectedTrainingType]);

  const reportCounts = useMemo(() => {
    return reportTypeOrder.reduce<Record<ReportType, number>>(
      (counts, type) => {
        counts[type] = members.filter((member) => {
          const matchesReport = memberMatchesReport(member, type, selectedMonth, selectedYear);
          const matchesTraining = selectedTrainingType === "All" || member.trainingType === selectedTrainingType;
          return matchesReport && matchesTraining;
        }).length;
        return counts;
      },
      {
        all: 0,
        payments: 0,
        dues: 0,
        expired: 0,
        active: 0,
        registrations: 0,
        renewals: 0,
      },
    );
  }, [members, selectedMonth, selectedYear, selectedTrainingType]);

  const reportSummary = useMemo(() => {
    return filteredMembers.reduce(
      (summary, member) => ({
        expected: summary.expected + member.feesAmount,
        collected: summary.collected + getMemberCollectedAmount(member),
        pending: summary.pending + getMemberPendingAmount(member),
      }),
      { expected: 0, collected: 0, pending: 0 },
    );
  }, [filteredMembers]);

  const actionSummary = useMemo(() => {
    const paymentFollowUps = filteredMembers.filter((member) => getMemberPendingAmount(member) > 0).length;
    const renewalCalls = filteredMembers.filter((member) => member.status === "Expired" || getMemberDueDatesForMonth(member, selectedYear, selectedMonth).length > 0).length;
    return { paymentFollowUps, renewalCalls };
  }, [filteredMembers, selectedMonth, selectedYear]);

  function handleCsvExport(): void {
    if (filteredMembers.length === 0) return;

    const headers = [
      "Registration No",
      "Name",
      "Phone",
      "Age",
      "Gender",
      "Join Date",
      "Weight (kg)",
      "Height (cm)",
      "BMI",
      "Goal",
      "Goal Other",
      "Health Problem",
      "Special Instruction",
      "Plan Type",
      "Membership Start",
      "Plan Renewal Date",
      "Plan Date Type",
      "Fees Amount",
      "Collected Amount",
      "Pending Amount",
      "Payment Status",
      "Status",
      "Training Type",
      "Address",
      "Partial Paid Amount",
      "Balance Amount",
      "Created At",
      "Updated At",
    ];

    const csvRows = [headers.join(",")];

    for (const member of filteredMembers) {
      const values = [
        member.regNo,
        member.name,
        member.phone,
        member.age,
        member.gender,
        member.joinDate,
        member.weightKg,
        member.heightCm,
        member.bmi,
        member.goal,
        member.goalOther ?? "",
        member.healthProblem ?? "",
        member.specialInstruction ?? "",
        member.planType,
        member.membershipStart,
        isPlanLessThanOneMonth(member) ? "N/A" : getMemberActionDueDate(member),
        isPlanLessThanOneMonth(member) ? "N/A" : getMemberDueKind(member),
        member.feesAmount,
        getMemberCollectedAmount(member),
        getMemberPendingAmount(member),
        member.paymentStatus,
        member.status,
        member.trainingType || "General",
        member.address || "",
        member.partialPaidAmount ?? 0,
        member.balanceAmount ?? 0,
        member.createdAt,
        member.updatedAt,
      ];
      csvRows.push(values.map(csvCell).join(","));
    }

    downloadBlob(csvRows.join("\n"), "text/csv;charset=utf-8;", reportFileName(reportType, selectedYear, selectedMonth, selectedDetails.period, "csv", selectedTrainingType));
  }

  function handleBackupExport(): void {
    const backup = {
      app: "Fitness World GymOS",
      generatedAt: new Date().toISOString(),
      note: "Full trainer workspace backup for business data safety.",
      counts: {
        members: members.length,
        attendance: attendance.length,
        paymentReceipts: paymentReceipts.length,
        renewalHistory: renewalHistory.length,
      },
      members: [...members].sort((a, b) => compareRegistrationNumbers(a.regNo, b.regNo)),
      attendance,
      paymentReceipts,
      renewalHistory,
    };
    downloadBlob(JSON.stringify(backup, null, 2), "application/json;charset=utf-8;", backupFileName());
  }

  function handlePdfExport(): void {
    if (filteredMembers.length === 0) return;

    const reportRows = filteredMembers
      .map(
        (member) => `
          <tr>
            <td>${htmlEscape(member.regNo)}</td>
            <td>
              <strong>${htmlEscape(member.name)}</strong>
              <span>${htmlEscape(member.trainingType)} Training</span>
            </td>
            <td>${htmlEscape(formatPhone(member.phone))}</td>
            <td>${htmlEscape(member.goal)}</td>
            <td>${htmlEscape(member.planType)}</td>
            <td>
              ${isPlanLessThanOneMonth(member) ? `
                <strong>N/A</strong>
              ` : `
                <strong>${htmlEscape(formatDisplayDate(getMemberActionDueDate(member)))}</strong>
                <span>${htmlEscape(getMemberDueKind(member))}</span>
              `}
            </td>
            <td>${htmlEscape(member.paymentStatus)}</td>
            <td class="currency">${htmlEscape(formatCurrency(getMemberCollectedAmount(member)))}</td>
            <td class="currency">${htmlEscape(formatCurrency(getMemberPendingAmount(member)))}</td>
            <td>${htmlEscape(member.status)}</td>
          </tr>
        `,
      )
      .join("");

    const reportHtml = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${htmlEscape(reportFileName(reportType, selectedYear, selectedMonth, selectedDetails.period, "pdf", selectedTrainingType))}</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #1a1a2e;
              font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              background: #ffffff;
              font-size: 11px;
            }
            .report-page {
              width: 100%;
              max-width: 100%;
            }
            header {
              display: grid;
              grid-template-columns: minmax(0, 1fr) 220px;
              align-items: center;
              gap: 18px;
              border-bottom: 3px solid #e8175d;
              padding-bottom: 12px;
            }
            .brand {
              display: flex;
              min-width: 0;
              align-items: center;
              gap: 10px;
            }
            .brand img {
              width: 44px;
              height: 44px;
              flex: 0 0 auto;
              object-fit: contain;
              border-radius: 999px;
            }
            h1 {
              margin: 0;
              overflow-wrap: anywhere;
              font-size: 21px;
              line-height: 1.08;
            }
            .muted {
              color: #667085;
              font-size: 10px;
              font-weight: 700;
              line-height: 1.35;
            }
            .report-meta {
              min-width: 0;
              text-align: right;
            }
            .report-meta strong {
              display: block;
              overflow-wrap: anywhere;
              font-size: 14px;
              line-height: 1.15;
            }
            .summary {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 8px;
              margin: 16px 0;
            }
            .card {
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              min-width: 0;
              padding: 9px 10px;
              background: #f8fafc;
            }
            .card span {
              color: #667085;
              display: block;
              font-size: 8px;
              font-weight: 900;
              letter-spacing: .05em;
              text-transform: uppercase;
            }
            .card strong {
              display: block;
              margin-top: 4px;
              overflow-wrap: anywhere;
              font-size: 15px;
              line-height: 1.1;
            }
            table {
              width: 100%;
              table-layout: fixed;
              border-collapse: collapse;
            }
            col.reg { width: 8%; }
            col.name { width: 18%; }
            col.phone { width: 12%; }
            col.goal { width: 12%; }
            col.plan { width: 9%; }
            col.renewal { width: 14%; }
            col.payment { width: 11%; }
            col.money { width: 8%; }
            col.status { width: 8%; }
            thead { display: table-header-group; }
            tr { break-inside: avoid; page-break-inside: avoid; }
            th {
              background: #f1f5f9;
              color: #667085;
              font-size: 8px;
              letter-spacing: .05em;
              padding: 7px 6px;
              text-align: left;
              text-transform: uppercase;
            }
            td {
              border-bottom: 1px solid #e5e7eb;
              font-size: 9px;
              line-height: 1.25;
              padding: 8px 6px;
              vertical-align: top;
              overflow-wrap: anywhere;
              word-break: break-word;
            }
            td strong {
              display: block;
              font-size: 9px;
              line-height: 1.25;
            }
            td span {
              display: block;
              color: #667085;
              font-size: 8px;
              font-weight: 700;
              margin-top: 2px;
            }
            .currency { white-space: nowrap; }
            footer {
              color: #667085;
              font-size: 9px;
              font-weight: 700;
              margin-top: 14px;
            }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <main class="report-page">
            <header>
              <div class="brand">
                <img src="${htmlEscape(window.location.origin)}/brand/fitness-world-logo-tight.png" alt="Fitness World" />
                <div>
                  <h1>Fitness World GymOS Report</h1>
                  <div class="muted">Unisex Gym · Member analysis and payment summary</div>
                </div>
              </div>
              <div class="report-meta">
                <strong>${htmlEscape(selectedDetails.title)}${selectedTrainingType !== "All" ? ` (${selectedTrainingType})` : ""}</strong>
                <div class="muted">${htmlEscape(periodLabel)}</div>
                <div class="muted">Generated ${htmlEscape(new Date().toLocaleString("en-IN"))}</div>
              </div>
            </header>

            <section class="summary">
              <div class="card"><span>Records</span><strong>${filteredMembers.length}</strong></div>
              <div class="card"><span>Expected</span><strong>${htmlEscape(formatCurrency(reportSummary.expected))}</strong></div>
              <div class="card"><span>Collected</span><strong>${htmlEscape(formatCurrency(reportSummary.collected))}</strong></div>
              <div class="card"><span>Pending</span><strong>${htmlEscape(formatCurrency(reportSummary.pending))}</strong></div>
            </section>

            <table>
              <colgroup>
                <col class="reg" />
                <col class="name" />
                <col class="phone" />
                <col class="goal" />
                <col class="plan" />
                <col class="renewal" />
                <col class="payment" />
                <col class="money" />
                <col class="money" />
                <col class="status" />
              </colgroup>
              <thead>
                <tr>
                  <th>Reg No</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Goal</th>
                  <th>Plan</th>
                  <th>Renewal Date</th>
                  <th>Payment</th>
                  <th>Collected</th>
                  <th>Pending</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${reportRows}</tbody>
            </table>
            <footer>Use browser Save as PDF to keep this report as ${htmlEscape(reportFileName(reportType, selectedYear, selectedMonth, selectedDetails.period, "pdf", selectedTrainingType))}.</footer>
          </main>
        </body>
      </html>`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(reportHtml);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  }

  return (
    <Modal open={open} title="Export Trainer Reports" onClose={onClose}>
      <div className="grid gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5 text-[13px] font-bold text-text-secondary">
            Month
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(Number(event.target.value))}
              className="studio-select h-12 w-full px-3 text-[15px] font-bold"
            >
              {months.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-[13px] font-bold text-text-secondary">
            Year
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              className="studio-select h-12 w-full px-3 text-[15px] font-bold"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-[13px] font-bold text-text-secondary">
            Training Type
            <select
              value={selectedTrainingType}
              onChange={(event) => setSelectedTrainingType(event.target.value as any)}
              className="studio-select h-12 w-full px-3 text-[15px] font-bold"
            >
              <option value="All">All Types</option>
              <option value="General">General</option>
              <option value="Personal">Personal</option>
              <option value="Couple">Couple</option>
            </select>
          </label>
        </div>

        <div className="grid gap-2">
          <span className="text-[13px] font-bold text-text-secondary">Trainer report</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {reportTypeOrder.map((type) => {
              const details = typeDetails[type];
              const Icon = details.icon;
              const isSelected = reportType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setReportType(type)}
                  className={`focus-ring flex min-h-[86px] items-start gap-3 rounded-[var(--radius-card)] border p-3 text-left transition-all hover:bg-brand-primary-light/10 ${
                    isSelected ? "border-brand-primary bg-brand-primary-light/30 shadow-[0_4px_12px_rgba(232,23,93,0.03)]" : "border-border-default bg-brand-white"
                  }`}
                >
                  <div className={`mt-0.5 grid h-8 w-8 place-items-center rounded-lg ${isSelected ? "bg-brand-primary text-brand-white" : "bg-surface-raised text-text-muted"}`}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <span className="block text-[14px] font-black text-text-primary">{details.title}</span>
                    <span className="mt-0.5 block text-[12px] font-semibold leading-normal text-text-secondary">{details.desc}</span>
                    <span className="mt-1 inline-flex rounded-full bg-surface-overlay px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-text-muted">
                      {reportCounts[type]} records · {details.period === "month" ? monthLabel : "All time"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 rounded-[var(--radius-card)] border border-border-default bg-surface-raised p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-sky-50 text-sky-600">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-text-muted">Report Preview · {periodLabel}</span>
              <span className="mt-0.5 block text-[15px] font-black text-text-primary">
                {filteredMembers.length} {filteredMembers.length === 1 ? "record" : "records"} found
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-right sm:grid-cols-5">
            <div>
              <span className="block text-[10px] font-black uppercase tracking-wider text-text-muted">Pay Calls</span>
              <span className="mt-0.5 block text-[13px] font-black text-status-due">{actionSummary.paymentFollowUps}</span>
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase tracking-wider text-text-muted">Renew Calls</span>
              <span className="mt-0.5 block text-[13px] font-black text-sky-700">{actionSummary.renewalCalls}</span>
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase tracking-wider text-text-muted">Expected</span>
              <span className="mt-0.5 block text-[13px] font-black text-text-primary">{formatCurrency(reportSummary.expected)}</span>
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase tracking-wider text-text-muted">Collected</span>
              <span className="mt-0.5 block text-[13px] font-black text-status-active">{formatCurrency(reportSummary.collected)}</span>
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase tracking-wider text-text-muted">Pending</span>
              <span className="mt-0.5 block text-[13px] font-black text-status-due">{formatCurrency(reportSummary.pending)}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 rounded-[var(--radius-card)] border border-emerald-100 bg-emerald-50/30 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <span className="block text-[11px] font-black uppercase tracking-wider text-emerald-700">Data Safety Backup</span>
            <p className="mt-1 text-[14px] font-bold leading-5 text-text-primary">
              Full JSON copy of members, attendance, payment receipts, and renewal history.
            </p>
            <p className="mt-1 text-[12px] font-semibold text-text-secondary">
              {members.length} members · {attendance.length} visits · {paymentReceipts.length} receipts · {renewalHistory.length} renewals
            </p>
          </div>
          <Button variant="secondary" type="button" className="min-w-36 border-emerald-200 text-emerald-700" onClick={handleBackupExport}>
            <Download size={16} />
            Backup JSON
          </Button>
        </div>

        <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center justify-end gap-3 border-t border-border-default bg-brand-white/95 px-6 py-4 shadow-[0_-12px_30px_rgba(26,26,46,0.08)] backdrop-blur">
          <Button variant="secondary" type="button" className="min-w-28" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            type="button"
            className="min-w-36"
            disabled={filteredMembers.length === 0}
            onClick={handlePdfExport}
          >
            <FileText size={16} />
            PDF Report
          </Button>
          <Button
            type="button"
            className="min-w-36"
            disabled={filteredMembers.length === 0}
            onClick={handleCsvExport}
          >
            <Download size={16} />
            Export CSV
          </Button>
        </div>
      </div>
    </Modal>
  );
}
