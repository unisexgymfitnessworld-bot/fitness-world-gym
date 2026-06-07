interface FwMarkProps {
  compact?: boolean;
}

export function FwMark({ compact = false }: FwMarkProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-brand-white p-1 shadow-sm ring-1 ring-white/20">
        <img className="h-full w-full object-contain rounded-full" src="/brand/fitness-world-logo-tight.png" alt="Fitness World logo" />
      </div>
      {compact ? null : (
        <div className="leading-tight">
          <p className="text-[17px] font-extrabold text-brand-white">FITNESS WORLD</p>
          <p className="text-[13px] font-semibold text-white/60">Unisex Gym</p>
        </div>
      )}
    </div>
  );
}
