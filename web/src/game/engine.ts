import type {
  Ability,
  CharacterType,
  Choice,
  Envelope,
  GameEvent,
  Ledger,
  LessonId,
  MoodDelta,
  Persona,
  Plan,
  Raid,
  Stats,
  Transaction,
  WeekResult,
} from "./types";
import type { LessonContext } from "./lessons";

// Plain-rules game engine. The player splits the month's money into Needs / Wants / Savings
// envelopes; every payment draws from its envelope, and when one runs dry the shortfall is taken
// from another (Wants → Needs → Savings → debt). Life events come from simple rules over the
// transactions and those raids. No randomness: the same month and choices always replay the same.

const MAX_EVENTS_PER_WEEK = 2; // fewer passive cards; every week also ends with a decision
const MICRO_LIMIT = 150; // ₹, a "chai / lunch" sized UPI payment
const DELIVERY = ["swiggy", "zomato"];
const PAY_LATER = ["lazypay", "simpl", "slice", "zestmoney", "bajaj finserv"];

export const STARTING_MOOD: Record<CharacterType, Pick<Stats, "happiness" | "stress">> = {
  student: { happiness: 60, stress: 30 },
  "first-job": { happiness: 62, stress: 45 },
  professional: { happiness: 58, stress: 52 },
};

export const ENVELOPES: Envelope[] = ["needs", "wants", "savings", "emergency"];
export const DEFAULT_PLAN: Plan = { needs: 50, wants: 30, savings: 20, emergency: 0 };

/** decisions[choiceId] = index of the option picked. */
export type Decisions = Record<string, number>;

export const dayOf = (t: Pick<Transaction, "datetime">) => Number(t.datetime.slice(8, 10));
export const isMicro = (t: Transaction) =>
  t.type === "DR" && t.channel === "UPI" && t.category === "Food & Dining" && t.amount <= MICRO_LIMIT;
export const isDelivery = (t: Transaction) =>
  t.type === "DR" && DELIVERY.some((d) => t.counterparty.toLowerCase().includes(d));
/** Buy-now-pay-later bills and consumer EMIs (not big planned loans like a car EMI). */
export const isPayLater = (t: Pick<Transaction, "category" | "counterparty">) =>
  t.category === "EMI & Loans" && PAY_LATER.some((p) => t.counterparty.toLowerCase().includes(p));
const sum = (ts: { amount: number }[]) => ts.reduce((s, t) => s + t.amount, 0);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;

// Small everyday food payments count as needs; delivery, eating out, shopping and fun are wants.
// Rent, EMIs and money sent home are commitments, so they sit with needs.
const NEEDS = new Set<string>([
  "Groceries",
  "Bills & Recharge",
  "Education",
  "Health",
  "Transport",
  "Personal Care",
  "Rent",
  "EMI & Loans",
  "Sent to Family",
]);

export const envelopeOf = (t: Pick<Transaction, "category" | "amount" | "channel" | "type">): Envelope =>
  NEEDS.has(t.category) || isMicro(t as Transaction) ? "needs" : "wants";

// ---------------------------------------------------------------- planning

/** Everything the player can plan with on day 1: what's in the account plus expected income. */
export const plannable = (p: Persona) => p.openingBalance + p.monthlyIncome;

export function planAmounts(p: Persona, plan: Plan): Record<Envelope, number> {
  const total = Math.max(0, plannable(p));
  const needs = Math.round((total * plan.needs) / 100);
  const wants = Math.round((total * plan.wants) / 100);
  const emergency = Math.round((total * (plan.emergency ?? 0)) / 100);
  return { needs, wants, emergency, savings: total - needs - wants - emergency };
}

/** What a finished month hands to the next: the money left in the account, and any debt. */
export interface MonthCarry {
  closingBalance: number; // last month's final Savings (everything left after the month-end sweep)
  debt: number; // still owed; repaid first from the new month's money
}

/**
 * The next month opens with last month's closing balance instead of the persona's default,
 * and any debt is paid back first, out of the money you can plan with.
 */
export function withCarryOver(p: Persona, carry: MonthCarry): Persona {
  return {
    ...p,
    openingBalance: carry.closingBalance - carry.debt,
    carriedBalance: carry.closingBalance,
    carriedDebt: carry.debt > 0 ? carry.debt : undefined,
  };
}

/** Give a new emergency envelope 5%, taken from Wants (Savings only if Wants is nearly empty). */
export function withEmergencySlice(p: Plan): Plan {
  if (p.emergency > 0) return p;
  return p.wants >= 10 ? { ...p, wants: p.wants - 5, emergency: 5 } : { ...p, savings: Math.max(0, p.savings - 5), emergency: 5 };
}

