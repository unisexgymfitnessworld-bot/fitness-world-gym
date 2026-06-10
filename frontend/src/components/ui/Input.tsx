import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/utils";

interface InputProps extends ComponentPropsWithoutRef<"input"> {
  label: string;
  error?: string;
  labelClassName?: string;
  variant?: "light" | "dark";
}

export function Input({ label, id, className, error, labelClassName, variant = "light", ...props }: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const isReadOnly = Boolean(props.readOnly);
  return (
    <label
      className={cn(
        "grid gap-2 text-[15px] font-semibold",
        variant === "light" ? "text-text-primary" : "text-white/80",
        labelClassName
      )}
      htmlFor={inputId}
    >
      {label}
      <input
        id={inputId}
        className={cn(
          "w-full px-4 py-3 text-[15px] font-normal rounded-[var(--radius-card)] transition-all duration-200 outline-none",
          variant === "light"
            ? "studio-input text-text-primary placeholder:text-text-muted"
            : "border border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-brand-primary focus:bg-white/10 focus:ring-2 focus:ring-brand-primary/20",
          isReadOnly && variant === "light" && "cursor-not-allowed border-slate-200 bg-slate-100 font-bold text-text-secondary shadow-inner hover:border-slate-200 focus:border-slate-200 focus:bg-slate-100 focus:shadow-inner",
          error && (variant === "light" ? "border-status-expired bg-red-50" : "border-status-expired bg-red-950/20"),
          className,
        )}
        {...props}
      />
      {error ? <span className="text-[13px] font-medium text-status-expired">{error}</span> : null}
    </label>
  );
}
