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
  onSend: (memberId: string, message: string, type: "sms" | "whatsapp") => Promise<void> | void;
}

export function SmsModal({ member, open, initialTemplate, onClose, onSend }: SmsModalProps) {
  const [templateId, setTemplateId] = useState<MessageTemplateId>("renewal-due");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sentType, setSentType] = useState<"sms" | "whatsapp" | null>(null);
  const [sending, setSending] = useState(false);
  const cleanPhone = member ? member.phone.replace(/\D/g, "") : "";
  const whatsAppHref = member ? `https://wa.me/91${cleanPhone.slice(-10)}?text=${encodeURIComponent(message)}` : "#";

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
    setSentType(null);
    setSending(false);
  }, [initialTemplate, member, member?.id, open]);

  function chooseTemplate(nextTemplate: MessageTemplateId): void {
    setTemplateId(nextTemplate);
    if (member) {
      setMessage(createMessageForTemplate(member, nextTemplate));
    }
    setError(null);
    setSent(false);
  }

  async function submit(type: "sms" | "whatsapp"): Promise<void> {
    if (!member) {
      return;
    }
    const parsed = smsSchema.safeParse({ message });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the message");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSend(member.id, parsed.data.message, type);
      setSentType(type);
      setSent(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : `Unable to send ${type}`;
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
              <span className="text-[15px] font-bold">Message sent via {sentType === "whatsapp" ? "WhatsApp Gateway" : "SMS Fast2SMS"}</span>
            </motion.div>
          ) : null}

          <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
            <a
              className="focus-ring inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--radius-card)] border border-green-200 bg-green-50 px-2 text-[13px] font-bold text-status-active transition-all hover:border-green-300 hover:bg-green-100"
              href={whatsAppHref}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={16} />
              Open WA (Manual)
            </a>
            <Button
              variant="secondary"
              className="!border-emerald-200 !bg-emerald-50/50 !text-emerald-700 hover:!bg-emerald-100 px-2 text-[13px] font-bold"
              onClick={() => void submit("whatsapp")}
              disabled={sent || sending}
            >
              <MessageCircle size={16} />
              {sending ? "Sending..." : "Send WA Gateway"}
            </Button>
            <Button onClick={() => void submit("sms")} disabled={sent || sending} className="px-2 text-[13px] font-bold">
              <Send size={16} />
              {sending ? "Sending..." : "Send SMS"}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
