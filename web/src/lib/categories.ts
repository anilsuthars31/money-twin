// Categories shared by the parser, the API and the Teach-your-twin cards.

/** What a player can label a payee as on the Teach-your-twin cards. */
export const TEACH_CATEGORIES = [
  "Food",
  "Rent/PG",
  "Groceries",
  "Friend",
  "Family",
  "Shopping",
  "Transport",
  "Bills & Recharge",
  "Education",
  "Health",
  "Entertainment",
  "Travel",
  "Other",
] as const;

/** Why someone pays *you*: offered instead of spending categories when a payee mostly sends you money. */
export const INCOME_CATEGORIES = ["Salary/Stipend", "Scholarship", "Refund", "Sold something", "Other income"] as const;

/** Categories the rules engine produces on its own (see parser/kotak_parser.py). */
export const RULE_CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Travel",
  "Transport",
  "Shopping",
  "Subscriptions & Apps",
  "Bills & Recharge",
  "Education",
  "Health",
  "Personal Care",
  "Govt & Documents",
  "Entertainment",
  "Gifts",
  "Rent",
  "EMI & Loans",
  "Salary",
  "Cash Withdrawal",
  "Bank Charges",
  "Self Transfer",
  "Sent to Family",
  "Family Support",
  "Received from Friends",
  "Paid to People",
  "Cashback & Rewards",
  "Interest",
  "Refund",
  "Cash Deposit",
  "Other Income",
  "Uncategorised",
  "Internal (ignore)",
] as const;

export const ALL_CATEGORIES = [...new Set<string>([...TEACH_CATEGORIES, ...INCOME_CATEGORIES, ...RULE_CATEGORIES, "Self"])];

/**
 * What money sent to a friend mostly was. "lend": they owe it back. "share": your part of things
 * you did together, which is your own spending. Money a friend sends you is never income either way.
 */
export type FriendMode = "lend" | "share";
export const FRIEND_MODES: FriendMode[] = ["lend", "share"];

/** The hour in India (IST) for a stored Date or an ISO string like "2026-08-03T13:10:00+05:30". */
export function istHour(datetime: string | Date): number {
  const ms = typeof datetime === "string" ? Date.parse(datetime) : datetime.getTime();
  return new Date(ms + 5.5 * 3600_000).getUTCHours();
}

/** "My share" payments become spending: small lunch/dinner payments are food, the rest outings. */
export function friendShareCategory(t: { amount: number; datetime: string | Date }): string {
  const h = istHour(t.datetime);
  return t.amount <= 400 && ((h >= 12 && h <= 15) || (h >= 19 && h <= 23)) ? "Food" : "Entertainment";
}

export type TeachCategory = (typeof TEACH_CATEGORIES)[number];

/**
 * What a label means for one transaction. "Family" depends on direction (money from family is
 * support, money to family is sent home), "Self" is a transfer between your own accounts, and
 * "Friend" is a split/loan, except payments marked "my share", which are your own spending.
 * Used by both the browser and the API, so a label always lands the same way.
 */
export function categoryForLabel(
  label: string,
  t: { type: "DR" | "CR"; amount: number; datetime: string | Date },
  friendMode?: FriendMode,
): string {
  if (label === "Self") return "Self Transfer";
  if (label === "Family") return t.type === "CR" ? "Family Support" : "Sent to Family";
  if (label === "Friend" && friendMode === "share" && t.type === "DR") return friendShareCategory(t);
  return label;
}

/** How payee names are compared: case-insensitive, spaces ignored ("Ramesh Kumar" → "rameshkumar"). */
export const payeeKey = (name: string) => name.toLowerCase().replace(/\s+/g, "");
