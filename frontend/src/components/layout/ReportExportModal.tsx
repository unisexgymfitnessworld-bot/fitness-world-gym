import { useMemo, useState } from "react";
import { Calendar, Coins, Download, FileSpreadsheet, Info, TrendingUp, Users } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { formatCurrency } from "../../lib/utils";
import type { Member } from "../../types";

interface ReportExportModalProps {
  open: boolean;
  members: Member[];
  onClose: () => void;
}

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

export function ReportExportModal({ open, members, onClose }: ReportExportModalProps) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, i) => currentYear - i);

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [reportType, setReportType] = useState<"registrations" | "renewals" | "dues" | "active" | "pending">("registrations");

  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      const joinDateObj = new Date(member.joinDate);
      const startDateObj = new Date(member.membershipStart);
      const dueDateObj = new Date(member.membershipDue);

      switch (reportType) {
        case "registrations":
          return (
            joinDateObj.getMonth() === selectedMonth &&
            joinDateObj.getFullYear() === selectedYear
          );
        case "renewals":
          return (
            startDateObj.getMonth() === selectedMonth &&
            startDateObj.getFullYear() === selectedYear
          );
        case "dues":
          return (
            dueDateObj.getMonth() === selectedMonth &&
            dueDateObj.getFullYear() === selectedYear
          );
        case "active": {
          const startOfSelectedMonth = new Date(selectedYear, selectedMonth, 1);
          const endOfSelectedMonth = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
          const joinDate = new Date(member.joinDate);
          const dueDate = new Date(member.membershipDue);
          
          return (
            joinDate <= endOfSelectedMonth &&
            dueDate >= startOfSelectedMonth &&
            member.status !== "Suspended"
          );
        }
        case "pending": {
          const isPending = member.paymentStatus === "Pending";
          const dueMatches = 
            dueDateObj.getMonth() === selectedMonth &&
            dueDateObj.getFullYear() === selectedYear;
          return isPending && (member.status === "Active" || dueMatches);
        }
        default:
          return true;
      }
    });
  }, [members, reportType, selectedMonth, selectedYear]);

  const totalValue = useMemo(() => {
    return filteredMembers.reduce((sum, member) => sum + member.feesAmount, 0);
  }, [filteredMembers]);

  function handleExport() {
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
      "Membership Due",
      "Fees Amount",
      "Payment Status",
      "Status",
      "Created At",
      "Updated At"
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
        member.membershipDue,
        member.feesAmount,
        member.paymentStatus,
        member.status,
        member.createdAt,
        member.updatedAt
      ];

      const escaped = values.map((val) => {
        const s = String(val ?? "");
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      });

      csvRows.push(escaped.join(","));
    }

    const csvContent = csvRows.join("\n");
    const formattedMonth = String(selectedMonth + 1).padStart(2, "0");
    const fileName = `GymOS_Report_${reportType}_${selectedYear}_${formattedMonth}.csv`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const typeDetails = {
    registrations: {
      title: "New Registrations",
      desc: "Members who registered and joined during the selected month.",
      icon: Users,
    },
    renewals: {
      title: "Renewals Started",
      desc: "Members whose current active plan started in the selected month.",
      icon: TrendingUp,
    },
    dues: {
      title: "Renewals Due",
      desc: "Members whose current plan expires/expired in the selected month.",
      icon: Calendar,
    },
    active: {
      title: "All Active Members",
      desc: "Snapshot of all active memberships running during the selected month.",
      icon: Users,
    },
    pending: {
      title: "Pending Payments",
      desc: "Members with 'Pending' payment status whose plans are active or due in this month.",
      icon: Coins,
    },
  };

  return (
    <Modal open={open} title="Export Monthly Reports" onClose={onClose}>
      <div className="grid gap-6">
        {/* Date Selector row */}
        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-1.5 text-[13px] font-bold text-text-secondary">
            Select Month
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="focus-ring h-12 w-full rounded-[var(--radius-card)] border border-border-default bg-brand-white px-3 text-[15px] font-bold text-text-primary"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-[13px] font-bold text-text-secondary">
            Select Year
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="focus-ring h-12 w-full rounded-[var(--radius-card)] border border-border-default bg-brand-white px-3 text-[15px] font-bold text-text-primary"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Report Type selector */}
        <div className="grid gap-2">
          <span className="text-[13px] font-bold text-text-secondary">Report Category</span>
          <div className="grid gap-2">
            {(["registrations", "renewals", "dues", "active", "pending"] as const).map((type) => {
              const details = typeDetails[type];
              const Icon = details.icon;
              const isSelected = reportType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setReportType(type)}
                  className={`focus-ring flex items-start gap-3 rounded-[var(--radius-card)] border p-3 text-left transition-all hover:bg-brand-primary-light/10 ${
                    isSelected
                      ? "border-brand-primary bg-brand-primary-light/30 shadow-[0_4px_12px_rgba(232,23,93,0.03)]"
                      : "border-border-default bg-brand-white"
                  }`}
                >
                  <div className={`mt-0.5 grid h-8 w-8 place-items-center rounded-lg ${
                    isSelected ? "bg-brand-primary text-brand-white" : "bg-surface-raised text-text-muted"
                  }`}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <span className="block text-[14px] font-black text-text-primary">{details.title}</span>
                    <span className="mt-0.5 block text-[12px] font-semibold text-text-secondary leading-normal">{details.desc}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Metrics Preview Section */}
        <div className="rounded-[var(--radius-card)] border border-border-default bg-surface-raised p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-sky-50 text-sky-600">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-text-muted">Report Preview</span>
              <span className="block text-[15px] font-black text-text-primary mt-0.5">
                {filteredMembers.length} {filteredMembers.length === 1 ? "record" : "records"} found
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-text-muted">Total Value</span>
            <span className="block text-[16px] font-black text-status-active mt-0.5">
              {formatCurrency(totalValue)}
            </span>
          </div>
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-end gap-3 border-t border-border-default pt-4">
          <Button variant="secondary" type="button" className="min-w-28" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="min-w-40 flex items-center justify-center gap-2"
            disabled={filteredMembers.length === 0}
            onClick={handleExport}
          >
            <Download size={16} />
            Export CSV
          </Button>
        </div>
      </div>
    </Modal>
  );
}
