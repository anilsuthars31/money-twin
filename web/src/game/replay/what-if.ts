import type { LessonId } from "../types";
import { dayOf, flowOf, isDelivery, nameOf, weeksOf, type RealMonth, type RealTxn } from "./real-month";
import type { ReplaySim } from "./replay";
import { inr } from "./templates";

// "What if?" moments: at 2-3 key real events in a replayed month, the player can keep what really
// happened or try a better move linked to a skill. A better move changes the month's transactions
// (a purchase skipped, delivery swapped for cooking...), so the twin's month plays out differently,
// and the report card compares "Real you" with "What-if you". Plain rules, no AI.

export type MomentKind = "impulse" | "delivery" | "crunch" | "cash";
export type WhatIfChoice = "real" | "better";
export type WhatIfChoices = Record<string, WhatIfChoice>;

export interface WhatIfMoment {
  id: string; // the kind: at most one of each per month
  kind: MomentKind;
  week: number;
  day: number;
  title: string;
  body: string; // what really happened
  realLabel: string;
  better: { label: string; outcome: string; lesson: LessonId; saves: number };
  /** Applies the better move: the month's transactions, changed. */
  apply: (txns: RealTxn[]) => RealTxn[];
}

export const MAX_MOMENTS = 3;
const COOKED_MEAL = 120; // groceries for one home-cooked dinner

const monthShort = (m: RealMonth) => new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
const weekOf = (m: RealMonth, day: number) => weeksOf(m).find((w) => day >= w.from && day <= w.to)!.week;
const sum = (ts: RealTxn[]) => ts.reduce((s, t) => s + t.amount, 0);
const without = (ids: Set<string>) => (txns: RealTxn[]) => txns.filter((t) => !ids.has(t.id));

/**
 * The month's What-if moments, found on the real month as it played with the player's plan
 * (the month-end crunch depends on when the envelopes ran dry). In date order, at most three.
 */
export function findMoments(real: ReplaySim): WhatIfMoment[] {
  const m = real.month;
  const income = Math.max(1, real.money.income);
  const on = (t: RealTxn) => `${dayOf(t)} ${monthShort(m)}`;
  const found: WhatIfMoment[] = [];
  const covered = new Set<string>(); // payments another moment already changes (never counted twice)
  const cash = m.txns.filter((t) => t.type === "DR" && t.category === "Cash Withdrawal").sort((a, b) => b.amount - a.amount)[0];
  const bigCash = cash && cash.amount >= Math.max(500, income * 0.05) ? cash : undefined;
  if (bigCash) covered.add(bigCash.id);

  // A big impulse buy: the biggest shopping payment, if it's big for this player.
  const buy = m.txns.filter((t) => t.type === "DR" && t.category === "Shopping").sort((a, b) => b.amount - a.amount)[0];
  if (buy && buy.amount >= Math.max(500, income * 0.08)) {
    covered.add(buy.id);
    found.push({
      id: "impulse",
      kind: "impulse",
      week: weekOf(m, dayOf(buy)),
      day: dayOf(buy),
      title: `${inr(buy.amount)} at ${nameOf(m, buy.counterparty)}`,
      body: `On ${on(buy)} you bought it straight away.`,
      realLabel: "Buy it now",
      better: {
        label: "Wishlist it for 24 hours",
        outcome: "A day later it didn't feel urgent, so your twin skipped it.",
        lesson: "impulse",
        saves: buy.amount,
      },
      apply: without(new Set([buy.id])),
    });
  }

  // A delivery streak: the first week with 3+ orders. Cook twice instead of the two biggest.
  for (const w of weeksOf(m)) {
    const orders = m.txns.filter((t) => isDelivery(t) && dayOf(t) >= w.from && dayOf(t) <= w.to);
    if (orders.length < 3) continue;
    const swapped = [...orders].sort((a, b) => b.amount - a.amount).slice(0, 2);
    const saves = sum(swapped) - swapped.length * COOKED_MEAL;
    if (saves <= 0) break;
    swapped.forEach((t) => covered.add(t.id));
    found.push({
      id: "delivery",
      kind: "delivery",
      week: w.week,
      day: dayOf(orders[2]),
      title: `Order #${orders.length} this week`,
      body: `${orders.length} delivery orders between ${on(orders[0])} and ${on(orders.at(-1)!)}, ${inr(sum(orders))} in all.`,
      realLabel: "Order again",
      better: {
        label: "Cook twice instead",
        outcome: `Two dinners at home for about ${inr(COOKED_MEAL)} each in groceries, instead of the two biggest orders.`,
        lesson: "delivery",
        saves,
      },
      apply: (txns) => {
        const ids = new Set(swapped.map((t) => t.id));
        const cooked: RealTxn[] = swapped.map((t) => ({
          ...t,
          id: `${t.id}-cooked`,
          amount: COOKED_MEAL,
          counterparty: "Groceries for dinner",
          category: "Groceries",
          channel: "UPI",
        }));
        return [...txns.filter((t) => !ids.has(t.id)), ...cooked].sort((a, b) => a.datetime.localeCompare(b.datetime));
      },
    });
    break;
  }

  // A month-end crunch: an envelope ran dry in the second half of the month. Pause wants from then on.
  const raid = real.weeks.flatMap((w) => w.raids).find((r) => r.week >= 3);
  if (raid) {
    const later = m.txns.filter((t) => flowOf(t) === "want" && dayOf(t) >= raid.day && !covered.has(t.id));
    if (later.length && sum(later) >= 100) {
      found.push({
        id: "crunch",
        kind: "crunch",
        week: weekOf(m, raid.day),
        day: raid.day,
        title: "Money's running out",
        body: `By ${raid.day} ${monthShort(m)} an envelope was empty, and ${inr(sum(later))} of wants still went out after that.`,
        realLabel: "Keep spending",
        better: {
          label: "Pause wants till month end",
          outcome: `Your twin skipped ${later.length === 1 ? "that payment" : `those ${later.length} payments`} and made do until the next month.`,
          lesson: "running-low",
          saves: sum(later),
        },
        apply: without(new Set(later.map((t) => t.id))),
      });
    }
  }

  // A cash withdrawal: money nobody can track. Take half.
  if (bigCash) {
    const cash = bigCash;
    const half = Math.round(cash.amount / 2 / 100) * 100;
    found.push({
      id: "cash",
      kind: "cash",
      week: weekOf(m, dayOf(cash)),
      day: dayOf(cash),
      title: `${inr(cash.amount)} cash from the ATM`,
      body: `On ${on(cash)}. Cash is spending nobody can see.`,
      realLabel: "Take it all",
      better: {
        label: `Take ${inr(cash.amount - half)}, pay the rest by UPI`,
        outcome: `Paying by UPI shows every rupee, so your twin only spent what was needed and kept ${inr(half)}.`,
        lesson: "upi-micro",
        saves: half,
      },
      apply: (txns) => txns.map((t) => (t.id === cash.id ? { ...t, amount: cash.amount - half } : t)),
    });
  }

  // Priority: impulse, delivery, crunch, cash. Shown in date order.
  return found.slice(0, MAX_MOMENTS).sort((a, b) => a.day - b.day);
}

/** The month with the better moves the player picked. */
export function applyChoices(m: RealMonth, moments: WhatIfMoment[], choices: WhatIfChoices): RealMonth {
  const txns = moments.filter((x) => choices[x.id] === "better").reduce((ts, x) => x.apply(ts), m.txns);
  return txns === m.txns ? m : { ...m, txns };
}
