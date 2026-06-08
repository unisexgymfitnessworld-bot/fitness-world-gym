import { Search, SlidersHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { goalOptions, type MemberFilters, paymentOptions } from "../../types";

interface FilterBarProps {
  filters: MemberFilters;
  resultCount: number;
  onChange: <K extends keyof MemberFilters>(key: K, value: MemberFilters[K]) => void;
}

export function FilterBar({ filters, resultCount, onChange }: FilterBarProps) {
  const statusHelp: Record<"All" | "Active" | "Expired", string> = {
    All: "Show all members in this trainer workspace",
    Active: "Show members whose membership is currently active",
    Expired: "Show members whose membership due date has passed",
  };

  return (
    <motion.section
      className="studio-card grid gap-3 rounded-[var(--radius-card)] p-3 lg:grid-cols-[minmax(260px,1fr)_auto] lg:gap-4 lg:p-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
    >
      <div className="relative flex items-center">
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

      <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto pb-1">
        {(["All", "Active", "Expired"] as const).map((status) => (
          <motion.button
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
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            {status}
          </motion.button>
        ))}

        <select
          aria-label="Goal filter"
          value={filters.goal}
          onChange={(event) => onChange("goal", event.target.value as MemberFilters["goal"])}
          className="focus-ring min-h-10 shrink-0 rounded-[var(--radius-card)] border border-border-default bg-brand-white px-3 text-[14px] font-semibold text-text-primary lg:min-h-12 lg:text-[15px]"
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
          className="focus-ring min-h-10 shrink-0 rounded-[var(--radius-card)] border border-border-default bg-brand-white px-3 text-[14px] font-semibold text-text-primary lg:min-h-12 lg:text-[15px]"
        >
          <option>All Payments</option>
          {paymentOptions.map((payment) => (
            <option key={payment}>{payment}</option>
          ))}
        </select>

        <motion.button
          type="button"
          aria-pressed={filters.dueSoon}
          title="Show active members whose renewal date is coming soon"
          onClick={() => onChange("dueSoon", !filters.dueSoon)}
          className={cn(
            "focus-ring min-h-10 shrink-0 rounded-[var(--radius-card)] border px-3 text-[14px] font-bold transition-colors lg:min-h-12 lg:text-[15px]",
            filters.dueSoon ? "border-status-due bg-amber-50 text-status-due shadow-[0_4px_12px_rgba(217,119,6,0.12)]" : "border-border-default bg-brand-white text-text-secondary hover:border-brand-primary/40 hover:text-brand-primary",
          )}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          Due Soon
        </motion.button>
      </div>
    </motion.section>
  );
}
