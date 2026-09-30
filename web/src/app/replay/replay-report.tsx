import { ArrowRight, CalendarDays, HandCoins, Lightbulb, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/twin/count-up";
import { ENVELOPE_STYLE } from "@/components/twin/envelope-bars";
import { inr } from "@/game/engine";
import { LESSON_INFO } from "@/game/lessons";
import type { ReplayReport as Report } from "@/game/replay/replay";
import type { LessonId } from "@/game/types";
import { cn } from "@/lib/utils";
import { EnvelopeRow, GRADE_STYLE } from "../play/demo/report-card";

const CATEGORY_ROWS = 6;

export function ReplayReport({
  report,
  newLessons,
  onLearn,
  onReplay,
  onMonths,
}: {
  report: Report;
  newLessons: LessonId[];
  onLearn: () => void;
  onReplay: () => void;
  onMonths: () => void;
}) {
  const monthName = report.monthLabel.split(" ")[0];
  const cats = report.categories.slice(0, CATEGORY_ROWS);
  const rest = report.categories.slice(CATEGORY_ROWS);
  const maxCat = cats[0]?.amount ?? 1;
  const { friends, owedToYou, youOwe } = report.friends;

  return (
    <div className="space-y-3">
      <section data-card className="rounded-3xl bg-card p-5 text-center ring-1 ring-white/5">
        <div className="text-xs font-medium text-muted-foreground">{report.monthLabel} report card</div>
        <div
          data-grade
          aria-label={`Grade ${report.grade}`}
          className={cn("mx-auto mt-4 grid size-24 place-items-center rounded-full font-display text-6xl font-bold ring-2", GRADE_STYLE[report.grade])}
        >
          {report.grade}
        </div>
        <div className="num mt-2 text-sm text-muted-foreground">{report.score}/100</div>
        <h2 className="mt-2 text-2xl font-bold text-balance">{report.headline}</h2>
        <div className="mt-5 grid grid-cols-3 divide-x divide-white/5 rounded-2xl bg-white/[0.03] py-3">
          <div>
            <div className="text-[11px] text-muted-foreground">Came in</div>
            <CountUp from={0} value={report.income + report.extra} className="num text-lg font-bold text-money" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Spent</div>
            <CountUp from={0} value={report.spent} className="num text-lg font-bold text-foreground" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">{report.debt > 0 ? "Short" : "Kept"}</div>
            <CountUp
              from={0}
              value={report.debt > 0 ? report.debt : Math.max(0, report.savingsKept)}
              className={cn("num text-lg font-bold", report.debt > 0 ? "text-alert" : "text-money")}
            />
          </div>
        </div>
      </section>

      <section data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
        <h3 className="text-lg font-bold">Your plan vs what really happened</h3>
        <p className="mb-3 mt-1 text-sm text-muted-foreground text-pretty">
          The white line is your plan. Amber means the real month went past it; for Savings, past it is good.
          {report.swept > 0 && ` ${inr(report.swept)} left unspent was moved into Savings.`}
        </p>
        <div className="space-y-2">
          {report.envelopes.map((e) => (
            <EnvelopeRow key={e.env} e={e} />
          ))}
        </div>
      </section>

      <section data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
        <h3 className="text-lg font-bold">Where {monthName}&apos;s money went</h3>
        <ul className="mt-4 space-y-3" aria-label="Spending by category">
          {cats.map((c) => (
            <li key={`${c.category}|${c.envelope}`}>
              <div className="flex items-baseline gap-2 text-sm">
                <span className="min-w-0 truncate">{c.category}</span>
                <span className={cn("text-[11px]", ENVELOPE_STYLE[c.envelope].text)}>{ENVELOPE_STYLE[c.envelope].label}</span>
                <span className="num ml-auto font-semibold">{inr(c.amount)}</span>
                <span className="num w-9 text-right text-xs text-muted-foreground">{c.share}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/5">
                <div className={cn("h-full rounded-full", ENVELOPE_STYLE[c.envelope].bar)} style={{ width: `${(c.amount / maxCat) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
        {rest.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Plus {rest.length} smaller {rest.length === 1 ? "category" : "categories"}, {inr(rest.reduce((s, c) => s + c.amount, 0))} in all.
          </p>
        )}
      </section>

      {friends.length > 0 && (
        <section data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <HandCoins className="size-5 text-happy" aria-hidden /> Friends this month
          </h3>
          <ul className="mt-3 space-y-2">
            {friends.slice(0, 5).map((f) => (
              <li key={f.key} className="flex items-center justify-between text-sm">
                <span className="truncate">{f.name}</span>
                <span className={cn("num font-semibold", f.net > 0 ? "text-happy" : "text-muted-foreground")}>
                  {f.net > 0 ? `owes you ${inr(f.net)}` : `paid back ${inr(-f.net)} more`}
                </span>
              </li>
            ))}
          </ul>
          {owedToYou > 0 && (
            <p className="mt-3 text-sm text-muted-foreground text-pretty">
              {inr(owedToYou)} lent this month hasn&apos;t come back yet.{youOwe > 0 && ` ${inr(youOwe)} came back from earlier loans.`}
            </p>
          )}
        </section>
      )}

      <section data-card className="rounded-3xl bg-goal/10 p-5 ring-1 ring-goal/30">
        <div className="flex items-center gap-2 text-sm font-medium text-goal">
          <Lightbulb className="size-4" aria-hidden />{" "}
          {newLessons.length ? `${newLessons.length} ${newLessons.length === 1 ? "skill" : "skills"} from your real habits` : "Skills"}
        </div>
        {newLessons.length ? (
          <>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {newLessons.map((l) => (
                <li key={l} className="rounded-full bg-white/[0.08] px-3 py-1 text-sm">
                  {LESSON_INFO[l].title}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground text-pretty">Each one uses your own numbers from {monthName}.</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">You&apos;ve already learned everything this month taught.</p>
        )}
        <Button size="xl" className="mt-4 w-full" onClick={onLearn}>
          {newLessons.length ? "Learn" : "Back to your months"} <ArrowRight data-icon="inline-end" />
        </Button>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" size="lg" className="h-12 rounded-2xl text-base" onClick={onReplay}>
          <RotateCcw data-icon="inline-start" /> New plan
        </Button>
        <Button variant="ghost" size="lg" className="h-12 rounded-2xl text-base" onClick={onMonths}>
          <CalendarDays data-icon="inline-start" /> All months
        </Button>
      </div>
    </div>
  );
}
