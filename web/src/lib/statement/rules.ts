import { categoryForLabel, payeeKey, type FriendMode } from "@/lib/categories";
import type { StatementRow } from "./kotak";

// Plain-rules categoriser (port of parser/kotak_parser.py). No AI. Differences from the Python
// version, on purpose:
//  - keywords must start at a word boundary, so "hair" no longer matches "chair", "rto" not "porto";
//  - bank charges ("CHRG/...") are recognised;
//  - self and family come only from the user's own labels, never from surname substrings.

export type Confidence = "high" | "medium" | "low" | "user";

/** A categorised transaction. The raw description is dropped here: nothing downstream sees it. */
export interface Categorised {
  datetime: string;
  amount: number;
  type: "DR" | "CR";
  balance: number;
  channel: StatementRow["channel"];
  counterparty: string;
  category: string;
  confidence: Confidence;
  /** What the rules alone said (kept so labels can be undone). */
  ruleCategory: string;
  ruleConfidence: Exclude<Confidence, "user">;
  fingerprint: string;
}

/** Payee labels the player taught: payeeKey → category ("Food", "Family", "Self", "Friend", …). */
export type Labels = Record<string, string>;

/** For payees labelled Friend: whether money sent to them was lending or your share. */
export type FriendModes = Record<string, FriendMode>;

// (category, keywords), checked in order; first match wins.
const MERCHANT_RULES: [string, string[]][] = [
  ["Food & Dining", ["swiggy", "zomato", "domino", "pizza", "kfc", "mcdonald", "burger", "hotel", "cafe", "bakery", "sweets", "restaurant", "chats", "canteen", "juice", "tea ", "dhaba", "biryani", "food"]],
  ["Groceries", ["zepto", "blinkit", "instamart", "bigbasket", "dmart", "mart", "kirana", "provision", "super market", "supermarket", "traders", "general store"]],
  ["Travel", ["indigo", "airline", "airindia", "ibibo", "makemytrip", "irctc", "redbus", "cleartrip", "goibibo"]],
  ["Transport", ["rapido", "uber", "ola ", "bmtc", "metro", "petrol", "fuel", "fastag", "garage", "auto", "namma yatri"]],
  ["Shopping", ["amazon", "flipkart", "myntra", "meesho", "ajio", "lenskart", "jewell", "style union", "styling", "life style", "lifestyle", "delhivery", "fashion", "trends", "bbiege", "footwear", "decathlon"]],
  ["Subscriptions & Apps", ["google india di", "googleindiadigi", "openai", "netflix", "spotify", "hotstar", "prime", "youtube", "apple"]],
  ["Bills & Recharge", ["jio", "airtel", "vi prepaid", "vodafone", "bescom", "electricity", "broadband", "billpay", "recharge"]],
  ["Education", ["institute", "college", "university", "school", "the secretary", "exam", "coaching"]],
  ["Health", ["health", "pharma", "medical", "clinic", "hospital", "apollo", "medplus", "1mg"]],
  ["Personal Care", ["salon", "saloon", "parlour", "barber", "hair"]],
  ["Govt & Documents", ["unique identifi", "uidai", "passport", "rto"]],
];

const INCOME_RULES: [string, string[]][] = [
  ["Cashback & Rewards", ["cashback", "supermoney", "reward"]],
  ["Interest", ["int.pd"]],
  ["Refund", ["rev-upi", "refund", "amazon sel"]],
  ["Cash Deposit", ["cash deposit"]],
];

// Words that suggest a business rather than a person.
const BUSINESS_HINTS = ["enterpri", "store", "shop", "traders", "mart", "pvt", "ltd", "llp", "services", "agency", "centre", "center", "paytmq", "ibkpos", "@ybl", "q52", "bharatpe"];

const IGNORE_PATTERNS = ["ac xfr from gl"];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Short, common keywords (under 6 letters: "hair", "rto", "auto", "exam", "mart") must start a word,
 * so "hair" matches "Hair Studio" but not "Chair". Longer brand names ("airindia", "googleindiadigi")
 * match anywhere, because UPI names are often run together and cut at 15 characters.
 */
const keywordRe = (kws: string[]) => {
  const short = kws.filter((k) => k.trim().length < 6).map(escape);
  const long = kws.filter((k) => k.trim().length >= 6).map(escape);
  const parts = [...(short.length ? [`(?:^|[^a-z0-9])(?:${short.join("|")})`] : []), ...(long.length ? [`(?:${long.join("|")})`] : [])];
  return new RegExp(parts.join("|"));
};
const MERCHANT_RE: [string, RegExp][] = MERCHANT_RULES.map(([c, k]) => [c, keywordRe(k)]);
const INCOME_RE: [string, RegExp][] = INCOME_RULES.map(([c, k]) => [c, keywordRe(k)]);

export function looksLikePerson(name: string): boolean {
  const n = name.toLowerCase();
  if (BUSINESS_HINTS.some((h) => n.includes(h))) return false;
  return /^(mr |mrs |ms )?[a-z .]+$/.test(n); // letters, spaces and dots only
}

const hourOf = (iso: string) => Number(iso.slice(11, 13));

/** What the rules alone say about a row (no user labels). */
export function ruleCategory(r: StatementRow): { category: string; confidence: Exclude<Confidence, "user"> } {
  const desc = r.description.toLowerCase();
  const cp = r.counterparty.toLowerCase();

  if (IGNORE_PATTERNS.some((p) => desc.includes(p))) return { category: "Internal (ignore)", confidence: "high" };
  if (desc.startsWith("chrg")) return { category: "Bank Charges", confidence: "high" };

  if (r.type === "CR") {
    for (const [cat, re] of INCOME_RE) if (re.test(desc)) return { category: cat, confidence: "high" };
    if (looksLikePerson(cp)) return { category: "Received from Friends", confidence: "medium" };
    return { category: "Other Income", confidence: "low" };
  }

  if (r.channel === "ATM") return { category: "Cash Withdrawal", confidence: "high" };
  for (const [cat, re] of MERCHANT_RE) if (re.test(cp) || re.test(desc)) return { category: cat, confidence: "high" };

  // Behavioural guess: a small payment around lunch or dinner to a local vendor is probably food.
  const h = hourOf(r.datetime);
  if (r.amount <= 150 && ((h >= 12 && h <= 15) || (h >= 18 && h <= 22))) return { category: "Food & Dining", confidence: "low" };
  if (looksLikePerson(cp)) return { category: "Paid to People", confidence: "low" };
  return { category: "Uncategorised", confidence: "low" };
}

/** The player's label wins; money to/from "Self" or "Family" gets the direction-specific category. */
export function applyLabel(t: Categorised, labels: Labels, modes: FriendModes = {}): Categorised {
  const key = payeeKey(t.counterparty);
  const label = labels[key];
  if (!label) return { ...t, category: t.ruleCategory, confidence: t.ruleConfidence };
  if (t.ruleCategory === "Internal (ignore)") return t;
  return { ...t, category: categoryForLabel(label, t, modes[key]), confidence: "user" };
}

export const applyLabels = (txns: Categorised[], labels: Labels, modes: FriendModes = {}) =>
  txns.map((t) => applyLabel(t, labels, modes));
