import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "success";
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setBusy(false);
    }
  }, [open]);

  async function handleConfirm(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await onConfirm();
    } catch {
      setBusy(false);
    }
  }

  const isSuccess = variant === "success";

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${isSuccess ? "bg-emerald-50 text-status-active" : "bg-red-50 text-status-expired"}`}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-[15px] font-semibold leading-relaxed text-text-secondary">{message}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelText}
          </Button>
          <Button
            className={isSuccess ? "!bg-status-active !text-brand-white hover:!bg-emerald-700" : "!bg-status-expired !text-brand-white hover:!bg-red-700"}
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? "Working..." : confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
