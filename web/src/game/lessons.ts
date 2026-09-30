import type { Ability, LessonId } from "./types";

// General money education only. Never product, stock or fund recommendations (SEBI rules).
// Each lesson is a 20–30 second interactive card: one widget, one takeaway, one quiz question.
// Lessons are built from the player's own month (LessonContext), so the numbers are theirs.

const r = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const clampN = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** The player's own numbers from the month they just played. */
export interface LessonContext {
  monthName: string; // "August"
  income: number; // pocket money / salary
  microPerDay: number; // average spent per day on payments under ₹150
  deliveryOrders: number; // delivery orders in the month
  deliveryAvg: number; // average order value
  week1Spent: number;
  fixedCosts: number; // rent, EMI, money home… (known bills)
  biggestBuy?: { amount: number; counterparty: string };
}

/** Used before the player has finished a month (e.g. opening the skills book early). */
export const DEFAULT_CONTEXT: LessonContext = {
  monthName: "August",
  income: 8000,
  microPerDay: 60,
  deliveryOrders: 10,
  deliveryAvg: 230,
  week1Spent: 3000,
  fixedCosts: 820,
};

export type LessonWidget =
  | {
      kind: "slider";
      label: string;
      min: number;
      max: number;
      step: number;
      initial: number;
      format: (v: number) => string;
      readout: (v: number) => { label: string; value: string; tone?: "good" | "bad" }[];
      note?: string;
    }
  | { kind: "scenario"; prompt: string; options: { label: string; feedback: string; good: boolean }[] }
  | { kind: "sort"; prompt: string; buckets: [string, string]; items: { label: string; bucket: 0 | 1 }[] };

export interface Lesson {
  id: LessonId;
  title: string;
  hook: string;
  widget: LessonWidget;
  takeaway: string;
  quiz: { q: string; options: string[]; answer: number; explain: string };
  ability?: { id: Ability; name: string; description: string };
}

export const XP_CORRECT = 30;
export const XP_TRIED = 10;

/** Four rupee options built around the right answer; `at` is where the right one sits. */
function rupeeOptions(correct: number, factors: number[], at: number) {
  const step = correct >= 10000 ? 500 : correct >= 1000 ? 100 : 10;
  const opts = factors.map((f) => r(roundTo(correct * f, step)));
  return { options: opts, answer: at };
}

/** Title, takeaway and ability never change with the numbers, so the UI can use them anywhere. */
export const LESSON_INFO: Record<LessonId, Pick<Lesson, "title" | "takeaway" | "ability">> = {
  "upi-micro": {
    title: "Small UPI payments add up",
    takeaway: "Set a weekly limit for tiny payments, and check your UPI history every Sunday.",
    ability: { id: "chai-cap", name: "Chai cap", description: "A weekly limit on tiny payments: about a third of them won't happen next month." },
  },
  impulse: {
    title: "The 24-hour rule",
    takeaway: "Wait 24 hours before any non-essential buy. Most of the urge is gone by morning.",
    ability: { id: "wishlist-24h", name: "Wishlist for 24h", description: "Sale and EMI decisions get a new option: wishlist it and decide tomorrow." },
  },
  delivery: {
    title: "Paying twice for dinner",
    takeaway: "Keep delivery for weekends and give yourself a fixed number of orders each month.",
    ability: { id: "cook-nights", name: "Cook nights", description: "Every other delivery order becomes a cook night at about a third of the price." },
  },
  "running-low": {
    title: "Plan the month, not just the day",
    takeaway: "Split your money into four weekly amounts and stick to each week's share.",
    ability: { id: "weekly-pace", name: "Pace markers", description: "Your envelopes show where you should be each week, so you see trouble early." },
  },
  "50-30-20": {
    title: "The 50/30/20 rule",
    takeaway: "About 50% on needs, 30% on wants, and move 20% to savings the day money arrives.",
    ability: {
      id: "smart-split",
      name: "Smart split",
      description: "The planner gets a one-tap split that starts from 50/30/20 and makes room for your known bills.",
    },
  },
  "emergency-fund": {
    title: "Build an emergency fund",
    takeaway: "Start with one month's spending and build it slowly. It's what stops you borrowing from friends.",
    ability: {
      id: "emergency-envelope",
      name: "Emergency envelope",
      description: "Plan a buffer for surprises. Repairs use it first, and it covers overspending before Savings is touched.",
    },
  },
  "emi-trap": {
    title: "The EMI and pay-later trap",
    takeaway: "Before any EMI or pay-later, ask whether you'd buy it if you had to pay in full today.",
    ability: {
      id: "save-up-instead",
      name: "Save up instead",
      description: "EMI offers get a new option: put the monthly amount into Savings and buy it outright later.",
    },
  },
  "fixed-costs": {
    title: "Know your fixed costs",
    takeaway: "Add up your fixed costs before planning. Try to keep rent and EMIs to about 30–40% of income.",
  },
};

