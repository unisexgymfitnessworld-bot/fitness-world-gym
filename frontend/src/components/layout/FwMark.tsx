interface FwMarkProps {
  compact?: boolean;
}

export function FwMark({ compact = false }: FwMarkProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-brand-white p-1 shadow-md ring-1 ring-white/20">
        <img className="h-full w-full object-contain rounded-full" src="/brand/fitness-world-logo-tight.png" alt="Fitness World logo" />
      </div>
      {compact ? null : (
        <div className="leading-tight">
          <p className="text-[24px] font-black text-brand-white tracking-tight">FITNESS WORLD</p>
          <p className="text-[15px] font-bold text-white/70">Unisex Gym</p>
        </div>
      )}
    </div>
  );
}
