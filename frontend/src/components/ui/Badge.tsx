import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

type BadgeTone = "primary" | "active" | "expired" | "due" | "pending" | "neutral" | "paid";

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

const tones: Record<BadgeTone, string> = {
  primary: "bg-brand-primary-light text-brand-primary border-brand-primary/20",
  active: "bg-green-50 text-status-active border-green-200",
  expired: "bg-red-50 text-status-expired border-red-200",
  due: "bg-amber-50 text-status-due border-amber-200",
  pending: "bg-purple-50 text-status-pending border-purple-200",
  neutral: "bg-surface-overlay text-text-secondary border-border-default",
  paid: "bg-green-50 text-status-active border-green-200",
};

const dotColors: Record<BadgeTone, string> = {
  primary: "bg-brand-primary",
  active: "bg-status-active",
  expired: "bg-status-expired",
  due: "bg-status-due",
  pending: "bg-status-pending",
  neutral: "bg-text-muted",
  paid: "bg-status-active",
};

export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold uppercase tracking-wide", tones[tone], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dotColors[tone])} />
      {children}
    </span>
  );
}
