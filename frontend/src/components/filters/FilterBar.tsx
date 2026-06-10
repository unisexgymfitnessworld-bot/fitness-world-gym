import { CalendarClock, IndianRupee, Search, SlidersHorizontal, X } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { cn, daysUntil, getMemberActionDueDate } from "../../lib/utils";
import { goalOptions, type MemberFilters, paymentOptions, type Member } from "../../types";

interface FilterBarProps {
  filters: MemberFilters;
  resultCount: number;
  onChange: <K extends keyof MemberFilters>(key: K, value: MemberFilters[K]) => void;
  members: Member[];
}

export function FilterBar({ filters, resultCount, onChange, members }: FilterBarProps) {
  const selectClassName = "studio-select min-h-10 shrink-0 px-3 text-[14px] font-semibold lg:min-h-12 lg:text-[15px]";
  const statusHelp: Record<"All" | "Active" | "Expired", string> = useMemo(
    () => ({
      All: `Show all ${members.length} members in this trainer workspace`,
      Active: `Show ${members.filter((member) => member.status === "Active").length} active members`,
      Expired: `Show ${members.filter((member) => member.status === "Expired").length} expired members`,
    }),
    [members],
  );

  const quickCounts = useMemo(() => {
    const pending = members.filter((member) => member.paymentStatus === "Pending").length;
    const partial = members.filter((member) => member.paymentStatus === "Partially Paid").length;
    const dueSoon = members.filter((member) => {
      const remaining = daysUntil(getMemberActionDueDate(member));
      return member.status === "Active" && remaining >= 0 && remaining <= 3;
    }).length;
    return { pending, partial, dueSoon };
  }, [members]);

  const hasActiveFilters =
    filters.query.trim().length > 0 ||
    filters.status !== "All" ||
    filters.goal !== "All Goals" ||
    filters.payment !== "All Payments" ||
    filters.month !== "All" ||
    filters.dueSoon;

  function clearFilters(): void {
    onChange("query", "");
    onChange("status", "All");
    onChange("goal", "All Goals");
    onChange("payment", "All Payments");
    onChange("month", "All");
    onChange("dueSoon", false);
  }

  const monthOptions = useMemo(() => {
    const months = new Set<string>();

    // Add current month by default
    const currentMonth = new Date().toISOString().slice(0, 7);
    months.add(currentMonth);

    // Collect months from members
    members.forEach((m) => {
      if (m.membershipStart) {
        months.add(m.membershipStart.slice(0, 7));
      }
      if (m.joinDate) {
        months.add(m.joinDate.slice(0, 7));
      }
    });

    // Sort descending
    return Array.from(months)
      .sort((a, b) => b.localeCompare(a))
      .map((m) => {
        const [year, monthStr] = m.split("-");
        const dateObj = new Date(Number(year), Number(monthStr) - 1, 1);
        const label = dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        return { value: m, label };
      });
  }, [members]);

  return (
    <motion.section
      className="studio-card grid min-w-0 gap-3 overflow-hidden rounded-[var(--radius-card)] p-3 lg:grid-cols-[minmax(260px,1fr)_auto] lg:gap-4 lg:p-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
    >
      <div className="relative flex min-w-0 items-center">
        <label className="relative block w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted lg:left-4" size={18} />
          <input
            aria-label="Search members"
            value={filters.query}
            onChange={(event) => onChange("query", event.target.value)}
            className="studio-input w-full rounded-[var(--radius-card)] py-2.5 pl-10 pr-28 text-[15px] font-semibold lg:py-3 lg:pl-12 lg:pr-32"
            placeholder="Search name, phone, or reg no"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-full bg-brand-primary-light px-2.5 py-1 text-[11px] font-bold text-brand-primary lg:right-3 lg:px-3 lg:text-[12px] shadow-sm">
            <SlidersHorizontal size={12} />
            <span>{resultCount} found</span>
          </div>
        </label>
      </div>

      <div className="scrollbar-hide flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-1">
        {(["All", "Active", "Expired"] as const).map((status) => (
          <button
            key={status}
            type="button"
            aria-label={`${status} members filter. ${statusHelp[status]}`}
            title={statusHelp[status]}
            className={cn(
              "focus-ring min-h-10 shrink-0 rounded-[var(--radius-card)] border px-3 text-[14px] font-bold transition-colors lg:min-h-12 lg:text-[15px]",
              filters.status === status
                ? "border-brand-primary bg-gradient-to-r from-brand-primary to-[#F0447D] text-brand-white shadow-[0_8px_20px_rgba(232,23,93,0.20)]"
                : "border-border-default bg-brand-white text-text-secondary hover:border-brand-primary/40 hover:text-brand-primary",
            )}
            onClick={() => onChange("status", status)}
          >
            {status}
          </button>
        ))}

        <button
          type="button"
          aria-pressed={filters.payment === "Pending"}
          title="Show members whose full fee is pending"
          onClick={() => onChange("payment", filters.payment === "Pending" ? "All Payments" : "Pending")}
          className={cn(
            "focus-ring flex min-h-10 shrink-0 items-center gap-1.5 rounded-[var(--radius-card)] border px-3 text-[14px] font-bold transition-colors lg:min-h-12 lg:text-[15px]",
            filters.payment === "Pending"
              ? "border-status-due bg-amber-50 text-status-due shadow-[0_4px_12px_rgba(217,119,6,0.12)]"
              : "border-border-default bg-brand-white text-text-secondary hover:border-brand-primary/40 hover:text-brand-primary",
          )}
        >
          <IndianRupee size={15} />
          Pending
          <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[11px] font-black">{quickCounts.pending}</span>
        </button>

        <button
          type="button"
          aria-pressed={filters.payment === "Partially Paid"}
          title="Show members who paid partly and still have balance"
          onClick={() => onChange("payment", filters.payment === "Partially Paid" ? "All Payments" : "Partially Paid")}
          className={cn(
            "focus-ring flex min-h-10 shrink-0 items-center gap-1.5 rounded-[var(--radius-card)] border px-3 text-[14px] font-bold transition-colors lg:min-h-12 lg:text-[15px]",
            filters.payment === "Partially Paid"
              ? "border-brand-primary bg-brand-primary-light text-brand-primary shadow-[0_4px_12px_rgba(232,23,93,0.12)]"
              : "border-border-default bg-brand-white text-text-secondary hover:border-brand-primary/40 hover:text-brand-primary",
          )}
        >
          <IndianRupee size={15} />
          Partial
          <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[11px] font-black">{quickCounts.partial}</span>
        </button>

        <button
          type="button"
          aria-pressed={filters.dueSoon}
          title="Show active members whose plan renewal date is coming soon"
          onClick={() => onChange("dueSoon", !filters.dueSoon)}
          className={cn(
            "focus-ring flex min-h-10 shrink-0 items-center gap-1.5 rounded-[var(--radius-card)] border px-3 text-[14px] font-bold transition-colors lg:min-h-12 lg:text-[15px]",
            filters.dueSoon ? "border-sky-300 bg-sky-50 text-sky-700 shadow-[0_4px_12px_rgba(2,132,199,0.12)]" : "border-border-default bg-brand-white text-text-secondary hover:border-brand-primary/40 hover:text-brand-primary",
          )}
        >
          <CalendarClock size={15} />
          Due Soon
          <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[11px] font-black">{quickCounts.dueSoon}</span>
        </button>

        <select
          aria-label="Goal filter"
          value={filters.goal}
          onChange={(event) => onChange("goal", event.target.value as MemberFilters["goal"])}
          className={selectClassName}
        >
          <option>All Goals</option>
          {goalOptions.map((goal) => (
            <option key={goal}>{goal}</option>
          ))}
        </select>

        <select
          aria-label="Payment filter"
          value={filters.payment}
          onChange={(event) => onChange("payment", event.target.value as MemberFilters["payment"])}
          className={selectClassName}
        >
          <option>All Payments</option>
          {paymentOptions.map((payment) => (
            <option key={payment}>{payment}</option>
          ))}
        </select>

        <select
          aria-label="Month filter"
          value={filters.month}
          onChange={(event) => onChange("month", event.target.value)}
          className={selectClassName}
        >
          <option value="All">All Months</option>
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            title="Clear all search and filter choices"
            onClick={clearFilters}
            className="focus-ring flex min-h-10 shrink-0 items-center gap-1.5 rounded-[var(--radius-card)] border border-slate-200 bg-slate-50 px-3 text-[14px] font-bold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 lg:min-h-12 lg:text-[15px]"
          >
            <X size={15} />
            Clear
          </button>
        )}
      </div>
    </motion.section>
  );
}
