import { AlertTriangle } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const [shake, setShake] = useState(false);

  async function handleConfirm(): Promise<void> {
    setShake(true);
    setTimeout(() => {
      setShake(false);
      void onConfirm();
    }, 400);
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-red-50 text-status-expired">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-[15px] font-semibold leading-relaxed text-text-secondary">{message}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            {cancelText}
          </Button>
          <motion.div animate={shake ? { x: [-4, 4, -4, 4, 0] } : {}} transition={{ duration: 0.4 }}>
            <Button className="!bg-status-expired !text-brand-white hover:!bg-red-700" onClick={() => void handleConfirm()}>
              {confirmText}
            </Button>
          </motion.div>
        </div>
      </div>
    </Modal>
  );
}
