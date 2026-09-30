"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Flame, Lock, PiggyBank, Smile, Upload, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { TwinAvatar } from "@/components/twin/avatar";
import { CountUp } from "@/components/twin/count-up";
import { ENVELOPE_STYLE, EnvelopeBars } from "@/components/twin/envelope-bars";
import { LessonCard } from "@/components/lessons/lesson-card";
import { useCharacter } from "@/game/character";
import { DEFAULT_PLAN, inr, withEmergencySlice } from "@/game/engine";
import { walletOf } from "@/game/ledger";
import { buildRealMonth, flowOf, nameOf, type FriendMode, type RealMonth, type RealTxn } from "@/game/replay/real-month";
import { plannableOf, replayPlanAmounts, replayReport, simulateReplay } from "@/game/replay/replay";
import { moodBefore, saveMonthResult, useReplayProgress } from "@/game/replay-progress";
import { abilitiesOf, learnLesson, saveLessonContext, useSkills } from "@/game/skills";
import type { Character, Ledger, LessonId, Plan, Stats } from "@/game/types";
import { cn } from "@/lib/utils";
import { EventCard, RaidList } from "../play/demo/event-card";
import { MonthList, type MonthSummary } from "./month-list";
import { ReplayPlanner } from "./replay-planner";
import { ReplayReport } from "./replay-report";

// "Replay your real past": pick a month you have saved → plan it → live its real weeks (events from
// the rules library) → report card → skills from your real habits. The grade, and how the twin
// felt, are saved and carry into the next month.

const GUEST: Character = { type: "student", name: "Your twin", city: "", avatarSeed: "replay-guest", createdAt: "" };
const MAX_LESSONS_PER_MONTH = 3;

type Phase =
  | { kind: "pick" }
  | { kind: "plan" }
  | { kind: "week"; w: number; step: number } // step -1 = summary, 0..n-1 = events
  | { kind: "report" }
  | { kind: "learn"; i: number };

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; months: MonthSummary[] };

interface Override {
  key: string;
  nickname?: string;
  friendMode?: FriendMode;
}

/** The month's first and last instant in India time, for the transactions query. */
function monthRangeIst(key: string) {
  const [y, m] = key.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const from = new Date(`${key}-01T00:00:00+05:30`);
  const to = new Date(new Date(`${next}-01T00:00:00+05:30`).getTime() - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 401 ? "signed-out" : `Couldn't load (${res.status})`);
  return (await res.json()) as T;
}

