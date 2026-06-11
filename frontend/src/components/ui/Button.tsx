import { motion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "icon";

interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: "relative overflow-hidden bg-gradient-to-r from-brand-primary to-[#F0447D] text-brand-white hover:from-brand-primary-hover hover:to-brand-primary shadow-[0_10px_28px_rgba(232,23,93,0.28)] active:shadow-[0_4px_12px_rgba(232,23,93,0.20)]",
  secondary: "relative overflow-hidden border border-border-default bg-surface-base text-text-primary hover:border-brand-primary hover:text-brand-primary hover:bg-brand-primary-light/30 hover:shadow-[0_4px_12px_rgba(232,23,93,0.08)] active:bg-brand-primary-light/50",
  ghost: "relative overflow-hidden text-text-secondary hover:bg-surface-overlay hover:text-text-primary active:bg-surface-overlay/80",
  danger: "relative overflow-hidden bg-status-expired text-brand-white hover:bg-red-700 shadow-[0_8px_20px_rgba(220,38,38,0.2)] active:shadow-[0_2px_8px_rgba(220,38,38,0.15)]",
  icon: "relative overflow-hidden border border-border-default bg-surface-base text-text-secondary hover:border-brand-primary hover:text-brand-primary hover:shadow-[0_4px_12px_rgba(232,23,93,0.08)] active:bg-brand-primary-light/30",
};

export function Button({ className, variant = "primary", children, type = "button", ...props }: ButtonProps) {
  return (
    <motion.button
      type={type}
      className={cn(
        "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-card)] px-4 py-2.5 text-[15px] font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60 select-none",
        variant === "icon" && "h-11 w-11 px-0 lg:h-12 lg:w-12",
        variants[variant],
        className,
      )}
      whileHover={{ scale: 1.04, y: -1.5 }}
      whileTap={{ scale: 0.94, y: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 20 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
