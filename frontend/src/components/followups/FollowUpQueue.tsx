import { AlertTriangle, CalendarClock, Eye, IndianRupee, MessageCircle, UserRoundX } from "lucide-react";
import { motion } from "motion/react";
import { formatDisplayDate, getMemberActionDueDate } from "../../lib/utils";
import type { FollowUpItem, FollowUpKind } from "../../lib/followUps";
import type { MessageTemplateId } from "../../lib/messageTemplates";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

interface FollowUpQueueProps {
  items: FollowUpItem[];
  onView: (memberId: string) => void;
  onMessage: (memberId: string, template: MessageTemplateId) => void;
}

const kindStyles: Record<FollowUpKind, { icon: typeof AlertTriangle; tone: "expired" | "due" | "pending" | "neutral"; className: string }> = {
  expired: {
    icon: AlertTriangle,
    tone: "expired",
    className: "border-red-100 bg-red-50/45",
  },
  partial: {
    icon: IndianRupee,
    tone: "due",
    className: "border-amber-100 bg-amber-50/45",
  },
  payment: {
    icon: IndianRupee,
    tone: "pending",
    className: "border-pink-100 bg-brand-primary-light/35",
  },
  renewal: {
    icon: CalendarClock,
    tone: "due",
    className: "border-sky-100 bg-sky-50/45",
  },
  inactive: {
    icon: UserRoundX,
    tone: "neutral",
    className: "border-slate-100 bg-slate-50/65",
  },
};

export function FollowUpQueue({ items, onView, onMessage }: FollowUpQueueProps) {
  const previewItems = items.slice(0, 6);
  const hiddenCount = Math.max(items.length - previewItems.length, 0);

  return (
    <section className="studio-card grid gap-4 rounded-[var(--radius-panel)] p-3 sm:p-4 lg:grid-cols-[250px_1fr] lg:gap-5 lg:p-5">
      <div className="grid content-start gap-2">
        <div className="flex items-center gap-2 text-brand-primary">
          <AlertTriangle size={16} />
          <p className="text-[11px] font-bold uppercase tracking-wider">Today&apos;s Follow-up Queue</p>
        </div>
        <h2 className="text-[18px] font-black leading-tight text-text-primary sm:text-[20px]">Trainer call list</h2>
        <p className="text-[12px] font-semibold leading-5 text-text-secondary sm:text-[13px]">
          Payments, renewals, expired plans, and inactive members in one daily action list.
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge tone={items.length > 0 ? "due" : "paid"}>{items.length} actions</Badge>
          {hiddenCount > 0 ? <Badge tone="neutral">+{hiddenCount} more</Badge> : null}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {previewItems.length > 0 ? (
          previewItems.map((item, index) => {
            const style = kindStyles[item.kind];
            const Icon = style.icon;
            return (
              <motion.article
                key={item.id}
                className={`grid min-h-[150px] gap-3 rounded-[var(--radius-card)] border p-3 shadow-sm ${style.className}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.04 }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-black text-text-primary">{item.member.name}</p>
                    <p className="font-mono text-[11px] font-bold text-text-muted">{item.member.regNo}</p>
                  </div>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-white/75 text-brand-primary shadow-sm">
                    <Icon size={16} />
                  </span>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={style.tone}>{item.badge}</Badge>
                    <span className="text-[11px] font-black uppercase tracking-wide text-text-muted">
                      {formatDisplayDate(getMemberActionDueDate(item.member))}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] font-black text-text-primary">{item.title}</p>
                  <p className="mt-1 text-[12px] font-semibold leading-5 text-text-secondary">{item.detail}</p>
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <Button variant="secondary" className="!min-h-9 !px-2 !py-1.5 text-[13px]" onClick={() => onView(item.member.id)}>
                    <Eye size={15} />
                    View
                  </Button>
                  <Button className="!min-h-9 !px-2 !py-1.5 text-[13px]" onClick={() => onMessage(item.member.id, item.template)}>
                    <MessageCircle size={15} />
                    Message
                  </Button>
                </div>
              </motion.article>
            );
          })
        ) : (
          <div className="rounded-[var(--radius-card)] border border-dashed border-border-default bg-surface-raised px-4 py-8 text-center sm:col-span-2 xl:col-span-3">
            <p className="text-[15px] font-black text-text-primary">No urgent follow-ups today</p>
            <p className="mt-1 text-[13px] font-semibold text-text-secondary">Payments, renewals, and active member checks are clear.</p>
          </div>
        )}
      </div>
    </section>
  );
}