/**
 * A realistic plan for next month: halfway between how money was really split last month and
 * 50/30/20, so it's reachable but still an improvement. Needs never drops below known bills,
 * and Savings is at least 10% (taken from Wants if needed).
 */
export function suggestPlan(p: Persona, last: { needsSpent: number; wantsSpent: number }): Plan {
  const total = Math.max(1, plannable(p));
  const pct = (n: number) => (n / total) * 100;
  const billsFloor = Math.ceil(pct(knownBillsTotal(p)) / 5) * 5;
  // Round Needs up (it's committed money) and Wants down (that's where the improvement comes from).
  const needs = Math.min(80, Math.max(billsFloor, Math.ceil((pct(last.needsSpent) + DEFAULT_PLAN.needs) / 2 / 5) * 5));
  let wants = Math.max(5, Math.floor((pct(last.wantsSpent) + DEFAULT_PLAN.wants) / 2 / 5) * 5);
  if (100 - needs - wants < 10) wants = Math.max(5, 100 - needs - 10);
  return { needs, wants, savings: 100 - needs - wants, emergency: 0 };
}

export const knownBillsTotal = (p: Persona) => sum(p.knownBills);

/**
 * The "Smart split" ability: start from 50/30/20, but make Needs big enough for known bills plus
 * everyday essentials, and never squeeze Wants below 20% or Savings below 10%.
 */
export function smartSplit(p: Persona): Plan {
  const billsPct = (knownBillsTotal(p) / plannable(p)) * 100;
  const needs = Math.min(70, Math.max(50, Math.ceil((billsPct + 10) / 5) * 5));
  const savings = Math.max(10, Math.min(20, 100 - needs - 20));
  return { needs, wants: 100 - needs - savings, savings, emergency: 0 };
}

/** The one income the plan already counts (pocket money / salary). Anything else is extra. */
function isPlannedIncome(t: Transaction, p: Persona) {
  return (
    t.type === "CR" &&
    (t.category === "Salary" || t.category === "Family Support") &&
    t.amount >= p.monthlyIncome * 0.5 &&
    dayOf(t) <= 10
  );
}

export function weeksOf(p: Persona) {
  const days = new Date(p.year, p.month, 0).getDate();
  return [
    { week: 1, from: 1, to: 7 },
    { week: 2, from: 8, to: 14 },
    { week: 3, from: 15, to: 21 },
    { week: 4, from: 22, to: days },
  ];
}

// ---------------------------------------------------------------- abilities

/** Learned skills change the month itself: fewer chai payments, cook nights, extra options. */
export function applyAbilities(p: Persona, abilities: Ability[]): Persona {
  const has = (a: Ability) => abilities.includes(a);
  let txns = p.transactions;

  if (has("chai-cap")) {
    // A weekly chai & snacks cap: roughly every third tiny payment doesn't happen.
    let n = 0;
    txns = txns.filter((t) => !(isMicro(t) && ++n % 3 === 0));
  }
  if (has("cook-nights")) {
    // Every other delivery becomes a cook night: groceries at about a third of the price.
    let n = 0;
    const extra: Transaction[] = [];
    txns = txns.filter((t) => {
      if (!isDelivery(t) || ++n % 2 === 1) return true;
      extra.push({
        ...t,
        id: `${t.id}-cook`,
        counterparty: "Zepto",
        description: t.description.replace(/UPI\/[^/]+/, "UPI/Zepto"),
        amount: Math.round((t.amount * 0.35) / 5) * 5,
        category: "Groceries",
      });
      return false;
    });
    txns = [...txns, ...extra].sort((a, b) => a.datetime.localeCompare(b.datetime));
  }

  const choices = p.choices.map((c) => ({
    ...c,
    options: c.options.filter((o) => !o.ability || has(o.ability)),
  }));
  return { ...p, transactions: txns, choices };
}

// ---------------------------------------------------------------- ledger

function newLedger(p: Persona, plan: Plan): Ledger {
  const { needs, wants, emergency, savings } = planAmounts(p, plan);
  return { needs, wants, emergency, savings: 0, locked: savings, debt: 0 };
}

/** Pay yourself first: move this week's share of planned savings into the Savings envelope. */
function autoSave(l: Ledger, planned: number, week: number) {
  const move = Math.min(l.locked, week === 4 ? l.locked : Math.round(planned / 4));
  l.locked -= move;
  l.savings += move;
  return move;
}

/** Savings you can raid: what's already in the envelope plus what hasn't been moved in yet. */
const saved = (l: Ledger) => l.savings + l.locked;

/** All the money you hold, across every envelope (debt not subtracted). */
export const walletOf = (l: Ledger) => l.needs + l.wants + l.emergency + l.savings + l.locked;

