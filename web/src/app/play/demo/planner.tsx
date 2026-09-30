"use client";

import { History, Lightbulb, ReceiptText, Target, TriangleAlert, WandSparkles } from "lucide-react";
import { ENVELOPE_STYLE } from "@/components/twin/envelope-bars";
import { DEFAULT_PLAN, inr, knownBillsTotal, planAmounts, plannable, smartSplit, withEmergencySlice } from "@/game/engine";
import type { Envelope, Persona, Plan } from "@/game/types";
import { cn } from "@/lib/utils";

const HINT: Record<Envelope, string> = {
  needs: "Rent, bills, groceries, travel, everyday food",
  wants: "Delivery, eating out, shopping, trips, fun",
  emergency: "Repairs and surprises come out of here first",
  savings: "Moved in a quarter each week, before you spend",
};

/** Moving one slider rebalances the others (in proportion) so the plan always adds up to 100%. */
export function rebalance(plan: Plan, envs: Envelope[], env: Envelope, value: number): Plan {
  const v = Math.max(0, Math.min(100, value));
  const others = envs.filter((e) => e !== env);
  const oldRest = others.reduce((s, e) => s + plan[e], 0);
  const next: Plan = { ...plan, [env]: v };
  let left = 100 - v;
  others.forEach((e, i) => {
    const share =
      i === others.length - 1
        ? left
        : Math.min(left, Math.round(((oldRest === 0 ? 1 / others.length : plan[e] / oldRest) * (100 - v)) / 5) * 5);
    next[e] = share;
    left -= share;
  });
  return next;
}

export interface PlanSuggestion {
  plan: Plan;
  monthName: string;
  needsSpent: number;
  wantsSpent: number;
}

