import { STARTING_MOOD, gradeMonth, gradeSave, gradeSpend, type EnvelopeReview, type Grade } from "../engine";
import { autoSave, ledgerFromAmounts, receive, saved, spend, walletOf } from "../ledger";
import type { LessonContext } from "../lessons";
import type { CharacterType, Envelope, GameEvent, Ledger, LessonId, MoodDelta, Plan, Raid, Stats } from "../types";
import {
  dayOf,
  displayCategory,
  flowOf,
  isDelivery,
  isMicro,
  isSpend,
  monthMoney,
  nameOf,
  payeeKey,
  weeksOf,
  type MonthMoney,
  type RealMonth,
  type RealTxn,
} from "./real-month";
import { eventsForWeek, inr } from "./templates";

// Replaying a real month: the player's plan funds the envelopes, their real payments come out week
// by week, and the template library turns what happened into life events. Same ledger and grading
// as the demo month, so a real "B" means the same as a demo "B".

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const sum = (xs: { amount: number }[]) => xs.reduce((s, t) => s + t.amount, 0);

/** Everything the player could plan with: what was in the account plus the month's real income. */
export const plannableOf = (money: MonthMoney) => Math.max(0, money.opening + money.income);

export function replayPlanAmounts(money: MonthMoney, plan: Plan): Record<Envelope, number> {
  const total = plannableOf(money);
  const needs = Math.round((total * plan.needs) / 100);
  const wants = Math.round((total * plan.wants) / 100);
  const emergency = Math.round((total * (plan.emergency ?? 0)) / 100);
  return { needs, wants, emergency, savings: total - needs - wants - emergency };
}

/** The month's savings goal: what the plan sets aside, or 10% of income if it sets nothing aside. */
export const goalFor = (money: MonthMoney, planned: Record<Envelope, number>) =>
  Math.max(planned.savings, Math.round(money.income * 0.1), 1);

/** How the month really split (share of income): shown next to the 50/30/20 hint. */
export function realSplit(money: MonthMoney) {
  const base = Math.max(1, money.income);
  return {
    needs: Math.round((money.needs / base) * 100),
    wants: Math.round((money.wants / base) * 100),
    saved: Math.round((Math.max(0, money.income - money.spent) / base) * 100),
  };
}

export interface ReplayWeek {
  week: number;
  label: string;
  txns: RealTxn[];
  spent: number;
  received: number;
  autoSaved: number;
  raids: Raid[];
  events: GameEvent[];
  ledgerAfterTxns: Ledger;
  statsAfterTxns: Stats;
  statsAfterEvent: Stats[];
}

export interface ReplaySim {
  month: RealMonth;
  money: MonthMoney;
  plan: Plan;
  planned: Record<Envelope, number>;
  goal: number;
  weeks: ReplayWeek[];
  startLedger: Ledger;
  startStats: Stats;
  ledger: Ledger;
  stats: Stats;
}

export function simulateReplay(
  m: RealMonth,
  plan: Plan,
  type: CharacterType,
  startMood?: Pick<Stats, "happiness" | "stress">,
): ReplaySim {
  const money = monthMoney(m);
  const planned = replayPlanAmounts(money, plan);
  const goal = goalFor(money, planned);
  const total = Math.max(1, plannableOf(money));
  const income = Math.max(1, money.income);
  const ledger = ledgerFromAmounts(planned);
  const mood = { ...(startMood ?? STARTING_MOOD[type]) };
  const applyDelta = (d: MoodDelta) => {
    mood.happiness = clamp(mood.happiness + (d.happiness ?? 0));
    mood.stress = clamp(mood.stress + (d.stress ?? 0));
  };
  const toStats = (): Stats => ({
    savings: clamp(((walletOf(ledger) - ledger.debt) / total) * 100),
    happiness: mood.happiness,
    stress: mood.stress,
    goal: clamp((ledger.savings / goal) * 100),
  });

  const startLedger = { ...ledger };
  const startStats = toStats();
  const fired = new Set<string>();
  const weeks: ReplayWeek[] = [];
  const monthShort = new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
  let streak = 0;

  for (const w of weeksOf(m)) {
    const before = m.txns.filter((t) => dayOf(t) < w.from);
    const week = m.txns.filter((t) => dayOf(t) >= w.from && dayOf(t) <= w.to);
    const autoSaved = autoSave(ledger, planned.savings, w.week);
    const raids: Raid[] = [];
    for (const t of week) {
      const flow = flowOf(t);
      if (flow === "need") spend(ledger, "needs", t.amount, w.week, dayOf(t), raids);
      else if (flow === "want" || flow === "lent") spend(ledger, "wants", t.amount, w.week, dayOf(t), raids);
      else if (flow === "extra" || flow === "friend-back") receive(ledger, t.amount);
      // "income" is already in the plan; "ignore" never touches the envelopes.
    }
    streak = autoSaved > 0 && !raids.some((r) => r.from === "savings") ? streak + 1 : 0;
    const ledgerAfterTxns = { ...ledger };
    const statsAfterTxns = toStats();
    const events = eventsForWeek({
      m,
      week: w.week,
      from: w.from,
      to: w.to,
      weekTxns: week,
      before,
      income,
      planned,
      raids,
      ledger: ledgerAfterTxns,
      autoSaved,
      savingsStreak: streak,
      fired,
    });
    const statsAfterEvent = events.map((e) => {
      applyDelta(e.delta);
      return toStats();
    });
    weeks.push({
      week: w.week,
      label: `${w.from}–${w.to} ${monthShort}`,
      txns: week,
      spent: sum(week.filter(isSpend)),
      received: sum(week.filter((t) => t.type === "CR" && flowOf(t) !== "ignore")),
      autoSaved,
      raids,
      events,
      ledgerAfterTxns,
      statsAfterTxns,
      statsAfterEvent,
    });
  }

  return { month: m, money, plan, planned, goal, weeks, startLedger, startStats, ledger: { ...ledger }, stats: toStats() };
}

