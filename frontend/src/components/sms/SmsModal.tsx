import { CheckCircle2, Send } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { createReminderMessage, formatPhone } from "../../lib/utils";
import { smsSchema } from "../../lib/validations";
import type { Member } from "../../types";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

interface SmsModalProps {
  member: Member | null;
  open: boolean;
  onClose: () => void;
  onSend: (memberId: string, message: string) => Promise<void> | void;
}

export function SmsModal({ member, open, onClose, onSend }: SmsModalProps) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const memberId = member?.id ?? null;

  useEffect(() => {
    setMessage(member ? createReminderMessage(member) : "");
    setError(null);
    setSent(false);
    setSending(false);
  }, [memberId, open]);

  async function submit(): Promise<void> {
    if (!member) {
      return;
    }
    const parsed = smsSchema.safeParse({ message });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the SMS message");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSend(member.id, parsed.data.message);
      setSent(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to send SMS";
      setError(message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open && member !== null} title="Send SMS" onClose={onClose}>
      {member ? (
        <div className="grid gap-5">
          <div className="rounded-card bg-surface-raised p-4">
            <p className="text-[17px] font-bold text-text-primary">{member.name}</p>
            <p className="font-mono text-[13px] text-text-secondary">{formatPhone(member.phone)}</p>
          </div>

          <label className="grid gap-2 text-[15px] font-semibold text-text-primary">
            Message
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="studio-input min-h-36 px-4 py-3 text-[15px] font-normal text-text-primary placeholder:text-text-muted"
            />
            {error ? <span className="text-[13px] font-semibold text-status-expired">{error}</span> : null}
          </label>

          {sent ? (
            <motion.div className="flex items-center gap-3 rounded-card bg-green-50 p-4 text-status-active" initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} transition={{ duration: 0.3 }}>
              <CheckCircle2 size={22} />
              <span className="text-[15px] font-bold">SMS Sent</span>
            </motion.div>
          ) : null}

          <Button onClick={() => void submit()} disabled={sent || sending}>
            <Send size={20} />
            {sending ? "Sending SMS" : "Send SMS"}
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}
