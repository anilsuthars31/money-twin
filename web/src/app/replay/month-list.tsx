import Link from "next/link";
import { ArrowRight, PieChart, Play, RotateCcw, Upload, Wand2 } from "lucide-react";
import { inr } from "@/game/engine";
import { monthLabel } from "@/game/replay/real-month";
import { totalWhatIfSaved, type ReplayProgress } from "@/game/replay-progress";
import { cn } from "@/lib/utils";
import { GRADE_STYLE } from "../play/demo/report-card";

export interface MonthSummary {
  month: string; // "2026-08"
  count: number;
  spent: number;
  received: number;
}

/** Each month with saved data is a chapter: what came in and went out, and its grade once replayed. */
export function MonthList({
  months,
  progress,
  onPick,
}: {
  months: MonthSummary[];
  progress: ReplayProgress;
  onPick: (key: string) => void;
}) {
  const played = months.filter((m) => progress.months[m.month]).length;
  const upNext = months.find((m) => !progress.months[m.month])?.month;
  const whatIfTotal = totalWhatIfSaved({ months: Object.fromEntries(months.flatMap((m) => (progress.months[m.month] ? [[m.month, progress.months[m.month]]] : []))) });

  return (
    <div className="space-y-3">
      <section data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
        <h1 className="text-2xl font-bold leading-tight text-balance">Replay your real past</h1>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Each month is a chapter. Plan it the way you wish you had, then live it again with your real payments.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex flex-1 gap-1" aria-hidden>
            {months.map((m) => (
              <div key={m.month} className={cn("h-1.5 flex-1 rounded-full", progress.months[m.month] ? "bg-money" : "bg-white/10")} />
            ))}
          </div>
          <span className="num text-xs text-muted-foreground">
            {played} of {months.length} replayed
          </span>
        </div>
        {whatIfTotal > 0 && (
          <p className="mt-3 flex items-center gap-2 rounded-2xl bg-goal/10 px-3 py-2 text-sm ring-1 ring-goal/30" data-testid="what-if-total">
            <Wand2 className="size-4 shrink-0 text-goal" aria-hidden />
            <span>
              What-if you has kept <span className="num font-bold text-money">{inr(whatIfTotal)}</span> more across{" "}
              {played === 1 ? "1 month" : `${played} months`}
            </span>
          </p>
        )}
      </section>

      <ol className="relative space-y-2" aria-label="Your months">
        {months.map((m, i) => {
          const r = progress.months[m.month];
          const next = m.month === upNext;
          return (
            <li key={m.month}>
              <button
                type="button"
                onClick={() => onPick(m.month)}
                aria-label={`${monthLabel(+m.month.slice(0, 4), +m.month.slice(5))}: spent ${inr(m.spent)}, came in ${inr(m.received)}${r ? `, grade ${r.grade}` : ""}`}
                className={cn(
                  "flex w-full items-center gap-3 rounded-3xl bg-card p-4 text-left ring-1 transition active:scale-[0.99]",
                  next ? "ring-money/40 hover:ring-money/70" : "ring-white/5 hover:ring-white/15",
                )}
              >
                {r ? (
                  <span className={cn("grid size-12 shrink-0 place-items-center rounded-full font-display text-2xl font-bold ring-2", GRADE_STYLE[r.grade])}>
                    {r.grade}
                  </span>
                ) : (
                  <span className="num grid size-12 shrink-0 place-items-center rounded-full bg-white/[0.05] text-sm font-semibold text-muted-foreground ring-1 ring-white/10">
                    {i + 1}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{monthLabel(+m.month.slice(0, 4), +m.month.slice(5))}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    <span className="num text-foreground">{inr(m.spent)}</span> spent ·{" "}
                    <span className="num text-money">{inr(m.received)}</span> came in
                  </span>
                  {r?.whatIfSaved ? (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-goal">
                      <Wand2 className="size-3" aria-hidden /> What-if you kept <span className="num font-semibold">{inr(r.whatIfSaved)}</span> more
                    </span>
                  ) : null}
                  {m.count < 10 && <span className="mt-0.5 block text-xs text-muted-foreground">Only {m.count} payments saved: part of a month</span>}
                </span>
                {r ? (
                  <RotateCcw className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : next ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-money px-3 py-1.5 text-xs font-bold text-background">
                    <Play className="size-3.5" aria-hidden /> Play
                  </span>
                ) : (
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <Link
        href="/dashboard"
        className="flex items-center gap-3 rounded-3xl bg-white/[0.03] p-4 text-sm ring-1 ring-white/5 hover:ring-white/15"
      >
        <PieChart className="size-4 text-money" aria-hidden />
        <span className="flex-1">Where your money goes</span>
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
      <Link
        href="/upload"
        className="flex items-center gap-3 rounded-3xl bg-white/[0.03] p-4 text-sm ring-1 ring-white/5 hover:ring-white/15"
      >
        <Upload className="size-4 text-money" aria-hidden />
        <span className="flex-1">Add a newer statement for more chapters</span>
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
    </div>
  );
}
