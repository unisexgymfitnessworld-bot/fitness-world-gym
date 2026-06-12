import { AlertTriangle, Camera, Save, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, useRef } from "react";
import { compressImage } from "../../lib/imageCompression";
import { useForm } from "react-hook-form";
import { splitAmountForCouple } from "../../lib/analytics";
import { calculateBmi, calculateDueDate, createPlanDueSummary, formatDisplayDate, getPlanDurationLabel, normalizePhone, todayISO } from "../../lib/utils";
import { memberInputSchema, type MemberInputValues } from "../../lib/validations";
import { genderOptions, goalOptions, paymentOptions, planOptions, trainingTypeOptions, type Gender, type Goal, type Member, type MemberInput } from "../../types";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface MemberSheetProps {
  open: boolean;
  member: Member | null;
  onClose: () => void;
  onSave: (input: MemberInput | MemberInput[], memberId?: string) => Promise<void>;
}

interface CouplePartnerValues {
  partnerName: string;
  partnerPhone: string;
  partnerAge: number;
  partnerGender: Gender;
  partnerJoinDate: string;
  partnerWeightKg: number;
  partnerHeightCm: number;
  partnerGoal: Goal;
  partnerGoalOther?: string;
  partnerHealthProblem?: string;
  partnerSpecialInstruction?: string;
  partnerWarmupExercises?: string;
  partnerFlexibilityTraining?: string;
  partnerCardioTraining?: string;
  partnerAddress: string;
}

type MemberSheetValues = MemberInputValues & CouplePartnerValues;

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
  "avatar",
  "trainingType",
  "address",
  "partialPaidAmount",
  "balanceAmount",
] as const satisfies readonly (keyof MemberInputValues)[];

const partnerDefaults = {
  partnerName: "",
  partnerPhone: "",
  partnerAge: 18,
  partnerGender: "Female",
  partnerJoinDate: todayISO(),
  partnerWeightKg: 70,
  partnerHeightCm: 170,
  partnerGoal: "General Fitness",
  partnerGoalOther: "",
  partnerHealthProblem: "",
  partnerSpecialInstruction: "",
  partnerWarmupExercises: "",
  partnerFlexibilityTraining: "",
  partnerCardioTraining: "",
  partnerAddress: "",
} as const satisfies CouplePartnerValues;

const partnerErrorFieldMap = {
  name: "partnerName",
  phone: "partnerPhone",
  age: "partnerAge",
  gender: "partnerGender",
  joinDate: "partnerJoinDate",
  weightKg: "partnerWeightKg",
  heightCm: "partnerHeightCm",
  goal: "partnerGoal",
  goalOther: "partnerGoalOther",
  healthProblem: "partnerHealthProblem",
  specialInstruction: "partnerSpecialInstruction",
  warmupExercises: "partnerWarmupExercises",
  flexibilityTraining: "partnerFlexibilityTraining",
  cardioTraining: "partnerCardioTraining",
  address: "partnerAddress",
} as const satisfies Partial<Record<keyof MemberInputValues, keyof MemberSheetValues>>;

function isMemberInputField(value: PropertyKey): value is keyof MemberInputValues {
  return typeof value === "string" && fieldNames.includes(value as keyof MemberInputValues);
}

function isPartnerMappedField(value: keyof MemberInputValues): value is keyof typeof partnerErrorFieldMap {
  return value in partnerErrorFieldMap;
}

function partnerDefaultValues(): CouplePartnerValues {
  return {
    ...partnerDefaults,
    partnerJoinDate: todayISO(),
  };
}

function defaults(member: Member | null): MemberSheetValues {
  const defaultFees = member?.feesAmount ?? 1800;
  let defaultPartial = member?.partialPaidAmount ?? 0;
  let defaultBalance = member?.balanceAmount ?? 0;

  if (member) {
    defaultPartial = member.partialPaidAmount;
    defaultBalance = member.balanceAmount;
  } else {
    // defaults for new member (which is Pending)
    defaultPartial = 0;
    defaultBalance = defaultFees;
  }

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
    feesAmount: defaultFees,
    paymentStatus: member?.paymentStatus ?? "Pending",
    avatar: member?.avatar ?? "",
    trainingType: member?.trainingType ?? "General",
    address: member?.address ?? "",
    partialPaidAmount: defaultPartial,
    balanceAmount: defaultBalance,
    ...partnerDefaultValues(),
  };
}

