import { ArrowRight, Lightbulb, Sparkle } from "lucide-react";
import { EventIcon, TONE_TEXT } from "@/components/twin/event-icon";
import { ENVELOPE_STYLE } from "@/components/twin/envelope-bars";
import { LESSON_INFO } from "@/game/lessons";
import { envelopeOf, goalMove, inr } from "@/game/engine";
import type { Choice, GameEvent, Ledger, MoodDelta, Raid, WeekResult } from "@/game/types";
import { cn } from "@/lib/utils";

const TONE_LABEL = { good: "Good news", bad: "Uh oh", neutral: "Life happens" } as const;

export function DeltaChips({ delta }: { delta: MoodDelta }) {
  const entries = Object.entries(delta).filter(([, v]) => v) as ["happiness" | "stress", number][];
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => {
        // For stress, going up is bad; for happiness, going up is good.
        const good = k === "stress" ? v < 0 : v > 0;
        return (
          <span
            key={k}
            data-chip
            className={cn(
              "num rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
              good ? "bg-money/10 text-money ring-money/20" : "bg-alert/10 text-alert ring-alert/20",
            )}
          >
            {k === "happiness" ? "Happiness" : "Stress"} {v > 0 ? "+" : "−"}
            {Math.abs(v)}
          </span>
        );
      })}
    </div>
  );
}

