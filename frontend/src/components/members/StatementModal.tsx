import { useEffect, useState } from "react";
import { Mail, MessageCircle, Send, Sparkles } from "lucide-react";
import type { BillChannel, StatementResult } from "../../types";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

interface StatementModalProps {
  open: boolean;
  memberName: string;
  memberEmail?: string;
  onClose: () => void;
  onPreview: () => Promise<{ sms: string | null; email: string | null }>;
  onSend: (channel: BillChannel) => Promise<StatementResult>;
}

const channels: Array<{ id: BillChannel; label: string; hint: string }> = [
  { id: "auto", label: "Auto", hint: "Best way first" },
  { id: "sms", label: "SMS", hint: "To their phone" },
  { id: "email", label: "Email", hint: "Needs email saved" },
];

export function StatementModal({ open, memberName, memberEmail, onClose, onPreview, onSend }: StatementModalProps) {
  const [channel, setChannel] = useState<BillChannel>("auto");
  const [preview, setPreview] = useState<{ sms: string | null; email: string | null } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setChannel("auto");
    setPreview(null);
    setError(null);
    setResult(null);
    setLoadingPreview(true);
    onPreview()
      .then(setPreview)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load preview"))
      .finally(() => setLoadingPreview(false));
  }, [open, onPreview]);

  async function handleSend(): Promise<void> {
    if (sending) return;
    setError(null);
    setResult(null);
    if (channel === "email" && !memberEmail) {
      setError("This member has no email saved. Add one on their page first, or use SMS.");
      return;
    }
    setSending(true);
    try {
      const sent = await onSend(channel);
      if (sent.duplicate) {
        setResult("Already sent a moment ago — not sent twice.");
      } else if (sent.status === "sent" || sent.status === "delivered") {
        const via = sent.channel === "email" ? "email" : sent.channel === "whatsapp" ? "WhatsApp" : "SMS";
        setResult(`Bill sent by ${via}.`);
      } else if (sent.status === "queued") {
        setResult("Saved to send — it goes out automatically when the service is back.");
      } else {
        setError(sent.error || "Could not send the bill.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the bill.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} title={`Send Bill To ${memberName}`} onClose={onClose} disableBackdropClose>
      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-2">
          {channels.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setChannel(entry.id)}
              aria-pressed={channel === entry.id}
              className={`focus-ring grid gap-0.5 rounded-[var(--radius-card)] border px-3 py-2.5 text-center transition ${
                channel === entry.id
                  ? "border-brand-primary bg-brand-primary-light/50 text-brand-primary shadow-sm"
                  : "border-border-default bg-brand-white text-text-secondary hover:border-brand-primary/40"
              }`}
            >
              <span className="flex items-center justify-center gap-1.5 text-[14px] font-black">
                {entry.id === "auto" ? <Sparkles size={15} /> : entry.id === "email" ? <Mail size={15} /> : <MessageCircle size={15} />}
                {entry.label}
              </span>
              <span className="text-[11px] font-bold">{entry.hint}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-2">
          <p className="text-[12px] font-bold uppercase tracking-wider text-text-muted">They will get</p>
          {loadingPreview ? (
            <p className="rounded-[var(--radius-card)] bg-surface-raised px-3 py-3 text-[13px] font-semibold text-text-secondary">Loading preview…</p>
          ) : (
            <>
              {(channel === "auto" || channel === "sms") && preview?.sms ? (
                <p className="rounded-[var(--radius-card)] border border-border-default bg-surface-raised px-3 py-2.5 text-[13px] font-semibold leading-5 text-text-primary">
                  <span className="font-black text-brand-primary">SMS: </span>{preview.sms}
                </p>
              ) : null}
              {(channel === "auto" || channel === "email") && (
                preview?.email ? (
                  <p className="whitespace-pre-line rounded-[var(--radius-card)] border border-border-default bg-surface-raised px-3 py-2.5 text-[13px] font-semibold leading-5 text-text-primary">
                    <span className="font-black text-brand-primary">Email: </span>{preview.email}
                  </p>
                ) : (
                  <p className="rounded-[var(--radius-card)] border border-dashed border-border-default px-3 py-2.5 text-[12px] font-bold text-text-muted">
                    No email saved for this member — SMS only.
                  </p>
                )
              )}
            </>
          )}
        </div>

        {error ? <p className="text-[13px] font-semibold text-status-expired">{error}</p> : null}
        {result ? <p className="rounded-[var(--radius-card)] border border-green-200 bg-green-50 px-3 py-2.5 text-[13px] font-bold text-green-800">{result}</p> : null}

        <div className="flex justify-end gap-3 border-t border-border-default pt-4">
          <Button variant="secondary" type="button" onClick={onClose} disabled={sending}>
            Close
          </Button>
          <Button type="button" onClick={() => void handleSend()} disabled={sending || loadingPreview}>
            <Send size={16} />
            {sending ? "Sending..." : result ? "Send Again" : "Send Bill"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