/** What a "save it" choice does: move from Wants, pay back any debt first, the rest into Savings. */
export function goalMove(l: Pick<Ledger, "wants" | "debt">, toGoal: number) {
  const move = Math.min(toGoal, Math.max(0, l.wants));
  const repaid = Math.min(l.debt, move);
  return { move, repaid, toSavings: move - repaid };
}

// When an envelope runs dry, raid the others in this order. The emergency envelope protects Savings.
const RAID_ORDER: Record<Envelope, Envelope[]> = {
  wants: ["needs", "emergency", "savings"],
  needs: ["wants", "emergency", "savings"],
  emergency: ["needs", "wants", "savings"],
  savings: [],
};

/** Take a payment from its envelope; if it runs dry, raid the others, then borrow. */
function spend(l: Ledger, env: Envelope, amount: number, week: number, day: number, raids: Raid[]) {
  l[env] -= amount;
  if (l[env] >= 0) return;
  let short = -l[env];
  l[env] = 0;
  for (const from of RAID_ORDER[env]) {
    const take = Math.min(from === "savings" ? saved(l) : l[from], short);
    if (take > 0) {
      if (from === "savings") {
        const fromLocked = Math.min(l.locked, take);
        l.locked -= fromLocked;
        l.savings -= take - fromLocked;
      } else {
        l[from] -= take;
      }
      short -= take;
      raids.push({ week, day, from, to: env, amount: take });
    }
    if (short === 0) return;
  }
  l.debt += short;
  raids.push({ week, day, from: "debt", to: env, amount: short });
}

/** Unplanned money in pays back debt first, then lands in Wants. */
function receive(l: Ledger, amount: number) {
  const repay = Math.min(l.debt, amount);
  l.debt -= repay;
  l.wants += amount - repay;
}

// ---------------------------------------------------------------- event rules

interface Ctx {
  persona: Persona;
  before: Transaction[]; // everything before this week
  week: Transaction[];
  weekNo: number;
  raids: Raid[]; // raids caused by this week's payments
  fired: Set<string>; // event ids already shown this month
}

type Rule = (ctx: Ctx) => GameEvent | null;

