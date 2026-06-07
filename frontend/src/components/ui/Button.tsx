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
  primary: "bg-gradient-to-r from-brand-primary to-[#F0447D] text-brand-white hover:from-brand-primary-hover hover:to-brand-primary shadow-[0_10px_28px_rgba(232,23,93,0.28)]",
  secondary: "border border-border-default bg-surface-base text-text-primary hover:border-brand-primary hover:text-brand-primary hover:shadow-[0_4px_12px_rgba(232,23,93,0.08)]",
  ghost: "text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
  danger: "bg-status-expired text-brand-white hover:bg-red-700 shadow-[0_8px_20px_rgba(220,38,38,0.2)]",
  icon: "border border-border-default bg-surface-base text-text-secondary hover:border-brand-primary hover:text-brand-primary hover:shadow-[0_4px_12px_rgba(232,23,93,0.08)]",
};

export function Button({ className, variant = "primary", children, type = "button", ...props }: ButtonProps) {
  return (
    <motion.button
      type={type}
      className={cn(
        "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-card)] px-4 py-2.5 text-[15px] font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        variant === "icon" && "h-11 w-11 px-0 lg:h-12 lg:w-12",
        variants[variant],
        className,
      )}
      whileHover={{ scale: 1.03, y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
