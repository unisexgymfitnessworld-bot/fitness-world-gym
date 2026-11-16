import { useEffect } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ToastMessage } from "../../types";
import { useAppStore } from "../../store/useAppStore";

function ToastCard({ toast }: { toast: ToastMessage }) {
  const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? XCircle : Info;
  const dismissToast = useAppStore((state) => state.dismissToast);

  useEffect(() => {
    // Errors persist until dismissed; everything else auto-expires.
    if (toast.tone === "error") return;
    const timer = setTimeout(() => dismissToast(toast.id), 3000);
    return () => clearTimeout(timer);
  }, [toast, dismissToast]);

  return (
    <motion.div
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex max-w-sm flex-col overflow-hidden rounded-[var(--radius-card)] border border-border-default bg-surface-base shadow-[0_20px_50px_rgba(26,26,46,0.14)]"
      initial={{ x: 120, opacity: 0, scale: 0.9 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: 120, opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 340, damping: 22 }}
    >
      <div className="flex items-start gap-3 p-4">
        <Icon className={toast.tone === "success" ? "text-status-active" : toast.tone === "error" ? "text-status-expired" : "text-brand-primary"} size={22} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-text-primary">{toast.title}</p>
          <p className="text-[14px] text-text-secondary">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={() => dismissToast(toast.id)}
          aria-label="Dismiss notification"
          className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted transition hover:bg-surface-raised hover:text-text-primary"
        >
          <X size={16} />
        </button>
      </div>
      {toast.tone === "error" ? null : (
        <div className="h-[3px] w-full bg-surface-overlay">
          <div
            className={`animate-progress-shrink h-full ${
              toast.tone === "success" ? "bg-status-active" : "bg-brand-primary"
            }`}
          />
        </div>
      )}
    </motion.div>
  );
}

export function ToastStack() {
  const toasts = useAppStore((state) => state.toasts);
  return (
    <div className="pointer-events-none fixed right-4 top-20 z-50 flex flex-col gap-2 lg:right-6 lg:top-24 print:hidden">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