// Rules are listed in priority order; each week shows at most MAX_EVENTS_PER_WEEK of them.
const RULES: Rule[] = [
  function borrowed({ persona, raids, weekNo, fired }) {
    const debt = raids.filter((r) => r.from === "debt");
    if (!debt.length || fired.has("borrowed")) return null;
    const amount = sum(debt);
    return {
      id: "borrowed",
      week: weekNo,
      icon: "users",
      tone: "bad",
      title: persona.copy.borrowTitle.replace("{amount}", inr(amount)),
      body: "Every envelope hit zero before the month did. Next month starts with money to pay back.",
      amount,
      delta: { stress: 15, happiness: -8 },
      lesson: "emergency-fund",
    };
  },

  function savingsRaided({ raids, weekNo, fired }) {
    const r = raids.filter((x) => x.from === "savings");
    if (!r.length || fired.has("savings-raid")) return null;
    const amount = sum(r);
    return {
      id: "savings-raid",
      week: weekNo,
      icon: "piggy-bank",
      tone: "bad",
      title: `Broke into savings on day ${r[0].day}`,
      body: `Needs and Wants were both empty, so ${inr(amount)} came out of your Savings envelope. The goal just moved further away.`,
      amount,
      delta: { stress: 8, happiness: -5 },
      lesson: "emergency-fund",
    };
  },

  function wantsRanDry({ raids, weekNo, fired }) {
    const r = raids.filter((x) => x.from === "needs" && x.to === "wants");
    if (!r.length || fired.has("wants-dry")) return null;
    const amount = sum(r);
    return {
      id: "wants-dry",
      week: weekNo,
      icon: "alert",
      tone: "bad",
      title: `Wants ran dry on day ${r[0].day}`,
      body: `${inr(amount)} of fun money came out of Needs. That's food and travel money for the rest of the month.`,
      amount,
      delta: { stress: 10, happiness: -3 },
      lesson: "running-low",
    };
  },

  function needsOver({ raids, weekNo, fired }) {
    const r = raids.filter((x) => x.from === "wants" && x.to === "needs");
    if (!r.length || fired.has("needs-over")) return null;
    const amount = sum(r);
    return {
      id: "needs-over",
      week: weekNo,
      icon: "alert",
      tone: "neutral",
      title: "Needs went over plan",
      body: `Essentials cost more than you planned, so ${inr(amount)} came out of Wants. Less fun money for the rest of the month.`,
      amount,
      delta: { stress: 5, happiness: -3 },
      lesson: "fixed-costs",
    };
  },

  function income({ persona, week, weekNo, fired }) {
    if (fired.has("income")) return null;
    const t = week.find((x) => isPlannedIncome(x, persona));
    if (!t) return null;
    return {
      id: "income",
      week: weekNo,
      icon: t.category === "Salary" ? "briefcase" : "wallet",
      tone: "good",
      title: persona.copy.incomeTitle,
      body: persona.copy.incomeBody.replace("{amount}", inr(t.amount)).replace("{day}", String(dayOf(t))),
      amount: t.amount,
      delta: { happiness: 5, stress: -10 },
    };
  },

  function fixedCosts({ persona, week, weekNo, fired }) {
    if (fired.has("fixed-costs")) return null;
    const fixed = week.filter(
      (x) => x.type === "DR" && (x.category === "Rent" || x.category === "EMI & Loans") && !isPayLater(x),
    );
    const total = sum(fixed);
    if (total < persona.monthlyIncome * 0.2) return null;
    const share = Math.round((total / persona.monthlyIncome) * 100);
    const hasEmi = fixed.some((x) => x.category === "EMI & Loans");
    return {
      id: "fixed-costs",
      week: weekNo,
      icon: "home",
      tone: "neutral",
      title: `${hasEmi ? "Rent and EMI" : "Rent"} gone by day ${Math.max(...fixed.map(dayOf))}`,
      body: `${inr(total)}, ${share}% of your income, is gone before you've bought a single thing.`,
      amount: total,
      delta: { stress: 6 },
      lesson: "fixed-costs",
    };
  },

  function payLater({ week, weekNo, fired }) {
    const t = week.find((x) => x.type === "DR" && isPayLater(x));
    if (!t || fired.has(`pay-later-${t.id}`)) return null;
    return {
      id: `pay-later-${t.id}`,
      week: weekNo,
      icon: "credit-card",
      tone: "bad",
      title: `${t.counterparty} bill: ${inr(t.amount)}`,
      body: "All those small \"pay later\" taps from last month, due at once.",
      amount: t.amount,
      delta: { stress: 8, happiness: -2 },
      lesson: "emi-trap",
    };
  },

  function familyTopUp({ week, weekNo, fired }) {
    const t = week.find((x) => x.type === "CR" && x.category === "Family Support" && x.amount >= 1000 && dayOf(x) > 10);
    if (!t || fired.has("family-topup")) return null;
    return {
      id: "family-topup",
      week: weekNo,
      icon: "home",
      tone: "good",
      title: `Mom sent ${inr(t.amount)} "just in case"`,
      body: "Unplanned money lands in Wants, or pays back what you borrowed first.",
      amount: t.amount,
      delta: { stress: -6, happiness: 3 },
    };
  },

  function impulseBuy({ persona, week, weekNo, fired }) {
    const big = Math.max(900, persona.monthlyIncome * 0.04);
    const t = week.find((x) => x.type === "DR" && x.category === "Shopping" && x.amount >= big);
    if (!t || fired.has(`impulse-${t.id}`)) return null;
    const lateNight = Number(t.datetime.slice(11, 13)) >= 23;
    const shop = t.counterparty.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
    return {
      id: `impulse-${t.id}`,
      week: weekNo,
      icon: "shopping-bag",
      tone: "bad",
      title: lateNight ? "Midnight add-to-cart" : "Big buy",
      body: `${inr(t.amount)} at ${shop}${lateNight ? ` at ${t.datetime.slice(11, 16)}` : ""}. The excitement fades by the time it arrives.`,
      amount: t.amount,
      delta: { happiness: 2, stress: 6 },
      lesson: "impulse",
    };
  },

  function sentHome({ week, weekNo, fired }) {
    const t = week.find((x) => x.type === "DR" && x.category === "Sent to Family");
    if (!t || fired.has("sent-home")) return null;
    return {
      id: "sent-home",
      week: weekNo,
      icon: "heart",
      tone: "good",
      title: `Sent ${inr(t.amount)} home`,
      body: "Your parents call just to say it arrived. It feels good, and it's money you plan around every month.",
      amount: t.amount,
      delta: { happiness: 6, stress: -2 },
    };
  },

  function microSpends({ persona, before, week, weekNo, fired }) {
    const all = [...before, ...week].filter(isMicro);
    const total = sum(all);
    if (!fired.has("micro-count") && all.length >= 8) {
      const weekly = week.filter(isMicro);
      return {
        id: "micro-count",
        week: weekNo,
        icon: "coffee",
        tone: "neutral",
        title: `${weekly.length} tiny UPI payments this week`,
        body: `Chai, lunch, a samosa. None felt like spending, but together they're ${inr(sum(weekly))}.`,
        amount: sum(weekly),
        delta: { happiness: 1 },
        lesson: "upi-micro",
      };
    }
    if (fired.has("micro-count") && !fired.has("micro-share") && total >= persona.monthlyIncome * 0.12) {
      const share = Math.round((total / persona.monthlyIncome) * 100);
      return {
        id: "micro-share",
        week: weekNo,
        icon: "coffee",
        tone: "bad",
        title: `The chai tab is ${share}% of your money`,
        body: `${all.length} payments under ₹150 this month add up to ${inr(total)}.`,
        amount: total,
        delta: { stress: 5 },
        lesson: "upi-micro",
      };
    }
    return null;
  },

  function delivery({ persona, before, week, weekNo, fired }) {
    const prev = before.filter(isDelivery).length;
    const now = prev + week.filter(isDelivery).length;
    const spent = sum([...before, ...week].filter(isDelivery));
    if (prev < 8 && now >= 8 && !fired.has("delivery-8")) {
      return {
        id: "delivery-8",
        week: weekNo,
        icon: "utensils",
        tone: "bad",
        title: `Order #${now} from Swiggy & Zomato`,
        body: `${persona.copy.deliveryLate} ${inr(spent)} on delivery this month.`,
        amount: spent,
        delta: { happiness: -3, stress: 6 },
        lesson: "delivery",
      };
    }
    if (prev < 4 && now >= 4 && !fired.has("delivery-4")) {
      return {
        id: "delivery-4",
        week: weekNo,
        icon: "utensils",
        tone: "neutral",
        title: "Late-night cravings",
        body: `${now} delivery orders already. ${persona.copy.deliveryEarly}`,
        amount: spent,
        delta: { happiness: 3, stress: 2 },
      };
    }
    return null;
  },

  function bigTreat({ persona, week, weekNo, fired }) {
    const big = Math.max(450, persona.monthlyIncome * 0.025);
    const t = week.find(
      (x) =>
        x.type === "DR" &&
        (x.category === "Food & Dining" || x.category === "Entertainment") &&
        x.amount >= big &&
        !isDelivery(x),
    );
    if (!t || fired.has(`treat-${t.id}`)) return null;
    return {
      id: `treat-${t.id}`,
      week: weekNo,
      icon: "party",
      tone: "good",
      title: t.category === "Entertainment" ? "Movie night" : "Big night out",
      body: `${inr(t.amount)} at ${t.counterparty}. Good memories, lighter Wants envelope.`,
      amount: t.amount,
      delta: { happiness: 6, stress: -3 },
    };
  },

  function friendsPaidBack({ week, weekNo, fired }) {
    const back = week.filter((x) => x.type === "CR" && x.category === "Received from Friends");
    if (!back.length || fired.has(`friends-${weekNo}`)) return null;
    return {
      id: `friends-${weekNo}`,
      week: weekNo,
      icon: "users",
      tone: "good",
      title: "A friend paid you back",
      body: `${back.map((x) => x.counterparty).join(" and ")} sent ${inr(sum(back))}. It goes into Wants.`,
      amount: sum(back),
      delta: { happiness: 3, stress: -2 },
    };
  },
];

