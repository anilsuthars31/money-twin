// "Replay your real past": the player's saved transactions for one month, shaped for the game.
// Transactions come from MongoDB (categorised, never raw statement text). Dates are read in India
// time, so a payment at 11pm on the 31st belongs to that month, not the next.

export interface RealTxn {
  id: string;
  datetime: string; // ISO (UTC "…Z" from the API, or with +05:30)
  amount: number;
  type: "DR" | "CR";
  channel: string;
  counterparty: string;
  category: string;
  confidence: string;
  balance?: number;
}

export type FriendMode = "lend" | "share";

export interface RealMonth {
  key: string; // "2026-08"
  year: number;
  month: number; // 1-12
  label: string; // "August 2026"
  days: number;
  txns: RealTxn[]; // oldest first
  nicknames: Record<string, string>; // payeeKey → "Gym trainer"
  friendModes: Record<string, FriendMode>;
}

/** How a transaction plays out in the envelopes. */
export type Flow =
  | "need" // essentials: out of Needs
  | "want" // everything else you spend: out of Wants
  | "lent" // money lent to a friend: leaves the wallet, but isn't spending
  | "income" // money you can plan with: salary, stipend, money from home…
  | "extra" // unplanned money in: refunds, cashback, interest
  | "friend-back" // a friend paying you back
  | "ignore"; // transfers between your own accounts, internal bank moves

const NEED_CATEGORIES = new Set([
  "Rent/PG",
  "Rent",
  "Groceries",
  "Bills & Recharge",
  "Education",
  "Health",
  "Transport",
  "EMI & Loans",
  "Sent to Family",
  "Personal Care",
  "Govt & Documents",
  "Bank Charges",
]);
const INCOME_CATEGORIES = new Set([
  "Salary",
  "Salary/Stipend",
  "Family Support",
  "Scholarship",
  "Other income",
  "Other Income",
  "Sold something",
  "Cash Deposit",
  "Received from Friends", // a person the rules couldn't place; counted as money you had
]);
const EXTRA_CATEGORIES = new Set(["Refund", "Cashback & Rewards", "Interest"]);
const IGNORE_CATEGORIES = new Set(["Internal (ignore)", "Self Transfer"]);
const FOOD = new Set(["Food", "Food & Dining"]);

export const payeeKey = (name: string) => name.toLowerCase().replace(/\s+/g, "");

/** India-time parts of a timestamp. */
export function ist(iso: string) {
  const d = new Date(Date.parse(iso) + 5.5 * 3600_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), weekday: d.getUTCDay() };
}

export const monthKeyOf = (iso: string) => {
  const p = ist(iso);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
};

/** Small everyday food payments (chai, lunch) count as essentials, like in the demo. */
export const isMicro = (t: RealTxn) => t.type === "DR" && FOOD.has(t.category) && t.amount <= 150 && t.channel === "UPI";
export const isDelivery = (t: RealTxn) => t.type === "DR" && /swiggy|zomato/i.test(t.counterparty);

export function flowOf(t: RealTxn): Flow {
  if (IGNORE_CATEGORIES.has(t.category)) return "ignore";
  if (t.type === "CR") {
    if (t.category === "Friend") return "friend-back";
    if (EXTRA_CATEGORIES.has(t.category)) return "extra";
    return INCOME_CATEGORIES.has(t.category) ? "income" : "extra";
  }
  if (t.category === "Friend") return "lent";
  return NEED_CATEGORIES.has(t.category) || isMicro(t) ? "need" : "want";
}

/** Spending (needs + wants): what the report and events count as "spent". */
export const isSpend = (t: RealTxn) => {
  const f = flowOf(t);
  return f === "need" || f === "want";
};

/** One category name per idea, for the report ("Food & Dining" and "Food" are the same thing). */
export function displayCategory(category: string): string {
  if (FOOD.has(category)) return "Food";
  if (category === "Rent") return "Rent/PG";
  if (category === "Paid to People" || category === "Uncategorised") return "Not yet taught";
  return category;
}

export function monthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Builds the month from saved transactions (any order) and the player's labels. */
export function buildRealMonth(
  key: string,
  txns: RealTxn[],
  nicknames: Record<string, string> = {},
  friendModes: Record<string, FriendMode> = {},
): RealMonth {
  const [year, month] = key.split("-").map(Number);
  return {
    key,
    year,
    month,
    label: monthLabel(year, month),
    days: new Date(Date.UTC(year, month, 0)).getUTCDate(),
    txns: txns.filter((t) => monthKeyOf(t.datetime) === key).sort((a, b) => a.datetime.localeCompare(b.datetime)),
    nicknames,
    friendModes,
  };
}

/** The name to show: the player's nickname if they gave one. */
export const nameOf = (m: Pick<RealMonth, "nicknames">, counterparty: string) => m.nicknames[payeeKey(counterparty)] ?? counterparty;

const sum = (ts: RealTxn[]) => ts.reduce((s, t) => s + t.amount, 0);

/** Money in the account when the month began: the first balance minus (or plus) its own amount. */
export function openingBalance(m: RealMonth): number {
  const first = m.txns.find((t) => typeof t.balance === "number");
  if (!first || first.balance === undefined) return 0;
  return Math.round(first.balance - (first.type === "CR" ? first.amount : -first.amount));
}

export interface MonthMoney {
  opening: number;
  income: number; // money you could plan with
  extra: number; // refunds, cashback, interest
  spent: number; // needs + wants
  needs: number;
  wants: number;
  lent: number;
  friendBack: number;
}

export function monthMoney(m: RealMonth): MonthMoney {
  const by = (f: Flow) => sum(m.txns.filter((t) => flowOf(t) === f));
  return {
    opening: openingBalance(m),
    income: by("income"),
    extra: by("extra"),
    needs: by("need"),
    wants: by("want"),
    spent: by("need") + by("want"),
    lent: by("lent"),
    friendBack: by("friend-back"),
  };
}

/** Week 1 is days 1–7, week 2 8–14, week 3 15–21, week 4 the rest. */
export function weeksOf(m: RealMonth) {
  return [
    { week: 1, from: 1, to: 7 },
    { week: 2, from: 8, to: 14 },
    { week: 3, from: 15, to: 21 },
    { week: 4, from: 22, to: m.days },
  ];
}

export const dayOf = (t: RealTxn) => ist(t.datetime).day;
export const hourOf = (t: RealTxn) => ist(t.datetime).hour;
