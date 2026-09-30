"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Flame, Lock, PiggyBank, Smile, Sparkle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TwinAvatar } from "@/components/twin/avatar";
import { CountUp } from "@/components/twin/count-up";
import { ENVELOPE_STYLE, EnvelopeBars } from "@/components/twin/envelope-bars";
import { LessonCard } from "@/components/lessons/lesson-card";
import { useCharacter } from "@/game/character";
import {
  DEFAULT_PLAN,
  envelopeOf,
  inr,
  lessonContextFrom,
  planAmounts,
  plannable,
  reportCard,
  simulateMonth,
  suggestPlan,
  walletOf,
  withCarryOver,
  withEmergencySlice,
  type Decisions,
} from "@/game/engine";
import { LESSON_INFO } from "@/game/lessons";
import { getPersona, type DemoMonth } from "@/game/personas";
import { abilitiesOf, learnLesson, saveLessonContext, useSkills } from "@/game/skills";
import type { Ability, Character, Ledger, LessonId, Plan, Stats } from "@/game/types";
import { cn } from "@/lib/utils";
import { ChoiceCard, EventCard, RaidList } from "./event-card";
import { Planner, type PlanSuggestion } from "./planner";
import { ReportCard } from "./report-card";

// Used when someone hits "Play demo" without creating a twin (examiners, the curious).
const GUEST: Character = { type: "student", name: "Aarav", city: "Bengaluru", avatarSeed: "Aarav-hostel", createdAt: "" };

const MAX_LESSONS_PER_MONTH = 3;

const ABILITY_NAME: Record<Ability, string> = {
  "wishlist-24h": "Wishlist for 24h",
  "chai-cap": "Chai cap",
  "cook-nights": "Cook nights",
  "smart-split": "Smart split",
  "save-up-instead": "Save up instead",
  "weekly-pace": "Pace markers",
  "emergency-envelope": "Emergency envelope",
};

/** What a finished month hands to the next one: debt to repay, mood, and how money was really spent. */
interface Carry {
  closingBalance: number; // what was left in the account at the end of last month
  debt: number;
  mood: Pick<Stats, "happiness" | "stress">;
  suggestion: Omit<PlanSuggestion, "plan">;
}

/**
 * Plan → Live (4 weeks: summary, up to 2 events, 1 decision) → Review (report card)
 * → Learn (interactive skill cards) → Play better (next month with new abilities).
 */
type Phase =
  | { kind: "intro" }
  | { kind: "plan" }
  | { kind: "week"; w: number; step: number } // step -1 = summary, 0..n-1 = events, n = decision
  | { kind: "report" }
  | { kind: "learn"; i: number }
  | { kind: "next" };