function quietWeek(persona: Persona, weekNo: number, spent: number): GameEvent {
  return {
    id: `quiet-${weekNo}`,
    week: weekNo,
    icon: "sparkles",
    tone: "good",
    title: "A quiet week",
    body: `${persona.copy.quietWeek} ${inr(spent)} out, nothing dramatic.`,
    amount: spent,
    delta: { stress: -4 },
  };
}

// ---------------------------------------------------------------- simulation

export interface MonthSim {
  persona: Persona; // after abilities
  plan: Plan;
  planned: Record<Envelope, number>;
  weeks: WeekResult[];
  startStats: Stats;
  startLedger: Ledger;
  /** Ledger and stats at the end of the last week that has been fully decided. */
  ledger: Ledger;
  stats: Stats;
}

/** The synthetic transaction a picked option adds (dated the last day of its week). */
function choiceTxn(p: Persona, c: Choice, optionIndex: number): Transaction | null {
  const o = c.options[optionIndex];
  if (!o?.spend) return null;
  const w = weeksOf(p)[c.week - 1];
  const mm = String(p.month).padStart(2, "0");
  return {
    id: `choice-${c.id}`,
    datetime: `${p.year}-${mm}-${String(w.to).padStart(2, "0")}T20:00:00`,
    description: `UPI/${o.spend.counterparty}/choice/Paid`,
    amount: o.spend.amount,
    type: "DR",
    channel: "UPI",
    counterparty: o.spend.counterparty,
    category: o.spend.category,
    confidence: "user",
  };
}

/**
 * Plays the month for a plan and the decisions made so far. Week N only depends on decisions from
 * earlier weeks, so the UI can call this again after each choice without rewriting history.
 */
