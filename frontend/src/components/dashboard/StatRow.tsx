import { AlertTriangle, CalendarClock, IndianRupee, UsersRound } from "lucide-react";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { useEffect, useRef } from "react";
import type { DashboardStats } from "../../types";

interface StatRowProps {
  stats: DashboardStats;
}

interface StatCardProps {
  label: string;
  value: number;
  tone: "neutral" | "green" | "amber" | "red";
  icon: typeof UsersRound;
  index: number;
}

const toneClasses: Record<StatCardProps["tone"], string> = {
  neutral: "bg-brand-dark text-brand-white",
  green: "bg-green-50 text-status-active",
  amber: "bg-amber-50 text-status-due",
  red: "bg-brand-primary-light text-brand-primary",
};

const toneBorderClasses: Record<StatCardProps["tone"], string> = {
  neutral: "from-brand-dark",
  green: "from-status-active",
  amber: "from-status-due",
  red: "from-brand-primary",
};

function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsubscribe = rounded.on("change", (v) => {
      if (ref.current) {
        ref.current.textContent = String(v);
      }
    });
    return () => {
      controls.stop();
      unsubscribe();
    };
  }, [motionValue, rounded, value]);

  return <span ref={ref}>0</span>;
}

function StatCard({ label, value, tone, icon: Icon, index }: StatCardProps) {
  return (
    <motion.article
      className="studio-card-subtle group relative overflow-hidden rounded-[var(--radius-card)] p-3 sm:p-4 lg:p-5"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3, boxShadow: "0 20px 48px rgba(26,26,46,0.12)" }}
    >
      <div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${toneBorderClasses[tone]} to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
      <div className="flex items-start justify-between gap-3 lg:gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted sm:text-[12px]">{label}</p>
          <p className="mt-1 text-[22px] font-black leading-none text-text-primary sm:mt-2 sm:text-[28px] lg:text-[30px]">
            <AnimatedNumber value={value} />
          </p>
        </div>
        <span className={`grid h-8 w-8 place-items-center rounded-lg shadow-sm transition-transform duration-300 group-hover:scale-110 sm:h-10 sm:w-10 lg:h-12 lg:w-12 ${toneClasses[tone]}`}>
          <Icon size={16} className="sm:hidden" />
          <Icon size={20} className="hidden sm:block" />
        </span>
      </div>
    </motion.article>
  );
}

export function StatRow({ stats }: StatRowProps) {
  return (
    <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4 lg:gap-4">
      <StatCard label="Total Members" value={stats.total} tone="neutral" icon={UsersRound} index={0} />
      <StatCard label="Active" value={stats.active} tone="green" icon={UsersRound} index={1} />
      <StatCard label="Due This Week" value={stats.dueThisWeek} tone={stats.dueThisWeek > 0 ? "amber" : "neutral"} icon={CalendarClock} index={2} />
      <StatCard label="Pending Payments" value={stats.pendingPayments} tone={stats.pendingPayments > 0 ? "red" : "neutral"} icon={stats.pendingPayments > 0 ? AlertTriangle : IndianRupee} index={3} />
    </section>
  );
}
