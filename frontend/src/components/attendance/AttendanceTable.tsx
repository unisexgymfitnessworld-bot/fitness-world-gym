import { useState } from "react";
import { motion } from "motion/react";
import { daysUntil, formatDisplayDate, todayISO } from "../../lib/utils";
import type { AttendanceEntry } from "../../types";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface AttendanceTableProps {
  memberId: string;
  attendance: AttendanceEntry[];
  onAddVisit: (memberId: string, visitDate: string, weightKg?: number) => void;
}

export function AttendanceTable({ memberId, attendance, onAddVisit }: AttendanceTableProps) {
  const [visitDate, setVisitDate] = useState(todayISO());
  const [weight, setWeight] = useState("");
  const visits = attendance.filter((entry) => entry.memberId === memberId);

  function submitVisit(): void {
    const parsedWeight = weight ? Number(weight) : undefined;
    onAddVisit(memberId, visitDate, Number.isFinite(parsedWeight) ? parsedWeight : undefined);
    setWeight("");
  }

  return (
    <section className="grid gap-3 lg:gap-4">
      <div className="studio-card grid gap-2 rounded-[var(--radius-card)] p-3 md:grid-cols-[1fr_1fr_auto] lg:gap-3 lg:p-4 print:hidden">
        <Input label="Visit Date" className="studio-input" type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} />
        <Input label="Weight kg" className="studio-input" type="number" step="0.01" value={weight} onChange={(event) => setWeight(event.target.value)} />
        <Button className="self-end" onClick={submitVisit}>
          Add Visit
        </Button>
      </div>

      <motion.div
        className="studio-card overflow-hidden rounded-[var(--radius-card)]"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.2 }}
      >
        <table className="w-full border-collapse text-left">
          <thead className="bg-surface-overlay">
            <tr>
              <th className="px-3 py-2.5 text-[12px] font-bold uppercase tracking-wider text-text-muted lg:px-4 lg:py-3 lg:text-[13px]">Date</th>
              <th className="px-3 py-2.5 text-[12px] font-bold uppercase tracking-wider text-text-muted lg:px-4 lg:py-3 lg:text-[13px]">Weight</th>
              <th className="px-3 py-2.5 text-[12px] font-bold uppercase tracking-wider text-text-muted lg:px-4 lg:py-3 lg:text-[13px]">Days Ago</th>
            </tr>
          </thead>
          <tbody>
            {visits.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-[14px] text-text-secondary lg:px-4 lg:py-5 lg:text-[15px]" colSpan={3}>
                  No attendance history yet.
                </td>
              </tr>
            ) : (
              visits.map((entry) => (
                <tr key={entry.id} className="zebra-row border-t border-border-default">
                  <td className="px-3 py-2.5 text-[14px] font-semibold text-text-primary lg:px-4 lg:py-3 lg:text-[15px]">{formatDisplayDate(entry.visitDate)}</td>
                  <td className="px-3 py-2.5 text-[14px] text-text-secondary lg:px-4 lg:py-3 lg:text-[15px]">{entry.weightKg ? `${entry.weightKg} kg` : "Not recorded"}</td>
                  <td className="px-3 py-2.5 text-[14px] text-text-secondary lg:px-4 lg:py-3 lg:text-[15px]">{Math.abs(daysUntil(entry.visitDate))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </motion.div>
    </section>
  );
}
