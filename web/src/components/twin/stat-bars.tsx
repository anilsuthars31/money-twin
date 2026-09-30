"use client";

import { Flame, PiggyBank, Smile, Target, type LucideIcon } from "lucide-react";
import type { StatKey, Stats } from "@/game/types";
import { cn } from "@/lib/utils";
import { CountUp } from "./count-up";
import { Bar } from "./envelope-bars";

const META: Record<StatKey, { label: string; icon: LucideIcon; bar: string; text: string }> = {
  savings: { label: "Savings", icon: PiggyBank, bar: "bg-money", text: "text-money" },
  happiness: { label: "Happiness", icon: Smile, bar: "bg-happy", text: "text-happy" },
  stress: { label: "Stress", icon: Flame, bar: "bg-alert", text: "text-alert" },
  goal: { label: "Goal", icon: Target, bar: "bg-goal", text: "text-goal" },
};

const ORDER: StatKey[] = ["savings", "happiness", "stress", "goal"];

export function StatBars({ stats, className }: { stats: Stats; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-5 gap-y-3", className)}>
      {ORDER.map((k) => {
        const { label, icon: Icon, bar, text } = META[k];
        return (
          <div key={k} className="flex items-center gap-2.5">
            <Icon className={cn("size-4 shrink-0", text)} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <CountUp from={0} value={stats[k]} rupees={false} className={cn("num font-semibold", text)} />
              </div>
              <Bar fill={stats[k] / 100} className={bar} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