export function simulateMonth(
  base: Persona,
  type: CharacterType,
  plan: Plan,
  decisions: Decisions,
  abilities: Ability[] = [],
  startMood?: Pick<Stats, "happiness" | "stress">,
): MonthSim {
  const persona = applyAbilities(base, abilities);
  const total = Math.max(1, plannable(persona));
  const fired = new Set<string>();
  // Mood carries over from last month; a first month starts from the life stage's default.
  const mood = { ...(startMood ?? STARTING_MOOD[type]) };
  const ledger = newLedger(persona, plan);
  const planned = planAmounts(persona, plan);

  const applyDelta = (d: MoodDelta) => {
    mood.happiness = clamp(mood.happiness + (d.happiness ?? 0));
    mood.stress = clamp(mood.stress + (d.stress ?? 0));
  };
  const toStats = (): Stats => ({
    savings: clamp(((walletOf(ledger) - ledger.debt) / total) * 100),
    happiness: mood.happiness,
    stress: mood.stress,
    goal: clamp((ledger.savings / persona.savingsGoal) * 100),
  });

  const startStats = toStats();
  const startLedger = { ...ledger };
  const weeks: WeekResult[] = [];
  const txns = persona.transactions;
  const monthShort = new Date(persona.year, persona.month - 1, 1).toLocaleString("en-IN", { month: "short" });

  let carried: Raid[] = []; // raids from last week's decision, shown as this week's consequences
  for (const w of weeksOf(persona)) {
    const before = txns.filter((t) => dayOf(t) < w.from);
    const week = txns.filter((t) => dayOf(t) >= w.from && dayOf(t) <= w.to);

    // 1. Money moves: this week's savings go in first, then each payment comes out of its envelope.
    const autoSaved = autoSave(ledger, planned.savings, w.week);
    // Copy: the decision's own list must never grow with next week's payments.
    const raids: Raid[] = [...carried];
    carried = [];
    for (const t of week) {
      if (t.type === "CR") {
        if (!isPlannedIncome(t, persona)) receive(ledger, t.amount);
      } else {
        spend(ledger, envelopeOf(t), t.amount, w.week, dayOf(t), raids);
      }
    }
    const ledgerAfterTxns = { ...ledger };
    const statsAfterTxns = toStats();

    // 2. Life events from rules; each nudges the mood.
    const ctx: Ctx = { persona, before, week, weekNo: w.week, raids, fired };
    const events: GameEvent[] = [];
    for (const rule of RULES) {
      if (events.length >= MAX_EVENTS_PER_WEEK) break;
      const e = rule(ctx);
      if (e) {
        events.push(e);
        fired.add(e.id);
      }
    }
    const spent = sum(week.filter((t) => t.type === "DR"));
    if (!events.length) events.push(quietWeek(persona, w.week, spent));
    const statsAfterEvent = events.map((e) => {
      applyDelta(e.delta);
      return toStats();
    });

    // 3. The week's decision.
    const choice = persona.choices.find((c) => c.week === w.week);
    const result: WeekResult = {
      week: w.week,
      label: `${w.from}–${w.to} ${monthShort}`,
      transactions: week,
      spent,
      received: sum(week.filter((t) => t.type === "CR")),
      autoSaved,
      raids,
      events,
      choice,
      ledgerAfterTxns,
      statsAfterTxns,
      statsAfterEvent,
    };
    const picked = choice ? decisions[choice.id] : undefined;
    if (choice && picked !== undefined && choice.options[picked]) {
      const o = choice.options[picked];
      const choiceRaids: Raid[] = [];
      const t = choiceTxn(persona, choice, picked);
      // Emergencies (repairs) come out of the emergency envelope first, if there is one.
      const env = t && choice.tags?.includes("emergency") && ledger.emergency > 0 ? "emergency" : t ? envelopeOf(t) : null;
      if (t && env) spend(ledger, env, t.amount, w.week, w.to, choiceRaids);
      const g = goalMove(ledger, o.toGoal ?? 0);
      ledger.wants -= g.move;
      ledger.debt -= g.repaid;
      ledger.savings += g.toSavings;
      applyDelta(o.delta);
      result.choiceResult = {
        raids: [...choiceRaids],
        toSavings: g.toSavings,
        repaid: g.repaid,
        ledger: { ...ledger },
        stats: toStats(),
      };
      carried = choiceRaids;
    }
    weeks.push(result);
    if (choice && picked === undefined) break; // later weeks wait for this decision
  }

  return { persona, plan, planned, weeks, startStats, startLedger, ledger: { ...ledger }, stats: toStats() };
}

