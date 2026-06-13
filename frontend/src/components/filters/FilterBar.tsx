import { CalendarClock, IndianRupee, Search, SlidersHorizontal, X, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";
import { cn, daysUntil, getMemberActionDueDate } from "../../lib/utils";
import { goalOptions, type MemberFilters, paymentOptions, type Member, trainingTypeOptions, planOptions } from "../../types";

interface FilterBarProps {
  filters: MemberFilters;
  resultCount: number;
  onChange: <K extends keyof MemberFilters>(key: K, value: MemberFilters[K]) => void;
  members: Member[];
}

export function FilterBar({ filters, resultCount, onChange, members }: FilterBarProps) {
  const selectClassName = "studio-select min-h-10 w-full px-3 text-[14px] font-semibold lg:min-h-11 lg:text-[15px] bg-brand-white";

  const statusHelp: Record<"All" | "Active" | "Expired" | "Suspended" | "Deleted", string> = useMemo(
    () => ({
      All: `Show all ${members.filter((member) => member.status !== "Deleted").length} members in this trainer workspace`,
      Active: `Show ${members.filter((member) => member.status === "Active").length} active members`,
      Expired: `Show ${members.filter((member) => member.status === "Expired").length} expired members`,
      Suspended: `Show ${members.filter((member) => member.status === "Suspended").length} suspended members`,
      Deleted: `Show ${members.filter((member) => member.status === "Deleted").length} deleted members`,
    }),
    [members],
  );

  const quickCounts = useMemo(() => {
    const pending = members.filter((member) => member.status !== "Deleted" && member.paymentStatus === "Pending").length;
    const partial = members.filter((member) => member.status !== "Deleted" && member.paymentStatus === "Partially Paid").length;
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
    filters.dueSoon ||
    (filters.trainingType && filters.trainingType !== "All Training") ||
    (filters.planType && filters.planType !== "All Plans");

  const hasAdvancedFiltersActive =
    filters.goal !== "All Goals" ||
    filters.payment !== "All Payments" ||
    filters.month !== "All" ||
    (filters.trainingType && filters.trainingType !== "All Training") ||
    (filters.planType && filters.planType !== "All Plans");

  // Keep advanced filters panel open if any advanced filter is currently active
  const [isOpen, setIsOpen] = useState(hasAdvancedFiltersActive);

  function clearFilters(): void {
    onChange("query", "");
    onChange("status", "All");
    onChange("goal", "All Goals");
    onChange("payment", "All Payments");
    onChange("month", "All");
    onChange("dueSoon", false);
    onChange("trainingType", "All Training");
    onChange("planType", "All Plans");
  }

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    const currentMonth = new Date().toISOString().slice(0, 7);
    months.add(currentMonth);

    members.forEach((m) => {
      if (m.membershipStart) {
        months.add(m.membershipStart.slice(0, 7));
      }
      if (m.joinDate) {
        months.add(m.joinDate.slice(0, 7));
      }
    });

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
      className="studio-card flex flex-col gap-3.5 overflow-hidden rounded-[var(--radius-card)] p-3 lg:gap-4 lg:p-5"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
    >
      {/* Top Search & Controls Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted lg:left-4" size={18} />
          <input
            aria-label="Search members"
            value={filters.query}
            onChange={(event) => onChange("query", event.target.value)}
            className="studio-input w-full rounded-[var(--radius-card)] py-2 pl-10 pr-28 text-[14px] font-semibold lg:py-2.5 lg:pl-12 lg:pr-32 lg:text-[15px]"
            placeholder="Search name, phone, or reg no"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full bg-brand-primary-light px-2 py-0.5 text-[11px] font-bold text-brand-primary lg:right-3 lg:px-2.5 lg:py-1">
            <SlidersHorizontal size={10} />
            <span>{resultCount} found</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              "focus-ring flex min-h-10 items-center gap-1.5 rounded-[var(--radius-card)] border px-3 text-[13px] font-bold transition-all sm:min-h-11 lg:text-[14px]",
              isOpen 
                ? "border-brand-primary bg-brand-primary-light text-brand-primary shadow-sm" 
                : "border-border-default bg-brand-white text-text-secondary hover:border-brand-primary/40 hover:text-brand-primary"
            )}
          >
            <SlidersHorizontal size={14} />
            <span>Advanced Filters</span>
            {hasAdvancedFiltersActive && (
              <span className="h-2 w-2 rounded-full bg-brand-primary animate-pulse" />
            )}
            {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              title="Clear all search and filter choices"
              onClick={clearFilters}
              className="focus-ring flex min-h-10 items-center gap-1.5 rounded-[var(--radius-card)] border border-slate-200 bg-slate-100/50 px-3 text-[13px] font-bold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 sm:min-h-11 lg:text-[14px]"
            >
              <X size={14} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Filters Row */}
      <div className="scrollbar-hide flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-0.5 border-t border-border-default/50 pt-3 lg:pt-4">
        <div className="flex bg-surface-overlay p-0.5 rounded-[var(--radius-card)] gap-0.5 shrink-0">
          {(["All", "Active", "Expired", "Suspended", "Deleted"] as const).map((status) => (
            <button
              key={status}
              type="button"
              aria-label={`${status} members filter. ${statusHelp[status]}`}
              title={statusHelp[status]}
              className={cn(
                "focus-ring min-h-9 shrink-0 rounded-[10px] px-3.5 text-[13px] font-bold transition-all",
                filters.status === status
                  ? "bg-brand-primary text-brand-white shadow-[0_2px_8px_rgba(232,23,93,0.15)]"
                  : "text-text-secondary hover:text-text-primary",
              )}
              onClick={() => onChange("status", status)}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="h-5 w-[1px] bg-border-default shrink-0 mx-1" />

        <button
          type="button"
          aria-pressed={filters.payment === "Pending"}
          title="Show members whose full fee is pending"
          onClick={() => onChange("payment", filters.payment === "Pending" ? "All Payments" : "Pending")}
          className={cn(
            "focus-ring flex min-h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-card)] border px-3 text-[13px] font-bold transition-colors",
            filters.payment === "Pending"
              ? "border-status-due bg-amber-50 text-status-due shadow-sm"
              : "border-border-default bg-brand-white text-text-secondary hover:border-brand-primary/40 hover:text-brand-primary",
          )}
        >
          <IndianRupee size={13} />
          Pending Fee
          <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[10px] font-black">{quickCounts.pending}</span>
        </button>

        <button
          type="button"
          aria-pressed={filters.payment === "Partially Paid"}
          title="Show members who paid partly and still have balance"
          onClick={() => onChange("payment", filters.payment === "Partially Paid" ? "All Payments" : "Partially Paid")}
          className={cn(
            "focus-ring flex min-h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-card)] border px-3 text-[13px] font-bold transition-colors",
            filters.payment === "Partially Paid"
              ? "border-brand-primary bg-brand-primary-light text-brand-primary shadow-sm"
              : "border-border-default bg-brand-white text-text-secondary hover:border-brand-primary/40 hover:text-brand-primary",
          )}
        >
          <IndianRupee size={13} />
          Partial Fee
          <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[10px] font-black">{quickCounts.partial}</span>
        </button>

        <button
          type="button"
          aria-pressed={filters.dueSoon}
          title="Show active members whose plan renewal date is coming soon"
          onClick={() => onChange("dueSoon", !filters.dueSoon)}
          className={cn(
            "focus-ring flex min-h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-card)] border px-3 text-[13px] font-bold transition-colors",
            filters.dueSoon 
              ? "border-sky-300 bg-sky-50 text-sky-700 shadow-sm" 
              : "border-border-default bg-brand-white text-text-secondary hover:border-brand-primary/40 hover:text-brand-primary",
          )}
        >
          <CalendarClock size={13} />
          Due Soon
          <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[10px] font-black">{quickCounts.dueSoon}</span>
        </button>
      </div>

      {/* Advanced Filters Collapsible Section */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="grid gap-3 border-t border-border-default/50 pt-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 lg:gap-4 lg:pt-4">
              {/* Training Type Select */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Training Type</span>
                <select
                  aria-label="Training filter"
                  value={filters.trainingType || "All Training"}
                  onChange={(event) => onChange("trainingType", event.target.value as MemberFilters["trainingType"])}
                  className={selectClassName}
                >
                  <option value="All Training">All Training</option>
                  {trainingTypeOptions.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Plan Type Select */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Membership Plan</span>
                <select
                  aria-label="Plan filter"
                  value={filters.planType || "All Plans"}
                  onChange={(event) => onChange("planType", event.target.value as MemberFilters["planType"])}
                  className={selectClassName}
                >
                  <option value="All Plans">All Plans</option>
                  {planOptions.map((plan) => (
                    <option key={plan} value={plan}>{plan}</option>
                  ))}
                </select>
              </div>

              {/* Goal Select */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Fitness Goal</span>
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
              </div>

              {/* Payment Select */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Payment Status</span>
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
              </div>

              {/* Month Select */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Joining Month</span>
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
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
