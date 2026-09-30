"use client";

import { useState } from "react";
import { CircleCheck, CircleX, Lightbulb, Sparkle, Zap } from "lucide-react";
import { DEFAULT_CONTEXT, XP_CORRECT, XP_TRIED, lessonFor, type LessonContext, type LessonWidget } from "@/game/lessons";
import type { LessonId } from "@/game/types";
import { cn } from "@/lib/utils";

// A 20–30 second interactive lesson: play with a widget, read one takeaway, answer one question.

function SliderWidget({ w, onDone }: { w: Extract<LessonWidget, { kind: "slider" }>; onDone: () => void }) {
  const [v, setV] = useState(w.initial);
  const [moved, setMoved] = useState(false);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="lesson-slider" className="text-sm text-muted-foreground">
          {w.label}
        </label>
        <span className="num text-lg font-bold text-money">{w.format(v)}</span>
      </div>
      <input
        id="lesson-slider"
        type="range"
        min={w.min}
        max={w.max}
        step={w.step}
        value={v}
        onChange={(e) => {
          setV(Number(e.target.value));
          if (!moved) {
            setMoved(true);
            onDone();
          }
        }}
        className="mt-2 h-8 w-full cursor-pointer accent-money"
      />
      <dl className="mt-3 space-y-2 rounded-2xl bg-white/[0.04] p-3">
        {w.readout(v).map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                "num text-base font-bold",
                row.tone === "bad" ? "text-alert" : row.tone === "good" ? "text-money" : "text-foreground",
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        {w.note ? `${w.note} ` : ""}
        {!moved && "Drag the slider to see what changes."}
      </p>
    </div>
  );
}

function ScenarioWidget({ w, onDone }: { w: Extract<LessonWidget, { kind: "scenario" }>; onDone: () => void }) {
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div>
      <p className="text-[15px] font-medium text-pretty">{w.prompt}</p>
      <div className="mt-3 grid gap-2">
        {w.options.map((o, i) => {
          const chosen = pick === i;
          return (
            <button
              key={o.label}
              type="button"
              disabled={pick !== null && !chosen && w.options[pick].good}
              aria-label={chosen ? `${o.label}. ${o.good ? "Right" : "Not quite"}: ${o.feedback}` : o.label}
              onClick={() => {
                setPick(i);
                if (o.good) onDone();
              }}
              className={cn(
                "rounded-2xl px-4 py-3 text-left text-sm font-medium ring-1 transition disabled:opacity-40",
                chosen ? (o.good ? "bg-money/10 ring-money/50" : "bg-alert/10 ring-alert/50") : "bg-raised ring-white/10 hover:bg-white/10",
              )}
            >
              {o.label}
              {chosen && <span className={cn("mt-1 block text-[13px] font-normal", o.good ? "text-money" : "text-alert")}>{o.feedback}</span>}
            </button>
          );
        })}
      </div>
      {pick !== null && !w.options[pick].good && <p className="mt-2 text-xs text-muted-foreground">Try another option.</p>}
    </div>
  );
}

