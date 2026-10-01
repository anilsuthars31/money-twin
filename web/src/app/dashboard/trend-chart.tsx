"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { inr } from "@/game/engine";
import { compact, type DashMonth } from "@/lib/dashboard";

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: DashMonth }[] }) {
  const m = payload?.[0]?.payload;
  if (!active || !m) return null;
  return (
    <div className="rounded-2xl bg-raised px-3 py-2 text-xs shadow-xl ring-1 ring-white/10">
      <div className="font-semibold">{m.label}</div>
      <div className="num mt-1 text-goal">Needs {inr(m.needs)}</div>
      <div className="num text-happy">Wants {inr(m.wants)}</div>
      <div className="num mt-1 text-muted-foreground">Came in {inr(m.cameIn)}</div>
    </div>
  );
}

/** Spending per month, needs stacked under wants. Tap a month to see it. */
export function TrendChart({ months, selected, onSelect }: { months: DashMonth[]; selected: string; onSelect: (key: string) => void }) {
  const dim = (key: string) => (key === selected ? 1 : 0.35);
  return (
    <div className="h-44 w-full" role="img" aria-label={`Spending per month: ${months.map((m) => `${m.label} ${inr(m.spent)}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={months} margin={{ top: 8, right: 4, bottom: 0, left: -12 }} barCategoryGap="28%">
          <XAxis dataKey="short" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <YAxis
            tickFormatter={compact}
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="needs" stackId="spent" fill="var(--goal)" onClick={(d) => onSelect((d as unknown as DashMonth).key)} className="cursor-pointer">
            {months.map((m) => (
              <Cell key={m.key} fillOpacity={dim(m.key)} />
            ))}
          </Bar>
          <Bar
            dataKey="wants"
            stackId="spent"
            fill="var(--happy)"
            radius={[8, 8, 0, 0]}
            onClick={(d) => onSelect((d as unknown as DashMonth).key)}
            className="cursor-pointer"
          >
            {months.map((m) => (
              <Cell key={m.key} fillOpacity={dim(m.key)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