export function ReplayApp() {
  const stored = useCharacter();
  const skills = useSkills();
  const progress = useReplayProgress();
  const twin = stored ?? GUEST;

  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [month, setMonth] = useState<RealMonth | null>(null);
  const [opening, setOpening] = useState<string | null>(null); // month being fetched
  const [plan, setPlan] = useState<Plan>(DEFAULT_PLAN);
  const [startMood, setStartMood] = useState<Pick<Stats, "happiness" | "stress"> | undefined>();
  const [learnQueue, setLearnQueue] = useState<LessonId[]>([]);
  const [finished, setFinished] = useState<Partial<Record<LessonId, boolean>>>({});
  const labels = useRef<{ nicknames: Record<string, string>; friendModes: Record<string, FriendMode> } | null>(null);
  const savedFor = useRef<string | null>(null); // the plan whose result has been saved

  const fetchMonths = useCallback(
    () =>
      getJson<{ months: MonthSummary[] }>("/api/months")
        .then(({ months }) => setLoad({ state: "ready", months }))
        .catch((e: Error) => setLoad({ state: "error", message: e.message })),
    [],
  );
  useEffect(() => {
    void fetchMonths();
  }, [fetchMonths]);
  const loadMonths = () => {
    setLoad({ state: "loading" });
    void fetchMonths();
  };

  const abilities = abilitiesOf(skills);
  const emergency = abilities.includes("emergency-envelope");

  const sim = useMemo(() => (month ? simulateReplay(month, plan, twin.type, startMood) : null), [month, plan, twin.type, startMood]);
  const report = useMemo(() => (sim && (phase.kind === "report" || phase.kind === "learn") ? replayReport(sim) : null), [sim, phase.kind]);

  // Save the result once the report card is reached (replaying with a new plan replaces it).
  useEffect(() => {
    if (!report || !month) return;
    const id = `${month.key}:${JSON.stringify(plan)}`;
    if (savedFor.current === id) return;
    savedFor.current = id;
    saveMonthResult(month.key, {
      grade: report.grade,
      score: report.score,
      savingsKept: Math.round(report.savingsKept),
      stats: report.finalStats,
      plan,
    });
  }, [report, month, plan]);

  async function openMonth(key: string) {
    setOpening(key);
    try {
      if (!labels.current) {
        const { overrides } = await getJson<{ overrides: Override[] }>("/api/overrides");
        labels.current = { nicknames: {}, friendModes: {} };
        for (const o of overrides) {
          if (o.nickname) labels.current.nicknames[o.key] = o.nickname;
          if (o.friendMode) labels.current.friendModes[o.key] = o.friendMode;
        }
      }
      const { from, to } = monthRangeIst(key);
      const { transactions } = await getJson<{ transactions: RealTxn[] }>(
        `/api/transactions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=5000`,
      );
      const m = buildRealMonth(key, transactions, labels.current.nicknames, labels.current.friendModes);
      setMonth(m);
      setStartMood(moodBefore(progress, key));
      const previous = progress.months[key]?.plan;
      setPlan(previous ?? (emergency ? withEmergencySlice(DEFAULT_PLAN) : DEFAULT_PLAN));
      savedFor.current = null;
      setPhase({ kind: "plan" });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setLoad({ state: "error", message: (e as Error).message });
    } finally {
      setOpening(null);
    }
  }

  const newLessons = report
    ? [report.lesson, ...report.lessons].filter((l, i, all) => all.indexOf(l) === i && !skills.learned[l]).slice(0, MAX_LESSONS_PER_MONTH)
    : [];

  function startLearning() {
    if (!report) return;
    saveLessonContext(report.lessonContext);
    if (!newLessons.length) return backToMonths();
    setLearnQueue(newLessons);
    setFinished({});
    setPhase({ kind: "learn", i: 0 });
    window.scrollTo({ top: 0 });
  }

  function backToMonths() {
    setPhase({ kind: "pick" });
    setMonth(null);
    window.scrollTo({ top: 0 });
  }

  const week = phase.kind === "week" && sim ? sim.weeks[phase.w] : undefined;

  function next() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!sim) return;
    if (phase.kind === "plan") return setPhase({ kind: "week", w: 0, step: -1 });
    if (phase.kind === "week" && week) {
      if (phase.step < week.events.length - 1) return setPhase({ ...phase, step: phase.step + 1 });
      if (phase.w < sim.weeks.length - 1) return setPhase({ kind: "week", w: phase.w + 1, step: -1 });
      return setPhase({ kind: "report" });
    }
    if (phase.kind === "learn") {
      if (phase.i < learnQueue.length - 1) return setPhase({ kind: "learn", i: phase.i + 1 });
      return backToMonths();
    }
  }

  if (stored === undefined) return <div className="flex-1" />; // waiting for localStorage on first paint

  // ---------------------------------------------------------------- the month picker
  if (phase.kind === "pick" || !month || !sim) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-10">
        <header className="flex items-center gap-3 py-4">
          <Link href="/" className="grid size-9 place-items-center rounded-full hover:bg-white/5" aria-label="Home">
            <ArrowLeft className="size-5 text-muted-foreground" />
          </Link>
          <TwinAvatar seed={twin.avatarSeed} className="size-10" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{twin.name}</div>
            {twin.city && <div className="truncate text-xs text-muted-foreground">{twin.city}</div>}
          </div>
          <Link
            href="/skills"
            className="flex h-9 items-center gap-1.5 rounded-full bg-white/5 px-3 text-xs font-semibold hover:bg-white/10"
            aria-label={`Money Skills book, ${skills.xp} XP`}
          >
            <BookOpen className="size-4 text-goal" />
            <span className="num">{skills.xp} XP</span>
          </Link>
        </header>

        {load.state === "loading" && (
          <div className="space-y-2" aria-busy="true" aria-label="Loading your months">
            <div className="h-32 animate-pulse rounded-3xl bg-card" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-3xl bg-card/70" />
            ))}
          </div>
        )}

        {load.state === "error" && (
          <section className="rounded-3xl bg-alert/10 p-5 ring-1 ring-alert/30">
            {load.message === "signed-out" ? (
              <>
                <h1 className="text-xl font-bold">Your session ended</h1>
                <p className="mt-1 text-sm text-muted-foreground">Sign in again to replay your saved months.</p>
                <Link href="/account?callbackUrl=%2Freplay" className={cn(buttonVariants({ size: "lg" }), "mt-4")}>
                  Sign in
                </Link>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold">Couldn&apos;t load your months</h1>
                <p className="mt-1 text-sm text-muted-foreground">{load.message}. Check your connection and try again.</p>
                <Button size="lg" className="mt-4" onClick={loadMonths}>
                  Try again
                </Button>
              </>
            )}
          </section>
        )}

        {load.state === "ready" && load.months.length === 0 && (
          <section className="rounded-3xl bg-card p-6 text-center ring-1 ring-white/5">
            <h1 className="text-2xl font-bold text-balance">No real months yet</h1>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">
              Add your Kotak statement and each month becomes a chapter your twin can replay. The file is read on your device and
              never uploaded.
            </p>
            <Link href="/upload" className={cn(buttonVariants({ size: "xl" }), "mt-5 w-full")}>
              <Upload data-icon="inline-start" /> Add a statement
            </Link>
            <Link href="/play/demo" className="mt-3 block text-sm text-money underline-offset-4 hover:underline">
              Play the demo month instead
            </Link>
          </section>
        )}

        {load.state === "ready" && load.months.length > 0 && (
          <div className={cn(opening && "pointer-events-none opacity-60 transition-opacity")} aria-busy={!!opening}>
            <MonthList months={load.months} progress={progress} onPick={openMonth} />
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- playing a month
  const money = sim.money;
  const planned = replayPlanAmounts(money, plan);
  let ledger: Ledger = sim.startLedger;
  let stats: Stats = sim.startStats;
  if (phase.kind === "week" && week) {
    ledger = week.ledgerAfterTxns;
    stats = phase.step < 0 ? week.statsAfterTxns : week.statsAfterEvent[phase.step];
  } else if (report) {
    ledger = report.finalLedger;
    stats = report.finalStats;
  }
  const planning = phase.kind === "plan";
  const wallet = planning ? plannableOf(money) : walletOf(ledger);
  const weekCount = sim.weeks.length;
  const weekNo = phase.kind === "week" ? phase.w + (phase.step >= 0 ? 1 : 0.5) : planning ? 0 : weekCount;
  const monthName = month.label.split(" ")[0];
  const stepKey = phase.kind === "week" ? `${phase.w}:${phase.step}` : phase.kind === "learn" ? `learn:${phase.i}` : phase.kind;

  let label = "Continue";
  let canNext = true;
  if (planning) label = `Lock in plan · replay ${monthName}`;
  else if (phase.kind === "week" && week) {
    if (phase.step === -1) label = "See what happened";
    else if (phase.step === week.events.length - 1) label = phase.w < weekCount - 1 ? "Next week" : "See report card";
  } else if (phase.kind === "learn") {
    canNext = finished[learnQueue[phase.i]] !== undefined;
    label = !canNext ? "Answer the question" : phase.i < learnQueue.length - 1 ? "Next skill" : "Back to your months";
  }
  const showBar = phase.kind !== "report";

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4">
      <header className={cn("top-0 z-10 -mx-4 bg-background/85 px-4 pb-3 pt-3 backdrop-blur-md", (phase.kind === "week" || planning) && "sticky")}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={backToMonths}
            className="grid size-9 place-items-center rounded-full hover:bg-white/5"
            aria-label="Back to your months"
          >
            <X className="size-5 text-muted-foreground" />
          </button>
          <div className="flex flex-1 gap-1" aria-label={`${monthName}, week ${Math.ceil(weekNo)} of ${weekCount}`}>
            {sim.weeks.map((_, i) => (
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
              {twin.name} · {month.label}
              {phase.kind === "week" && ` · wk ${phase.w + 1}`}
            </div>
            <div className="flex items-baseline gap-2">
              <CountUp value={wallet} className="num text-3xl font-bold leading-none" />
              {ledger.debt > 0 && (
                <span className="num rounded-full bg-alert/15 px-2 py-0.5 text-xs font-semibold text-alert">short {inr(ledger.debt)}</span>
              )}
            </div>
          </div>
          <div className="ml-auto flex flex-col gap-1 text-xs">
            <span className="flex items-center gap-1 text-happy" aria-label={`Happiness ${stats.happiness}`}>
              <Smile className="size-3.5" /> <span className="num font-semibold">{stats.happiness}</span>
            </span>
            <span className="flex items-center gap-1 text-alert" aria-label={`Stress ${stats.stress}`}>
              <Flame className="size-3.5" /> <span className="num font-semibold">{stats.stress}</span>
            </span>
            <span className="flex items-center gap-1 text-money" aria-label={`Goal ${stats.goal}%`}>
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
            goal={sim.goal}
            week={phase.kind === "week" ? phase.w + 1 : 0}
            pace={abilities.includes("weekly-pace")}
            className="mt-3"
          />
        )}
      </header>

      <main key={stepKey} className="flex-1 pb-28 pt-2 animate-in fade-in slide-in-from-right-6 duration-300 motion-reduce:animate-none">
        {planning && (
          <>
            {startMood && (
              <p className="mb-3 px-1 text-sm text-muted-foreground">
                {twin.name} starts {monthName} feeling how last month ended: happiness{" "}
                <span className="num text-foreground">{startMood.happiness}</span>, stress{" "}
                <span className="num text-foreground">{startMood.stress}</span>.
              </p>
            )}
            <ReplayPlanner month={month} money={money} plan={plan} onChange={setPlan} emergency={emergency} />
          </>
        )}

        {phase.kind === "week" && week && phase.step === -1 && (
          <article data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
            <div className="text-xs font-medium text-muted-foreground">Week {week.week}</div>
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

            {week.txns.length > 0 ? (
              <>
                <div className="mt-4 text-xs text-muted-foreground">
                  Biggest of {week.txns.length} {week.txns.length === 1 ? "payment" : "payments"}
                </div>
                <ul className="mt-1 divide-y divide-white/5" aria-label="Biggest payments this week">
                  {[...week.txns]
                    .filter((t) => flowOf(t) !== "ignore")
                    .sort((a, b) => b.amount - a.amount)
                    .slice(0, 4)
                    .map((t) => {
                      const f = flowOf(t);
                      const env = f === "need" ? "needs" : f === "want" || f === "lent" ? "wants" : null;
                      return (
                        <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">{nameOf(month, t.counterparty)}</span>
                          {env && <span className={cn("text-[11px]", ENVELOPE_STYLE[env].text)}>{ENVELOPE_STYLE[env].label}</span>}
                          <span className={cn("num w-20 text-right font-semibold", t.type === "CR" && "text-money")}>
                            {t.type === "CR" ? "+" : "−"}
                            {inr(t.amount)}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No payments this week.</p>
            )}

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

        {phase.kind === "week" && week && phase.step >= 0 && week.events[phase.step] && (
          <div className="space-y-2">
            <div className="num px-1 text-xs text-muted-foreground">
              Week {week.week} · {phase.step + 1} of {week.events.length}
            </div>
            <EventCard key={week.events[phase.step].id} event={week.events[phase.step]} />
          </div>
        )}

        {phase.kind === "report" && report && (
          <ReplayReport
            report={report}
            newLessons={newLessons}
            onLearn={startLearning}
            onReplay={() => {
              setPhase({ kind: "plan" });
              window.scrollTo({ top: 0 });
            }}
            onMonths={backToMonths}
          />
        )}

        {phase.kind === "learn" && learnQueue[phase.i] && (
          <div className="space-y-2">
            <div className="num px-1 text-xs text-muted-foreground">
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
