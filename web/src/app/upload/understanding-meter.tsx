import { cn } from "@/lib/utils";

/** "Your twin understands 64% of your spending", with an optional starting point to show progress. */
export function UnderstandingMeter({ value, from, className }: { value: number; from?: number; className?: string }) {
  const pct = Math.round(value * 100);
  const start = from === undefined ? undefined : Math.round(from * 100);
  return (
    <div className={cn("rounded-2xl bg-white/[0.04] p-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">Your twin understands</span>
        <span className="num text-2xl font-bold text-money" aria-live="polite">
          {pct}%
        </span>
      </div>
      <div
        className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.08]"
        role="progressbar"
        aria-label="Share of your spending your twin understands"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        {start !== undefined && start < pct && (
          <div className="absolute inset-y-0 left-0 bg-money/35" style={{ width: `${start}%` }} />
        )}
        <div
          className="h-full rounded-full bg-money transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">
        of your spending{start !== undefined && start < pct ? `, up from ${start}%` : ""}
      </div>
    </div>
  );
}
