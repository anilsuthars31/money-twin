"use client";

import { useEffect, useState } from "react";
import { inr } from "@/game/engine";
import type { Envelope, Ledger } from "@/game/types";
import { cn } from "@/lib/utils";
import { CountUp } from "./count-up";

export const ENVELOPE_STYLE: Record<Envelope, { label: string; bar: string; text: string; accent: string }> = {
  needs: { label: "Needs", bar: "bg-goal", text: "text-goal", accent: "accent-goal" },
  wants: { label: "Wants", bar: "bg-happy", text: "text-happy", accent: "accent-happy" },
  savings: { label: "Savings", bar: "bg-money", text: "text-money", accent: "accent-money" },
  emergency: { label: "Emergency", bar: "bg-foreground/70", text: "text-foreground", accent: "accent-foreground" },
};

/** A bar that eases to its new width with a CSS transition (0.7s, never longer). */
export function Bar({ fill, marker, className }: { fill: number; marker?: number; className: string }) {
  // Start empty on first paint, then fill, so bars visibly grow when a screen appears.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const scale = ready ? Math.max(0, Math.min(1, fill)) : 0;
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.07]">
      <div
        className={cn("h-full w-full origin-left rounded-full transition-transform duration-700 ease-out motion-reduce:transition-none", className)}
        style={{ transform: `scaleX(${scale})` }}
      />
      {marker !== undefined && (
        <div
          className="absolute inset-y-0 w-0.5 bg-white/70"
          style={{ left: `${Math.max(0, Math.min(1, marker)) * 100}%` }}
          title="Where you should be this week"
        />
      )}
    </div>
  );
}

/**
 * The envelopes. Needs, Wants and Emergency show what's left of their budget; Savings shows
 * progress toward the goal. With the "Pace markers" ability, a tick shows where you should be.
 */
export function EnvelopeBars({
  ledger,
  budget,
  goal,
  week,
  pace,
  className,
}: {
  ledger: Ledger;
  budget: Record<Envelope, number>;
  goal: number;
  week: number; // 0 before week 1 starts
  pace: boolean;
  className?: string;
}) {
  const paceLeft = 1 - Math.min(4, week) / 4;
  const envs: Envelope[] = budget.emergency > 0 ? ["needs", "wants", "emergency", "savings"] : ["needs", "wants", "savings"];
  return (
    <div className={cn("grid gap-2", envs.length === 4 ? "grid-cols-4" : "grid-cols-3", className)}>
      {envs.map((env) => {
        const s = ENVELOPE_STYLE[env];
        const isSavings = env === "savings";
        const left = isSavings ? ledger.savings : ledger[env];
        const denom = isSavings ? goal : Math.max(budget[env], left, 1);
        return (
          <div key={env} className="min-w-0 rounded-2xl bg-white/[0.04] px-2.5 py-2">
            <div className="truncate text-[11px] text-muted-foreground">{isSavings ? `Goal ${inr(goal)}` : s.label}</div>
            <CountUp
              value={left}
              className={cn("num block truncate font-bold leading-tight", envs.length === 4 ? "text-sm" : "text-base", s.text)}
            />
            <Bar fill={left / denom} marker={pace && !isSavings && week > 0 ? paceLeft : undefined} className={s.bar} />
          </div>
        );
      })}
    </div>
  );
}