export function DemoMonth() {
  const stored = useCharacter();
  const skills = useSkills();
  const twin = stored ?? GUEST;

  const [month, setMonth] = useState<DemoMonth>(8);
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [plan, setPlan] = useState<Plan>(DEFAULT_PLAN);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [abilities, setAbilities] = useState<Ability[]>([]); // fixed for the month once the plan is locked
  const [learnQueue, setLearnQueue] = useState<LessonId[]>([]);
  const [finished, setFinished] = useState<Partial<Record<LessonId, boolean>>>({});
  const [carry, setCarry] = useState<Carry | null>(null); // from the previous month, if any

  const persona = useMemo(
    () => (carry ? withCarryOver(getPersona(twin.type, twin.city, month), carry) : getPersona(twin.type, twin.city, month)),
    [twin.type, twin.city, month, carry],
  );
  const startMood = carry?.mood;
  const sim = useMemo(
    () => simulateMonth(persona, twin.type, plan, decisions, abilities, startMood),
    [persona, twin.type, plan, decisions, abilities, startMood],
  );
  const monthDone = sim.weeks.length === 4 && sim.weeks[3].choiceResult !== undefined;
  const report = useMemo(
    () => (monthDone ? reportCard(persona, twin.type, plan, decisions, abilities, startMood) : null),
    [monthDone, persona, twin.type, plan, decisions, abilities, startMood],
  );
  const suggestion = useMemo<PlanSuggestion | undefined>(
    () => (carry ? { ...carry.suggestion, plan: suggestPlan(persona, carry.suggestion) } : undefined),
    [carry, persona],
  );

  const week = phase.kind === "week" ? sim.weeks[phase.w] : undefined;
  const onChoice = phase.kind === "week" && week !== undefined && phase.step === week.events.length;
  const picked = week?.choice ? decisions[week.choice.id] : undefined;

  // What the HUD shows right now.
  const planned = planAmounts(persona, plan);
  let ledger: Ledger = { ...sim.startLedger };
  let stats: Stats = sim.startStats;
  if (phase.kind === "week" && week) {
    ledger = week.ledgerAfterTxns;
    if (phase.step < 0) stats = week.statsAfterTxns;
    else if (phase.step < week.events.length) stats = week.statsAfterEvent[phase.step];
    else if (week.choiceResult) {
      ledger = week.choiceResult.ledger;
      stats = week.choiceResult.stats;
    } else stats = week.statsAfterEvent.at(-1)!;
  } else if (report && (phase.kind === "report" || phase.kind === "learn" || phase.kind === "next")) {
    ledger = report.finalLedger;
    stats = report.finalStats;
  }
  const planning = phase.kind === "intro" || phase.kind === "plan";
  // Before the plan is locked the header shows only what there is to plan with.
  const wallet = planning ? Math.max(0, plannable(persona)) : walletOf(ledger);
  const weekNo = phase.kind === "week" ? phase.w + (phase.step >= 0 ? 1 : 0.5) : ["report", "learn", "next"].includes(phase.kind) ? 4 : 0;

  // At most three skill cards a month (the report's main lesson first); the rest come back later.
  const newLessons = report
    ? [report.lesson, ...report.lessons].filter((l, i, all) => all.indexOf(l) === i && !skills.learned[l]).slice(0, MAX_LESSONS_PER_MONTH)
    : [];
  const monthName = persona.monthLabel.split(" ")[0];

  function startMonth(m: DemoMonth, nextCarry: Carry | null = carry) {
    const unlocked = abilitiesOf(skills);
    setMonth(m);
    setCarry(nextCarry);
    setDecisions({});
    setAbilities(unlocked);
    if (nextCarry) {
      // Suggest a plan from last month's real spending (the planner shows why).
      const p = withCarryOver(getPersona(twin.type, twin.city, m), nextCarry);
      const s = suggestPlan(p, nextCarry.suggestion);
      setPlan(unlocked.includes("emergency-envelope") ? withEmergencySlice(s) : s);
    } else if (unlocked.includes("emergency-envelope")) {
      setPlan(withEmergencySlice(plan));
    }
    setPhase({ kind: "plan" });
    window.scrollTo({ top: 0 });
  }

  /** Money and mood carry into the next month: debt is repaid first, stats continue. */
  function carryFrom(r: NonNullable<typeof report>): Carry {
    return {
      closingBalance: r.finalLedger.savings,
      debt: r.debt,
      mood: { happiness: r.finalStats.happiness, stress: r.finalStats.stress },
      suggestion: { monthName, needsSpent: r.needsSpent, wantsSpent: r.wantsSpent },
    };
  }

  function next() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    switch (phase.kind) {
      case "intro":
        return startMonth(month);
      case "plan":
        setAbilities(abilitiesOf(skills));
        return setPhase({ kind: "week", w: 0, step: -1 });
      case "week": {
        if (!week) return;
        if (phase.step < week.events.length) return setPhase({ ...phase, step: phase.step + 1 });
        if (phase.w < 3) return setPhase({ kind: "week", w: phase.w + 1, step: -1 });
        return setPhase({ kind: "report" });
      }
      case "learn":
        if (phase.i < learnQueue.length - 1) return setPhase({ kind: "learn", i: phase.i + 1 });
        return setPhase({ kind: "next" });
      case "next":
        // After September there's no October yet: play September again, carrying everything over.
        return startMonth(9, report ? carryFrom(report) : carry);
    }
  }

  function startLearning() {
    if (report) saveLessonContext(lessonContextFrom(persona, report));
    if (!newLessons.length) return setPhase({ kind: "next" });
    setLearnQueue(newLessons);
    setFinished({});
    setPhase({ kind: "learn", i: 0 });
    window.scrollTo({ top: 0 });
  }

  // Each step remounts its content with a short CSS slide-in. Content is visible by default, so
  // nothing can get stuck hidden if an animation is interrupted.
  const stepKey = phase.kind === "week" ? `${phase.w}:${phase.step}` : phase.kind === "learn" ? `learn:${phase.i}` : phase.kind;

  if (stored === undefined) return <div className="flex-1" />; // waiting for localStorage on first paint

  // Bottom button
  let label = "Continue";
  let canNext = true;
  if (phase.kind === "intro") label = "Plan your month";
  else if (phase.kind === "plan") label = `Lock in plan · start ${monthName}`;
  else if (phase.kind === "week" && week) {
    if (phase.step === -1) label = "See what happened";
    else if (phase.step === week.events.length - 1) label = "Your call";
    else if (onChoice) {
      canNext = picked !== undefined;
      label = !canNext ? "Make your choice" : phase.w < 3 ? "Next week" : "See report card";
    }
  } else if (phase.kind === "learn") {
    canNext = finished[learnQueue[phase.i]] !== undefined;
    label = !canNext ? "Answer the question" : phase.i < learnQueue.length - 1 ? "Next skill" : "Done";
  } else if (phase.kind === "next") label = month === 8 ? "Plan September" : "Play September again";
  const showBar = phase.kind !== "report";

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4">
      {/* HUD: twin centred, envelopes and mood always visible */}
      <header
        className={cn(
          "top-0 z-10 -mx-4 bg-background/85 px-4 pb-3 pt-3 backdrop-blur-md",
          (phase.kind === "week" || phase.kind === "plan") && "sticky",
        )}
      >
        <div className="flex items-center gap-3">
          <Link href="/" className="grid size-9 place-items-center rounded-full hover:bg-white/5" aria-label="Leave demo">
            <X className="size-5 text-muted-foreground" />
          </Link>
          <div className="flex flex-1 gap-1" aria-label={`${monthName}, week ${Math.ceil(weekNo)} of 4`}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-money transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.max(0, Math.min(1, weekNo - i)) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <Link
            href="/skills"
            className="flex h-9 items-center gap-1.5 rounded-full bg-white/5 px-3 text-xs font-semibold hover:bg-white/10"
            aria-label={`Money Skills book, ${skills.xp} XP`}
          >
            <BookOpen className="size-4 text-goal" />
            <span className="num">{skills.xp} XP</span>
          </Link>
        </div>

        <div className="mt-3 flex items-center justify-center gap-3">
          <TwinAvatar seed={twin.avatarSeed} className="size-14" />
          <div className="min-w-0">
            <div className="truncate text-sm text-muted-foreground">
              {twin.name} · {monthName}
              {phase.kind === "week" && ` · wk ${phase.w + 1}`}
            </div>
            <div className="flex items-baseline gap-2">
              <CountUp value={wallet} className="num text-3xl font-bold leading-none" />
              {ledger.debt > 0 && (
                <span className="num rounded-full bg-alert/15 px-2 py-0.5 text-xs font-semibold text-alert">owe {inr(ledger.debt)}</span>
              )}
            </div>
          </div>
          <div className="ml-auto flex flex-col gap-1 text-xs">
            <span className="flex items-center gap-1 text-happy">
              <Smile className="size-3.5" /> <span className="num font-semibold">{stats.happiness}</span>
            </span>
            <span className="flex items-center gap-1 text-alert">
              <Flame className="size-3.5" /> <span className="num font-semibold">{stats.stress}</span>
            </span>
            <span className="flex items-center gap-1 text-money">
              <PiggyBank className="size-3.5" /> <span className="num font-semibold">{stats.goal}%</span>
            </span>
          </div>
        </div>
        {planning ? (
          <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-white/[0.04] py-3 text-xs text-muted-foreground">
            <Lock className="size-3.5" /> Envelopes fill once you lock in your plan
          </div>
        ) : (
          <EnvelopeBars
            ledger={ledger}
            budget={planned}
            goal={persona.savingsGoal}
            week={phase.kind === "week" ? phase.w + 1 : 0}
            pace={abilities.includes("weekly-pace")}
            className="mt-3"
          />
        )}
      </header>

      <main
        key={stepKey}
        className="flex-1 pb-28 pt-2 animate-in fade-in slide-in-from-right-6 duration-300 motion-reduce:animate-none"
      >
        {phase.kind === "intro" && (
          <div className="space-y-3">
            <article data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
              <div className="text-xs font-medium text-money">Demo month · {persona.title}</div>
              <h1 className="mt-1 text-2xl font-bold leading-tight text-balance">
                {persona.copy.intro.headline.replace("{name}", twin.name)}
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty">{persona.copy.intro.body}</p>
            </article>
            <article data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
              <h2 className="text-lg font-bold">How a month works</h2>
              <ol className="mt-3 space-y-2 text-[15px]">
                {[
                  ["Plan", "Split your money into Needs, Wants and Savings."],
                  ["Live", "Four weeks of real-life spending, one big decision each week."],
                  ["Review", "Your report card compares the plan with what happened."],
                  ["Learn", "Quick skill cards earn XP and unlock abilities for next month."],
                ].map(([t, d], i) => (
                  <li key={t} data-row className="flex gap-3">
                    <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-raised text-xs font-bold">{i + 1}</span>
                    <span>
                      <span className="font-semibold">{t}.</span> <span className="text-muted-foreground">{d}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </article>
            {stored === null && (
              <p className="px-1 text-center text-sm text-muted-foreground">
                Playing as a guest.{" "}
                <Link href="/create" className="text-money underline-offset-4 hover:underline">
                  Create your own twin
                </Link>
              </p>
            )}
          </div>
        )}

        {phase.kind === "plan" && (
          <>
            {abilities.length > 0 && (
              <div data-card className="mb-3 rounded-3xl bg-money/10 p-4 ring-1 ring-money/30">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-money">
                  <Sparkle className="size-4" /> Your skills this month
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {abilities.map((a) => (
                    <span key={a} className="rounded-full bg-white/[0.08] px-3 py-1 text-xs">
                      {ABILITY_NAME[a]}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <Planner
              persona={persona}
              plan={plan}
              onChange={setPlan}
              smart={abilities.includes("smart-split")}
              emergency={abilities.includes("emergency-envelope")}
              suggestion={suggestion}
            />
          </>
        )}

        {phase.kind === "week" && week && phase.step === -1 && (
          <article data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
            <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Week {week.week}</div>
            <h2 className="mt-1 text-3xl font-bold">{week.label}</h2>
            <div className="mt-1 text-sm text-muted-foreground">
              <span className="num font-semibold text-foreground">{inr(week.spent)}</span> spent
              {week.received > 0 && (
                <>
                  {" · "}
                  <span className="num font-semibold text-money">{inr(week.received)}</span> came in
                </>
              )}
            </div>

            {/* Biggest payments first, so they're visible without scrolling. */}
            <div className="mt-4 text-xs text-muted-foreground">
              Biggest of {week.transactions.length} payments
            </div>
            <ul className="mt-1 divide-y divide-white/5" aria-label="Biggest payments this week">
              {[...week.transactions]
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 4)
                .map((t) => {
                  const env = t.type === "CR" ? null : envelopeOf(t);
                  return (
                    <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{t.counterparty}</span>
                      {env && <span className={cn("text-[11px]", ENVELOPE_STYLE[env].text)}>{ENVELOPE_STYLE[env].label}</span>}
                      <span className={cn("num w-20 text-right font-semibold", t.type === "CR" && "text-money")}>
                        {t.type === "CR" ? "+" : "−"}
                        {inr(t.amount)}
                      </span>
                    </li>
                  );
                })}
            </ul>

            {week.autoSaved > 0 && (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <PiggyBank className="size-4 text-money" />
                Auto-save moved {inr(week.autoSaved)} into Savings first.
              </p>
            )}
            {week.raids.length > 0 && (
              <div className="mt-3 rounded-2xl bg-alert/10 p-3 ring-1 ring-alert/20">
                <div className="mb-1.5 text-xs font-medium text-alert">An envelope ran dry, so money moved:</div>
                <RaidList raids={week.raids} />
              </div>
            )}
          </article>
        )}

        {phase.kind === "week" && week && phase.step >= 0 && phase.step < week.events.length && (
          <EventCard key={week.events[phase.step].id} event={week.events[phase.step]} />
        )}

        {onChoice && week?.choice && (
          <ChoiceCard
            choice={week.choice}
            picked={picked}
            before={week.ledgerAfterTxns}
            result={week.choiceResult}
            onPick={(i) => setDecisions((d) => ({ ...d, [week.choice!.id]: i }))}
          />
        )}

        {phase.kind === "report" && report && (
          <ReportCard
            report={report}
            monthName={monthName}
            newLessons={newLessons}
            onLearn={startLearning}
            onReplay={() => startMonth(month)}
          />
        )}

        {phase.kind === "learn" && learnQueue[phase.i] && (
          <div className="space-y-2">
            <div className="px-1 text-xs text-muted-foreground num">
              Skill {phase.i + 1} of {learnQueue.length}
            </div>
            <LessonCard
              key={learnQueue[phase.i]}
              id={learnQueue[phase.i]}
              context={skills.context}
              onFinish={(correct) => {
                learnLesson(learnQueue[phase.i], correct);
                setFinished((f) => ({ ...f, [learnQueue[phase.i]]: correct }));
              }}
            />
          </div>
        )}

        {phase.kind === "next" && (
          <div className="space-y-3">
            <article data-card className="rounded-3xl bg-card p-5 text-center ring-1 ring-white/5">
              <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Play better</div>
              <h2 className="mt-2 text-2xl font-bold text-balance">
                {month === 8 ? "September is coming. New month, new skills." : "Try September again with everything you know."}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground text-pretty">
                {abilitiesOf(skills).length
                  ? "These abilities will be switched on in your next month:"
                  : "Learn skills after a month to unlock abilities."}
              </p>
              <div className="mt-4 grid gap-2 text-left">
                {(Object.keys(skills.learned) as LessonId[])
                  .filter((id) => LESSON_INFO[id].ability)
                  .map((id) => (
                    <div key={id} data-row className="rounded-2xl bg-money/10 p-3 ring-1 ring-money/30">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-money">
                        <Sparkle className="size-4" /> {LESSON_INFO[id].ability!.name}
                      </div>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">{LESSON_INFO[id].ability!.description}</p>
                    </div>
                  ))}
              </div>
            </article>
            <Link
              href="/skills"
              data-card
              className="flex items-center gap-3 rounded-3xl bg-card p-4 ring-1 ring-white/5 hover:ring-white/15"
            >
              <BookOpen className="size-5 text-goal" />
              <span className="flex-1 font-semibold">Open your Money Skills book</span>
              <span className="num text-sm text-muted-foreground">{skills.xp} XP</span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>
          </div>
        )}
      </main>

      {showBar && (
        <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/95 to-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
          <div className="mx-auto max-w-md px-4">
            <Button size="xl" className="w-full" onClick={next} disabled={!canNext}>
              {label} {canNext && <ArrowRight data-icon="inline-end" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
