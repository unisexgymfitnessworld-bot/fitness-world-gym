import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type FilterFn,
  type SortingState,
} from "@tanstack/react-table";
import { Eye, MessageCircle, MessageSquare, Pencil, UserX, SearchX, Plus, Download, UserCheck, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { compareRegistrationNumbers, createWhatsAppLink, formatDisplayDate, formatPhone, getDueTone, getMemberActionDueDate, getMemberDueKind, isPlanLessThanOneMonth, formatCurrency } from "../../lib/utils";
import type { Member } from "../../types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { SkeletonRow } from "../ui/Skeleton";


interface MemberTableProps {
  members: Member[];
  query: string;
  loading: boolean;
  onView: (memberId: string) => void;
  onEdit: (memberId: string) => void;
  onSms: (memberId: string) => void;
  onSuspend: (memberId: string) => void;
  onDelete: (memberId: string) => void;
  isDbEmpty?: boolean;
  onAddClick?: () => void;
  onClearFilters?: () => void;
}

const columnHelper = createColumnHelper<Member>();

const actionLegend = [
  "View profile",
  "WhatsApp/SMS reminders",
  "Edit details",
  "Suspend or restore member",
] as const;

const memberGlobalFilter: FilterFn<Member> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();
  if (!query) {
    return true;
  }
  const member = row.original;
  return [member.name, member.phone, member.regNo].some((value) => value.toLowerCase().includes(query));
};

