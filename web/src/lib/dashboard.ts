import {
  buildRealMonth,
  cameIn,
  cameInParts,
  displayCategory,
  flowOf,
  isSpend,
  monthKeyOf,
  monthMoney,
  nameOf,
  payeeKey,
  type FriendMode,
  type RealMonth,
  type RealTxn,
} from "@/game/replay/real-month";

// "Where your money goes": month totals, spending by category against last month, the
// month-on-month trend and top payees. Pure functions over saved transactions, using the same
// rules as the replay (what counts as spending, needs vs wants, display category names), so the
// dashboard and the report cards always agree.

export interface DashMonth {
  key: string; // "2026-08"
  label: string; // "August 2026"
  short: string; // "Aug"
  income: number;
  extra: number; // refunds, cashback, interest, friends paying back
  cameIn: number; // income + extra: the one "came in" used everywhere
  cameInParts: { label: string; amount: number }[];
  spent: number; // needs + wants
  needs: number;
  wants: number;
  lent: number; // to friends: not spending, but out of your pocket
  count: number;
}

export interface CategoryLine {
  category: string;
  envelope: "needs" | "wants"; // where most of it went
  amount: number;
  share: number; // of the month's spending, 0-100
  count: number;
  previous: number | null; // same category last month (null when there's no last month)
}

export interface PayeeLine {
  key: string;
  name: string; // nickname if taught
  category: string;
  amount: number;
  count: number;
  share: number; // of the month's spending, 0-100
}

const round = (n: number) => Math.round(n);

/** Every month with transactions, oldest first, with the player's nicknames and friend modes. */
export function monthsOf(txns: RealTxn[], nicknames: Record<string, string> = {}, friendModes: Record<string, FriendMode> = {}): RealMonth[] {
  const keys = [...new Set(txns.map((t) => monthKeyOf(t.datetime)))].sort();
  return keys.map((k) => buildRealMonth(k, txns, nicknames, friendModes));
}

export function monthSummary(m: RealMonth): DashMonth {
  const money = monthMoney(m);
  return {
    key: m.key,
    label: m.label,
    short: new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleString("en-IN", { month: "short", timeZone: "UTC" }),
    income: round(money.income),
    extra: round(money.extra + money.friendBack + money.borrowed),
    cameIn: round(cameIn(money)),
    cameInParts: cameInParts(money),
    spent: round(money.spent),
    needs: round(money.needs),
    wants: round(money.wants),
    lent: round(money.lent),
    count: m.txns.length,
  };
}

/** Change from `before` to `now` in percent, or null when there's nothing to compare with. */
export function changePct(now: number, before: number | null | undefined): number | null {
  if (before === null || before === undefined || before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

function spendByCategory(m: RealMonth) {
  const rows = new Map<string, { amount: number; count: number; needs: number }>();
  for (const t of m.txns.filter(isSpend)) {
    const c = displayCategory(t.category);
    const r = rows.get(c) ?? { amount: 0, count: 0, needs: 0 };
    r.amount += t.amount;
    r.count += 1;
    if (flowOf(t) === "need") r.needs += t.amount;
    rows.set(c, r);
  }
  return rows;
}

/** Spending by category this month, biggest first, with last month's amount for comparison. */
export function categoriesFor(m: RealMonth, previous?: RealMonth): CategoryLine[] {
  const now = spendByCategory(m);
  const before = previous ? spendByCategory(previous) : null;
  const total = Math.max(1, [...now.values()].reduce((s, r) => s + r.amount, 0));
  return [...now.entries()]
    .map(([category, r]) => ({
      category,
      envelope: (r.needs * 2 >= r.amount ? "needs" : "wants") as CategoryLine["envelope"],
      amount: round(r.amount),
      share: Math.round((r.amount / total) * 100),
      count: r.count,
      previous: before ? round(before.get(category)?.amount ?? 0) : null,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** Who your money went to, biggest first. Friends you lent to aren't spending, so they're left out. */
export function topPayees(m: RealMonth, limit = 10): PayeeLine[] {
  const rows = new Map<string, { name: string; amount: number; count: number; cats: Map<string, number> }>();
  for (const t of m.txns.filter(isSpend)) {
    const key = payeeKey(t.counterparty);
    const r = rows.get(key) ?? { name: nameOf(m, t.counterparty), amount: 0, count: 0, cats: new Map() };
    r.amount += t.amount;
    r.count += 1;
    const c = displayCategory(t.category);
    r.cats.set(c, (r.cats.get(c) ?? 0) + t.amount);
    rows.set(key, r);
  }
  const total = Math.max(1, [...rows.values()].reduce((s, r) => s + r.amount, 0));
  return [...rows.entries()]
    .map(([key, r]) => ({
      key,
      name: r.name,
      category: [...r.cats.entries()].sort((a, b) => b[1] - a[1])[0][0],
      amount: round(r.amount),
      count: r.count,
      share: Math.round((r.amount / total) * 100),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

/** Chart axis labels: ₹800, ₹2.5k, ₹12k, ₹1.2L. */
export const compact = (n: number) => {
  const short = (x: number) => (x < 10 ? String(Math.round(x * 10) / 10) : String(Math.round(x)));
  return n >= 100_000 ? `₹${short(n / 100_000)}L` : n >= 1000 ? `₹${short(n / 1000)}k` : `₹${n}`;
};

/** Months with fewer payments than this are probably only part of a month (statement edges). */
export const PARTIAL_MONTH = 10;
