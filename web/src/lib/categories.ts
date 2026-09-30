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

export const ALL_CATEGORIES = [...new Set<string>([...TEACH_CATEGORIES, ...RULE_CATEGORIES, "Self"])];

export type TeachCategory = (typeof TEACH_CATEGORIES)[number];

/**
 * What a label means for one transaction. "Family" depends on direction (money from family is
 * support, money to family is sent home) and "Self" is a transfer between your own accounts.
 * Used by both the browser and the API, so a label always lands the same way.
 */
export function categoryForLabel(label: string, type: "DR" | "CR"): string {
  if (label === "Self") return "Self Transfer";
  if (label === "Family") return type === "CR" ? "Family Support" : "Sent to Family";
  return label;
}

/** How payee names are compared: case-insensitive, spaces ignored ("Ramesh Kumar" → "rameshkumar"). */
export const payeeKey = (name: string) => name.toLowerCase().replace(/\s+/g, "");
