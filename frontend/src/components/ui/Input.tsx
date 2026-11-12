import { useState, type ComponentPropsWithoutRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../../lib/utils";

interface InputProps extends ComponentPropsWithoutRef<"input"> {
  label: string;
  error?: string;
  labelClassName?: string;
  variant?: "light" | "dark";
}

export function Input({ label, id, className, error, labelClassName, variant = "light", type, ...props }: InputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const isReadOnly = Boolean(props.readOnly);
  const isPassword = type === "password";
  const inputType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <label
      className={cn(
        "grid gap-2 text-[15px] font-semibold relative",
        variant === "light" ? "text-text-primary" : "text-white/80",
        labelClassName
      )}
      htmlFor={inputId}
    >
      {label}
      <div className="relative w-full">
        <input
          id={inputId}
          type={inputType}
          className={cn(
            "w-full px-4 py-3 text-[15px] font-normal rounded-[var(--radius-card)] transition-all duration-200 outline-none pr-10",
            variant === "light"
              ? "studio-input text-text-primary placeholder:text-text-muted"
              : "border border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-brand-primary focus:bg-white/10 focus:ring-2 focus:ring-brand-primary/20",
            isReadOnly && variant === "light" && "cursor-not-allowed border-slate-200 bg-slate-100 font-bold text-text-secondary shadow-inner hover:border-slate-200 focus:border-slate-200 focus:bg-slate-100 focus:shadow-inner",
            error && (variant === "light" ? "border-status-expired bg-red-50" : "border-status-expired bg-red-950/20"),
            className,
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center p-1 rounded-full text-text-muted hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none",
              variant === "light" ? "text-text-muted hover:text-text-primary" : "text-white/60 hover:text-white"
            )}
            onClick={(e) => {
              e.preventDefault();
              setShowPassword(!showPassword);
            }}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {error ? <span className="text-[13px] font-medium text-status-expired">{error}</span> : null}
    </label>
  );
}

