import type { Envelope, EventTone, GameEvent, IconName, Ledger, LessonId, MoodDelta, Raid } from "../types";
import { netFriends } from "@/lib/friends";
import { dayOf, flowOf, hourOf, ist, isDelivery, isMicro, isSpend, nameOf, payeeKey, type RealMonth, type RealTxn } from "./real-month";

// The event template library for "Replay your real past". Plain rules, no AI: each template has a
// trigger over the player's real transactions and fills in their real amounts, counts, dates and
// nicknames. Money thresholds are fractions of the month's income (with a floor), so "a big buy"
// means big *for this player*: ₹1,300 is big on ₹8,000 pocket money, not on a ₹40,000 salary.
// Small UPI payments stay absolute (≤ ₹150): a ₹20 chai is a chai at any income.

export type TemplateGroup =
  | "income"
  | "food"
  | "small-upi"
  | "rent-bills"
  | "shopping"
  | "travel"
  | "entertainment"
  | "health-education"
  | "friends"
  | "family"
  | "savings"
  | "big-one-off"
  | "consequence";

export interface TemplateCtx {
  m: RealMonth;
  week: number;
  from: number;
  to: number;
  weekTxns: RealTxn[];
  before: RealTxn[]; // earlier this month
  income: number; // money the player could plan with this month (at least 1)
  planned: Record<Envelope, number>;
  raids: Raid[]; // envelope transfers caused this week
  ledger: Ledger; // after this week's payments
  autoSaved: number;
  savingsStreak: number; // weeks in a row with savings moved in and never raided
  fired: Set<string>; // template ids already shown this month
  /** Days of the payments the template mentioned while firing (filled in by `who` / `onDate`). */
  touched?: number[];
}

type Fill = Omit<GameEvent, "id" | "week">;

export interface EventTemplate {
  id: string;
  group: TemplateGroup;
  /** May fire again in a later week (otherwise once per month). */
  repeats?: boolean;
  fire: (c: TemplateCtx) => Fill | null;
}

