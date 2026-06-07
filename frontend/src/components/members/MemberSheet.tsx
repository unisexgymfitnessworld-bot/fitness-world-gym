import { AlertTriangle, Save, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { calculateBmi, calculateDueDate, normalizePhone, todayISO } from "../../lib/utils";
import { memberInputSchema, type MemberInputValues } from "../../lib/validations";
import { genderOptions, goalOptions, paymentOptions, planOptions, type Member, type MemberInput } from "../../types";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface MemberSheetProps {
  open: boolean;
  member: Member | null;
  onClose: () => void;
  onSave: (input: MemberInput, memberId?: string) => void;
}

const fieldNames = [
  "name",
  "phone",
  "age",
  "gender",
  "joinDate",
  "weightKg",
  "heightCm",
  "goal",
  "goalOther",
  "healthProblem",
  "specialInstruction",
  "warmupExercises",
  "flexibilityTraining",
  "cardioTraining",
  "planType",
  "membershipStart",
  "membershipDue",
  "feesAmount",
  "paymentStatus",
] as const satisfies readonly (keyof MemberInputValues)[];

function isMemberInputField(value: PropertyKey): value is keyof MemberInputValues {
  return typeof value === "string" && fieldNames.includes(value as keyof MemberInputValues);
}

function defaults(member: Member | null): MemberInputValues {
  return {
    name: member?.name ?? "",
    phone: member?.phone ?? "",
    age: member?.age ?? 18,
    gender: member?.gender ?? "Male",
    joinDate: member?.joinDate ?? todayISO(),
    weightKg: member?.weightKg ?? 70,
    heightCm: member?.heightCm ?? 170,
    goal: member?.goal ?? "General Fitness",
    goalOther: member?.goalOther ?? "",
    healthProblem: member?.healthProblem ?? "",
    specialInstruction: member?.specialInstruction ?? "",
    warmupExercises: member?.warmupExercises ?? "",
    flexibilityTraining: member?.flexibilityTraining ?? "",
    cardioTraining: member?.cardioTraining ?? "",
    planType: member?.planType ?? "1 Month",
    membershipStart: member?.membershipStart ?? todayISO(),
    membershipDue: member?.membershipDue ?? calculateDueDate(todayISO(), "1 Month"),
    feesAmount: member?.feesAmount ?? 1800,
    paymentStatus: member?.paymentStatus ?? "Pending",
  };
}

function Section({ title, children, delay = 0 }: { title: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.section
      className="grid gap-3 border-b border-border-default px-4 py-4 last:border-b-0 lg:gap-4 lg:px-6 lg:py-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <div className="flex items-center gap-3">
        <span className="h-6 w-1 rounded-full bg-gradient-to-b from-brand-primary to-[#F0447D]" />
        <h3 className="text-[16px] font-bold text-text-primary lg:text-[17px]">{title}</h3>
      </div>
      {children}
    </motion.section>
  );
}

export function MemberSheet({ open, member, onClose, onSave }: MemberSheetProps) {
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const initialValues = useMemo(() => defaults(member), [member]);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<MemberInputValues>({
    defaultValues: initialValues,
  });

  useEffect(() => {
    reset(initialValues);
    setShowCloseWarning(false);
  }, [initialValues, reset, open]);

  const weight = watch("weightKg");
  const height = watch("heightCm");
  const planType = watch("planType");
  const membershipStart = watch("membershipStart");
  const goal = watch("goal");
  const bmi = calculateBmi(Number(weight), Number(height));

  useEffect(() => {
    if (planType !== "Custom" && membershipStart) {
      setValue("membershipDue", calculateDueDate(membershipStart, planType), { shouldDirty: true });
    }
  }, [membershipStart, planType, setValue]);

  function requestClose(): void {
    if (isDirty) {
      setShowCloseWarning(true);
      return;
    }
    onClose();
  }

  function submit(values: MemberInputValues): void {
    const normalized = {
      ...values,
      phone: normalizePhone(values.phone),
    };
    const parsed = memberInputSchema.safeParse(normalized);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0];
        if (key !== undefined && isMemberInputField(key)) {
          setError(key, { type: "manual", message: issue.message });
        }
      });
      return;
    }
    onSave(parsed.data, member?.id);
    reset(parsed.data);
    onClose();
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          {/* Backdrop overlay */}
          <motion.div
            className="fixed inset-0 z-[39] bg-brand-dark/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={requestClose}
          />
          <motion.aside
            className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[760px] flex-col overflow-x-hidden border-l border-border-default bg-brand-white shadow-[0_0_60px_rgba(26,26,46,0.18)]"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            aria-label={member ? "Edit member" : "Add member"}
          >
            <header className="studio-dark relative flex items-center justify-between border-b border-white/[0.10] px-4 py-4 text-brand-white lg:px-6 lg:py-5">
              <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-brand-primary via-[#F0447D] to-transparent" />
              <div className="flex items-center gap-3 lg:gap-4">
                <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-brand-white p-1 shadow-sm ring-1 ring-black/10 lg:h-14 lg:w-14">
                  <img className="h-full w-full object-contain rounded-full" src="/brand/fitness-world-logo-tight.png" alt="Fitness World logo" />
                </div>
                <div>
                  <p className="font-mono text-[12px] font-semibold text-brand-primary-light lg:text-[13px]">{member?.regNo ?? "FW-AUTO"}</p>
                  <h2 className="text-[20px] font-bold text-brand-white lg:text-[22px]">{member ? "Edit Member" : "Add Member"}</h2>
                </div>
              </div>
              <Button aria-label="Close drawer" title="Close" variant="ghost" className="!text-brand-white hover:!bg-white/[0.10] hover:!text-brand-white" onClick={requestClose}>
                <X size={20} />
              </Button>
            </header>

            <form className="scrollbar-soft flex-1 overflow-y-auto pb-28" onSubmit={handleSubmit(submit)}>
              <Section title="Personal" delay={0.1}>
                <div className="grid gap-3 md:grid-cols-2 lg:gap-4">
                  <Input label="Name" error={errors.name?.message} {...register("name")} />
                  <Input
                    label="Phone"
                    inputMode="numeric"
                    error={errors.phone?.message}
                    {...register("phone", {
                      onChange: (event) => {
                        const target = event.target as HTMLInputElement;
                        target.value = normalizePhone(target.value);
                      },
                    })}
                  />
                  <Input label="Age" type="number" error={errors.age?.message} {...register("age", { valueAsNumber: true })} />
                  <label className="grid gap-2 text-[15px] font-semibold">
                    Gender
                    <select className="focus-ring rounded-[var(--radius-card)] border border-transparent bg-surface-overlay px-4 py-2.5 lg:py-3" {...register("gender")}>
                      {genderOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <Input label="Join Date" type="date" error={errors.joinDate?.message} {...register("joinDate")} />
                  <Input label="Reg No" value={member?.regNo ?? "Auto generated"} readOnly />
                </div>
              </Section>

              <Section title="Body Metrics" delay={0.15}>
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_128px] lg:gap-4">
                  <Input label="Weight kg" type="number" step="0.01" error={errors.weightKg?.message} {...register("weightKg", { valueAsNumber: true })} />
                  <Input label="Height cm" type="number" step="0.01" error={errors.heightCm?.message} {...register("heightCm", { valueAsNumber: true })} />
                  <div className="rounded-[var(--radius-card)] bg-brand-primary-light p-3 lg:p-4">
                    <p className="text-[12px] font-bold uppercase tracking-wider text-brand-primary">BMI</p>
                    <p className="mt-1.5 text-[26px] font-black text-text-primary lg:mt-2 lg:text-[28px]">{bmi || "0.00"}</p>
                  </div>
                </div>
              </Section>

              <Section title="Goal" delay={0.2}>
                <div className="grid gap-2 md:grid-cols-2 lg:gap-3">
                  {goalOptions.map((option) => (
                    <label key={option} className="flex min-h-11 items-center gap-3 rounded-[var(--radius-card)] border border-border-default bg-brand-white px-3 text-[14px] font-semibold text-text-primary transition-colors hover:border-brand-primary/40 lg:min-h-12 lg:px-4 lg:text-[15px]">
                      <input className="h-4 w-4 accent-brand-primary" type="radio" value={option} {...register("goal")} />
                      {option}
                    </label>
                  ))}
                </div>
                {goal === "Other" ? <Input label="Other Goal" error={errors.goalOther?.message} {...register("goalOther")} /> : null}
              </Section>

              <Section title="Health Notes" delay={0.25}>
                <div className="grid gap-3 lg:gap-4">
                  {(
                    [
                      ["healthProblem", "Health Problem"],
                      ["specialInstruction", "Special Instruction"],
                      ["warmupExercises", "Warmup Exercises"],
                      ["flexibilityTraining", "Flexibility Training"],
                      ["cardioTraining", "Cardio Training"],
                    ] as const
                  ).map(([name, label]) => (
                    <label key={name} className="grid gap-2 text-[14px] font-semibold lg:text-[15px]">
                      {label}
                      <textarea className="focus-ring min-h-20 rounded-[var(--radius-card)] border border-transparent bg-surface-overlay px-3 py-2.5 text-[14px] font-normal lg:min-h-24 lg:px-4 lg:py-3 lg:text-[15px]" {...register(name)} />
                    </label>
                  ))}
                </div>
              </Section>

              <Section title="Membership" delay={0.3}>
                <div className="grid gap-3 md:grid-cols-2 lg:gap-4">
                  <label className="grid gap-2 text-[14px] font-semibold lg:text-[15px]">
                    Plan Type
                    <select className="focus-ring rounded-[var(--radius-card)] border border-transparent bg-surface-overlay px-3 py-2.5 lg:px-4 lg:py-3" {...register("planType")}>
                      {planOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <Input label="Start Date" type="date" error={errors.membershipStart?.message} {...register("membershipStart")} />
                  <Input label="Due Date" type="date" error={errors.membershipDue?.message} {...register("membershipDue")} />
                  <Input label="Fees" type="number" step="1" error={errors.feesAmount?.message} {...register("feesAmount", { valueAsNumber: true })} />
                  <label className="grid gap-2 text-[14px] font-semibold lg:text-[15px]">
                    Payment Status
                    <select className="focus-ring rounded-[var(--radius-card)] border border-transparent bg-surface-overlay px-3 py-2.5 lg:px-4 lg:py-3" {...register("paymentStatus")}>
                      {paymentOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </Section>

              <div className="fixed bottom-0 right-0 w-full max-w-[760px] border-t border-border-default bg-brand-white/95 px-4 py-3 shadow-[0_-20px_50px_rgba(26,26,46,0.08)] backdrop-blur-xl lg:px-6 lg:py-4">
                {showCloseWarning ? (
                  <div className="mb-2 flex items-center gap-3 rounded-[var(--radius-card)] bg-amber-50 px-3 py-2.5 text-status-due lg:mb-3 lg:px-4 lg:py-3">
                    <AlertTriangle size={18} />
                    <span className="text-[14px] font-semibold lg:text-[15px]">Unsaved changes</span>
                    <Button className="ml-auto" variant="secondary" onClick={() => setShowCloseWarning(false)}>
                      Keep Editing
                    </Button>
                    <Button variant="danger" onClick={onClose}>
                      Discard
                    </Button>
                  </div>
                ) : null}
                <Button className="w-full" type="submit">
                  <Save size={20} />
                  Save Member
                </Button>
              </div>
            </form>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
