interface FwMarkProps {
  compact?: boolean;
  tone?: "dark" | "light";
}

export function FwMark({ compact = false, tone = "dark" }: FwMarkProps) {
  const light = tone === "light";
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-brand-white p-1 shadow-md ring-1 ring-black/10">
        <img className="h-full w-full object-contain rounded-full" src="/brand/fitness-world-logo-tight.png" alt="Fitness World logo" />
      </div>
      {compact ? null : (
        <div className="leading-tight">
          <p className={`text-[24px] font-black tracking-tight ${light ? "text-text-primary" : "text-brand-white"}`}>FITNESS WORLD</p>
          <p className={`text-[15px] font-bold ${light ? "text-text-secondary" : "text-white/70"}`}>Unisex Gym</p>
        </div>
      )}
    </div>
  );
}
