import { CheckCircle2, MessageCircle, Send } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { formatPhone } from "../../lib/utils";
import { createMessageForTemplate, getDefaultMessageTemplate, messageTemplateOptions, type MessageTemplateId } from "../../lib/messageTemplates";
import { smsSchema } from "../../lib/validations";
import type { Member } from "../../types";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

interface SmsModalProps {
  member: Member | null;
  open: boolean;
  initialTemplate?: MessageTemplateId;
  onClose: () => void;
  onSend: (memberId: string, message: string) => Promise<void> | void;
}

export function SmsModal({ member, open, initialTemplate, onClose, onSend }: SmsModalProps) {
  const [templateId, setTemplateId] = useState<MessageTemplateId>("renewal-due");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const memberId = member?.id ?? null;
  const whatsAppHref = member ? `https://wa.me/91${member.phone}?text=${encodeURIComponent(message)}` : "#";

  useEffect(() => {
    if (!member) {
      setMessage("");
      return;
    }
    const nextTemplate = initialTemplate ?? getDefaultMessageTemplate(member);
    setTemplateId(nextTemplate);
    setMessage(createMessageForTemplate(member, nextTemplate));
    setError(null);
    setSent(false);
    setSending(false);
  }, [initialTemplate, member, memberId, open]);

  function chooseTemplate(nextTemplate: MessageTemplateId): void {
    setTemplateId(nextTemplate);
    if (member) {
      setMessage(createMessageForTemplate(member, nextTemplate));
    }
    setError(null);
    setSent(false);
  }

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
    <Modal open={open && member !== null} title="Message Member" onClose={onClose}>
      {member ? (
        <div className="grid gap-5">
          <div className="rounded-card bg-surface-raised p-4">
            <p className="text-[17px] font-bold text-text-primary">{member.name}</p>
            <p className="font-mono text-[13px] text-text-secondary">{formatPhone(member.phone)}</p>
          </div>

          <label className="grid gap-2 text-[15px] font-semibold text-text-primary">
            Template
            <select
              className="studio-input px-4 py-3 text-[15px] font-semibold text-text-primary"
              value={templateId}
              onChange={(event) => chooseTemplate(event.target.value as MessageTemplateId)}
            >
              {messageTemplateOptions.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label}
                </option>
              ))}
            </select>
            <span className="text-[12px] font-semibold leading-5 text-text-muted">
              {messageTemplateOptions.find((template) => template.id === templateId)?.description}
            </span>
          </label>

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

          <div className="grid gap-2 sm:grid-cols-2">
            <a
              className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-card)] border border-green-200 bg-green-50 px-4 py-2.5 text-[15px] font-semibold text-status-active transition-all hover:border-green-300 hover:bg-green-100"
              href={whatsAppHref}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={20} />
              Open WhatsApp
            </a>
            <Button onClick={() => void submit()} disabled={sent || sending}>
              <Send size={20} />
              {sending ? "Sending SMS" : "Send SMS"}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
