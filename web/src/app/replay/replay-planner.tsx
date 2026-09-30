"use client";

import { Lightbulb, ReceiptText, Target, TriangleAlert } from "lucide-react";
import { ENVELOPE_STYLE } from "@/components/twin/envelope-bars";
import { DEFAULT_PLAN, inr, withEmergencySlice } from "@/game/engine";
import { goalFor, plannableOf, realSplit, replayPlanAmounts } from "@/game/replay/replay";
import type { MonthMoney, RealMonth } from "@/game/replay/real-month";
import type { Envelope, Plan } from "@/game/types";
import { cn } from "@/lib/utils";
import { rebalance } from "../play/demo/planner";

const HINT: Record<Envelope, string> = {
  needs: "Rent, bills, groceries, travel, everyday food",
  wants: "Delivery, eating out, shopping, trips, fun, money lent",
  emergency: "Surprises come out of here first",
  savings: "Moved in a quarter each week, before you spend",
};

const FIXED = ["Rent/PG", "Rent", "EMI & Loans", "Bills & Recharge", "Sent to Family"];

/** "If you'd planned this month…": envelopes over the month's real money, with a 50/30/20 hint on real income. */
export function ReplayPlanner({
  month,
  money,
  plan,
  onChange,
  emergency,
}: {
  month: RealMonth;
  money: MonthMoney;
  plan: Plan;
  onChange: (p: Plan) => void;
  emergency: boolean; // "Emergency envelope" ability
}) {
  const envs: Envelope[] = emergency ? ["needs", "wants", "emergency", "savings"] : ["needs", "wants", "savings"];
  const total = plannableOf(money);
  const amounts = replayPlanAmounts(money, plan);
  const goal = goalFor(money, amounts);
  const split = realSplit(money);
  const income = Math.round(money.income);
  const fixed = month.txns.filter((t) => t.type === "DR" && FIXED.includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const monthName = month.label.split(" ")[0];
  const rule = { needs: Math.round(income * 0.5), wants: Math.round(income * 0.3), savings: Math.round(income * 0.2) };

  const warnings: string[] = [];
  if (amounts.needs < fixed) warnings.push(`Needs won't cover this month's fixed costs (${inr(fixed)}).`);
  if (plan.wants < 10) warnings.push("Almost no Wants. The first treat will raid your Needs.");

  return (
    <div className="space-y-3">
      <article data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
        <div className="text-xs font-medium text-money">Replay {month.label}</div>
        <h2 className="mt-1 text-2xl font-bold leading-tight text-balance">If you&apos;d planned {monthName}…</h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          {inr(Math.max(0, money.opening))} was in the account and {inr(income)} came in. Split {inr(total)} into envelopes; your real
          payments will come out of them, week by week.
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

        <button
          type="button"
          onClick={() => onChange(emergency ? withEmergencySlice(DEFAULT_PLAN) : DEFAULT_PLAN)}
          className="mt-5 h-10 rounded-full bg-raised px-4 text-sm font-medium ring-1 ring-white/10 hover:bg-white/10"
        >
          Use 50/30/20
        </button>
      </article>

      <article data-card className="rounded-3xl bg-goal/10 p-4 ring-1 ring-goal/30">
        <div className="flex items-center gap-2 text-sm font-semibold text-goal">
          <Lightbulb className="size-4" aria-hidden /> 50/30/20 on your {inr(income)}
        </div>
        <ul className="mt-2 grid grid-cols-3 gap-2 text-center" aria-label="50/30/20 on this month's income">
          {(["needs", "wants", "savings"] as const).map((env) => (
            <li key={env} className="rounded-xl bg-white/[0.05] px-2 py-2">
              <div className={cn("text-[11px]", ENVELOPE_STYLE[env].text)}>{ENVELOPE_STYLE[env].label}</div>
              <div className="num text-sm font-bold">{inr(rule[env])}</div>
            </li>
          ))}
        </ul>
        {income > 0 && (
          <p className="mt-3 text-sm text-muted-foreground text-pretty">
            What really happened: <span className="num font-semibold text-foreground">{split.needs}%</span> on needs,{" "}
            <span className="num font-semibold text-foreground">{split.wants}%</span> on wants,{" "}
            <span className="num font-semibold text-foreground">{split.saved}%</span> left over.
          </p>
        )}
      </article>

      {fixed > 0 && (
        <article data-card className="flex items-center gap-3 rounded-3xl bg-card p-4 ring-1 ring-white/5">
          <ReceiptText className="size-5 shrink-0 text-goal" aria-hidden />
          <p className="text-sm">
            <span className="font-semibold">Fixed costs this month:</span>{" "}
            <span className="num font-semibold">{inr(fixed)}</span>
            {income > 0 && <span className="text-muted-foreground"> ({Math.round((fixed / income) * 100)}% of income)</span>}
          </p>
        </article>
      )}

      <article data-card className="flex items-center gap-3 rounded-3xl bg-card p-4 ring-1 ring-white/5">
        <Target className="size-5 shrink-0 text-money" aria-hidden />
        <p className="text-sm">
          <span className="font-semibold">Goal:</span> have <span className="num font-semibold text-money">{inr(goal)}</span> in
          Savings by the end of {monthName}.
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