export function MemberTable({
  members,
  query,
  loading,
  onView,
  onEdit,
  onSms,
  onSuspend,
  onDelete,
  isDbEmpty = false,
  onAddClick,
  onClearFilters,
}: MemberTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "regNo", desc: false }]);
  const [globalFilter, setGlobalFilter] = useState(query);

  const registerOrderedMembers = useMemo(
    () => [...members].sort((a, b) => compareRegistrationNumbers(a.regNo, b.regNo)),
    [members],
  );

  function exportToCsv(): void {
    const headers = [
      "Reg No",
      "Name",
      "Phone",
      "Age",
      "Gender",
      "Join Date",
      "Weight (kg)",
      "Height (cm)",
      "BMI",
      "Goal",
      "Plan Type",
      "Start Date",
      "Plan Renewal Date",
      "Plan Date Type",
      "Fees",
      "Payment Status",
      "Status",
      "Training Type",
      "Address",
      "Partial Paid Amount",
      "Balance Amount"
    ];
    
    const csvRows = [headers.join(",")];
    const visibleMembers = table.getRowModel().rows.map((row) => row.original);
    
    for (const member of visibleMembers) {
      const row = [
        `"${member.regNo}"`,
        `"${member.name.replace(/"/g, '""')}"`,
        `"${member.phone}"`,
        member.age,
        `"${member.gender}"`,
        `"${member.joinDate}"`,
        member.weightKg,
        member.heightCm,
        member.bmi,
        `"${member.goal}"`,
        `"${member.planType}"`,
        `"${member.membershipStart}"`,
        `"${getMemberActionDueDate(member)}"`,
        `"${getMemberDueKind(member)}"`,
        member.feesAmount,
        `"${member.paymentStatus}"`,
        `"${member.status}"`,
        `"${member.trainingType || "General"}"`,
        `"${(member.address || "").replace(/"/g, '""')}"`,
        member.partialPaidAmount ?? 0,
        member.balanceAmount ?? 0
      ];
      csvRows.push(row.join(","));
    }
    
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `fitness_world_members_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  useEffect(() => {
    setGlobalFilter(query);
  }, [query]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("regNo", {
        header: "Reg No",
        cell: (info) => <span className="font-mono text-[13px] font-bold text-brand-primary">{info.getValue()}</span>,
        sortingFn: (rowA, rowB) => compareRegistrationNumbers(rowA.original.regNo, rowB.original.regNo),
      }),
      columnHelper.accessor("name", {
        header: "Name",
        cell: (info) => {
          const member = info.row.original;
          return (
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border-default bg-surface-raised flex items-center justify-center">
                {member.avatar ? (
                  <img src={member.avatar} alt={member.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[12px] font-bold text-text-muted">{member.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-text-primary">{info.getValue()}</span>
                <span className="text-[11px] font-medium text-text-muted mt-0.5">
                  {member.trainingType || "General"} · {member.planType} · <span className="font-bold text-brand-primary">{formatCurrency(member.feesAmount)}</span>
                </span>
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor("phone", {
        header: "Phone",
        cell: (info) => {
          const member = info.row.original;
          return (
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[13px] text-text-secondary">{formatPhone(info.getValue())}</span>
              {member.smsSent3days && (
                <span className="inline-flex max-w-max items-center gap-1 text-[10px] font-bold text-brand-primary bg-brand-primary-light px-1.5 py-0.5 rounded-md uppercase tracking-wider">Sent</span>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("goal", {
        header: "Goal",
        cell: (info) => (
          <Badge tone="neutral">
            {info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor("joinDate", {
        header: "Join Date",
        cell: (info) => (
          <span className="text-[13px] text-text-secondary font-semibold">
            {info.getValue() ? formatDisplayDate(info.getValue()) : "—"}
          </span>
        ),
      }),
      columnHelper.accessor("address", {
        header: "Address",
        cell: (info) => {
          const address = info.getValue() || "";
          return (
            <span 
              className="text-[13px] text-text-muted block max-w-[140px] truncate" 
              title={address}
            >
              {address || "—"}
            </span>
          );
        },
      }),
      columnHelper.accessor((member) => getMemberActionDueDate(member), {
        id: "nextDue",
        header: "Renewal Date",
        cell: (info) => {
          const member = info.row.original;
          const tone = getDueTone(member);
          const isShortTerm = isPlanLessThanOneMonth(member);
          return (
            <div className="flex flex-col gap-1 justify-center">
              {isShortTerm ? (
                <span className="font-semibold text-text-muted">N/A</span>
              ) : (
                <>
                  <span className={tone === "expired" ? "font-bold text-status-expired" : tone === "due" ? "font-bold text-status-due" : "font-semibold text-status-active"}>
                    {formatDisplayDate(info.getValue())}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted leading-none">
                    {getMemberDueKind(member)}
                  </span>
                </>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("paymentStatus", {
        header: "Payment",
        cell: (info) => {
          const status = info.getValue();
          const member = info.row.original;
          const tone = status === "Paid" ? "paid" : status === "Partially Paid" ? "due" : "pending";
          return (
            <div className="flex flex-col gap-1.5 items-start justify-center">
              <Badge tone={tone}>
                {status}
              </Badge>
              {status === "Partially Paid" && member.balanceAmount > 0 && (
                <span className="text-[11px] font-black text-status-due leading-none pl-1">
                  Due: ₹{member.balanceAmount}
                </span>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => {
          const status = info.getValue();
          return (
            <Badge tone={status === "Active" ? "active" : status === "Expired" ? "expired" : "neutral"}>
              {status}
            </Badge>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: (info) => {
          const member = info.row.original;
          const isShortTerm = isPlanLessThanOneMonth(member);
          return (
            <div className="flex items-center gap-1.5">
              <motion.button
                className="focus-ring flex h-9 items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50/50 px-2.5 text-[12px] font-bold text-indigo-700 transition hover:bg-indigo-600 hover:text-white"
                onClick={() => onView(member.id)}
                title="View full member profile"
                aria-label={`View full profile for ${member.name}`}
                whileHover={{ scale: 1.08, y: -1 }}
                whileTap={{ scale: 0.92 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
              >
                <Eye size={14} />
                <span>View</span>
              </motion.button>
              {!isShortTerm && (
                <>
                  <motion.button
                    className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50/50 text-emerald-700 transition hover:bg-emerald-600 hover:text-white"
                    onClick={() => onSms(member.id)}
                    title="Send WhatsApp/SMS renewal reminder"
                    aria-label={`Send WhatsApp/SMS renewal reminder to ${member.name}`}
                    whileHover={{ scale: 1.12, y: -1 }}
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                  >
                    <MessageCircle size={15} />
                  </motion.button>
                </>
              )}
              <motion.button
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-55 text-slate-700 transition hover:bg-slate-600 hover:text-white"
                onClick={() => onEdit(member.id)}
                title="Edit member details"
                aria-label={`Edit member details for ${member.name}`}
                whileHover={{ scale: 1.12, y: -1 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
              >
                <Pencil size={15} />
              </motion.button>
              {member.status === "Suspended" ? (
                <motion.button
                  className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50/50 text-emerald-700 transition hover:bg-emerald-600 hover:text-white"
                  onClick={() => onSuspend(member.id)}
                  title="Unsuspend member access"
                  aria-label={`Unsuspend member access for ${member.name}`}
                  whileHover={{ scale: 1.12, y: -1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                >
                  <UserCheck size={15} />
                </motion.button>
              ) : (
                <motion.button
                  className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-rose-100 bg-rose-50/50 text-rose-700 transition hover:bg-rose-600 hover:text-white"
                  onClick={() => onSuspend(member.id)}
                  title="Suspend member access"
                  aria-label={`Suspend member access for ${member.name}`}
                  whileHover={{ scale: 1.12, y: -1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                >
                  <UserX size={15} />
                </motion.button>
              )}
              <motion.button
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 bg-red-50/50 text-red-700 transition hover:bg-red-600 hover:text-white"
                onClick={() => onDelete(member.id)}
                title="Delete member"
                aria-label={`Delete member ${member.name}`}
                whileHover={{ scale: 1.12, y: -1 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
              >
                <Trash2 size={15} />
              </motion.button>
            </div>
          );
        },
      }),
    ],
    [onEdit, onSms, onSuspend, onDelete, onView],
  );

  const table = useReactTable({
    data: registerOrderedMembers,
    columns,
    state: {
      globalFilter,
      sorting,
    },
    filterFns: {
      memberGlobalFilter,
    },
    globalFilterFn: memberGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (loading) {
    return (
      <section className="grid gap-3">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </section>
    );
  }

  const rows = table.getRowModel().rows;

  return (
    <motion.section
      className="studio-card overflow-hidden rounded-[var(--radius-card)]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.4 }}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border-default bg-brand-white px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 lg:px-5 lg:py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-primary sm:text-[12px]">Member Register</p>
          <h2 className="text-[18px] font-black text-text-primary sm:text-[20px] lg:text-[24px]">Fitness World Members</h2>
          <p className="mt-1 hidden max-w-[680px] text-[11px] font-bold uppercase tracking-wide text-text-muted lg:block">
            Actions: {actionLegend.join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-surface-overlay px-2.5 py-1 text-[13px] font-bold text-text-secondary sm:px-3 sm:py-1.5 sm:text-[14px]">{rows.length} visible</div>
          <Button variant="secondary" className="!h-9 !min-h-0 !px-3 !py-1 text-[13px] font-bold shadow-sm" onClick={exportToCsv} title="Export CSV" aria-label="Export CSV">
            <Download size={14} />
            <span>Export</span>
          </Button>
        </div>
      </header>

      {rows.length === 0 ? (
        isDbEmpty ? (
          <div className="flex flex-col items-center justify-center p-8 text-center sm:p-12 lg:p-16 border-t border-border-default bg-brand-white/80 backdrop-blur-sm shadow-[0_12px_40px_rgba(26,26,46,0.04)]">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary-light text-brand-primary shadow-[0_12px_24px_rgba(232,23,93,0.12)]">
              <Plus size={28} className="animate-pulse" />
            </div>
            <h2 className="mt-6 text-[22px] font-black text-text-primary sm:text-[24px]">Welcome to Fitness World!</h2>
            <p className="mt-2.5 max-w-md text-[14px] font-semibold text-text-secondary leading-relaxed sm:text-[15px]">
              Start by registering your first member to track their plans, body metrics, BMI, and daily attendance.
            </p>
            {onAddClick && (
              <Button className="mt-6 px-6 py-2.5 bg-gradient-to-r from-brand-primary to-[#F0447D] shadow-[0_10px_24px_rgba(232,23,93,0.24)] hover:shadow-[0_12px_28px_rgba(232,23,93,0.3)] hover:-translate-y-0.5 transition-all" onClick={onAddClick}>
                <Plus size={18} />
                Add First Member
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center sm:p-12 border-t border-border-default bg-brand-white/80 backdrop-blur-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <SearchX size={28} />
            </div>
            <h2 className="mt-6 text-[20px] font-black text-text-primary sm:text-[22px]">No members found</h2>
            <p className="mt-2 max-w-sm text-[14px] font-semibold text-text-secondary sm:text-[15px]">
              No members match your current search query or active filter selections.
            </p>
            {onClearFilters && (
              <Button className="mt-6" variant="secondary" onClick={onClearFilters}>
                Clear All Filters
              </Button>
            )}
          </div>
        )
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="grid gap-1.5 bg-surface-raised p-1.5 sm:gap-2 sm:p-2 md:hidden">
        {rows.map((row, i) => {
          const member = row.original;
          const dueTone = getDueTone(member);
          const nextDueDate = getMemberActionDueDate(member);
          const nextDueKind = getMemberDueKind(member);
          const isShortTerm = isPlanLessThanOneMonth(member);
          return (
            <motion.article
              key={row.id}
              className="rounded-[var(--radius-card)] border border-border-default bg-brand-white p-2.5 shadow-sm sm:p-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.05, 0.4) }}
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border-default bg-surface-raised flex items-center justify-center">
                  {member.avatar ? (
                    <img src={member.avatar} alt={member.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[12px] font-bold text-text-muted">{member.name.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-brand-primary">{member.regNo}</span>
                    <Badge tone={member.status === "Active" ? "active" : member.status === "Expired" ? "expired" : "neutral"}>
                      {member.status}
                    </Badge>
                    {member.smsSent3days && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-primary bg-brand-primary-light px-1.5 py-0.5 rounded-md uppercase tracking-wider">SMS Sent</span>
                    )}
                  </div>
                  <h3 className="mt-0.5 truncate text-[15px] font-bold text-text-primary">{member.name}</h3>
                  <p className="text-[11px] font-medium text-text-muted mt-0.5">
                    {member.trainingType || "General"} · {member.planType}
                  </p>
                  <p className="font-mono text-[11px] text-text-secondary mt-0.5">{formatPhone(member.phone)}</p>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-1.5 sm:mt-3 sm:gap-2">
                <div className="rounded-md bg-surface-overlay px-2 py-1.5 sm:rounded-lg sm:py-2">
                  <p className="text-[10px] font-bold uppercase text-text-muted">Goal</p>
                  <p className="mt-0.5 truncate text-[12px] font-bold text-text-primary sm:text-[13px]">{member.goal}</p>
                </div>
                <div className="rounded-md bg-surface-overlay px-2 py-1.5 sm:rounded-lg sm:py-2">
                  <p className="text-[10px] font-bold uppercase text-text-muted">Renewal</p>
                  {isShortTerm ? (
                    <p className="mt-0.5 text-[12px] font-bold text-text-muted sm:text-[13px]">N/A</p>
                  ) : (
                    <>
                      <p className={`mt-0.5 text-[12px] font-bold sm:text-[13px] ${dueTone === "expired" ? "text-status-expired" : dueTone === "due" ? "text-status-due" : "text-status-active"}`}>
                        {formatDisplayDate(nextDueDate)}
                      </p>
                      <p className="mt-0.5 text-[9px] font-bold uppercase text-text-muted">{nextDueKind}</p>
                    </>
                  )}
                </div>
                <div className="rounded-md bg-surface-overlay px-2 py-1.5 sm:rounded-lg sm:py-2">
                  <p className="text-[10px] font-bold uppercase text-text-muted">Pay</p>
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    <Badge tone={member.paymentStatus === "Paid" ? "paid" : member.paymentStatus === "Partially Paid" ? "due" : "pending"}>
                      {member.paymentStatus}
                    </Badge>
                    {member.paymentStatus === "Partially Paid" && member.balanceAmount > 0 && (
                      <span className="text-[10px] font-bold text-status-due">
                        Due: ₹{member.balanceAmount}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {(member.joinDate || member.address) && (
                <div className="mt-2 border-t border-border-default/50 pt-2 text-[11px] flex flex-col gap-1 bg-surface-overlay/20 px-2 py-1.5 rounded-lg">
                  {member.joinDate && (
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-text-muted uppercase text-[9px] tracking-wider">Join Date</span>
                      <span className="font-semibold text-text-secondary">{formatDisplayDate(member.joinDate)}</span>
                    </div>
                  )}
                  {member.address && (
                    <div className="flex justify-between items-start gap-3">
                      <span className="font-bold text-text-muted uppercase text-[9px] tracking-wider shrink-0 mt-0.5">Address</span>
                      <span className="font-medium text-text-secondary text-right line-clamp-2" title={member.address}>{member.address}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <motion.button
                  className="focus-ring flex h-8 items-center gap-1 rounded-md border border-indigo-100 bg-indigo-50/50 px-2 text-[11px] font-bold text-indigo-700 transition"
                  onClick={() => onView(member.id)}
                  title="View full member profile"
                  aria-label={`View full profile for ${member.name}`}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                >
                  <Eye size={13} />
                  <span>View</span>
                </motion.button>
                {!isShortTerm && (
                  <>
                    <motion.button
                      className="focus-ring flex h-8 w-8 items-center justify-center rounded-md border border-emerald-100 bg-emerald-50/50 text-emerald-700 transition"
                      onClick={() => onSms(member.id)}
                      title="Send WhatsApp/SMS renewal reminder"
                      aria-label={`Send WhatsApp/SMS renewal reminder to ${member.name}`}
                      whileHover={{ scale: 1.12 }}
                      whileTap={{ scale: 0.9 }}
                      transition={{ type: "spring", stiffness: 500, damping: 20 }}
                    >
                      <MessageCircle size={14} />
                    </motion.button>
                  </>
                )}
                <motion.button
                  className="focus-ring flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700 transition"
                  onClick={() => onEdit(member.id)}
                  title="Edit member details"
                  aria-label={`Edit member details for ${member.name}`}
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                >
                  <Pencil size={14} />
                </motion.button>
                {member.status === "Suspended" ? (
                  <motion.button
                    className="focus-ring flex h-8 w-8 items-center justify-center rounded-md border border-emerald-100 bg-emerald-50/50 text-emerald-700 transition"
                    onClick={() => onSuspend(member.id)}
                    title="Unsuspend member access"
                    aria-label={`Unsuspend member access for ${member.name}`}
                    whileHover={{ scale: 1.12 }}
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                  >
                    <UserCheck size={14} />
                  </motion.button>
                ) : (
                  <motion.button
                    className="focus-ring flex h-8 w-8 items-center justify-center rounded-md border border-rose-100 bg-rose-50/50 text-rose-700 transition"
                    onClick={() => onSuspend(member.id)}
                    title="Suspend member access"
                    aria-label={`Suspend member access for ${member.name}`}
                    whileHover={{ scale: 1.12 }}
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                  >
                    <UserX size={14} />
                  </motion.button>
                )}
                <motion.button
                  className="focus-ring flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-red-50 text-red-700 transition hover:bg-red-600 hover:text-white"
                  onClick={() => onDelete(member.id)}
                  title="Delete member"
                  aria-label={`Delete member ${member.name}`}
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                >
                  <Trash2 size={14} />
                </motion.button>
              </div>
            </motion.article>
          );
        })}
      </div>

      {/* Desktop Table View */}
      <div className="scrollbar-soft hidden overflow-x-auto md:block">
        <table className="min-w-[1080px] w-full border-collapse text-left">
          <thead className="bg-surface-overlay">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="border-b border-border-default px-4 py-3.5 text-[12px] font-bold uppercase tracking-wider text-text-muted">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="zebra-row group border-b border-border-default last:border-0">
                {row.getVisibleCells().map((cell, index) => (
                  <td key={cell.id} className="px-4 py-4 text-[15px]">
                    <div className={index === 0 ? "relative" : undefined}>
                      {index === 0 ? <span className="absolute -left-4 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r bg-gradient-to-b from-brand-primary to-[#F0447D] opacity-0 transition-opacity group-hover:opacity-100" /> : null}
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        </>
      )}
    </motion.section>
  );
}