export function Planner({
  persona,
  plan,
  onChange,
  smart,
  emergency,
  suggestion,
}: {
  persona: Persona;
  plan: Plan;
  onChange: (p: Plan) => void;
  smart: boolean; // "Smart split" ability
  emergency: boolean; // "Emergency envelope" ability
  suggestion?: PlanSuggestion; // from last month's actual spending
}) {
  const envs: Envelope[] = emergency ? ["needs", "wants", "emergency", "savings"] : ["needs", "wants", "savings"];
  const total = plannable(persona);
  const amounts = planAmounts(persona, plan);
  const bills = knownBillsTotal(persona);
  const billsPct = Math.round((bills / Math.max(total, 1)) * 100);
  const withEmergency = (p: Plan): Plan => (emergency ? withEmergencySlice(p) : p);

  const warnings: string[] = [];
  if (amounts.needs < bills) warnings.push(`Needs won't cover your known bills (${inr(bills)}). Money will come out of Wants.`);
  if (amounts.savings < persona.savingsGoal)
    warnings.push(`Savings is below your ${inr(persona.savingsGoal)} goal. You'd have to save leftovers to reach it.`);
  if (plan.wants < 10) warnings.push("Almost no Wants. One treat will raid your Needs.");

  return (
    <div className="space-y-3">
      {persona.carriedDebt ? (
        <article data-card className="flex items-start gap-3 rounded-3xl bg-alert/10 p-4 ring-1 ring-alert/30">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-alert" aria-hidden />
          <p className="text-sm text-pretty">
            <span className="font-semibold">{inr(persona.carriedDebt)} paid back first.</span> Last month&apos;s debt comes out of
            this month&apos;s money before you plan.
          </p>
        </article>
      ) : null}

      {suggestion && (
        <article data-card className="rounded-3xl bg-goal/10 p-4 ring-1 ring-goal/30">
          <div className="flex items-center gap-2 text-sm font-semibold text-goal">
            <History className="size-4" /> Based on your {suggestion.monthName}
          </div>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            You spent {inr(suggestion.needsSpent)} on needs and {inr(suggestion.wantsSpent)} on wants. This plan goes halfway
            from that toward 50/30/20:
          </p>
          <ul className="mt-2 grid grid-cols-3 gap-2 text-center" aria-label="Suggested plan">
            {(["needs", "wants", "savings"] as const).map((env) => (
              <li key={env} className="rounded-xl bg-white/[0.05] px-2 py-2">
                <div className={cn("text-[11px]", ENVELOPE_STYLE[env].text)}>{ENVELOPE_STYLE[env].label}</div>
                <div className="num text-sm font-bold">{inr(planAmounts(persona, suggestion.plan)[env])}</div>
                <div className="num text-[11px] text-muted-foreground">{suggestion.plan[env]}%</div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onChange(withEmergency(suggestion.plan))}
            className="mt-3 h-10 rounded-full bg-goal/15 px-4 text-sm font-semibold text-goal ring-1 ring-goal/40"
          >
            Use this plan
          </button>
        </article>
      )}

      <article data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
        <div className="text-xs font-medium text-money">Plan · {persona.monthLabel}</div>
        <h2 className="mt-1 text-2xl font-bold leading-tight">Split {inr(total)} into envelopes</h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          {persona.carriedBalance !== undefined
            ? `${inr(persona.carriedBalance)} carried over from last month${persona.carriedDebt ? `, minus ${inr(persona.carriedDebt)} owed` : ""}, plus ${inr(persona.monthlyIncome)} coming in.`
            : `${inr(persona.openingBalance)} in the account + ${inr(persona.monthlyIncome)} coming in.`}{" "}
          Every payment this month comes out of one envelope.
        </p>

        <div className="mt-5 space-y-5">
          {envs.map((env) => {
            const s = ENVELOPE_STYLE[env];
            return (
              <div key={env}>
                <div className="flex items-baseline justify-between">
                  <label htmlFor={`env-${env}`} className={cn("font-semibold", s.text)}>
                    {s.label}
                  </label>
                  <span className="num text-lg font-bold">
                    {plan[env]}% <span className="text-sm font-medium text-muted-foreground">· {inr(amounts[env])}</span>
                  </span>
                </div>
                <input
                  id={`env-${env}`}
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={plan[env]}
                  onChange={(e) => onChange(rebalance(plan, envs, env, Number(e.target.value)))}
                  className={cn("mt-2 h-8 w-full cursor-pointer", s.accent)}
                />
                <div className="text-xs text-muted-foreground">{HINT[env]}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange(withEmergency(DEFAULT_PLAN))}
            className="h-10 rounded-full bg-raised px-4 text-sm font-medium ring-1 ring-white/10 hover:bg-white/10"
          >
            Use 50/30/20
          </button>
          {smart && (
            <button
              type="button"
              onClick={() => onChange(withEmergency(smartSplit(persona)))}
              className="flex h-10 items-center gap-1.5 rounded-full bg-money/10 px-4 text-sm font-semibold text-money ring-1 ring-money/40"
            >
              <WandSparkles className="size-4" /> Smart split
            </button>
          )}
        </div>
      </article>

      <article data-card className="rounded-3xl bg-card p-4 ring-1 ring-white/5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ReceiptText className="size-4 text-goal" /> Bills you know are coming
          <span className="num ml-auto">
            {inr(bills)} · {billsPct}%
          </span>
        </div>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {persona.knownBills.map((b) => (
            <li key={b.label} className="flex justify-between">
              <span>{b.label}</span>
              <span className="num">{inr(b.amount)}</span>
            </li>
          ))}
        </ul>
      </article>

      {!suggestion && (
        <article data-card className="flex items-start gap-3 rounded-3xl bg-goal/10 p-4 ring-1 ring-goal/30">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-goal" aria-hidden />
          <p className="text-sm text-pretty">
            <span className="font-semibold">50/30/20 hint:</span> about half on needs, a third on wants, a fifth saved. If
            your bills are big, give Needs more and take it from Wants, not Savings.
          </p>
        </article>
      )}

      <article data-card className="flex items-center gap-3 rounded-3xl bg-card p-4 ring-1 ring-white/5">
        <Target className="size-5 shrink-0 text-money" aria-hidden />
        <p className="text-sm">
          <span className="font-semibold">Goal:</span> have{" "}
          <span className="num font-semibold text-money">{inr(persona.savingsGoal)}</span> in Savings by month end.
        </p>
      </article>

      {warnings.length > 0 && (
        <ul className="space-y-1.5 px-1">
          {warnings.map((w) => (
            <li key={w} className="flex gap-2 text-sm text-alert text-pretty">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
