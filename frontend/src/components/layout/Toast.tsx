import { CheckCircle2, Info, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ToastMessage } from "../../types";

interface ToastProps {
  toast: ToastMessage | null;
}

export function Toast({ toast }: ToastProps) {
  const Icon = toast?.tone === "success" ? CheckCircle2 : toast?.tone === "error" ? XCircle : Info;

  return (
    <AnimatePresence>
      {toast ? (
        <motion.div
          className="pointer-events-none fixed right-4 top-20 z-50 flex max-w-sm flex-col overflow-hidden rounded-[var(--radius-card)] border border-border-default bg-surface-base shadow-[0_20px_50px_rgba(26,26,46,0.14)] lg:right-6 lg:top-24"
          initial={{ x: 120, opacity: 0, scale: 0.9 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={{ x: 120, opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 340, damping: 22 }}
        >
          <div className="flex items-start gap-3 p-4">
            <Icon className={toast.tone === "success" ? "text-status-active" : toast.tone === "error" ? "text-status-expired" : "text-brand-primary"} size={22} />
            <div>
              <p className="text-[15px] font-bold text-text-primary">{toast.title}</p>
              <p className="text-[14px] text-text-secondary">{toast.message}</p>
            </div>
          </div>
          <div className="h-[3px] w-full bg-surface-overlay">
            <div
              className={`animate-progress-shrink h-full ${
                toast.tone === "success" ? "bg-status-active" : toast.tone === "error" ? "bg-status-expired" : "bg-brand-primary"
              }`}
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
