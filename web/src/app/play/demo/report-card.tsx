import Link from "next/link";
import { ArrowRight, Lightbulb, RotateCcw, ShieldCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CountUp } from "@/components/twin/count-up";
import { ENVELOPE_STYLE } from "@/components/twin/envelope-bars";
import { LESSON_INFO } from "@/game/lessons";
import { inr, type EnvelopeReview, type Grade, type ReportCard as Report } from "@/game/engine";
import type { LessonId } from "@/game/types";
import { cn } from "@/lib/utils";

const GRADE_STYLE: Record<Grade, string> = {
  A: "text-money ring-money/50 bg-money/10",
  B: "text-goal ring-goal/50 bg-goal/10",
  C: "text-happy ring-happy/50 bg-happy/10",
  D: "text-alert ring-alert/50 bg-alert/10",
};

/** Planned vs actual for one envelope. Overspending shows as an amber overflow past the plan line. */
function EnvelopeRow({ e }: { e: EnvelopeReview }) {
  const s = ENVELOPE_STYLE[e.env];
  const isSavings = e.env === "savings";
  const scale = Math.max(e.budget, Math.abs(e.actual), 1);
  const within = Math.min(Math.max(e.actual, 0), e.budget) / scale;
  const over = Math.max(0, e.actual - e.budget) / scale;
  const planLine = e.budget / scale;
  return (
    <div className="rounded-2xl bg-white/[0.03] p-3">
      <div className="flex items-center gap-2">
        <span className={cn("font-semibold", s.text)}>{s.label}</span>
        <span className={cn("ml-auto grid size-7 place-items-center rounded-full text-sm font-bold ring-1", GRADE_STYLE[e.grade])}>
          {e.grade}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 text-sm">
        <div>
          <div className="text-[11px] text-muted-foreground">Planned</div>
          <div className="num font-semibold">
            {inr(e.planned)}
            {e.budget > e.planned && <span className="text-xs text-muted-foreground"> +{inr(e.budget - e.planned)} extra</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground">{isSavings ? "Kept" : e.env === "emergency" ? "Used" : "Spent"}</div>
          <div className={cn("num font-semibold", e.grade === "D" || e.actual < 0 ? "text-alert" : "")}>{inr(e.actual)}</div>
        </div>
      </div>
      <div className="relative mt-2 flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div data-split className={cn("h-full origin-left", s.bar)} style={{ width: `${within * 100}%` }} />
        {over > 0 && <div data-split className="h-full origin-left bg-alert" style={{ width: `${over * 100}%` }} />}
        <div className="absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `calc(${planLine * 100}% - 1px)` }} />
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground text-pretty">{e.verdict}</p>
    </div>
  );
}

export function ReportCard({
  report,
  monthName,
  newLessons,
  onLearn,
  onReplay,
}: {
  report: Report;
  monthName: string;
  newLessons: LessonId[];
  onLearn: () => void;
  onReplay: () => void;
}) {
  const topCats = report.categories.slice(0, 4);
  const maxCat = topCats[0]?.amount ?? 1;

  return (
    <div className="space-y-3">
      <section data-card className="rounded-3xl bg-card p-5 text-center ring-1 ring-white/5">
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{monthName} report card</div>
        <div
          data-grade
          className={cn("mx-auto mt-4 grid size-24 place-items-center rounded-full font-display text-6xl font-bold ring-2", GRADE_STYLE[report.grade])}
        >
          {report.grade}
        </div>
        <div className="num mt-2 text-sm text-muted-foreground">{report.score}/100</div>
        <h2 className="mt-2 text-2xl font-bold text-balance">{report.headline}</h2>
        <div className="mt-5 grid grid-cols-3 divide-x divide-white/5 rounded-2xl bg-white/[0.03] py-3">
          <div>
            <div className="text-[11px] text-muted-foreground">Money in</div>
            <CountUp from={0} value={report.received} className="num text-lg font-bold text-money" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Spent</div>
            <CountUp from={0} value={report.spent} className="num text-lg font-bold text-foreground" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">{report.debt > 0 ? "Owed" : "Saved"}</div>
            <CountUp
              from={0}
              value={report.debt > 0 ? report.debt : report.savingsKept}
              className={cn("num text-lg font-bold", report.debt > 0 ? "text-alert" : "text-money")}
            />
          </div>
        </div>
      </section>

      <section data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
        <h3 className="text-lg font-bold">Plan vs actual</h3>
        <p className="mb-3 mt-1 text-sm text-muted-foreground text-pretty">
          The white line is your plan. Amber means you went past it.
          {report.swept > 0 && ` ${inr(report.swept)} left unspent was moved into Savings.`}
        </p>
        <div className="space-y-2">
          {report.envelopes.map((e) => (
            <EnvelopeRow key={e.env} e={e} />
          ))}
        </div>
      </section>

      <section data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
        <h3 className="text-lg font-bold">Where the money went</h3>
        <div className="mt-4 space-y-3">
          {topCats.map((c) => (
            <div key={c.category}>
              <div className="flex justify-between text-sm">
                <span>{c.category}</span>
                <span className="num font-semibold">{inr(c.amount)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/5">
                <div className="h-full rounded-full bg-white/40" style={{ width: `${(c.amount / maxCat) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-2xl bg-white/[0.04] p-3 text-sm text-muted-foreground text-pretty">
          <span className="num font-semibold text-foreground">{report.micro.count}</span> payments under ₹150 added up to{" "}
          <span className="num font-semibold text-foreground">{inr(report.micro.total)}</span>.
        </p>
      </section>

      <section data-card className="rounded-3xl bg-goal/10 p-5 ring-1 ring-goal/30">
        <div className="flex items-center gap-2 text-sm font-medium text-goal">
          <Lightbulb className="size-4" aria-hidden /> {newLessons.length ? `${newLessons.length} skills to learn` : "Skills"}
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
            <p className="mt-3 text-sm text-muted-foreground text-pretty">
              About 30 seconds each. Earn XP, and some unlock new abilities for next month.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">You&apos;ve already learned everything this month taught.</p>
        )}
        <Button size="xl" className="mt-4 w-full" onClick={onLearn}>
          {newLessons.length ? "Learn" : "Continue"} <ArrowRight data-icon="inline-end" />
        </Button>
      </section>

      <section data-card className="rounded-3xl bg-card p-5 text-center ring-1 ring-money/30">
        <h3 className="text-xl font-bold text-balance">That was a sample month. Want to see yours?</h3>
        <p className="mt-2 text-sm text-muted-foreground text-pretty">
          Add your Kotak statement and your twin lives your real months. The file is read on your device and never uploaded.
        </p>
        <Link href="/upload" className={cn(buttonVariants({ size: "xl" }), "mt-4 w-full")}>
          <ShieldCheck data-icon="inline-start" /> Bring your twin to life
        </Link>
      </section>

      <Button variant="ghost" size="lg" className="h-12 w-full rounded-2xl text-base" onClick={onReplay}>
        <RotateCcw data-icon="inline-start" /> Replay {monthName} with a new plan
      </Button>
    </div>
  );
}