/** "Wants → Needs ₹420": money moved because an envelope ran dry. */
export function RaidList({ raids }: { raids: Raid[] }) {
  if (!raids.length) return null;
  // One row per route (e.g. all the small Needs → Wants top-ups together), in the order they happened.
  const grouped = new Map<string, Raid>();
  for (const r of raids) {
    const key = `${r.from}>${r.to}`;
    const g = grouped.get(key);
    grouped.set(key, g ? { ...g, amount: g.amount + r.amount } : { ...r });
  }
  return (
    <ul className="space-y-1">
      {[...grouped.values()].map((r, i) => (
        <li key={i} className="flex items-center gap-1.5 text-sm text-alert">
          <span className="font-semibold">{r.from === "debt" ? "Borrowed" : ENVELOPE_STYLE[r.from].label}</span>
          <ArrowRight className="size-3.5" aria-hidden />
          <span className="font-semibold">{ENVELOPE_STYLE[r.to].label}</span>
          <span className="num ml-auto font-semibold">{inr(r.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

export function EventCard({ event }: { event: GameEvent }) {
  return (
    <article data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5 shadow-xl shadow-black/20">
      <div className="flex items-start gap-3">
        <EventIcon name={event.icon} tone={event.tone} />
        <div className="min-w-0 flex-1">
          <div className={cn("text-xs font-medium", TONE_TEXT[event.tone])}>{TONE_LABEL[event.tone]}</div>
          <h2 className="mt-0.5 text-xl font-bold leading-tight text-balance">{event.title}</h2>
        </div>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty">{event.body}</p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <DeltaChips delta={event.delta} />
        {event.amount !== undefined && (
          <span className={cn("num shrink-0 text-2xl font-bold", TONE_TEXT[event.tone])}>{inr(event.amount)}</span>
        )}
      </div>
      {event.lesson && (
        <div data-chip className="mt-4 flex items-center gap-2 rounded-2xl bg-white/[0.04] px-3 py-2 text-sm">
          <Lightbulb className="size-4 shrink-0 text-goal" aria-hidden />
          <span className="text-muted-foreground">
            Skill to learn: <span className="text-foreground">{LESSON_INFO[event.lesson].title}</span>
          </span>
        </div>
      )}
    </article>
  );
}

export function ChoiceCard({
  choice,
  picked,
  before,
  result,
  onPick,
}: {
  choice: Choice;
  picked: number | undefined;
  before: Ledger; // envelopes when the decision is shown (what the header shows)
  result: WeekResult["choiceResult"];
  onPick: (i: number) => void;
}) {
  const outcome = picked === undefined ? undefined : choice.options[picked];
  const nothingMoved = !!outcome?.toGoal && !!result && result.toSavings + result.repaid === 0;
  const envFor = (o: Choice["options"][number]) =>
    o.spend
      ? choice.tags?.includes("emergency") && before.emergency > 0
        ? "emergency"
        : envelopeOf({ ...o.spend, channel: "UPI", type: "DR" })
      : null;
  return (
    <article data-card className="rounded-3xl bg-card p-5 ring-1 ring-goal/30 shadow-xl shadow-black/20">
      <div className="flex items-start gap-3">
        <EventIcon name={choice.icon} tone="neutral" className="bg-goal/12 ring-goal/25 [&_svg]:text-goal" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-goal">Your call</div>
          <h2 className="mt-0.5 text-xl font-bold leading-tight text-balance">{choice.title}</h2>
        </div>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty">{choice.body}</p>

      {outcome && result ? (
        <div data-outcome className="mt-4 space-y-3 rounded-2xl bg-white/[0.04] p-4">
          <div className="text-sm font-semibold">{nothingMoved ? (outcome.emptyLabel ?? outcome.label) : outcome.label}</div>
          <p className="text-sm text-muted-foreground text-pretty">
            {nothingMoved ? (outcome.emptyOutcome ?? outcome.outcome) : outcome.outcome}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {outcome.spend && (
              <span className="num rounded-full bg-alert/10 px-2.5 py-1 text-xs font-semibold text-alert ring-1 ring-alert/20">
                −{inr(outcome.spend.amount)} from {ENVELOPE_STYLE[envFor(outcome)!].label}
              </span>
            )}
            {result.toSavings > 0 && (
              <span className="num rounded-full bg-money/10 px-2.5 py-1 text-xs font-semibold text-money ring-1 ring-money/20">
                +{inr(result.toSavings)} Wants → Savings
              </span>
            )}
            {result.repaid > 0 && (
              <span className="num rounded-full bg-money/10 px-2.5 py-1 text-xs font-semibold text-money ring-1 ring-money/20">
                {inr(result.repaid)} paid back what you owed
              </span>
            )}
            <DeltaChips delta={outcome.delta} />
          </div>
          {result.raids.length > 0 && (
            <div className="rounded-xl bg-alert/10 p-3 ring-1 ring-alert/20">
              <div className="mb-1.5 text-xs font-medium text-alert">Not enough in the envelope, so this decision moved:</div>
              <RaidList raids={result.raids} />
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 grid gap-2" role="group" aria-label="Choose one">
          {choice.options.map((o, i) => {
            const g = o.toGoal ? goalMove(before, o.toGoal) : null;
            const saves = g !== null && g.move > 0;
            // With nothing in Wants, "Skip, save it +₹0" would be misleading: it's just "Skip it".
            const label = g && !saves ? (o.emptyLabel ?? o.label) : o.label;
            const cost = o.spend ? `−${inr(o.spend.amount)}` : saves ? `+${inr(g!.move)} saved` : "₹0";
            const env = envFor(o);
            const aria = o.spend
              ? `${label}: spend ${inr(o.spend.amount)} from ${ENVELOPE_STYLE[env!].label}`
              : saves
                ? `${label}: move ${inr(g!.move)} from Wants to Savings`
                : `${label}: costs nothing`;
            return (
              <button
                key={o.label}
                type="button"
                onClick={() => onPick(i)}
                aria-label={o.ability ? `${aria}. New skill.` : aria}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-2xl px-4 text-left text-[15px] font-semibold ring-1 transition active:scale-[0.98]",
                  o.ability ? "bg-money/10 ring-money/50 hover:bg-money/15" : "bg-raised ring-white/10 hover:bg-white/10",
                )}
              >
                <span className="flex-1">
                  {label}
                  {o.ability && (
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-money">
                      <Sparkle className="size-3" /> New skill
                    </span>
                  )}
                </span>
                <span className={cn("num text-sm", o.spend ? "text-muted-foreground" : "text-money")}>{cost}</span>
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}