function valuesToMemberInput(values: MemberSheetValues): MemberInput {
  const membershipDue = values.planType === "Custom" ? values.membershipDue : calculateDueDate(values.membershipStart, values.planType);

  return {
    name: values.name,
    phone: normalizePhone(values.phone),
    age: values.age,
    gender: values.gender,
    joinDate: values.joinDate,
    weightKg: values.weightKg,
    heightCm: values.heightCm,
    goal: values.goal,
    goalOther: values.goalOther,
    healthProblem: values.healthProblem,
    specialInstruction: values.specialInstruction,
    warmupExercises: values.warmupExercises,
    flexibilityTraining: values.flexibilityTraining,
    cardioTraining: values.cardioTraining,
    planType: values.planType,
    membershipStart: values.membershipStart,
    membershipDue,
    feesAmount: values.feesAmount,
    paymentStatus: values.paymentStatus,
    avatar: values.avatar,
    trainingType: values.trainingType,
    address: values.address,
    partialPaidAmount: values.partialPaidAmount,
    balanceAmount: values.balanceAmount,
  };
}

function partnerToMemberInput(values: MemberSheetValues, shared: MemberInput): MemberInput {
  return {
    ...shared,
    name: values.partnerName,
    phone: normalizePhone(values.partnerPhone),
    age: values.partnerAge,
    gender: values.partnerGender,
    joinDate: values.partnerJoinDate,
    weightKg: values.partnerWeightKg,
    heightCm: values.partnerHeightCm,
    goal: values.partnerGoal,
    goalOther: values.partnerGoalOther,
    healthProblem: values.partnerHealthProblem,
    specialInstruction: values.partnerSpecialInstruction,
    warmupExercises: values.partnerWarmupExercises,
    flexibilityTraining: values.partnerFlexibilityTraining,
    cardioTraining: values.partnerCardioTraining,
    avatar: "",
    trainingType: "Couple",
    address: values.partnerAddress,
  };
}

