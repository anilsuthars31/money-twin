import { categoryForLabel, payeeKey, type FriendMode, type FriendReceived } from "@/lib/categories";
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

/** For payees labelled Friend: what money they sent you was (paying back, their share, a loan to you). */
export type FriendReceivedModes = Record<string, FriendReceived>;

// (category, keywords), checked in order; first match wins.
const MERCHANT_RULES: [string, string[]][] = [
  ["Food & Dining", ["swiggy", "zomato", "domino", "pizza", "kfc", "mcdonald", "mc donald", "burger", "hotel", "cafe", "coffee", "bakery", "sweets", "restaurant", "chats", "canteen", "juice", "tea ", "dhaba", "biryani", "food", "lassi", "dosa", "catering", "catring", "uengage"]],
  ["Groceries", ["zepto", "blinkit", "instamart", "bigbasket", "bbnow", "dmart", "mart", "kirana", "provision", "super market", "supermarket", "traders", "general store", "farm fresh"]],
  ["Travel", ["indigo", "airline", "airindia", "ibibo", "makemytrip", "irctc", "indian railways", "railway", "redbus", "cleartrip", "goibibo"]],
  ["Transport", ["rapido", "uber", "ola ", "bmtc", "metro", "petrol", "fuel", "fastag", "garage", "auto", "namma yatri", "scooter"]],
  ["Shopping", ["amazon", "flipkart", "myntra", "meesho", "ajio", "lenskart", "jewell", "style union", "styling", "life style", "lifestyle", "delhivery", "fashion", "trends", "bbiege", "footwear", "decathlon"]],
  ["Subscriptions & Apps", ["google india di", "googleindiadigi", "openai", "netflix", "spotify", "hotstar", "prime", "youtube", "apple"]],
  ["Bills & Recharge", ["jio", "airtel", "vi prepaid", "vodafone", "bescom", "electricity", "broadband", "billpay", "recharge"]],
  ["Education", ["institute", "college", "university", "school", "the secretary", "exam", "coaching", "tutedude"]],
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
// UPI names are cut at 15 characters, so hints are prefixes ("Lakshmi Enterpr", "Tutedude Privat").
const BUSINESS_HINTS = ["enterpr", "privat", "sewing", "steel", "brand", "store", "shop", "traders", "mart", "pvt", "ltd", "llp", "services", "agency", "centre", "center", "paytmq", "ibkpos", "@ybl", "q52", "bharatpe"];

const IGNORE_PATTERNS = ["ac xfr from gl"];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Short, common keywords (under 5 letters: "hair", "rto", "auto", "exam", "mart") must be a whole
 * word (a plural "s" is fine), so "hair" matches "Hair Studio" but not "Chair", "mart" not "Martin",
 * "uber" not "Uberoi", and "food" still matches "Shakti Foods". Longer brand names ("airindia", "googleindiadigi")
 * match anywhere, because UPI names are often run together and cut at 15 characters.
 */
const keywordRe = (kws: string[]) => {
  const short = kws.filter((k) => k.trim().length < 5).map(escape);
  const long = kws.filter((k) => k.trim().length >= 5).map(escape);
  const parts = [...(short.length ? [`(?:^|[^a-z0-9])(?:${short.join("|")})s?(?![a-z])`] : []), ...(long.length ? [`(?:${long.join("|")})`] : [])];
  return new RegExp(parts.join("|"));
};
const MERCHANT_RE: [string, RegExp][] = MERCHANT_RULES.map(([c, k]) => [c, keywordRe(k)]);
const INCOME_RE: [string, RegExp][] = INCOME_RULES.map(([c, k]) => [c, keywordRe(k)]);

/** A payee the merchant rules know ("Google India Di", "Dominos Pizza"): a business, never a person. */
export const isKnownMerchant = (name: string) => MERCHANT_RE.some(([, re]) => re.test(name.toLowerCase()));

/**
 * Word hints start a word ("enterpr" for a cut-off "Enterprises"); short ones (mart, shop, pvt, ltd)
 * are whole words, so "mart" matches "Grace Mart" but not "Martin". Others (@ybl, q52) match anywhere.
 */
const hintRe = (h: string) =>
  !/^[a-z]+$/.test(h) ? escape(h) : h.length < 5 ? `(?:^|[^a-z0-9])${h}s?(?![a-z])` : `(?:^|[^a-z0-9])${h}`;
const BUSINESS_RE = new RegExp(BUSINESS_HINTS.map(hintRe).join("|"));

export function looksLikePerson(name: string): boolean {
  const n = name.toLowerCase();
  if (BUSINESS_RE.test(n)) return false;
  if (isKnownMerchant(n)) return false;
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
    // Money back from a shop or app (Google, Domino's…) is a refund, not a friend.
    if (isKnownMerchant(cp)) return { category: "Refund", confidence: "medium" };
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
export function applyLabel(t: Categorised, labels: Labels, modes: FriendModes = {}, received: FriendReceivedModes = {}): Categorised {
  const key = payeeKey(t.counterparty);
  const label = labels[key];
  if (!label) return { ...t, category: t.ruleCategory, confidence: t.ruleConfidence };
  if (t.ruleCategory === "Internal (ignore)") return t;
  return { ...t, category: categoryForLabel(label, t, modes[key], received[key]), confidence: "user" };
}

export const applyLabels = (txns: Categorised[], labels: Labels, modes: FriendModes = {}, received: FriendReceivedModes = {}) =>
  txns.map((t) => applyLabel(t, labels, modes, received));