export function lessonFor(id: LessonId, c: LessonContext = DEFAULT_CONTEXT): Lesson {
  const info = LESSON_INFO[id];
  const base = { id, ...info };

  switch (id) {
    case "upi-micro": {
      const day = clampN(roundTo(c.microPerDay, 10), 10, 200);
      return {
        ...base,
        hook: `In ${c.monthName} your small payments averaged ${r(c.microPerDay)} a day. None of them felt like spending.`,
        widget: {
          kind: "slider",
          label: "Chai, snacks and small bites per day",
          min: 0,
          max: 200,
          step: 10,
          initial: day,
          format: (v) => `${r(v)} a day`,
          readout: (v) => [
            { label: "Per month", value: r(v * 30) },
            { label: "Per year", value: r(v * 365), tone: v * 365 > c.income ? "bad" : undefined },
            { label: "Share of your monthly income", value: `${Math.round(((v * 30) / c.income) * 100)}%` },
          ],
          note: `Starts at your ${c.monthName} average.`,
        },
        quiz: {
          q: `At your ${c.monthName} pace of ${r(day)} a day, tiny payments cost about how much in a year?`,
          ...rupeeOptions(day * 365, [0.1, 0.33, 1, 3], 2),
          explain: `${r(day)} × 365 days = ${r(day * 365)}. Tiny amounts, big total.`,
        },
      };
    }

    case "impulse": {
      const buy = c.biggestBuy ?? { amount: 1799, counterparty: "a shopping app" };
      return {
        ...base,
        hook: `Your biggest shopping buy in ${c.monthName} was ${r(buy.amount)}. Late-night shopping is mostly about mood, not need.`,
        widget: {
          kind: "scenario",
          prompt: `11:48pm. Something for ${r(buy.amount)} is in your cart, and the sale ends in 10 minutes. You…`,
          options: [
            { label: "Buy now before it's gone", feedback: "The timer is there to rush you. Sales come back every few weeks.", good: false },
            { label: "Wishlist it, decide tomorrow", feedback: "Right. If you still want it after a day, buy it without guilt.", good: true },
            { label: "Buy it and return it later", feedback: "Returns are a hassle, and most people never get round to them.", good: false },
          ],
        },
        quiz: {
          q: "What does the 24-hour rule say?",
          options: [
            "Only shop between 9am and 9pm",
            "Wait a day before buying something you don't need",
            "Return anything within 24 hours",
            "Never buy during a sale",
          ],
          answer: 1,
          explain: "A day's wait separates real wants from a mood.",
        },
      };
    }

    case "delivery": {
      const price = clampN(roundTo(c.deliveryAvg || 250, 10), 100, 1000);
      const cook = roundTo(price / 3, 10);
      const perWeek = clampN(Math.round(c.deliveryOrders / 4.3), 1, 10);
      const extra = (n: number) => n * 4.3 * (price - cook);
      return {
        ...base,
        hook: `You ordered ${c.deliveryOrders} times in ${c.monthName}, about ${r(price)} an order. If dinner is already paid for, each order is a second dinner.`,
        widget: {
          kind: "slider",
          label: "Delivery orders per week",
          min: 0,
          max: 10,
          step: 1,
          initial: perWeek,
          format: (v) => `${v} order${v === 1 ? "" : "s"} a week`,
          readout: (v) => [
            { label: `Delivery per month (${r(price)} each)`, value: r(v * 4.3 * price) },
            { label: `Cooking the same (${r(cook)} each)`, value: r(v * 4.3 * cook), tone: "good" },
            { label: "Extra you pay for delivery", value: r(extra(v)), tone: v >= 3 ? "bad" : undefined },
          ],
          note: `Starts at your ${c.monthName} pace.`,
        },
        quiz: {
          q: `${perWeek} orders a week at ${r(price)}, versus ${r(cook)} to cook. Extra cost per month?`,
          ...rupeeOptions(extra(perWeek), [0.25, 0.5, 1, 1.6], 2),
          explain: `${perWeek} × 4.3 weeks × ${r(price - cook)} extra ≈ ${r(extra(perWeek))} a month.`,
        },
      };
    }

    case "running-low": {
      const step = roundTo(c.income / 40, 50) || 50;
      const w1 = clampN(roundTo(c.week1Spent, step), step, roundTo(c.income * 0.75, step));
      const planned = c.income / 4;
      const left = (v: number) => (c.income - v) / 3;
      return {
        ...base,
        hook: `${r(c.income)} arrives on day 1 and has to last until day 30. In week 1 of ${c.monthName} you spent ${r(c.week1Spent)}.`,
        widget: {
          kind: "slider",
          label: `Spent in week 1, out of ${r(c.income)}`,
          min: step,
          max: roundTo(c.income * 0.75, step),
          step,
          initial: w1,
          format: (v) => r(v),
          readout: (v) => [
            { label: "Left for weeks 2–4", value: r(c.income - v) },
            { label: "Per week from now on", value: r(left(v)), tone: left(v) < planned * 0.75 ? "bad" : "good" },
            { label: "An even split would be", value: `${r(planned)} a week` },
          ],
        },
        quiz: {
          q: `${r(c.income)} for the month and ${r(w1)} gone in week 1. What's left per week for the other three?`,
          ...rupeeOptions(left(w1), [0.5, 0.75, 1, 1.33], 2),
          explain: `${r(c.income - w1)} left ÷ 3 weeks = ${r(left(w1))} a week.`,
        },
      };
    }

    case "50-30-20":
      return {
        ...base,
        hook: `A simple split for any income, including your ${r(c.income)}: needs, wants, and savings first.`,
        widget: {
          kind: "sort",
          prompt: "Tap each item, then tap Need or Want.",
          buckets: ["Need", "Want"],
          items: [
            { label: "Rent", bucket: 0 },
            { label: "Netflix", bucket: 1 },
            { label: "Groceries", bucket: 0 },
            { label: "Concert tickets", bucket: 1 },
            { label: "Phone bill", bucket: 0 },
            { label: "New sneakers", bucket: 1 },
            { label: "Medicine", bucket: 0 },
            { label: "Swiggy dinner", bucket: 1 },
          ],
        },
        quiz: {
          q: `Your income is ${r(c.income)}. How much does 50/30/20 say to save?`,
          ...rupeeOptions(c.income * 0.2, [0.5, 1, 1.5, 2.5], 1),
          explain: `20% of ${r(c.income)} = ${r(c.income * 0.2)}, set aside before you spend.`,
        },
      };

    case "emergency-fund":
      return {
        ...base,
        hook: `Surprises happen: a broken phone, a trip home, a medical bill. You live on about ${r(c.income)} a month.`,
        widget: {
          kind: "slider",
          label: "Months of living costs you want covered",
          min: 1,
          max: 6,
          step: 1,
          initial: 3,
          format: (v) => `${v} month${v === 1 ? "" : "s"}`,
          readout: (v) => [
            { label: `Fund needed at ${r(c.income)} a month`, value: r(v * c.income) },
            { label: `Saving 10% (${r(c.income * 0.1)}) a month`, value: `${v * 10} months` },
            { label: `Saving 20% (${r(c.income * 0.2)}) a month`, value: `${v * 5} months`, tone: "good" },
          ],
        },
        quiz: {
          q: `You live on ${r(c.income)} a month. How big is a 3-month emergency fund?`,
          ...rupeeOptions(c.income * 3, [0.33, 1, 2, 4], 1),
          explain: `3 × ${r(c.income)} = ${r(c.income * 3)}, built up slowly, a little every month.`,
        },
      };

    case "emi-trap": {
      const emiShare = Math.round((2999 / c.income) * 100);
      return {
        ...base,
        hook: `"Just ₹2,999 a month" is designed to feel smaller than ₹35,988. On your income that's ${emiShare}% of every month for a year.`,
        widget: {
          kind: "scenario",
          prompt: "A phone costs ₹35,988, or ₹2,999 × 12 on \"No Cost EMI\" plus a ₹199 fee. What really happens with the EMI?",
          options: [
            { label: "It's cheaper, the price is split", feedback: "Same price plus a fee, so it's never cheaper.", good: false },
            { label: "It costs the same", feedback: "Close, but there's a fee, and it ties up the next 12 months of income.", good: false },
            { label: "It costs more and spends future income", feedback: "Right: fees plus a year of committed money.", good: true },
          ],
        },
        quiz: {
          q: "Why can \"No Cost EMI\" still cost you?",
          options: ["It can't, it's free", "Fees, and it spends money you haven't earned yet", "The phone is worse", "EMIs are illegal"],
          answer: 1,
          explain: "Processing fees and a year of committed income are the real cost.",
        },
      };
    }

    case "fixed-costs": {
      const pct = clampN(roundTo((c.fixedCosts / c.income) * 100, 5), 5, 80);
      const opts = [...new Set([pct - 20, pct - 10, pct, pct + 15].map((v) => clampN(v, 5, 95)))];
      while (opts.length < 4) opts.push(opts[opts.length - 1] + 10);
      const sorted = opts.sort((a, b) => a - b);
      return {
        ...base,
        hook: `Rent, EMIs and money home leave before you buy a single thing. Yours were ${r(c.fixedCosts)} in ${c.monthName}.`,
        widget: {
          kind: "slider",
          label: `Fixed costs as a share of your ${r(c.income)}`,
          min: 5,
          max: 80,
          step: 5,
          initial: pct,
          format: (v) => `${v}%`,
          readout: (v) => [
            { label: "Fixed costs", value: r((c.income * v) / 100) },
            { label: "Left for everything else", value: r(c.income * (1 - v / 100)), tone: v > 50 ? "bad" : "good" },
            { label: "Verdict", value: v <= 35 ? "Healthy" : v <= 50 ? "Tight" : "Risky", tone: v <= 35 ? "good" : "bad" },
          ],
          note: `Starts at your ${c.monthName} share.`,
        },
        quiz: {
          q: `Your fixed costs were ${r(c.fixedCosts)} on ${r(c.income)}. About what share is that?`,
          options: sorted.map((v) => `${v}%`),
          answer: sorted.indexOf(pct),
          explain: `${r(c.fixedCosts)} ÷ ${r(c.income)} ≈ ${pct}%.`,
        },
      };
    }
  }
}

export const LESSON_ORDER: LessonId[] = [
  "upi-micro",
  "impulse",
  "delivery",
  "running-low",
  "50-30-20",
  "emergency-fund",
  "emi-trap",
  "fixed-costs",
];

export const ABILITY_OF: Partial<Record<LessonId, Ability>> = Object.fromEntries(
  LESSON_ORDER.flatMap((id) => (LESSON_INFO[id].ability ? [[id, LESSON_INFO[id].ability!.id]] : [])),
);