function applyCouplePaymentSplit(input: MemberInput, index: 0 | 1): MemberInput {
  const [firstFees, secondFees] = splitAmountForCouple(input.feesAmount);
  const [firstPartial, secondPartial] = splitAmountForCouple(input.partialPaidAmount);
  const [firstBalance, secondBalance] = splitAmountForCouple(input.balanceAmount);

  return {
    ...input,
    feesAmount: index === 0 ? firstFees : secondFees,
    partialPaidAmount: index === 0 ? firstPartial : secondPartial,
    balanceAmount: index === 0 ? firstBalance : secondBalance,
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setValue("avatar", compressed, { shouldDirty: true });
      } catch (err) {
        console.error("Image compression failed:", err);
        const reader = new FileReader();
        reader.onloadend = () => {
          setValue("avatar", reader.result as string, { shouldDirty: true });
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const initialValues = useMemo(() => defaults(member), [member]);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<MemberSheetValues>({
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
  const membershipDue = watch("membershipDue");
  const goal = watch("goal");
  const trainingType = watch("trainingType");
  const feesAmount = watch("feesAmount") || 0;
  const paymentStatus = watch("paymentStatus");
  const partialPaidAmount = watch("partialPaidAmount") || 0;
  const partnerGoal = watch("partnerGoal");
  const partnerWeight = watch("partnerWeightKg");
  const partnerHeight = watch("partnerHeightCm");
  const bmi = calculateBmi(Number(weight), Number(height));
  const partnerBmi = calculateBmi(Number(partnerWeight), Number(partnerHeight));
  const isNewCouple = !member && trainingType === "Couple";
  const planDueSummary = createPlanDueSummary(membershipStart, planType, membershipDue);
  const isCustomPlan = planType === "Custom";

  useEffect(() => {
    if (planType !== "Custom" && membershipStart) {
      const nextDue = calculateDueDate(membershipStart, planType);
      if (membershipDue !== nextDue) {
        setValue("membershipDue", nextDue, { shouldDirty: true });
      }
    }
  }, [membershipDue, membershipStart, planType, setValue]);

  useEffect(() => {
    if (paymentStatus === "Paid") {
      setValue("partialPaidAmount", feesAmount, { shouldDirty: true });
      setValue("balanceAmount", 0, { shouldDirty: true });
    } else if (paymentStatus === "Pending") {
      setValue("partialPaidAmount", 0, { shouldDirty: true });
      setValue("balanceAmount", feesAmount, { shouldDirty: true });
    } else if (paymentStatus === "Partially Paid") {
      const bal = Math.max(0, feesAmount - partialPaidAmount);
      setValue("balanceAmount", bal, { shouldDirty: true });
    }
  }, [paymentStatus, feesAmount, partialPaidAmount, setValue]);

  function requestClose(): void {
    if (isDirty) {
      setShowCloseWarning(true);
      return;
    }
    onClose();
  }

  async function submit(values: MemberSheetValues): Promise<void> {
    const parsed = memberInputSchema.safeParse(valuesToMemberInput(values));
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0];
        if (key !== undefined && isMemberInputField(key)) {
          setError(key, { type: "manual", message: issue.message });
        }
      });
      return;
    }

    if (isNewCouple) {
      const partnerInput = partnerToMemberInput(values, parsed.data);
      const parsedPartner = memberInputSchema.safeParse(partnerInput);
      if (!parsedPartner.success) {
        parsedPartner.error.issues.forEach((issue) => {
          const key = issue.path[0];
          if (key !== undefined && isMemberInputField(key)) {
            if (isPartnerMappedField(key)) {
              const partnerKey = partnerErrorFieldMap[key];
              setError(partnerKey, { type: "manual", message: issue.message });
            }
          }
        });
        return;
      }

      await onSave([applyCouplePaymentSplit(parsed.data, 0), applyCouplePaymentSplit(parsedPartner.data, 1)]);
      reset(defaults(null));
      onClose();
      return;
    }

    await onSave(parsed.data, member?.id);
    reset(defaults(member));
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
              <div className="flex flex-col items-center justify-center border-b border-border-default bg-surface-raised py-6">
                <div 
                  className="relative group flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border-default bg-brand-white shadow-sm ring-4 ring-brand-primary-light cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {watch("avatar") ? (
                    <img src={watch("avatar")} alt="Profile preview" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[20px] font-black text-text-muted">{watch("name") ? watch("name").slice(0, 2).toUpperCase() : "FW"}</span>
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="text-[12px] font-bold text-white uppercase">Upload</span>
                  </div>
                </div>

                {/* Hidden File Inputs */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageFile}
                />
                <input
                  type="file"
                  ref={cameraInputRef}
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={handleImageFile}
                />

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default bg-brand-white text-[12px] font-bold text-text-primary hover:bg-surface-raised shadow-sm transition-all cursor-pointer"
                  >
                    <Upload size={13} className="text-text-secondary" />
                    Upload Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default bg-brand-white text-[12px] font-bold text-text-primary hover:bg-surface-raised shadow-sm transition-all cursor-pointer"
                  >
                    <Camera size={13} className="text-brand-primary" />
                    Take Live Photo
                  </button>
                </div>

                {watch("avatar") && (
                  <button
                    type="button"
                    className="mt-2 text-[12px] font-bold text-status-expired hover:underline cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setValue("avatar", "", { shouldDirty: true });
                    }}
                  >
                    Remove Photo
                  </button>
                )}
              </div>

              <Section title="Training Type" delay={0.05}>
                <div className="grid gap-3 md:grid-cols-1 lg:gap-4">
                  <label className="grid gap-2 text-[14px] font-semibold lg:text-[15px]">
                    Training Type
                    <select className="studio-input w-full px-3 py-2.5 lg:px-4 lg:py-3" {...register("trainingType")}>
                      {trainingTypeOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </Section>

              <Section title={isNewCouple ? "Member 1 Details" : "Personal"} delay={0.1}>
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
                    <select className="studio-input w-full px-4 py-2.5 lg:py-3" {...register("gender")}>
                      {genderOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <Input label="Join Date" type="date" error={errors.joinDate?.message} {...register("joinDate")} />
                  <Input label="Reg No" value={member?.regNo ?? "Auto generated"} readOnly />
                </div>
                <div className="mt-3 lg:mt-4">
                  <label className="grid gap-2 text-[14px] font-semibold lg:text-[15px]">
                    Address
                    <textarea
                      className="studio-input min-h-20 w-full px-3 py-2.5 text-[14px] font-normal lg:min-h-24 lg:px-4 lg:py-3 lg:text-[15px]"
                      placeholder="Enter member's address..."
                      {...register("address")}
                    />
                    {errors.address?.message && <p className="text-[12px] font-medium text-status-expired">{errors.address.message}</p>}
                  </label>
                </div>
              </Section>

              <Section title={isNewCouple ? "Member 1 Body Metrics" : "Body Metrics"} delay={0.15}>
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_128px] lg:gap-4">
                  <Input label="Weight kg" type="number" step="0.01" error={errors.weightKg?.message} {...register("weightKg", { valueAsNumber: true })} />
                  <Input label="Height cm" type="number" step="0.01" error={errors.heightCm?.message} {...register("heightCm", { valueAsNumber: true })} />
                  <div className="rounded-[var(--radius-card)] bg-brand-primary-light p-3 lg:p-4">
                    <p className="text-[12px] font-bold uppercase tracking-wider text-brand-primary">BMI</p>
                    <p className="mt-1.5 text-[26px] font-black text-text-primary lg:mt-2 lg:text-[28px]">{bmi || "0.00"}</p>
                  </div>
                </div>
              </Section>

              <Section title={isNewCouple ? "Member 1 Goal" : "Goal"} delay={0.2}>
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

              <Section title={isNewCouple ? "Member 1 Health Notes" : "Health Notes"} delay={0.25}>
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
                      <textarea className="studio-input min-h-20 w-full px-3 py-2.5 text-[14px] font-normal lg:min-h-24 lg:px-4 lg:py-3 lg:text-[15px]" {...register(name)} />
                    </label>
                  ))}
                </div>
              </Section>

              {isNewCouple ? (
                <Section title="Member 2 Details" delay={0.28}>
                  <div className="rounded-[var(--radius-card)] border border-brand-primary/15 bg-brand-primary-light/35 px-3 py-2.5 text-[12px] font-bold leading-5 text-brand-primary lg:px-4">
                    Couple entry creates two member records and splits the shared fee totals for clean reports.
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 lg:gap-4">
                    <Input id="partner-name" label="Name" error={errors.partnerName?.message} {...register("partnerName")} />
                    <Input
                      id="partner-phone"
                      label="Phone"
                      inputMode="numeric"
                      error={errors.partnerPhone?.message}
                      {...register("partnerPhone", {
                        onChange: (event) => {
                          const target = event.target as HTMLInputElement;
                          target.value = normalizePhone(target.value);
                        },
                      })}
                    />
                    <Input id="partner-age" label="Age" type="number" error={errors.partnerAge?.message} {...register("partnerAge", { valueAsNumber: true })} />
                    <label className="grid gap-2 text-[15px] font-semibold">
                      Gender
                      <select className="studio-input w-full px-4 py-2.5 lg:py-3" {...register("partnerGender")}>
                        {genderOptions.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <Input id="partner-join-date" label="Join Date" type="date" error={errors.partnerJoinDate?.message} {...register("partnerJoinDate")} />
                    <div className="rounded-[var(--radius-card)] bg-brand-primary-light p-3 lg:p-4">
                      <p className="text-[12px] font-bold uppercase tracking-wider text-brand-primary">BMI</p>
                      <p className="mt-1.5 text-[26px] font-black text-text-primary lg:mt-2 lg:text-[28px]">{partnerBmi || "0.00"}</p>
                    </div>
                    <Input id="partner-weight-kg" label="Weight kg" type="number" step="0.01" error={errors.partnerWeightKg?.message} {...register("partnerWeightKg", { valueAsNumber: true })} />
                    <Input id="partner-height-cm" label="Height cm" type="number" step="0.01" error={errors.partnerHeightCm?.message} {...register("partnerHeightCm", { valueAsNumber: true })} />
                  </div>
                  <div className="mt-3 lg:mt-4">
                    <label className="grid gap-2 text-[14px] font-semibold lg:text-[15px]">
                      Address
                      <textarea
                        className="studio-input min-h-20 w-full px-3 py-2.5 text-[14px] font-normal lg:min-h-24 lg:px-4 lg:py-3 lg:text-[15px]"
                        placeholder="Enter partner member's address..."
                        {...register("partnerAddress")}
                      />
                      {errors.partnerAddress?.message && <p className="text-[12px] font-medium text-status-expired">{errors.partnerAddress.message}</p>}
                    </label>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 lg:gap-3">
                    {goalOptions.map((option) => (
                      <label key={option} className="flex min-h-11 items-center gap-3 rounded-[var(--radius-card)] border border-border-default bg-brand-white px-3 text-[14px] font-semibold text-text-primary transition-colors hover:border-brand-primary/40 lg:min-h-12 lg:px-4 lg:text-[15px]">
                        <input className="h-4 w-4 accent-brand-primary" type="radio" value={option} {...register("partnerGoal")} />
                        {option}
                      </label>
                    ))}
                  </div>
                  {partnerGoal === "Other" ? <Input id="partner-other-goal" label="Other Goal" error={errors.partnerGoalOther?.message} {...register("partnerGoalOther")} /> : null}
                  <div className="grid gap-3 lg:gap-4">
                    {(
                      [
                        ["partnerHealthProblem", "Health Problem"],
                        ["partnerSpecialInstruction", "Special Instruction"],
                        ["partnerWarmupExercises", "Warmup Exercises"],
                        ["partnerFlexibilityTraining", "Flexibility Training"],
                        ["partnerCardioTraining", "Cardio Training"],
                      ] as const
                    ).map(([name, label]) => (
                      <label key={name} className="grid gap-2 text-[14px] font-semibold lg:text-[15px]">
                        {label}
                        <textarea className="studio-input min-h-20 w-full px-3 py-2.5 text-[14px] font-normal lg:min-h-24 lg:px-4 lg:py-3 lg:text-[15px]" {...register(name)} />
                      </label>
                    ))}
                  </div>
                </Section>
              ) : null}

              <Section title="Membership" delay={0.3}>
                {isNewCouple ? (
                  <p className="rounded-[var(--radius-card)] border border-sky-100 bg-sky-50/70 px-3 py-2.5 text-[12px] font-bold leading-5 text-sky-800">
                    Enter the couple's total fee here. GymOS splits the saved amounts between both members so the dashboard and PDF reports stay accurate.
                  </p>
                ) : null}
                <div className="grid gap-3 md:grid-cols-2 lg:gap-4">
                  <label className="grid gap-2 text-[14px] font-semibold lg:text-[15px]">
                    Plan Type
                    <select className="studio-input w-full px-3 py-2.5 lg:px-4 lg:py-3" {...register("planType")}>
                      {planOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <Input label="Start Date" type="date" error={errors.membershipStart?.message} {...register("membershipStart")} />
                  <Input
                    label={isCustomPlan ? "Plan End Date" : "Plan End Date (Auto)"}
                    type="date"
                    error={errors.membershipDue?.message}
                    {...register("membershipDue")}
                    readOnly={!isCustomPlan}
                  />
                  <Input label="Fees" type="number" step="1" error={errors.feesAmount?.message} {...register("feesAmount", { valueAsNumber: true })} />
                  <label className="grid gap-2 text-[14px] font-semibold lg:text-[15px]">
                    Payment Status
                    <select className="studio-input w-full px-3 py-2.5 lg:px-4 lg:py-3" {...register("paymentStatus")}>
                      {paymentOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  {paymentStatus === "Partially Paid" && (
                    <>
                      <Input
                        label="Partial Paid Amount"
                        type="number"
                        step="1"
                        error={errors.partialPaidAmount?.message}
                        {...register("partialPaidAmount", { valueAsNumber: true })}
                      />
                      <div className="rounded-[var(--radius-card)] bg-amber-50/50 border border-amber-200 p-3 lg:p-4">
                        <p className="text-[12px] font-bold uppercase tracking-wider text-amber-700">Remaining Balance</p>
                        <p className="mt-1.5 text-[24px] font-black text-amber-900 lg:mt-2 lg:text-[26px]">
                          ₹{watch("balanceAmount") || 0}
                        </p>
                      </div>
                    </>
                  )}
                </div>
                <div className="grid gap-2 rounded-[var(--radius-card)] border border-border-default bg-surface-raised p-3 lg:grid-cols-[1fr_auto] lg:items-center lg:p-4">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-brand-primary">Due date rule</p>
                    <p className="mt-1 text-[13px] font-bold leading-5 text-text-primary lg:text-[14px]">{planDueSummary}</p>
                    <p className="mt-1 text-[12px] font-semibold leading-5 text-text-secondary">
                      {isCustomPlan
                        ? "Custom plan: set the exact end date needed for this member."
                        : "Fixed plan: choose only the start date. GymOS locks the plan end date. Payment status tracks full, partial, or pending collection."}
                    </p>
                  </div>
                  <div className="grid min-w-44 gap-1 rounded-[var(--radius-card)] bg-brand-white px-3 py-2 shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">{getPlanDurationLabel(planType)}</span>
                    <strong className="text-[15px] text-text-primary">{formatDisplayDate(membershipDue)}</strong>
                    <span className="text-[10px] font-black uppercase tracking-wider text-brand-primary">{isCustomPlan ? "editable" : "auto locked"}</span>
                  </div>
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
                  {isNewCouple ? "Save Couple Members" : "Save Member"}
                </Button>
              </div>
            </form>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
