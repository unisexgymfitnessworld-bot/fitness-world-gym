import { CheckCircle2, Clock3, Send } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { formatPhone } from "../../lib/utils";
import { createMessageForTemplate, getDefaultMessageTemplate, messageTemplateOptions, type MessageTemplateId } from "../../lib/messageTemplates";
import { smsSchema } from "../../lib/validations";
import type { Member, NotifyChannelChoice, SmsSendResult } from "../../types";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

const reminderTemplates: MessageTemplateId[] = ["renewal-due", "expired-plan"];

// Email is bills-only (receipts/statements): reminders go by SMS/WhatsApp.
const channelOptions: { value: NotifyChannelChoice; label: string }[] = [
  { value: "auto", label: "Auto (best channel first)" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
];

interface SmsModalProps {
  member: Member | null;
  open: boolean;
  initialTemplate?: MessageTemplateId;
  onClose: () => void;
  onSend: (memberId: string, message: string, markReminder: boolean, channel: NotifyChannelChoice) => Promise<SmsSendResult | void> | SmsSendResult | void;
}

export function SmsModal({ member, open, initialTemplate, onClose, onSend }: SmsModalProps) {
  const [templateId, setTemplateId] = useState<MessageTemplateId>("renewal-due");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<NotifyChannelChoice>("auto");
  const [sentVia, setSentVia] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [queued, setQueued] = useState(false);
  const [sending, setSending] = useState(false);

  const resetKey = `${open ? "open" : "closed"}-${member?.id ?? "none"}-${initialTemplate ?? "default"}`;
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
    setQueued(false);
    setSending(false);
    setChannel("auto");
    setSentVia(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function chooseTemplate(nextTemplate: MessageTemplateId): void {
    setTemplateId(nextTemplate);
    if (member) {
      setMessage(createMessageForTemplate(member, nextTemplate));
    }
    setError(null);
    setSent(false);
    setQueued(false);
  }

  async function submit(): Promise<void> {
    if (!member) {
      return;
    }
    const parsed = smsSchema.safeParse({ message });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the message");
      return;
    }
    if (channel === "email") {
      setError("Email is only used for bills. Reminders go by SMS or WhatsApp.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await onSend(member.id, parsed.data.message, reminderTemplates.includes(templateId), channel);
      const via = result && typeof result === "object" && result.channel
        ? result.channel === "whatsapp" ? "WhatsApp" : result.channel === "email" ? "email" : "SMS"
        : null;
      setSentVia(via);
      if (result && typeof result === "object" && result.status === "queued") {
        setQueued(true);
      } else {
        setSent(true);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to send message";
      setError(message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open && member !== null} title="Message Member" onClose={onClose}>
      {member ? (
        <div className="grid gap-5">
          <div className="rounded-[var(--radius-card)] bg-surface-raised p-4">
            <p className="text-[17px] font-bold text-text-primary">{member.name}</p>
            <p className="font-mono text-[13px] text-text-secondary">{formatPhone(member.phone)}</p>
          </div>

          <label className="grid gap-2 text-[15px] font-semibold text-text-primary">
            Channel
            <select
              className="studio-input px-4 py-3 text-[15px] font-semibold text-text-primary"
              value={channel}
              onChange={(event) => setChannel(event.target.value as NotifyChannelChoice)}
            >
              {channelOptions.map((option) => (
                <option key={option.value} value={option.value} disabled={option.value === "email" && !member.email}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="text-[12px] font-semibold leading-5 text-text-muted">
              Auto tries WhatsApp first, then SMS.
            </span>
          </label>

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
            <motion.div className="flex items-center gap-3 rounded-[var(--radius-card)] bg-green-50 p-4 text-status-active" initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} transition={{ duration: 0.3 }}>
              <CheckCircle2 size={22} />
              <span className="text-[15px] font-bold">{sentVia ?? "Message"} sent{sentVia === "SMS" ? ` to ${formatPhone(member.phone)}` : ""}</span>
            </motion.div>
          ) : null}

          {queued ? (
            <motion.div className="flex items-center gap-3 rounded-[var(--radius-card)] bg-amber-50 p-4 text-amber-700" initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} transition={{ duration: 0.3 }}>
              <Clock3 size={22} />
              <span className="text-[15px] font-bold">{sentVia ?? "Message"} queued — it will send automatically when the service is back.</span>
            </motion.div>
          ) : null}

          <Button onClick={() => void submit()} disabled={sent || queued || sending} className="w-full text-[15px] font-bold">
            <Send size={16} />
            {sending ? "Sending..." : channel === "auto" ? "Send" : `Send via ${channel === "whatsapp" ? "WhatsApp" : channel === "email" ? "Email" : "SMS"}`}
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}
