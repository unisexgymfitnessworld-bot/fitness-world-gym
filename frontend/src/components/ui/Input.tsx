import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/utils";

interface InputProps extends ComponentPropsWithoutRef<"input"> {
  label: string;
  error?: string;
  labelClassName?: string;
}

export function Input({ label, id, className, error, labelClassName, ...props }: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <label className={cn("grid gap-2 text-[15px] font-semibold text-text-primary", labelClassName)} htmlFor={inputId}>
      {label}
      <input
        id={inputId}
        className={cn(
          "focus-ring w-full rounded-card border border-transparent bg-surface-overlay px-4 py-3 text-[15px] font-normal text-text-primary placeholder:text-text-muted",
          error && "border-status-expired bg-red-50",
          className,
        )}
        {...props}
      />
      {error ? <span className="text-[13px] font-medium text-status-expired">{error}</span> : null}
    </label>
  );
}