function SortWidget({ w, onDone }: { w: Extract<LessonWidget, { kind: "sort" }>; onDone: () => void }) {
  const [placed, setPlaced] = useState<Record<number, 0 | 1>>({});
  const [active, setActive] = useState<number | null>(null);
  const [wrong, setWrong] = useState<number | null>(null);

  const drop = (bucket: 0 | 1) => {
    if (active === null) return;
    if (w.items[active].bucket !== bucket) {
      setWrong(active);
      return;
    }
    const next = { ...placed, [active]: bucket };
    setPlaced(next);
    setActive(null);
    setWrong(null);
    if (Object.keys(next).length === w.items.length) onDone();
  };

  return (
    <div>
      <p className="text-sm text-muted-foreground">{w.prompt}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {w.items.map((it, i) =>
          placed[i] !== undefined ? null : (
            <button
              key={it.label}
              type="button"
              aria-pressed={active === i}
              aria-label={`${it.label}${active === i ? ", selected" : ""}`}
              onClick={() => {
                setActive(i);
                setWrong(null);
              }}
              className={cn(
                "h-10 rounded-full px-4 text-sm font-medium ring-1 transition",
                active === i ? "bg-goal/15 ring-goal" : "bg-raised ring-white/10",
                wrong === i && "animate-[shake_0.3s] bg-alert/10 ring-alert",
              )}
            >
              {it.label}
            </button>
          ),
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {w.buckets.map((b, bi) => (
          <button
            key={b}
            type="button"
            aria-label={
              active !== null
                ? `Put ${w.items[active].label} in ${b}`
                : `${b}: ${w.items.filter((_, i) => placed[i] === bi).map((it) => it.label).join(", ") || "empty"}. Select an item first.`
            }
            onClick={() => drop(bi as 0 | 1)}
            className={cn(
              "min-h-24 rounded-2xl border border-dashed p-3 text-left transition",
              active !== null ? "border-white/40 bg-white/[0.06]" : "border-white/15 bg-white/[0.03]",
            )}
          >
            <div className="text-sm font-semibold">{b}</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {w.items.map((it, i) =>
                placed[i] === bi ? (
                  <span key={it.label} className="rounded-full bg-money/10 px-2 py-0.5 text-xs text-money">
                    {it.label}
                  </span>
                ) : null,
              )}
            </div>
          </button>
        ))}
      </div>
      {wrong !== null && <p className="mt-2 text-xs text-alert">Not quite. Think: could you live without it this month?</p>}
    </div>
  );
}

export function LessonCard({
  id,
  context = DEFAULT_CONTEXT,
  onFinish,
  practice = false,
}: {
  id: LessonId;
  context?: LessonContext; // the player's own numbers
  /** Called once the quiz is answered. */
  onFinish: (correct: boolean) => void;
  practice?: boolean; // replay from the skills book: no XP
}) {
  const lesson = lessonFor(id, context);
  const [explored, setExplored] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const correct = answer === lesson.quiz.answer;
  const w = lesson.widget;

  return (
    <article data-card className="rounded-3xl bg-card p-5 ring-1 ring-goal/30">
      <div className="flex items-center gap-2 text-xs font-medium text-goal">
        <Lightbulb className="size-4" aria-hidden /> Money skill
      </div>
      <h2 className="mt-1 text-2xl font-bold leading-tight">{lesson.title}</h2>
      <p className="mt-1 text-[15px] text-muted-foreground text-pretty">{lesson.hook}</p>

      <div className="mt-4">
        {w.kind === "slider" && <SliderWidget w={w} onDone={() => setExplored(true)} />}
        {w.kind === "scenario" && <ScenarioWidget w={w} onDone={() => setExplored(true)} />}
        {w.kind === "sort" && <SortWidget w={w} onDone={() => setExplored(true)} />}
      </div>

      {explored && (
        <div data-reveal className="mt-5 space-y-4">
          <p className="rounded-2xl bg-goal/10 p-3 text-[15px] text-pretty">
            <span className="font-semibold text-goal">Takeaway: </span>
            {lesson.takeaway}
          </p>

          <div>
            <div className="text-sm font-semibold">Quick check</div>
            <p className="mt-1 text-[15px] text-pretty">{lesson.quiz.q}</p>
            <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={lesson.quiz.q}>
              {lesson.quiz.options.map((o, i) => {
                const isAnswer = i === lesson.quiz.answer;
                const show = answer !== null && (i === answer || isAnswer);
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={answer !== null}
                    aria-label={`Answer ${String.fromCharCode(65 + i)}: ${o || "no value"}${show ? (isAnswer ? ", correct" : ", wrong") : ""}`}
                    onClick={() => {
                      setAnswer(i);
                      onFinish(i === lesson.quiz.answer);
                    }}
                    className={cn(
                      "flex min-h-12 items-center gap-2 rounded-2xl px-3 text-left text-sm font-medium ring-1 transition",
                      show && isAnswer && "bg-money/10 ring-money/60 text-money",
                      show && !isAnswer && "bg-alert/10 ring-alert/60 text-alert",
                      !show && "bg-raised ring-white/10 enabled:hover:bg-white/10 disabled:opacity-50",
                    )}
                  >
                    {show && isAnswer && <CircleCheck className="size-4 shrink-0" />}
                    {show && !isAnswer && <CircleX className="size-4 shrink-0" />}
                    <span className="num">{o}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {answer !== null && (
            <div data-reveal className="space-y-3">
              <p className="text-sm text-muted-foreground text-pretty">{lesson.quiz.explain}</p>
              {!practice && (
                <div className="flex items-center gap-2 text-sm font-semibold text-money">
                  <Zap className="size-4" /> +{correct ? XP_CORRECT : XP_TRIED} XP
                </div>
              )}
              {lesson.ability && !practice && (
                <div className="rounded-2xl bg-money/10 p-3 ring-1 ring-money/40">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-money">
                    <Sparkle className="size-4" /> Ability unlocked: {lesson.ability.name}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground text-pretty">{lesson.ability.description}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
