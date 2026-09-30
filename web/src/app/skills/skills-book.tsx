"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleCheck, Lock, RotateCcw, Sparkle, Trophy } from "lucide-react";
import { LessonCard } from "@/components/lessons/lesson-card";
import { LESSON_INFO, LESSON_ORDER } from "@/game/lessons";
import { resetSkills, useSkills } from "@/game/skills";
import type { LessonId } from "@/game/types";
import { cn } from "@/lib/utils";

const XP_PER_LEVEL = 100;

export function SkillsBook() {
  const book = useSkills();
  const [open, setOpen] = useState<LessonId | null>(null);
  const learnedCount = Object.keys(book.learned).length;
  const level = Math.floor(book.xp / XP_PER_LEVEL) + 1;
  const intoLevel = book.xp % XP_PER_LEVEL;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16">
      <header className="flex items-center gap-2 py-4">
        <Link href="/play/demo" className="grid size-10 place-items-center rounded-full hover:bg-white/5" aria-label="Back to the game">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-lg font-semibold">Money Skills</h1>
      </header>

      <section className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
        <div className="flex items-center gap-4">
          <div className="grid size-16 place-items-center rounded-2xl bg-goal/15 ring-1 ring-goal/40">
            <Trophy className="size-7 text-goal" />
          </div>
          <div className="flex-1">
            <div className="text-sm text-muted-foreground">Level {level}</div>
            <div className="num text-3xl font-bold">{book.xp} XP</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
              <div className="h-full rounded-full bg-goal" style={{ width: `${intoLevel}%` }} />
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {learnedCount} of {LESSON_ORDER.length} skills learned. New skills unlock when something happens to your twin.
        </p>
      </section>

      <ul className="mt-4 space-y-2">
        {LESSON_ORDER.map((id) => {
          const l = LESSON_INFO[id];
          const learned = book.learned[id];
          const isOpen = open === id;
          return (
            <li key={id}>
              <button
                type="button"
                disabled={!learned}
                onClick={() => setOpen(isOpen ? null : id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-3xl p-4 text-left ring-1 transition",
                  learned ? "bg-card ring-white/5 hover:ring-white/15" : "bg-card/50 ring-white/5",
                )}
              >
                <div
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-2xl",
                    learned ? "bg-money/12 text-money" : "bg-white/5 text-muted-foreground",
                  )}
                >
                  {learned ? <CircleCheck className="size-5" /> : <Lock className="size-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={cn("font-semibold", !learned && "text-muted-foreground")}>{l.title}</div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground text-pretty">
                    {learned ? l.takeaway : "Locked. It unlocks when this happens to your twin."}
                  </p>
                  {learned && l.ability && (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-money/10 px-2.5 py-1 text-xs font-medium text-money">
                      <Sparkle className="size-3" /> {l.ability.name}
                    </span>
                  )}
                </div>
                {learned && <RotateCcw className="mt-1 size-4 shrink-0 text-muted-foreground" aria-label="Practise again" />}
              </button>
              {isOpen && (
                <div className="mt-2">
                  <LessonCard id={id} context={book.context} practice onFinish={() => {}} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {learnedCount > 0 && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Reset all skills and XP on this device?")) resetSkills();
          }}
          className="mx-auto mt-8 block text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Reset progress
        </button>
      )}
    </div>
  );
}
