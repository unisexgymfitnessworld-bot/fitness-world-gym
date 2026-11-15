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
  primary: "bg-brand-primary text-brand-white hover:bg-brand-primary-hover shadow-[0_2px_8px_rgba(26,26,46,0.16)] active:shadow-none",
  secondary: "border border-border-default bg-surface-base text-text-primary hover:border-brand-primary hover:text-brand-primary hover:bg-brand-primary-light/30 active:bg-brand-primary-light/50",
  ghost: "text-text-secondary hover:bg-surface-overlay hover:text-text-primary active:bg-surface-overlay/80",
  danger: "bg-status-expired text-brand-white hover:bg-red-700 shadow-[0_2px_8px_rgba(26,26,46,0.16)] active:shadow-none",
  icon: "border border-border-default bg-surface-base text-text-secondary hover:border-brand-primary hover:text-brand-primary active:bg-brand-primary-light/30",
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
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 25 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
