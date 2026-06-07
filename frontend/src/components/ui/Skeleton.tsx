export function SkeletonRow() {
  return (
    <div className="grid gap-3 rounded-[var(--radius-card)] border border-border-default bg-surface-base p-4">
      <div className="animate-shimmer h-4 w-32 rounded-full" />
      <div className="animate-shimmer h-3 w-full rounded-full" style={{ animationDelay: "0.1s" }} />
      <div className="animate-shimmer h-3 w-2/3 rounded-full" style={{ animationDelay: "0.2s" }} />
    </div>
  );
}