// ---------------------------------------------------------------- report card

export interface CategoryRow {
  category: string;
  envelope: "needs" | "wants";
  amount: number;
  share: number; // of all spending, 0-100
}

export interface FriendLine {
  key: string;
  name: string;
  net: number; // > 0 they owe you
}

export interface ReplayReport {
  monthKey: string;
  monthLabel: string;
  grade: Grade;
  score: number;
  headline: string;
  income: number;
  extra: number;
  spent: number;
  swept: number;
  savingsKept: number;
  debt: number;
  goal: number;
  envelopes: EnvelopeReview[];
  categories: CategoryRow[];
  friends: { friends: FriendLine[]; owedToYou: number; youOwe: number };
  lesson: LessonId;
  lessons: LessonId[];
  finalStats: Stats;
  finalLedger: Ledger;
  lessonContext: LessonContext;
  eventCount: number;
}

export function replayReport(sim: ReplaySim): ReplayReport {
  const { month: m, money, planned, plan } = sim;
  const needsSpent = money.needs;
  const wantsSpent = money.wants + money.lent; // lent money also left Wants
  const wantsBudget = planned.wants + money.extra + money.friendBack;

  // Month end: unspent Needs, Wants and Emergency are swept into Savings, and any debt is repaid from it.
  const l = sim.ledger;
  const swept = l.needs + l.wants + l.emergency;
  const pot = saved(l) + swept;
  const repay = Math.min(l.debt, pot);
  const finalLedger: Ledger = { needs: 0, wants: 0, emergency: 0, savings: pot - repay, locked: 0, debt: l.debt - repay };
  const savingsKept = finalLedger.savings - finalLedger.debt;

  const envelopes: EnvelopeReview[] = [
    {
      env: "needs",
      planned: planned.needs,
      budget: planned.needs,
      actual: needsSpent,
      grade: gradeSpend(needsSpent, planned.needs),
      verdict:
        needsSpent <= planned.needs
          ? "Essentials fit the plan."
          : `Essentials were ${inr(needsSpent - planned.needs)} more than this plan allows.`,
    },
    {
      env: "wants",
      planned: planned.wants,
      budget: wantsBudget,
      actual: wantsSpent,
      grade: gradeSpend(wantsSpent, wantsBudget),
      verdict:
        wantsSpent <= wantsBudget
          ? money.lent > 0
            ? `Fun and loans to friends (${inr(money.lent)}) stayed inside the envelope.`
            : "Fun stayed inside the envelope."
          : `Wants${money.lent > 0 ? " and loans to friends" : ""} went ${inr(wantsSpent - wantsBudget)} over.`,
    },
    {
      env: "savings",
      planned: planned.savings,
      budget: planned.savings,
      actual: savingsKept,
      grade: gradeSave(savingsKept, planned.savings),
      verdict:
        savingsKept < 0
          ? `This plan ends ${inr(-savingsKept)} short instead of saving.`
          : savingsKept >= planned.savings
            ? `Kept the ${inr(planned.savings)} planned${swept > 0 ? `, plus ${inr(swept)} left over` : ""}.`
            : `Planned ${inr(planned.savings)}, kept ${inr(savingsKept)}.`,
    },
  ];

  const { score, grade } = gradeMonth({
    spentNeeds: needsSpent,
    plannedNeeds: planned.needs,
    spentWants: wantsSpent,
    wantsBudget,
    savingsKept,
    savingsGoal: sim.goal,
    planSavingsPct: plan.savings,
    debt: finalLedger.debt,
    happiness: sim.stats.happiness,
    stress: sim.stats.stress,
    envelopes,
  });

  // Spending by real category.
  const rows = new Map<string, CategoryRow>();
  for (const t of m.txns.filter(isSpend)) {
    const category = displayCategory(t.category);
    const env = flowOf(t) === "need" ? "needs" : "wants";
    const key = `${category}|${env}`;
    const row = rows.get(key) ?? { category, envelope: env, amount: 0, share: 0 };
    row.amount += t.amount;
    rows.set(key, row);
  }
  const categories = [...rows.values()]
    .map((r) => ({ ...r, amount: Math.round(r.amount), share: Math.round((r.amount / Math.max(1, money.spent)) * 100) }))
    .sort((a, b) => b.amount - a.amount);

  // Friends: what you lent minus what they paid back ("my share" friends aren't loans).
  const fr = new Map<string, FriendLine>();
  for (const t of m.txns) {
    const f = flowOf(t);
    if (f !== "lent" && f !== "friend-back") continue;
    const key = payeeKey(t.counterparty);
    if (m.friendModes[key] === "share") continue;
    const line = fr.get(key) ?? { key, name: nameOf(m, t.counterparty), net: 0 };
    line.net += f === "lent" ? t.amount : -t.amount;
    fr.set(key, line);
  }
  const friendLines = [...fr.values()].filter((f) => Math.round(f.net) !== 0).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  const lessonsFromEvents = sim.weeks.flatMap((w) => w.events.map((e) => e.lesson)).filter(Boolean) as LessonId[];
  const lesson: LessonId =
    finalLedger.debt > 0 ? "emergency-fund" : plan.savings < 15 || wantsSpent > wantsBudget ? "50-30-20" : "emergency-fund";
  const lessons = [...new Set<LessonId>([lesson, ...lessonsFromEvents])];

  const micro = m.txns.filter(isMicro);
  const deliveries = m.txns.filter(isDelivery);
  const fixed = m.txns.filter((t) => t.type === "DR" && ["Rent/PG", "Rent", "EMI & Loans", "Bills & Recharge", "Sent to Family"].includes(t.category));
  const buy = [...m.txns.filter((t) => t.type === "DR" && t.category === "Shopping")].sort((a, b) => b.amount - a.amount)[0];
  const lessonContext: LessonContext = {
    monthName: new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleString("en-IN", { month: "long", timeZone: "UTC" }),
    income: Math.max(1, Math.round(money.income)),
    microPerDay: Math.round(sum(micro) / m.days),
    deliveryOrders: deliveries.length,
    deliveryAvg: deliveries.length ? Math.round(sum(deliveries) / deliveries.length) : 0,
    week1Spent: Math.round(sim.weeks[0]?.spent ?? 0),
    fixedCosts: Math.round(sum(fixed)),
    biggestBuy: buy ? { amount: buy.amount, counterparty: nameOf(m, buy.counterparty) } : undefined,
  };

  const headline =
    finalLedger.debt > 0
      ? `With this plan, ${m.label.split(" ")[0]} ends ${inr(finalLedger.debt)} short.`
      : savingsKept >= sim.goal
        ? `Goal reached: ${inr(savingsKept)} kept.`
        : `${inr(savingsKept)} kept of a ${inr(sim.goal)} goal.`;

  return {
    monthKey: m.key,
    monthLabel: m.label,
    grade,
    score,
    headline,
    income: money.income,
    extra: money.extra + money.friendBack,
    spent: money.spent,
    swept,
    savingsKept,
    debt: finalLedger.debt,
    goal: sim.goal,
    envelopes,
    categories,
    friends: {
      friends: friendLines,
      owedToYou: friendLines.reduce((s, f) => s + Math.max(0, f.net), 0),
      youOwe: friendLines.reduce((s, f) => s + Math.max(0, -f.net), 0),
    },
    lesson,
    lessons,
    finalStats: { ...sim.stats, goal: clamp((Math.max(0, savingsKept) / sim.goal) * 100) },
    finalLedger,
    lessonContext,
    eventCount: sim.weeks.reduce((s, w) => s + w.events.length, 0),
  };
}