/** All transactions of the month, including the ones the player's decisions added. */
export function monthTransactions(persona: Persona, decisions: Decisions): Transaction[] {
  const extra = persona.choices
    .map((c) => (decisions[c.id] === undefined ? null : choiceTxn(persona, c, decisions[c.id])))
    .filter((t): t is Transaction => t !== null);
  return [...persona.transactions, ...extra].sort((a, b) => a.datetime.localeCompare(b.datetime));
}

/** The player's own numbers from a finished month, so lessons talk about their money. */
export function lessonContextFrom(p: Persona, r: ReportCard): LessonContext {
  const days = new Date(p.year, p.month, 0).getDate();
  return {
    monthName: new Date(p.year, p.month - 1, 1).toLocaleString("en-IN", { month: "long" }),
    income: p.monthlyIncome,
    microPerDay: Math.round(r.micro.total / days),
    deliveryOrders: r.delivery.count,
    deliveryAvg: r.delivery.count ? Math.round(r.delivery.total / r.delivery.count) : 0,
    week1Spent: r.weekSpent[0] ?? 0,
    fixedCosts: knownBillsTotal(p),
    biggestBuy: r.biggestBuy,
  };
}

// ---------------------------------------------------------------- report card

export type Grade = "A" | "B" | "C" | "D";

export interface EnvelopeReview {
  env: Envelope;
  planned: number;
  budget: number; // planned + extra money that landed in it
  actual: number; // spent (needs/wants) or kept (savings)
  grade: Grade;
  verdict: string;
}

export interface ReportCard {
  grade: Grade;
  needsSpent: number;
  wantsSpent: number;
  weekSpent: number[];
  delivery: { count: number; total: number };
  biggestBuy?: { amount: number; counterparty: string };
  score: number;
  headline: string;
  received: number;
  spent: number;
  extraIncome: number;
  swept: number; // unspent Needs/Wants moved into Savings at month end
  savingsKept: number; // final Savings envelope minus debt
  debt: number;
  goal: number;
  envelopes: EnvelopeReview[];
  categories: { category: string; amount: number }[];
  micro: { count: number; total: number };
  lesson: LessonId;
  lessons: LessonId[]; // everything unlocked this month
  finalStats: Stats;
  finalLedger: Ledger;
}

