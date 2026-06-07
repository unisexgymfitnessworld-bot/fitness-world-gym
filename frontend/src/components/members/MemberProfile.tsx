import { ArrowLeft, MessageCircle, MessageSquare, Pencil, RefreshCcw } from "lucide-react";
import { motion } from "motion/react";
import { calculateDueDate, createWhatsAppLink, formatCurrency, formatDisplayDate, formatPhone, todayISO } from "../../lib/utils";
import type { AttendanceEntry, Member } from "../../types";
import { AttendanceTable } from "../attendance/AttendanceTable";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

interface MemberProfileProps {
  member: Member;
  attendance: AttendanceEntry[];
  onBack: () => void;
  onEdit: (memberId: string) => void;
  onSms: (memberId: string) => void;
  onRenew: (memberId: string, start: string, due: string, feesAmount: number) => void;
  onAddVisit: (memberId: string, visitDate: string, weightKg?: number) => void;
}

export function MemberProfile({ member, attendance, onBack, onEdit, onSms, onRenew, onAddVisit }: MemberProfileProps) {
  const nextStart = todayISO();
  const nextDue = calculateDueDate(nextStart, member.planType === "Custom" ? "1 Month" : member.planType);

  return (
    <main className="studio-shell animated-grid relative min-h-screen overflow-hidden">
      <div className="relative mx-auto grid max-w-[1440px] gap-4 px-4 pb-10 pt-4 lg:gap-6 lg:px-8 lg:pt-6">
      <motion.div
        className="flex flex-wrap items-center justify-between gap-3"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft size={18} />
          Back
        </Button>
        <div className="scrollbar-hide flex flex-nowrap gap-2 overflow-x-auto">
          <Button variant="secondary" onClick={() => onEdit(member.id)}>
            <Pencil size={18} />
            <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button variant="secondary" onClick={() => onSms(member.id)}>
            <MessageSquare size={18} />
            <span className="hidden sm:inline">SMS</span>
          </Button>
          <a
            className="focus-ring inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-card)] border border-green-200 bg-green-50 px-3 py-2 text-[15px] font-semibold text-status-active lg:px-4 lg:py-3"
            href={createWhatsAppLink(member)}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={18} />
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
          <Button onClick={() => onRenew(member.id, nextStart, nextDue, member.feesAmount)}>
            <RefreshCcw size={18} />
            Renew
          </Button>
        </div>
      </motion.div>

      <motion.section
        className="studio-card overflow-hidden rounded-[var(--radius-card)]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
      >
        <div className="studio-dark grid gap-4 p-4 text-brand-white lg:min-h-56 lg:grid-cols-[1fr_280px] lg:gap-6 lg:p-6">
          <div className="flex items-start gap-4 lg:gap-5">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-white/20 bg-brand-white/10 flex items-center justify-center shadow-[0_18px_40px_rgba(232,23,93,0.34)] lg:h-20 lg:w-20">
              {member.avatar ? (
                <img src={member.avatar} alt={member.name} className="h-full w-full object-cover rounded-full" />
              ) : (
                <span className="text-[20px] font-black text-brand-white lg:text-[24px]">{member.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div>
            <p className="font-mono text-[12px] font-semibold text-brand-primary-light lg:text-[13px]">{member.regNo}</p>
            <h1 className="mt-1 text-[26px] font-extrabold leading-tight lg:mt-2 lg:text-[34px]">{member.name}</h1>
            <div className="mt-3 flex flex-wrap gap-1.5 lg:mt-4 lg:gap-2">
              <Badge tone={member.status === "Active" ? "active" : member.status === "Expired" ? "expired" : "neutral"}>{member.status}</Badge>
              <Badge tone="primary">{member.goal}</Badge>
              <Badge tone={member.paymentStatus === "Paid" ? "paid" : "pending"}>{member.paymentStatus}</Badge>
            </div>
            </div>
          </div>
          <div className="rounded-[var(--radius-card)] border border-white/10 bg-white/10 p-3 lg:p-4">
            <p className="text-[12px] font-bold uppercase tracking-wider text-white/60">Membership Due</p>
            <p className="mt-1.5 text-[20px] font-black lg:mt-2 lg:text-[22px]">{formatDisplayDate(member.membershipDue)}</p>
            <p className="mt-2 text-[14px] text-white/70 lg:mt-3 lg:text-[15px]">{formatCurrency(member.feesAmount)}</p>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2 lg:gap-6 lg:p-6">
          <motion.section
            className="grid gap-3 lg:gap-4"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            <h2 className="text-[20px] font-black text-text-primary lg:text-[22px]">Member Details</h2>
            <dl className="grid gap-2 lg:gap-3">
              <ProfileRow label="Phone" value={formatPhone(member.phone)} mono />
              <ProfileRow label="Age" value={`${member.age}`} />
              <ProfileRow label="Gender" value={member.gender} />
              <ProfileRow label="Join Date" value={formatDisplayDate(member.joinDate)} />
              <ProfileRow label="BMI" value={`${member.bmi}`} />
              <ProfileRow label="Weight" value={`${member.weightKg} kg`} />
              <ProfileRow label="Height" value={`${member.heightCm} cm`} />
            </dl>
          </motion.section>

          <motion.section
            className="grid gap-3 lg:gap-4"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
          >
            <h2 className="text-[20px] font-black text-text-primary lg:text-[22px]">Training Notes</h2>
            <dl className="grid gap-2 lg:gap-3">
              <ProfileRow label="Health Problem" value={member.healthProblem || "None recorded"} />
              <ProfileRow label="Special Instruction" value={member.specialInstruction || "None recorded"} />
              <ProfileRow label="Warmup" value={member.warmupExercises || "Not recorded"} />
              <ProfileRow label="Flexibility" value={member.flexibilityTraining || "Not recorded"} />
              <ProfileRow label="Cardio" value={member.cardioTraining || "Not recorded"} />
            </dl>
          </motion.section>
        </div>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.45 }}
      >
        <AttendanceTable memberId={member.id} attendance={attendance} onAddVisit={onAddVisit} />
      </motion.div>
      </div>
    </main>
  );
}

function ProfileRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 rounded-lg bg-surface-raised px-3 py-2.5 lg:grid-cols-[148px_1fr] lg:gap-3 lg:px-4 lg:py-3">
      <dt className="text-[14px] font-semibold text-text-muted lg:text-[15px]">{label}</dt>
      <dd className={mono ? "font-mono text-[12px] text-text-primary lg:text-[13px]" : "text-[14px] font-semibold text-text-primary lg:text-[15px]"}>{value}</dd>
    </div>
  );
}
