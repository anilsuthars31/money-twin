import { Lightbulb, Sparkle, Wand2 } from "lucide-react";
import { inr } from "@/game/engine";
import { LESSON_INFO } from "@/game/lessons";
import type { WhatIfChoice, WhatIfMoment } from "@/game/replay/what-if";
import { cn } from "@/lib/utils";

/** A real key moment, and the choice: keep what really happened, or try the better move. */
export function WhatIfCard({
  moment,
  monthShort,
  picked,
  onPick,
}: {
  moment: WhatIfMoment;
  monthShort: string;
  picked: WhatIfChoice | undefined;
  onPick: (c: WhatIfChoice) => void;
}) {
  const skill = LESSON_INFO[moment.better.lesson].title;
  return (
    <article data-card aria-label={`What if: ${moment.title}`} className="rounded-3xl bg-card p-5 ring-1 ring-goal/40 shadow-xl shadow-black/20">
      <div className="flex items-center gap-2 text-xs font-semibold text-goal">
        <Wand2 className="size-4" aria-hidden /> What if? · {moment.day} {monthShort}
      </div>
      <h2 className="mt-1 text-xl font-bold leading-tight text-balance">{moment.title}</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground text-pretty">{moment.body}</p>

      {picked ? (
        <div data-outcome className="mt-4 rounded-2xl bg-white/[0.04] p-4">
          {picked === "better" ? (
            <>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-money">
                <Sparkle className="size-4" aria-hidden /> {moment.better.label}
              </div>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">{moment.better.outcome}</p>
              <p className="num mt-2 text-sm font-semibold text-money">+{inr(moment.better.saves)} kept by What-if you</p>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold">Same as real: {moment.realLabel.toLowerCase()}</div>
              <p className="mt-1 text-sm text-muted-foreground">Your twin does exactly what you did.</p>
            </>
          )}
        </div>
      ) : (
        <div className="mt-5 grid gap-2" role="group" aria-label="What would your twin do?">
          <button
            type="button"
            onClick={() => onPick("better")}
            aria-label={`${moment.better.label}: keeps ${inr(moment.better.saves)}. Skill: ${skill}`}
            className="flex min-h-14 items-center gap-3 rounded-2xl bg-money/10 px-4 py-3 text-left ring-1 ring-money/50 transition hover:bg-money/15 active:scale-[0.98]"
          >
            <span className="flex-1">
              <span className="block text-[15px] font-semibold">{moment.better.label}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-goal">
                <Lightbulb className="size-3" aria-hidden /> {skill}
              </span>
            </span>
            <span className="num text-sm font-semibold text-money">+{inr(moment.better.saves)}</span>
          </button>
          <button
            type="button"
            onClick={() => onPick("real")}
            aria-label={`Same as real: ${moment.realLabel}`}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-2xl bg-raised px-4 text-left text-[15px] font-semibold ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.98]",
            )}
          >
            <span className="flex-1">
              Same as real
              <span className="block text-[11px] font-medium text-muted-foreground">{moment.realLabel}</span>
            </span>
            <span className="num text-sm text-muted-foreground">₹0</span>
          </button>
        </div>
      )}
    </article>
  );
}