export function reportCard(
  base: Persona,
  type: CharacterType,
  plan: Plan,
  decisions: Decisions,
  abilities: Ability[] = [],
  startMood?: Pick<Stats, "happiness" | "stress">,
): ReportCard {
  const sim = simulateMonth(base, type, plan, decisions, abilities, startMood);
  const persona = sim.persona;
  const txns = monthTransactions(persona, decisions);
  const debits = txns.filter((t) => t.type === "DR");
  const credits = txns.filter((t) => t.type === "CR");
  const received = sum(credits);
  const extraIncome = sum(credits.filter((t) => !isPlannedIncome(t, persona)));
  const spent = sum(debits);
  const spentNeeds = sum(debits.filter((t) => envelopeOf(t) === "needs"));
  const spentWants = spent - spentNeeds;

  // Month end: whatever is left in Needs, Wants and Emergency is swept into Savings, and any debt
  // is paid back from Savings. What's left is exactly what the header shows.
  const l = { ...sim.ledger };
  const swept = l.needs + l.wants + l.emergency;
  const pot = saved(l) + swept;
  const repay = Math.min(l.debt, pot);
  const finalLedger: Ledger = { needs: 0, wants: 0, emergency: 0, savings: pot - repay, locked: 0, debt: l.debt - repay };
  const savingsKept = finalLedger.savings - finalLedger.debt;

  const gradeSpend = (actual: number, budget: number): Grade => {
    const r = actual / Math.max(budget, 1);
    return r <= 1 ? "A" : r <= 1.1 ? "B" : r <= 1.25 ? "C" : "D";
  };
  const gradeSave = (kept: number, target: number): Grade => {
    if (target <= 0) return kept > 0 ? "B" : "D";
    const r = kept / target;
    return r >= 1 ? "A" : r >= 0.8 ? "B" : r >= 0.5 ? "C" : "D";
  };
  const wantsBudget = sim.planned.wants + extraIncome;
  const emergencyUsed = sim.planned.emergency - l.emergency;
  const emergencyReview: EnvelopeReview[] =
    sim.planned.emergency > 0
      ? [
          {
            env: "emergency",
            planned: sim.planned.emergency,
            budget: sim.planned.emergency,
            actual: emergencyUsed,
            grade: emergencyUsed <= sim.planned.emergency ? "A" : "C",
            verdict:
              emergencyUsed > 0
                ? `Covered ${inr(emergencyUsed)} of surprises without touching Savings.`
                : "No emergencies this month. The unused buffer was moved into Savings.",
          },
        ]
      : [];
  const envelopes: EnvelopeReview[] = [
    {
      env: "needs",
      planned: sim.planned.needs,
      budget: sim.planned.needs,
      actual: spentNeeds,
      grade: gradeSpend(spentNeeds, sim.planned.needs),
      verdict:
        spentNeeds <= sim.planned.needs
          ? "Essentials fit the plan."
          : `Essentials cost ${inr(spentNeeds - sim.planned.needs)} more than planned. Check your known bills next time.`,
    },
    {
      env: "wants",
      planned: sim.planned.wants,
      budget: wantsBudget,
      actual: spentWants,
      grade: gradeSpend(spentWants, wantsBudget),
      verdict:
        spentWants <= wantsBudget
          ? "Fun stayed inside the envelope."
          : `Wants went ${inr(spentWants - wantsBudget)} over, and the rest came out of other envelopes.`,
    },
    {
      env: "savings",
      planned: sim.planned.savings,
      budget: sim.planned.savings,
      actual: savingsKept,
      grade: gradeSave(savingsKept, sim.planned.savings),
      verdict:
        savingsKept >= sim.planned.savings
          ? `You kept the ${inr(sim.planned.savings)} you planned to save${swept > 0 ? `, plus ${inr(swept)} left over` : ""}.`
          : savingsKept < 0
            ? `You ended ${inr(-savingsKept)} in debt instead of saving.`
            : `Planned ${inr(sim.planned.savings)}, kept ${inr(savingsKept)}.`,
    },
    ...emergencyReview,
  ];

  // Plan vs actual carries the most weight: sticking to the plan, then reaching the goal, planning
  // to save at all, no debt, and mood. Overshooting an envelope by 50% or more scores zero for it.
  const overshoot = (a: number, b: number) => clamp01(1 - (2 * Math.max(0, a - b)) / Math.max(b, 1));
  const adherence = (overshoot(spentNeeds, sim.planned.needs) + overshoot(spentWants, wantsBudget)) / 2;
  const goalHit = clamp01(savingsKept / persona.savingsGoal);
  const planQuality = clamp01(plan.savings / 20);
  const noDebt = finalLedger.debt > 0 ? 0 : 1;
  const mood = (sim.stats.happiness + 100 - sim.stats.stress) / 200;
  const raw = Math.round(45 * adherence + 25 * goalHit + 10 * planQuality + 10 * noDebt + 10 * mood);
  // Heavy overspending caps the grade: a D envelope means at most C overall, a C envelope at most B.
  const spendGrades = envelopes.filter((e) => e.env === "needs" || e.env === "wants").map((e) => e.grade);
  const cap = spendGrades.includes("D") ? 64 : spendGrades.includes("C") ? 79 : 100;
  const score = Math.min(raw, cap);
  const grade: Grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D";

  const byCat = new Map<string, number>();
  for (const t of debits) byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
  const categories = [...byCat].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  const micro = debits.filter(isMicro);

  const lesson: LessonId =
    finalLedger.debt > 0 ? "emergency-fund" : plan.savings < 15 || spentWants > wantsBudget ? "50-30-20" : "emergency-fund";
  const lessons = [
    ...new Set([...sim.weeks.flatMap((w) => w.events.map((e) => e.lesson)), lesson].filter(Boolean)),
  ] as LessonId[];

  const headline =
    finalLedger.debt > 0
      ? `You ended the month owing ${inr(finalLedger.debt)}.`
      : savingsKept >= persona.savingsGoal
        ? `Goal reached: ${inr(savingsKept)} saved.`
        : `${inr(savingsKept)} saved of your ${inr(persona.savingsGoal)} goal.`;

  const finalStats: Stats = {
    ...sim.stats,
    goal: clamp((Math.max(0, savingsKept) / persona.savingsGoal) * 100),
  };

  const deliveries = debits.filter(isDelivery);
  const biggest = debits
    .filter((t) => t.category === "Shopping")
    .sort((a, b) => b.amount - a.amount)[0];

  return {
    grade,
    needsSpent: spentNeeds,
    wantsSpent: spentWants,
    weekSpent: sim.weeks.map((w) => w.spent),
    delivery: { count: deliveries.length, total: sum(deliveries) },
    biggestBuy: biggest ? { amount: biggest.amount, counterparty: biggest.counterparty } : undefined,
    score,
    headline,
    received,
    spent,
    extraIncome,
    swept,
    savingsKept,
    debt: finalLedger.debt,
    goal: persona.savingsGoal,
    envelopes,
    categories,
    micro: { count: micro.length, total: sum(micro) },
    lesson,
    lessons,
    finalStats,
    finalLedger,
  };
}