// ---------------------------------------------------------------- helpers

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const sum = (xs: { amount: number }[]) => xs.reduce((s, t) => s + t.amount, 0);
const pct = (c: TemplateCtx, n: number) => Math.round((n / c.income) * 100);
const over = (c: TemplateCtx, frac: number, floor: number) => Math.max(floor, c.income * frac);
/** Marks a payment as part of the event, so the event is dated by it. */
const touch = (c: TemplateCtx, t: RealTxn) => c.touched?.push(dayOf(t));
const who = (c: TemplateCtx, t: RealTxn) => {
  touch(c, t);
  return nameOf(c.m, t.counterparty);
};
const monthShort = (c: TemplateCtx) => new Date(Date.UTC(c.m.year, c.m.month - 1, 1)).toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
const onDate = (c: TemplateCtx, t: RealTxn) => {
  touch(c, t);
  return `${dayOf(t)} ${monthShort(c)}`;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const inCats = (ts: RealTxn[], ...cats: string[]) => ts.filter((t) => cats.includes(t.category));
const spent = (ts: RealTxn[]) => ts.filter(isSpend);
const monthSoFar = (c: TemplateCtx) => [...c.before, ...c.weekTxns];
const biggest = (ts: RealTxn[]) => [...ts].sort((a, b) => b.amount - a.amount)[0];
const isWeekend = (t: RealTxn) => [0, 6].includes(ist(t.datetime).weekday);
const isShare = (c: TemplateCtx, t: RealTxn) => c.m.friendModes[payeeKey(t.counterparty)] === "share";
const isLateNight = (t: RealTxn) => hourOf(t) >= 23 || hourOf(t) < 4;
/** "11:48pm" in India time. */
const clock = (t: RealTxn) => {
  const { hour, minute } = ist(t.datetime);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")}${hour < 12 ? "am" : "pm"}`;
};
const FOOD = ["Food", "Food & Dining"];
const RENT = ["Rent/PG", "Rent"];
const INCOME_CATS = ["Salary", "Salary/Stipend", "Other income", "Other Income", "Scholarship", "Sold something"];

function ev(
  title: string,
  body: string,
  o: { icon: IconName; tone: EventTone; amount?: number; delta?: MoodDelta; lesson?: LessonId; day?: number },
): Fill {
  return { title, body, icon: o.icon, tone: o.tone, amount: o.amount, delta: o.delta ?? {}, lesson: o.lesson, day: o.day };
}

// ---------------------------------------------------------------- the library (priority order)

export const TEMPLATES: EventTemplate[] = [
  // Consequences first: what the envelopes did this week.
  {
    id: "borrowed",
    group: "consequence",
    fire: (c) => {
      const debts = c.raids.filter((r) => r.from === "debt");
      const d = sum(debts);
      if (!d) return null;
      return ev(`Ran out: ${inr(d)} short`, "Every envelope hit zero before the month did. In real life that gap came from a friend, a credit card or home.", {
        icon: "alert", tone: "bad", amount: d, day: debts[0].day, delta: { stress: 15, happiness: -8 }, lesson: "emergency-fund",
      });
    },
  },
  {
    id: "savings-raided",
    group: "consequence",
    fire: (c) => {
      const r = c.raids.filter((x) => x.from === "savings");
      if (!r.length) return null;
      return ev(`Broke into savings on day ${r[0].day}`, `Needs and Wants were both empty, so ${inr(sum(r))} came out of Savings.`, {
        icon: "piggy-bank", tone: "bad", amount: sum(r), day: r[0].day, delta: { stress: 8, happiness: -5 }, lesson: "emergency-fund",
      });
    },
  },
  {
    id: "wants-dry",
    group: "consequence",
    fire: (c) => {
      const r = c.raids.filter((x) => x.from === "needs" && x.to === "wants");
      if (!r.length) return null;
      const amount = r.reduce((s, x) => s + x.amount, 0);
      return ev(`Wants ran dry on day ${r[0].day}`, `${inr(amount)} of fun money came out of Needs: food and travel money for the rest of the month.`, {
        icon: "alert", tone: "bad", amount, day: r[0].day, delta: { stress: 10, happiness: -3 }, lesson: "running-low",
      });
    },
  },
  {
    id: "needs-over",
    group: "consequence",
    fire: (c) => {
      const r = c.raids.filter((x) => x.from === "wants" && x.to === "needs");
      if (!r.length) return null;
      const amount = r.reduce((s, x) => s + x.amount, 0);
      return ev("Essentials cost more than planned", `${inr(amount)} came out of Wants to cover them.`, {
        icon: "receipt", tone: "neutral", amount, day: r[0].day, delta: { stress: 5, happiness: -2 }, lesson: "fixed-costs",
      });
    },
  },
  {
    id: "running-low",
    group: "consequence",
    fire: (c) => {
      const left = c.ledger.needs + c.ledger.wants;
      if (c.week >= 4 || left > over(c, 0.1, 400) || c.ledger.debt > 0) return null;
      if (left >= c.planned.needs + c.planned.wants) return null; // nothing was planned to begin with
      return ev(`Down to ${inr(left)} with ${c.m.days - c.to} days to go`, "Needs and Wants together are almost empty and the month isn't over.", {
        icon: "trending-down", tone: "bad", amount: left, delta: { stress: 12, happiness: -4 }, lesson: "running-low",
      });
    },
  },

  // Income arriving.
  {
    id: "salary-day",
    group: "income",
    fire: (c) => {
      const t = biggest(inCats(c.weekTxns, "Salary", "Salary/Stipend").filter((x) => x.type === "CR"));
      if (!t || t.amount < c.income * 0.4) return null;
      return ev(`Payday: ${inr(t.amount)}`, `${who(c, t)} paid you on ${onDate(c, t)}. For a few hours, you feel rich.`, {
        icon: "briefcase", tone: "good", amount: t.amount, delta: { happiness: 6, stress: -10 },
      });
    },
  },
  {
    id: "money-from-home",
    group: "income",
    fire: (c) => {
      const t = biggest(inCats(c.weekTxns, "Family Support").filter((x) => x.type === "CR"));
      if (!t || t.amount < c.income * 0.3 || dayOf(t) > 12) return null;
      return ev(`Money from home: ${inr(t.amount)}`, `${who(c, t)} sent it on ${onDate(c, t)}. It has to last the month.`, {
        icon: "wallet", tone: "good", amount: t.amount, delta: { happiness: 5, stress: -8 },
      });
    },
  },
  {
    id: "extra-from-home",
    group: "income",
    fire: (c) => {
      const t = inCats(c.weekTxns, "Family Support").find((x) => x.type === "CR" && dayOf(x) > 12);
      if (!t) return null;
      return ev(`Extra from home: ${inr(t.amount)}`, `${who(c, t)} sent more on ${onDate(c, t)}. Nice, and also a sign the month got tight.`, {
        icon: "home", tone: "neutral", amount: t.amount, delta: { stress: -6, happiness: 2 },
      });
    },
  },
  {
    id: "income-in-pieces",
    group: "income",
    fire: (c) => {
      const all = inCats(monthSoFar(c), ...INCOME_CATS).filter((x) => x.type === "CR");
      const now = inCats(c.weekTxns, ...INCOME_CATS).filter((x) => x.type === "CR");
      if (all.length < 2 || !now.length || all.length - now.length < 1) return null;
      return ev(`Paid in pieces: payment #${all.length}`, `${inr(now[0].amount)} from ${who(c, now[0])}. So far this month: ${all.map((x) => inr(x.amount)).join(", ")}. Irregular income makes planning harder.`, {
        icon: "calendar", tone: "neutral", amount: now[0].amount, delta: { stress: 3, happiness: 3 }, lesson: "emergency-fund",
      });
    },
  },
  {
    id: "waiting-for-income",
    group: "income",
    fire: (c) => {
      if (c.week !== 2) return null;
      const got = monthSoFar(c).filter((x) => flowOf(x) === "income");
      if (got.length || c.income < 1000) return null;
      return ev("Still waiting to get paid", `Two weeks in and nothing has come in yet this month. You're living on the ${inr(c.planned.needs + c.planned.wants)} you planned with.`, {
        icon: "calendar", tone: "bad", delta: { stress: 10 }, lesson: "emergency-fund",
      });
    },
  },
  {
    id: "scholarship",
    group: "income",
    fire: (c) => {
      const t = inCats(c.weekTxns, "Scholarship").find((x) => x.type === "CR");
      return t ? ev(`Scholarship landed: ${inr(t.amount)}`, `From ${who(c, t)} on ${onDate(c, t)}. Money for doing well: the best kind.`, { icon: "graduation", tone: "good", amount: t.amount, delta: { happiness: 8, stress: -6 } }) : null;
    },
  },
  {
    id: "sold-something",
    group: "income",
    fire: (c) => {
      const t = inCats(c.weekTxns, "Sold something").find((x) => x.type === "CR");
      return t ? ev(`Sold something: +${inr(t.amount)}`, `${who(c, t)} paid you on ${onDate(c, t)}. Decluttering pays.`, { icon: "sparkles", tone: "good", amount: t.amount, delta: { happiness: 4 } }) : null;
    },
  },
  {
    id: "money-back",
    group: "income",
    fire: (c) => {
      const back = inCats(c.weekTxns, "Refund", "Cashback & Rewards").filter((x) => x.type === "CR");
      const total = sum(back);
      if (total < over(c, 0.01, 100)) return null;
      return ev(`${inr(total)} came back`, `${plural(back.length, "refund or cashback", "refunds and cashbacks")} this week. Unplanned money lands in Wants.`, {
        icon: "sparkles", tone: "good", amount: total, delta: { happiness: 3 },
      });
    },
  },
  {
    id: "interest",
    group: "income",
    fire: (c) => {
      const t = inCats(c.weekTxns, "Interest").find((x) => x.type === "CR");
      return t ? ev(`The bank paid you ${inr(t.amount)}`, "Interest on money that just sat there. Small now, but money kept aside keeps earning.", { icon: "piggy-bank", tone: "good", amount: t.amount, delta: { happiness: 1 } }) : null;
    },
  },

  // Rent, bills, EMIs.
  {
    id: "rent-day",
    group: "rent-bills",
    fire: (c) => {
      const t = biggest(inCats(c.weekTxns, ...RENT).filter((x) => x.type === "DR"));
      if (!t || t.amount < over(c, 0.12, 1000)) return null;
      const p = pct(c, t.amount);
      return ev(`Rent day: ${inr(t.amount)}`, `Paid to ${who(c, t)} on ${onDate(c, t)}. That's ${p}% of your income gone before anything else.`, {
        icon: "home", tone: "neutral", amount: t.amount, delta: { stress: p >= 40 ? 10 : 4 }, lesson: p >= 35 ? "fixed-costs" : undefined,
      });
    },
  },
  {
    id: "emi-day",
    group: "rent-bills",
    fire: (c) => {
      const emis = inCats(c.weekTxns, "EMI & Loans").filter((x) => x.type === "DR");
      if (!emis.length) return null;
      const total = sum(emis);
      return ev(`EMI day: ${inr(total)}`, `${emis.map((x) => who(c, x)).join(" and ")} took ${pct(c, total)}% of your income this week, for something already bought.`, {
        icon: "credit-card", tone: "bad", amount: total, delta: { stress: 8, happiness: -2 }, lesson: "emi-trap",
      });
    },
  },
  {
    id: "bills-week",
    group: "rent-bills",
    fire: (c) => {
      const bills = inCats(c.weekTxns, "Bills & Recharge").filter((x) => x.type === "DR");
      if (bills.length < 3) return null;
      return ev(`Bills week: ${plural(bills.length, "bill")}`, `${[...new Set(bills.map((x) => who(c, x)))].slice(0, 3).join(", ")}: ${inr(sum(bills))} in total. Boring, necessary.`, {
        icon: "receipt", tone: "neutral", amount: sum(bills), delta: { stress: 3 },
      });
    },
  },
  {
    id: "phone-recharge",
    group: "rent-bills",
    fire: (c) => {
      const t = inCats(c.weekTxns, "Bills & Recharge").find((x) => x.type === "DR" && /jio|airtel|vi |vodafone|recharge|bsnl/i.test(x.counterparty));
      return t ? ev(`Phone recharged: ${inr(t.amount)}`, `${who(c, t)} on ${onDate(c, t)}. Data for the month: sorted.`, { icon: "smartphone", tone: "neutral", amount: t.amount, delta: { stress: -1 } }) : null;
    },
  },
  {
    id: "subscriptions",
    group: "rent-bills",
    fire: (c) => {
      const subs = inCats(monthSoFar(c), "Subscriptions & Apps").filter((x) => x.type === "DR");
      if (subs.length < 2 || !inCats(c.weekTxns, "Subscriptions & Apps").length) return null;
      const names = [...new Set(subs.map((x) => who(c, x)))];
      return ev(`${plural(names.length, "subscription")} this month`, `${names.slice(0, 4).join(", ")}: ${inr(sum(subs))}. Each one is small; together they're a bill.`, {
        icon: "tv", tone: "neutral", amount: sum(subs), delta: { stress: 2 },
      });
    },
  },
  {
    id: "fixed-costs-share",
    group: "rent-bills",
    fire: (c) => {
      const fixed = inCats(monthSoFar(c), ...RENT, "EMI & Loans", "Bills & Recharge", "Sent to Family").filter((x) => x.type === "DR");
      const p = pct(c, sum(fixed));
      if (c.week < 2 || p < 45) return null;
      return ev(`Fixed costs: ${p}% of your income`, `Rent, EMIs, bills and money home add up to ${inr(sum(fixed))} so far. What's left has to cover everything else.`, {
        icon: "home", tone: "bad", amount: sum(fixed), delta: { stress: 8 }, lesson: "fixed-costs",
      });
    },
  },

  // Food and delivery.
  {
    id: "delivery-week",
    group: "food",
    repeats: true,
    fire: (c) => {
      const d = c.weekTxns.filter(isDelivery);
      if (d.length < 3 || c.fired.has(`delivery-week-${c.week - 1}`)) return null;
      return ev(`${plural(d.length, "delivery order")} this week`, `${inr(sum(d))} on Swiggy and Zomato between ${onDate(c, d[0])} and ${onDate(c, d.at(-1)!)}.`, {
        icon: "utensils", tone: "neutral", amount: sum(d), delta: { happiness: 3, stress: 2 },
      });
    },
  },
  {
    id: "delivery-habit",
    group: "food",
    fire: (c) => {
      const all = monthSoFar(c).filter(isDelivery);
      if (all.length < 8 || c.before.filter(isDelivery).length >= 8) return null;
      return ev(`Order #${all.length} this month`, `${inr(sum(all))} on delivery, about ${inr(sum(all) / all.length)} an order.`, {
        icon: "utensils", tone: "bad", amount: sum(all), delta: { stress: 5, happiness: -2 }, lesson: "delivery",
      });
    },
  },
  {
    id: "late-night-orders",
    group: "food",
    fire: (c) => {
      const late = c.weekTxns.filter((t) => isDelivery(t) && (hourOf(t) >= 22 || hourOf(t) < 4));
      if (late.length < 2) return null;
      return ev("Midnight cravings", `${plural(late.length, "order")} after 10pm this week, ${inr(sum(late))}. Tomorrow-you pays for tonight-you.`, {
        icon: "utensils", tone: "neutral", amount: sum(late), delta: { happiness: 2, stress: 3 }, lesson: "delivery",
      });
    },
  },
  {
    id: "delivery-share",
    group: "food",
    fire: (c) => {
      const all = monthSoFar(c).filter(isDelivery);
      const p = pct(c, sum(all));
      if (p < 10 || c.week < 3) return null;
      return ev(`Delivery is ${p}% of your income`, `${inr(sum(all))} so far this month on ${plural(all.length, "order")}.`, {
        icon: "utensils", tone: "bad", amount: sum(all), delta: { stress: 6 }, lesson: "delivery",
      });
    },
  },
  {
    id: "big-meal-out",
    group: "food",
    repeats: true,
    fire: (c) => {
      const t = biggest(inCats(c.weekTxns, ...FOOD).filter((x) => x.type === "DR" && !isDelivery(x) && !isMicro(x)));
      if (!t || t.amount < over(c, 0.04, 400)) return null;
      return ev(`Big meal at ${who(c, t)}`, `${inr(t.amount)} on ${onDate(c, t)}. Good food, good company, lighter Wants.`, {
        icon: "party", tone: "good", amount: t.amount, delta: { happiness: 6, stress: -2 },
      });
    },
  },
  {
    id: "regular-spot",
    group: "food",
    fire: (c) => {
      const counts = new Map<string, RealTxn[]>();
      for (const t of inCats(c.weekTxns, ...FOOD).filter((x) => x.type === "DR")) counts.set(payeeKey(t.counterparty), [...(counts.get(payeeKey(t.counterparty)) ?? []), t]);
      const top = [...counts.values()].sort((a, b) => b.length - a.length)[0];
      if (!top || top.length < 4) return null;
      return ev(`A regular at ${who(c, top[0])}`, `${plural(top.length, "visit")} this week, ${inr(sum(top))} in all. They probably know your order by now.`, {
        icon: "coffee", tone: "neutral", amount: sum(top), delta: { happiness: 2 },
      });
    },
  },

  // Small UPI payments.
  {
    id: "tiny-payments-week",
    group: "small-upi",
    fire: (c) => {
      const tiny = c.weekTxns.filter(isMicro);
      if (tiny.length < 8) return null;
      return ev(`${plural(tiny.length, "tiny payment")} this week`, `Chai, lunch, a snack: none felt like spending, but together they're ${inr(sum(tiny))}.`, {
        icon: "coffee", tone: "neutral", amount: sum(tiny), delta: { happiness: 1 }, lesson: "upi-micro",
      });
    },
  },
  {
    id: "chai-tab",
    group: "small-upi",
    fire: (c) => {
      const tiny = monthSoFar(c).filter(isMicro);
      const p = pct(c, sum(tiny));
      if (p < 10 || c.week < 2) return null;
      return ev(`The chai tab is ${p}% of your income`, `${plural(tiny.length, "payment")} under ₹150 so far, ${inr(sum(tiny))} in all.`, {
        icon: "coffee", tone: "bad", amount: sum(tiny), delta: { stress: 5 }, lesson: "upi-micro",
      });
    },
  },
  {
    id: "every-day-streak",
    group: "small-upi",
    fire: (c) => {
      const days = new Set(c.weekTxns.filter(isMicro).map(dayOf));
      if (days.size < 7) return null;
      return ev("A small payment every single day", `All 7 days this week had at least one ₹150-or-less UPI payment, ${inr(sum(c.weekTxns.filter(isMicro)))} in total.`, {
        icon: "coffee", tone: "neutral", delta: { stress: 2 }, lesson: "upi-micro",
      });
    },
  },
  {
    id: "top-small-payee",
    group: "small-upi",
    fire: (c) => {
      if (c.week < 3) return null;
      const by = new Map<string, RealTxn[]>();
      for (const t of monthSoFar(c).filter(isMicro)) by.set(payeeKey(t.counterparty), [...(by.get(payeeKey(t.counterparty)) ?? []), t]);
      const top = [...by.values()].sort((a, b) => sum(b) - sum(a))[0];
      if (!top || sum(top) < over(c, 0.04, 400)) return null;
      return ev(`${who(c, top[0])} got ${inr(sum(top))} in small bits`, `${plural(top.length, "payment")} this month, never more than ₹150 at a time.`, {
        icon: "coffee", tone: "neutral", amount: sum(top), delta: { stress: 2 }, lesson: "upi-micro",
      });
    },
  },

  // Shopping and big one-offs.
  {
    id: "big-buy",
    group: "shopping",
    repeats: true,
    fire: (c) => {
      const t = biggest(inCats(c.weekTxns, "Shopping").filter((x) => x.type === "DR"));
      if (!t || t.amount < over(c, 0.08, 500)) return null;
      const late = isLateNight(t) ? ` at ${clock(t)}` : "";
      return ev(`Big buy: ${inr(t.amount)}`, `At ${who(c, t)} on ${onDate(c, t)}${late}. That's ${pct(c, t.amount)}% of your month in one tap.`, {
        icon: "shopping-bag", tone: "bad", amount: t.amount, delta: { happiness: 4, stress: 5 }, lesson: "impulse",
      });
    },
  },
  {
    id: "midnight-cart",
    group: "shopping",
    fire: (c) => {
      // A late-night buy already shown as this week's big buy gets its time mentioned there instead.
      const shown = c.fired.has(`big-buy-${c.week}`) ? biggest(inCats(c.weekTxns, "Shopping").filter((x) => x.type === "DR")) : undefined;
      const t = c.weekTxns.find((x) => x !== shown && x.category === "Shopping" && x.type === "DR" && isLateNight(x));
      return t ? ev("Midnight add-to-cart", `${inr(t.amount)} at ${who(c, t)} at ${clock(t)} on ${onDate(c, t)}. Late-night shopping is mostly mood.`, { icon: "shopping-bag", tone: "bad", amount: t.amount, delta: { happiness: 2, stress: 4 }, lesson: "impulse" }) : null;
    },
  },
  {
    id: "shopping-spree",
    group: "shopping",
    fire: (c) => {
      const s = inCats(c.weekTxns, "Shopping").filter((x) => x.type === "DR");
      if (s.length < 3) return null;
      return ev(`Shopping spree: ${plural(s.length, "order")}`, `${inr(sum(s))} this week across ${[...new Set(s.map((x) => who(c, x)))].slice(0, 3).join(", ")}.`, {
        icon: "shopping-bag", tone: "bad", amount: sum(s), delta: { happiness: 3, stress: 5 }, lesson: "impulse",
      });
    },
  },
  {
    id: "one-off-large",
    group: "big-one-off",
    repeats: true,
    fire: (c) => {
      const t = biggest(spent(c.weekTxns).filter((x) => !RENT.includes(x.category) && x.category !== "EMI & Loans" && x.category !== "Sent to Family"));
      if (!t || t.amount < over(c, 0.2, 2000)) return null;
      return ev(`One payment, ${pct(c, t.amount)}% of your month`, `${inr(t.amount)} to ${who(c, t)} on ${onDate(c, t)} (${t.category}).`, {
        icon: "alert", tone: "neutral", amount: t.amount, delta: { stress: 6 },
      });
    },
  },
  {
    id: "cash-withdrawal",
    group: "big-one-off",
    fire: (c) => {
      const t = biggest(inCats(c.weekTxns, "Cash Withdrawal"));
      if (!t) return null;
      return ev(`Took out ${inr(t.amount)} in cash`, "Cash is spending your twin can't see: nobody knows where it went.", { icon: "wallet", tone: "neutral", amount: t.amount, delta: { stress: 2 } });
    },
  },

  // Getting around and trips.
  {
    id: "trip-booked",
    group: "travel",
    fire: (c) => {
      const t = biggest(inCats(c.weekTxns, "Travel").filter((x) => x.type === "DR"));
      if (!t || t.amount < over(c, 0.04, 300)) return null;
      return ev(`Trip booked: ${inr(t.amount)}`, `${who(c, t)} on ${onDate(c, t)}. Somewhere to look forward to.`, { icon: "plane", tone: "good", amount: t.amount, delta: { happiness: 8, stress: -3 } });
    },
  },
  {
    id: "rides-week",
    group: "travel",
    fire: (c) => {
      const r = inCats(c.weekTxns, "Transport").filter((x) => x.type === "DR");
      if (r.length < 5) return null;
      return ev(`${plural(r.length, "ride")} this week`, `${inr(sum(r))} getting around, about ${inr(sum(r) / r.length)} a ride.`, { icon: "bike", tone: "neutral", amount: sum(r), delta: { stress: 2 } });
    },
  },
  {
    id: "transport-share",
    group: "travel",
    fire: (c) => {
      const r = inCats(monthSoFar(c), "Transport").filter((x) => x.type === "DR");
      const p = pct(c, sum(r));
      if (p < 10 || c.week < 3) return null;
      return ev(`Getting around: ${p}% of your income`, `${inr(sum(r))} on ${plural(r.length, "ride")} so far this month.`, { icon: "bike", tone: "bad", amount: sum(r), delta: { stress: 4 } });
    },
  },
  {
    id: "weekend-away",
    group: "travel",
    fire: (c) => {
      const w = c.weekTxns.filter((x) => isWeekend(x) && ["Travel", "Entertainment"].includes(x.category) && x.type === "DR");
      if (sum(w) < over(c, 0.05, 500)) return null;
      return ev("A weekend well spent", `${inr(sum(w))} on getting out over the weekend.`, { icon: "mountain", tone: "good", amount: sum(w), delta: { happiness: 7, stress: -4 } });
    },
  },

  // Entertainment.
  {
    id: "night-out",
    group: "entertainment",
    repeats: true,
    fire: (c) => {
      const t = biggest(inCats(c.weekTxns, "Entertainment").filter((x) => x.type === "DR" && !isShare(c, x)));
      if (!t || t.amount < over(c, 0.03, 250)) return null;
      return ev(`Night out: ${inr(t.amount)}`, `${who(c, t)} on ${onDate(c, t)}. Worth it.`, { icon: "party", tone: "good", amount: t.amount, delta: { happiness: 6, stress: -3 } });
    },
  },
  {
    id: "fun-share",
    group: "entertainment",
    fire: (c) => {
      const f = inCats(monthSoFar(c), "Entertainment", "Subscriptions & Apps").filter((x) => x.type === "DR");
      const p = pct(c, sum(f));
      if (p < 12 || c.week < 3) return null;
      return ev(`Fun is ${p}% of your income`, `${inr(sum(f))} on outings and apps so far. Fun matters; so does the rest of the month.`, { icon: "party", tone: "neutral", amount: sum(f), delta: { stress: 3 }, lesson: "50-30-20" });
    },
  },
  {
    id: "weekend-splurge",
    group: "entertainment",
    fire: (c) => {
      const s = spent(c.weekTxns);
      const weekend = sum(s.filter(isWeekend));
      const weekday = sum(s.filter((x) => !isWeekend(x)));
      if (weekend < over(c, 0.05, 500) || weekend < weekday * 1.5) return null;
      return ev("Weekend splurge", `${inr(weekend)} over the weekend vs ${inr(weekday)} on weekdays.`, { icon: "party", tone: "neutral", amount: weekend, delta: { happiness: 4, stress: 2 } });
    },
  },

  // Health and education.
  {
    id: "health",
    group: "health-education",
    fire: (c) => {
      const h = inCats(c.weekTxns, "Health").filter((x) => x.type === "DR");
      if (!h.length || sum(h) < over(c, 0.01, 100)) return null;
      return ev(`Health: ${inr(sum(h))}`, `${[...new Set(h.map((x) => who(c, x)))].join(", ")}. Money well spent.`, { icon: "pill", tone: "neutral", amount: sum(h), delta: { stress: -2 } });
    },
  },
  {
    id: "health-surprise",
    group: "health-education",
    fire: (c) => {
      const t = biggest(inCats(c.weekTxns, "Health").filter((x) => x.type === "DR"));
      if (!t || t.amount < over(c, 0.08, 800)) return null;
      return ev(`An unplanned health bill: ${inr(t.amount)}`, `${who(c, t)} on ${onDate(c, t)}. This is what an emergency fund is for.`, { icon: "pill", tone: "bad", amount: t.amount, delta: { stress: 10 }, lesson: "emergency-fund" });
    },
  },
  {
    id: "study-costs",
    group: "health-education",
    fire: (c) => {
      const e = inCats(c.weekTxns, "Education").filter((x) => x.type === "DR");
      if (!e.length) return null;
      return ev(`Study costs: ${inr(sum(e))}`, `${[...new Set(e.map((x) => who(c, x)))].slice(0, 3).join(", ")}. Books, printouts, fees: needs, not wants.`, { icon: "graduation", tone: "neutral", amount: sum(e), delta: { stress: 1 } });
    },
  },
  {
    id: "fees-paid",
    group: "health-education",
    fire: (c) => {
      const t = biggest(inCats(c.weekTxns, "Education").filter((x) => x.type === "DR"));
      if (!t || t.amount < over(c, 0.15, 1500)) return null;
      return ev(`Fees paid: ${inr(t.amount)}`, `${who(c, t)}, ${pct(c, t.amount)}% of your month. Big, planned, done.`, { icon: "graduation", tone: "neutral", amount: t.amount, delta: { stress: 4 }, lesson: "fixed-costs" });
    },
  },

  // Friends: loans and splits.
  {
    id: "lent-to-friend",
    group: "friends",
    repeats: true,
    fire: (c) => {
      const t = biggest(c.weekTxns.filter((x) => flowOf(x) === "lent"));
      if (!t) return null;
      return ev(`Lent ${inr(t.amount)} to ${who(c, t)}`, `On ${onDate(c, t)}. It's not spending, but it's not in your pocket either.`, { icon: "users", tone: "neutral", amount: t.amount, delta: { stress: 3 } });
    },
  },
  {
    id: "friend-paid-back",
    group: "friends",
    repeats: true,
    fire: (c) => {
      const back = c.weekTxns.filter((x) => flowOf(x) === "friend-back");
      if (!back.length) return null;
      return ev(`${who(c, back[0])} paid you back ${inr(sum(back))}`, `On ${onDate(c, back.at(-1)!)}. Money you lent is coming home.`, { icon: "users", tone: "good", amount: sum(back), delta: { happiness: 3, stress: -3 } });
    },
  },
  {
    id: "borrowed-from-friend",
    group: "friends",
    repeats: true,
    fire: (c) => {
      const t = biggest(c.weekTxns.filter((x) => flowOf(x) === "borrowed"));
      if (!t) return null;
      const name = who(c, t);
      return ev(`You borrowed ${inr(t.amount)} from ${name}`, `On ${onDate(c, t)}. It helped this week, but you owe ${name} ${inr(t.amount)}.`, {
        icon: "credit-card", tone: "bad", amount: t.amount, delta: { stress: 8 }, lesson: "emergency-fund",
      });
    },
  },
  {
    id: "friend-their-share",
    group: "friends",
    repeats: true,
    fire: (c) => {
      const s = c.weekTxns.filter((x) => flowOf(x) === "their-share");
      if (!s.length) return null;
      return ev(`${who(c, s[0])} sent their share: ${inr(sum(s))}`, "For something you paid for. Money back on your own spending, not a loan.", {
        icon: "users", tone: "good", amount: sum(s), delta: { happiness: 2 },
      });
    },
  },
  {
    id: "your-share",
    group: "friends",
    fire: (c) => {
      const s = c.weekTxns.filter((x) => x.type === "DR" && isShare(c, x));
      if (!s.length) return null;
      return ev(`Your share with ${who(c, s[0])}`, `${inr(sum(s))} for things you did together. Counted as your own spending.`, { icon: "party", tone: "good", amount: sum(s), delta: { happiness: 5 } });
    },
  },
  {
    id: "friends-owe-you",
    group: "friends",
    fire: (c) => {
      const owed = netFriends(monthSoFar(c)).owedToYou;
      if (owed < over(c, 0.08, 500) || c.week < 2) return null;
      return ev(`Friends owe you ${inr(owed)}`, `That's ${pct(c, owed)}% of your income out on loan this month.`, { icon: "users", tone: "bad", amount: owed, delta: { stress: 6 } });
    },
  },
  {
    id: "splitting-with-everyone",
    group: "friends",
    fire: (c) => {
      const people = new Set(c.weekTxns.filter((x) => x.type === "DR" && (flowOf(x) === "lent" || isShare(c, x))).map((x) => payeeKey(x.counterparty)));
      if (people.size < 3) return null;
      return ev(`Splitting with ${people.size} friends this week`, "Group plans add up, one share at a time.", { icon: "users", tone: "neutral", delta: { happiness: 4, stress: 2 } });
    },
  },

  // Family.
  {
    id: "sent-home",
    group: "family",
    fire: (c) => {
      const t = biggest(inCats(c.weekTxns, "Sent to Family").filter((x) => x.type === "DR"));
      if (!t) return null;
      return ev(`Sent ${inr(t.amount)} home`, `To ${who(c, t)} on ${onDate(c, t)}. They called to say it arrived.`, { icon: "heart", tone: "good", amount: t.amount, delta: { happiness: 6, stress: -2 } });
    },
  },
  {
    id: "family-backbone",
    group: "family",
    fire: (c) => {
      const fam = inCats(monthSoFar(c), "Family Support").filter((x) => x.type === "CR");
      if (c.week < 3 || sum(fam) < c.income * 0.6) return null;
      return ev("Home is your biggest backer", `${pct(c, sum(fam))}% of this month's money came from family: ${inr(sum(fam))}.`, { icon: "home", tone: "neutral", amount: sum(fam), delta: { happiness: 2 } });
    },
  },
  {
    id: "family-both-ways",
    group: "family",
    fire: (c) => {
      const all = monthSoFar(c);
      const inn = inCats(all, "Family Support");
      const outt = inCats(all, "Sent to Family");
      if (!inn.length || !outt.length || !(inCats(c.weekTxns, "Family Support", "Sent to Family").length)) return null;
      return ev("Money both ways with family", `${inr(sum(inn))} came from home and ${inr(sum(outt))} went back this month.`, { icon: "heart", tone: "neutral", delta: { happiness: 2 } });
    },
  },

  // Savings and good weeks.
  {
    id: "savings-streak",
    group: "savings",
    repeats: true,
    fire: (c) => {
      if (c.savingsStreak < 2 || c.autoSaved <= 0) return null;
      return ev(`Savings streak: ${c.savingsStreak} weeks`, `${inr(c.ledger.savings)} set aside so far, and you haven't touched it.`, { icon: "piggy-bank", tone: "good", amount: c.ledger.savings, delta: { happiness: 4, stress: -4 } });
    },
  },
  {
    id: "no-spend-days",
    group: "savings",
    fire: (c) => {
      const days = new Set(spent(c.weekTxns).map(dayOf));
      const total = c.to - c.from + 1;
      const quiet = total - days.size;
      if (quiet < 2) return null;
      return ev(`${plural(quiet, "no-spend day")}`, `This week you spent nothing on ${quiet} of ${total} days.`, { icon: "sparkles", tone: "good", delta: { stress: -3, happiness: 1 } });
    },
  },
  {
    id: "under-budget",
    group: "savings",
    repeats: true,
    fire: (c) => {
      const pace = (c.planned.needs + c.planned.wants) / 4;
      const s = sum(spent(c.weekTxns));
      if (pace <= 0 || s > pace * 0.6 || s === 0) return null;
      return ev("Under budget this week", `${inr(s)} spent against a weekly pace of about ${inr(pace)}.`, { icon: "piggy-bank", tone: "good", amount: s, delta: { stress: -5, happiness: 2 } });
    },
  },
  {
    id: "payday-splurge",
    group: "savings",
    fire: (c) => {
      const pay = c.weekTxns.find((x) => flowOf(x) === "income" && x.amount >= c.income * 0.3);
      if (!pay) return null;
      const d = dayOf(pay);
      // Only fun counts: paying rent the day salary lands is responsible, not a splurge.
      const after = c.weekTxns.filter((x) => flowOf(x) === "want" && dayOf(x) >= d && dayOf(x) <= d + 3);
      if (sum(after) < pay.amount * 0.15) return null;
      return ev("Payday splurge", `${inr(sum(after))} on wants in the 3 days after ${inr(pay.amount)} arrived. That's ${Math.round((sum(after) / pay.amount) * 100)}% of it.`, { icon: "shopping-bag", tone: "bad", amount: sum(after), delta: { happiness: 3, stress: 5 }, lesson: "50-30-20" });
    },
  },
];

/** Shown when nothing else happened this week. */
export const QUIET_WEEK: EventTemplate = {
  id: "quiet-week",
  group: "savings",
  repeats: true,
  fire: (c) => {
    const s = sum(spent(c.weekTxns));
    return ev("A quiet week", `${inr(s)} out across ${plural(spent(c.weekTxns).length, "payment")}, nothing dramatic.`, { icon: "sparkles", tone: "good", amount: s, delta: { stress: -3 } });
  },
};

export const MAX_EVENTS_PER_WEEK = 3;

/**
 * The events for one week: templates are picked in priority order (each once a month unless it
 * repeats), then shown in the order they happened. An event is dated by the payments it mentions
 * (the latest of them), a raid by the day the envelope ran dry, anything else by the week's end.
 */
export function eventsForWeek(c: TemplateCtx): GameEvent[] {
  const events: GameEvent[] = [];
  for (const t of TEMPLATES) {
    if (events.length >= MAX_EVENTS_PER_WEEK) break;
    if (!t.repeats && c.fired.has(t.id)) continue;
    const touched: number[] = [];
    const fill = t.fire({ ...c, touched });
    if (!fill) continue;
    const id = t.repeats ? `${t.id}-${c.week}` : t.id;
    c.fired.add(t.id);
    c.fired.add(id);
    events.push({ ...fill, id, week: c.week, day: fill.day ?? (touched.length ? Math.max(...touched) : c.to) });
  }
  if (!events.length) {
    const fill = QUIET_WEEK.fire(c)!;
    events.push({ ...fill, id: `quiet-week-${c.week}`, week: c.week, day: c.to });
  }
  return events.map((e, i) => ({ e, i })).sort((a, b) => a.e.day! - b.e.day! || a.i - b.i).map(({ e }) => e);
}
