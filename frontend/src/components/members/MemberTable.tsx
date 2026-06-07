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
import { Eye, MessageCircle, MessageSquare, Pencil, UserX, SearchX, Plus, Download } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { createWhatsAppLink, formatDisplayDate, formatPhone, getDueTone } from "../../lib/utils";
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
  isDbEmpty?: boolean;
  onAddClick?: () => void;
  onClearFilters?: () => void;
}

const columnHelper = createColumnHelper<Member>();

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
  isDbEmpty = false,
  onAddClick,
  onClearFilters,
}: MemberTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "membershipDue", desc: false }]);
  const [globalFilter, setGlobalFilter] = useState(query);

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
      "Due Date",
      "Fees",
      "Payment Status",
      "Status"
    ];
    
    const csvRows = [headers.join(",")];
    
    for (const member of members) {
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
        `"${member.membershipDue}"`,
        member.feesAmount,
        `"${member.paymentStatus}"`,
        `"${member.status}"`
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
              <span className="font-semibold text-text-primary">{info.getValue()}</span>
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
          <Badge tone="primary">
            {info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor("membershipDue", {
        header: "Due Date",
        cell: (info) => {
          const tone = getDueTone(info.row.original);
          return (
            <span className={tone === "expired" ? "font-bold text-status-expired" : tone === "due" ? "font-bold text-status-due" : "font-semibold text-status-active"}>
              {formatDisplayDate(info.getValue())}
            </span>
          );
        },
      }),
      columnHelper.accessor("paymentStatus", {
        header: "Payment",
        cell: (info) => (
          <Badge tone={info.getValue() === "Paid" ? "paid" : "pending"}>
            {info.getValue()}
          </Badge>
        ),
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
          return (
            <div className="flex items-center gap-1.5">
              <Button variant="icon" className="!border-border-default !bg-brand-white !text-text-secondary hover:!border-brand-primary hover:!text-brand-primary" title="View" aria-label={`View ${member.name}`} onClick={() => onView(member.id)}>
                <Eye size={17} />
              </Button>
              <a
                className="focus-ring grid h-11 w-11 place-items-center rounded-[var(--radius-card)] border border-green-200 bg-green-50 text-status-active transition-colors hover:border-status-active lg:h-12 lg:w-12"
                href={createWhatsAppLink(member)}
                target="_blank"
                rel="noreferrer"
                title="WhatsApp"
                aria-label={`WhatsApp ${member.name}`}
              >
                <MessageCircle size={17} />
              </a>
              <Button variant="icon" className="!border-border-default !bg-brand-white !text-text-secondary hover:!border-brand-primary hover:!text-brand-primary" title="SMS" aria-label={`SMS ${member.name}`} onClick={() => onSms(member.id)}>
                <MessageSquare size={17} />
              </Button>
              <Button variant="icon" className="!border-border-default !bg-brand-white !text-text-secondary hover:!border-brand-primary hover:!text-brand-primary" title="Edit" aria-label={`Edit ${member.name}`} onClick={() => onEdit(member.id)}>
                <Pencil size={17} />
              </Button>
              <Button variant="icon" className="!border-border-default !bg-brand-white !text-text-secondary hover:!border-status-expired hover:!text-status-expired" title="Suspend" aria-label={`Suspend ${member.name}`} onClick={() => onSuspend(member.id)}>
                <UserX size={17} />
              </Button>
            </div>
          );
        },
      }),
    ],
    [onEdit, onSms, onSuspend, onView],
  );

  const table = useReactTable({
    data: members,
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
            <h2 className="mt-6 text-[22px] font-black text-text-primary sm:text-[24px]">Welcome to GymOS!</h2>
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
                  <p className="font-mono text-[11px] text-text-secondary">{formatPhone(member.phone)}</p>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-1.5 sm:mt-3 sm:gap-2">
                <div className="rounded-md bg-surface-overlay px-2 py-1.5 sm:rounded-lg sm:py-2">
                  <p className="text-[10px] font-bold uppercase text-text-muted">Goal</p>
                  <p className="mt-0.5 truncate text-[12px] font-bold text-text-primary sm:text-[13px]">{member.goal}</p>
                </div>
                <div className="rounded-md bg-surface-overlay px-2 py-1.5 sm:rounded-lg sm:py-2">
                  <p className="text-[10px] font-bold uppercase text-text-muted">Due</p>
                  <p className={`mt-0.5 text-[12px] font-bold sm:text-[13px] ${dueTone === "expired" ? "text-status-expired" : dueTone === "due" ? "text-status-due" : "text-status-active"}`}>
                    {formatDisplayDate(member.membershipDue)}
                  </p>
                </div>
                <div className="rounded-md bg-surface-overlay px-2 py-1.5 sm:rounded-lg sm:py-2">
                  <p className="text-[10px] font-bold uppercase text-text-muted">Pay</p>
                  <p className="mt-0.5">
                    <Badge tone={member.paymentStatus === "Paid" ? "paid" : "pending"}>
                      {member.paymentStatus}
                    </Badge>
                  </p>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-1 sm:mt-3 sm:gap-1.5">
                <Button variant="icon" className="!h-8 !w-8 !min-h-0 !p-0 !border-border-default !bg-brand-white !text-text-secondary hover:!border-brand-primary hover:!text-brand-primary" title="View" aria-label={`View ${member.name}`} onClick={() => onView(member.id)}>
                  <Eye size={15} />
                </Button>
                <a
                  className="focus-ring grid h-8 w-8 place-items-center rounded-[var(--radius-card)] border border-green-200 bg-green-50 text-status-active transition-colors hover:border-status-active"
                  href={createWhatsAppLink(member)}
                  target="_blank"
                  rel="noreferrer"
                  title="WhatsApp"
                  aria-label={`WhatsApp ${member.name}`}
                >
                  <MessageCircle size={15} />
                </a>
                <Button variant="icon" className="!h-8 !w-8 !min-h-0 !p-0 !border-border-default !bg-brand-white !text-text-secondary hover:!border-brand-primary hover:!text-brand-primary" title="SMS" aria-label={`SMS ${member.name}`} onClick={() => onSms(member.id)}>
                  <MessageSquare size={15} />
                </Button>
                <Button variant="icon" className="!h-8 !w-8 !min-h-0 !p-0 !border-border-default !bg-brand-white !text-text-secondary hover:!border-brand-primary hover:!text-brand-primary" title="Edit" aria-label={`Edit ${member.name}`} onClick={() => onEdit(member.id)}>
                  <Pencil size={15} />
                </Button>
                <Button variant="icon" className="!h-8 !w-8 !min-h-0 !p-0 !border-border-default !bg-brand-white !text-text-secondary hover:!border-status-expired hover:!text-status-expired" title="Suspend" aria-label={`Suspend ${member.name}`} onClick={() => onSuspend(member.id)}>
                  <UserX size={15} />
                </Button>
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
