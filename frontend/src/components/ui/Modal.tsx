import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { Button } from "./Button";

interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function Modal({ open, title, children, onClose }: ModalProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-brand-dark/60 px-4 py-8 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.section
            aria-modal="true"
            role="dialog"
            aria-label={title}
            className="w-full max-w-xl overflow-hidden rounded-[var(--radius-panel)] bg-brand-white shadow-[0_32px_80px_rgba(26,26,46,0.18)]"
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          >
            <header className="relative flex items-center justify-between border-b border-border-default px-6 py-4">
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-brand-primary via-[#F0447D] to-transparent" />
              <h2 className="text-[22px] font-bold text-text-primary">{title}</h2>
              <Button aria-label="Close modal" variant="icon" onClick={onClose}>
                <X size={20} />
              </Button>
            </header>
            <div className="p-6">{children}</div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
