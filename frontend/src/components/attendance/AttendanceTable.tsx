import { useState } from "react";
import { Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { daysUntil, formatDisplayDate, todayISO } from "../../lib/utils";
import type { AttendanceEntry } from "../../types";
import { Button } from "../ui/Button";
import { ConfirmModal } from "../ui/ConfirmModal";
import { Input } from "../ui/Input";

interface AttendanceTableProps {
  memberId: string;
  attendance: AttendanceEntry[];
  onAddVisit: (memberId: string, visitDate: string, weightKg?: number) => void;
  onDeleteVisit: (attendanceId: string) => void;
}

function formatDaysAgo(daysUntilVisit: number): string {
  if (daysUntilVisit < 0) {
    const days = -daysUntilVisit;
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  if (daysUntilVisit === 0) {
    return "Today";
  }
  return `in ${daysUntilVisit} day${daysUntilVisit === 1 ? "" : "s"}`;
}

export function AttendanceTable({ memberId, attendance, onAddVisit, onDeleteVisit }: AttendanceTableProps) {
  const [visitDate, setVisitDate] = useState(todayISO());
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const visits = attendance.filter((entry) => entry.memberId === memberId);

  function submitVisit(): void {
    if (saving || !visitDate || visitDate > todayISO()) {
      return;
    }
    setSaving(true);
    const parsedWeight = weight ? Number(weight) : undefined;
    onAddVisit(memberId, visitDate, Number.isFinite(parsedWeight) ? parsedWeight : undefined);
    setWeight("");
    window.setTimeout(() => setSaving(false), 1500);
  }

  return (
    <section className="grid gap-3 lg:gap-4">
      <div className="studio-card grid gap-2 rounded-[var(--radius-card)] p-3 md:grid-cols-[1fr_1fr_auto] lg:gap-3 lg:p-4 print:hidden">
        <Input label="Visit Date" className="studio-input" type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} />
        <Input label="Weight kg" className="studio-input" type="number" step="0.01" value={weight} onChange={(event) => setWeight(event.target.value)} />
        <Button className="self-end" onClick={submitVisit} disabled={saving}>
          {saving ? "Adding..." : "Add Visit"}
        </Button>
      </div>

      <motion.div
        className="studio-card overflow-hidden rounded-[var(--radius-card)]"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.2 }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-default bg-brand-white px-3 py-2.5 lg:px-4 lg:py-3">
          <p className="text-[12px] font-black uppercase tracking-wider text-text-muted">Visit History</p>
          <span className="rounded-full bg-surface-raised px-3 py-1 text-[12px] font-black text-text-secondary">
            {visits.length} visit{visits.length === 1 ? "" : "s"}
          </span>
        </div>
        <table className="w-full border-collapse text-left">
          <thead className="bg-surface-overlay">
            <tr>
              <th className="px-3 py-2.5 text-[12px] font-bold uppercase tracking-wider text-text-muted lg:px-4 lg:py-3 lg:text-[13px]">Date</th>
              <th className="px-3 py-2.5 text-[12px] font-bold uppercase tracking-wider text-text-muted lg:px-4 lg:py-3 lg:text-[13px]">Weight</th>
              <th className="px-3 py-2.5 text-[12px] font-bold uppercase tracking-wider text-text-muted lg:px-4 lg:py-3 lg:text-[13px]">Days Ago</th>
              <th className="px-3 py-2.5 text-right text-[12px] font-bold uppercase tracking-wider text-text-muted lg:px-4 lg:py-3 lg:text-[13px] print:hidden">Remove</th>
            </tr>
          </thead>
          <tbody>
            {visits.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-[14px] text-text-secondary lg:px-4 lg:py-5 lg:text-[15px]" colSpan={4}>
                  No attendance history yet.
                </td>
              </tr>
            ) : (
              visits.map((entry) => (
                <tr key={entry.id} className="zebra-row border-t border-border-default">
                  <td className="px-3 py-2.5 text-[14px] font-semibold text-text-primary lg:px-4 lg:py-3 lg:text-[15px]">{formatDisplayDate(entry.visitDate)}</td>
                  <td className="px-3 py-2.5 text-[14px] text-text-secondary lg:px-4 lg:py-3 lg:text-[15px]">{entry.weightKg ? `${entry.weightKg} kg` : "Not recorded"}</td>
                  <td className="px-3 py-2.5 text-[14px] text-text-secondary lg:px-4 lg:py-3 lg:text-[15px]">{formatDaysAgo(daysUntil(entry.visitDate))}</td>
                  <td className="px-3 py-2.5 text-right lg:px-4 lg:py-3 print:hidden">
                    <button
                      type="button"
                      className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-brand-white text-slate-500 transition hover:border-red-300 hover:text-status-expired"
                      onClick={() => setDeletingId(entry.id)}
                      title={`Remove visit on ${formatDisplayDate(entry.visitDate)}`}
                      aria-label={`Remove visit on ${formatDisplayDate(entry.visitDate)}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </motion.div>
      <ConfirmModal
        open={deletingId !== null}
        title="Remove Visit"
        message="Remove this check-in entry? This cannot be undone."
        confirmText="Remove"
        variant="danger"
        onConfirm={() => {
          if (deletingId) {
            onDeleteVisit(deletingId);
            setDeletingId(null);
          }
        }}
        onClose={() => setDeletingId(null)}
      />
    </section>
  );
}
