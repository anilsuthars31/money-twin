import type { Category, Channel, Transaction, TxnType } from "../types";

// Shared helpers for sample personas. Every persona is generated from a fixed seed, so a given
// life stage + city + month always plays the same way.

export const YEAR = 2026;
/** Months the demo can play: August (first month), September (after learning). */
export const DEMO_MONTHS = [8, 9] as const;
export type DemoMonth = (typeof DEMO_MONTHS)[number];

export function monthInfo(month: number) {
  const days = new Date(YEAR, month, 0).getDate();
  const name = new Date(YEAR, month - 1, 1).toLocaleString("en-IN", { month: "long" });
  return {
    days,
    name,
    label: `${name} ${YEAR}`,
    isWeekend: (day: number) => [0, 6].includes(new Date(YEAR, month - 1, day).getDay()),
  };
}

export function rng(seed: number) {
  const next = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
    between: (lo: number, hi: number, step = 5) => Math.round((lo + next() * (hi - lo)) / step) * step,
    chance: (p: number) => next() < p,
  };
}

export type Draft = {
  day: number;
  time: string; // HH:MM
  amount: number;
  type?: TxnType;
  channel?: Channel;
  counterparty: string;
  category: Category;
  lowConfidence?: boolean; // what the rules engine couldn't place on its own
};

/** Kotak-style description so the data looks like what the real parser produces. */
function describe(d: Draft, i: number, type: TxnType, channel: Channel) {
  if (channel === "CARD") return `PCD/4821/${d.counterparty}/${d.counterparty.split(" ")[0]}`;
  if (channel === "BILLPAY") return `811:BD/${d.counterparty}`;
  if (channel === "IMPS") return `RECD:IMPS/${6000000 + i}/${d.counterparty}`;
  if (channel === "OTHER") return `NACH/${d.counterparty}/${6000000 + i}`;
  return `UPI/${d.counterparty}/${6000000 + i}/${type === "CR" ? "Sent" : "Paid"}`;
}

export function toTransactions(prefix: string, month: number, drafts: Draft[]): Transaction[] {
  const { days } = monthInfo(month);
  const mm = String(month).padStart(2, "0");
  return drafts
    .filter((d) => d.day <= days)
    .map((d, i): Transaction => {
      const type = d.type ?? "DR";
      const channel = d.channel ?? "UPI";
      return {
        id: `${prefix}-${month}-${String(i).padStart(3, "0")}`,
        datetime: `${YEAR}-${mm}-${String(d.day).padStart(2, "0")}T${d.time}:00`,
        description: describe(d, i, type, channel),
        amount: d.amount,
        type,
        channel,
        counterparty: d.counterparty.slice(0, 15),
        category: d.category,
        confidence: d.lowConfidence ? "low" : type === "CR" ? "medium" : "high",
      };
    })
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
}

/** Rent-like amounts: round to the nearest ₹500. */
export const round500 = (n: number) => Math.round(n / 500) * 500;

export const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
