import { TEACH_CATEGORIES, payeeKey, type TeachCategory } from "@/lib/categories";
import { looksLikePerson, type Categorised, type Labels } from "./rules";

// "Teach your twin": which payees to ask about, what to show on each card, and which six
// categories to offer first. Plain heuristics over the player's own transactions.

/**
 * Money that isn't really income or spending: internal bank moves, transfers between your own
 * accounts ("Me"), and friend splits/loans (netted per friend instead, see friendBalances).
 */
export const NOT_INCOME_OR_SPENDING = new Set(["Internal (ignore)", "Self Transfer", "Friend"]);

const spend = (t: Categorised) => t.type === "DR" && !NOT_INCOME_OR_SPENDING.has(t.category);
const sum = (ts: Categorised[]) => ts.reduce((s, t) => s + t.amount, 0);

/** Share of outgoing money the twin understands (anything but a low-confidence guess), 0–1. */
export function understoodShare(txns: Categorised[]): number {
  // Friend transfers count as understood; only internal moves and own-account transfers are left out.
  const out = txns.filter((t) => t.type === "DR" && t.category !== "Internal (ignore)" && t.category !== "Self Transfer");
  const total = sum(out);
  return total ? sum(out.filter((t) => t.confidence !== "low")) / total : 1;
}

export interface Summary {
  transactions: number;
  from: string;
  to: string;
  months: number;
  spent: number;
  received: number;
  understood: number; // 0–1
}

export function summarise(txns: Categorised[]): Summary {
  const months = new Set(txns.map((t) => t.datetime.slice(0, 7)));
  return {
    transactions: txns.length,
    from: txns[0]?.datetime ?? "",
    to: txns.at(-1)?.datetime ?? "",
    months: months.size,
    spent: sum(txns.filter(spend)),
    received: sum(txns.filter((t) => t.type === "CR" && !NOT_INCOME_OR_SPENDING.has(t.category))),
    understood: understoodShare(txns),
  };
}

// ---------------------------------------------------------------- friends: splits and loans

export interface FriendBalance {
  key: string;
  name: string; // nickname if given, else the payee name
  net: number; // > 0: they owe you, < 0: you owe them
}

/**
 * Money with friends is splits and loans, not income or spending. Per friend: what you paid them
 * minus what they paid you. Positive means they owe you.
 */
export function friendBalances(txns: Categorised[], nicknames: Record<string, string> = {}) {
  const byKey = new Map<string, FriendBalance>();
  for (const t of txns) {
    if (t.category !== "Friend") continue;
    const key = payeeKey(t.counterparty);
    const b = byKey.get(key) ?? { key, name: nicknames[key] ?? t.counterparty, net: 0 };
    b.net += t.type === "DR" ? t.amount : -t.amount;
    byKey.set(key, b);
  }
  const friends = [...byKey.values()].filter((b) => Math.round(b.net) !== 0).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  return {
    friends,
    owedToYou: friends.reduce((s, f) => s + Math.max(0, f.net), 0),
    youOwe: friends.reduce((s, f) => s + Math.max(0, -f.net), 0),
  };
}

/** The name to show for a payee: the player's nickname ("Gym trainer") or the statement name. */
export const displayName = (counterparty: string, nicknames: Record<string, string>) =>
  nicknames[payeeKey(counterparty)] ?? counterparty;

// ---------------------------------------------------------------- family & self

export interface PersonCandidate {
  key: string;
  counterparty: string;
  sent: number;
  received: number;
  count: number;
}

/**
 * People worth asking "family, or you?": person-like names with real money going back and forth
 * (at least 3 payments and ₹3,000, or ₹1,000+ received from them). No surname guessing.
 */
export function familyCandidates(txns: Categorised[], limit = 8): PersonCandidate[] {
  const byKey = new Map<string, PersonCandidate>();
  for (const t of txns) {
    if (t.category === "Internal (ignore)" || !looksLikePerson(t.counterparty)) continue;
    if (t.channel !== "UPI" && t.channel !== "IMPS") continue;
    const key = payeeKey(t.counterparty);
    const c = byKey.get(key) ?? { key, counterparty: t.counterparty, sent: 0, received: 0, count: 0 };
    if (t.type === "DR") c.sent += t.amount;
    else c.received += t.amount;
    c.count++;
    byKey.set(key, c);
  }
  return [...byKey.values()]
    .filter((c) => (c.count >= 3 && c.sent + c.received >= 3000) || c.received >= 1000)
    .sort((a, b) => b.sent + b.received - (a.sent + a.received))
    .slice(0, limit);
}

// ---------------------------------------------------------------- unknown payees

export interface PayeeCard {
  key: string;
  counterparty: string;
  total: number; // spent with them
  count: number;
  range: [number, number]; // typical payment (25th–75th percentile)
  when: string; // "usually around lunch"
  months: number;
  sameDayMonthly: boolean; // a big payment around the same date each month (rent-like)
  moneyBack: number; // received from them too (friend-like)
  person: boolean;
  channel: Categorised["channel"];
  share: number; // of all unknown spending, 0–1
  suggestions: TeachCategory[]; // all 13, likeliest first
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];

function timeOfDay(hours: number[]): string {
  const bucket = (h: number) => (h >= 5 && h < 11 ? "in the morning" : h >= 11 && h < 16 ? "around lunch" : h >= 16 && h < 19 ? "in the evening" : h >= 19 && h < 23 ? "around dinner" : "late at night");
  const counts = new Map<string, number>();
  for (const h of hours) counts.set(bucket(h), (counts.get(bucket(h)) ?? 0) + 1);
  const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return n / hours.length >= 0.5 ? `usually ${top}` : "at different times of day";
}

/** Rank the 13 categories for a payee from simple signals, likeliest first. */
export function rankCategories(p: Omit<PayeeCard, "suggestions">, avg: number, lunchOrDinner: number): TeachCategory[] {
  const score = new Map<TeachCategory, number>(TEACH_CATEGORIES.map((c, i) => [c, -i * 0.01])); // stable default order
  const add = (c: TeachCategory, n: number) => score.set(c, (score.get(c) ?? 0) + n);
  const name = p.counterparty.toLowerCase();

  if (avg <= 200) add("Food", 3 + 2 * lunchOrDinner);
  if (avg <= 600) add("Groceries", 1.5);
  if (p.sameDayMonthly) add("Rent/PG", 4);
  if (avg >= 2000) add("Rent/PG", 1.5);
  if (p.moneyBack > 0) {
    add("Friend", 3);
    add("Family", 2);
  }
  if (p.person) {
    add("Friend", 2);
    add("Family", 1);
    add("Rent/PG", 0.5);
  } else {
    add("Shopping", 2);
    add("Groceries", 1);
  }
  if (p.channel === "CARD") {
    add("Shopping", 3);
    add("Travel", 1.5);
    add("Health", 1);
    add("Education", 1);
  }
  if (/store|shop|mart|trader|enterpri|general/.test(name)) add("Groceries", 2);
  if (/travel|tour|bus|rail|air/.test(name)) add("Travel", 3);
  if (/school|college|academy|institute|tuition|book/.test(name)) add("Education", 3);
  if (/medic|pharm|clinic|hospital|lab|dental/.test(name)) add("Health", 3);
  if (/movie|cinema|game|club|pvr|inox/.test(name)) add("Entertainment", 3);
  if (/recharge|mobile|electric|gas|water|wifi|broadband/.test(name)) add("Bills & Recharge", 3);
  if (/cab|auto|taxi|petrol|fuel|parking/.test(name)) add("Transport", 3);
  add("Other", -1);
  return [...score].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

/** A card for one payee from all their transactions (spending, and money they sent you). */
function buildCard(key: string, ts: Categorised[], received: number, unknownTotal: number): PayeeCard {
  const out = ts.filter((t) => t.type === "DR");
  const basis = out.length ? out : ts; // someone who only ever sent you money
  const amounts = basis.map((t) => t.amount).sort((a, b) => a - b);
  const hours = basis.map((t) => Number(t.datetime.slice(11, 13)));
  const total = sum(out);
  const avg = sum(basis) / basis.length;
  const monthsSet = new Set(ts.map((t) => t.datetime.slice(0, 7)));
  const days = out.filter((t) => t.amount >= 1500).map((t) => Number(t.datetime.slice(8, 10)));
  const sameDayMonthly =
    monthsSet.size >= 2 && days.length >= 2 && Math.max(...days) - Math.min(...days) <= 6 && days.length >= monthsSet.size * 0.6;
  const lunchOrDinner = hours.filter((h) => (h >= 12 && h <= 15) || (h >= 19 && h <= 22)).length / hours.length;
  const base = {
    key,
    counterparty: ts[0].counterparty,
    total,
    count: out.length || ts.length,
    range: [pct(amounts, 0.25), pct(amounts, 0.75)] as [number, number],
    when: timeOfDay(hours),
    months: monthsSet.size,
    sameDayMonthly,
    moneyBack: received,
    person: looksLikePerson(ts[0].counterparty),
    channel: ts[0].channel,
    share: unknownTotal ? total / unknownTotal : 0,
  };
  return { ...base, suggestions: rankCategories(base, avg, lunchOrDinner) };
}

/**
 * The cards to teach, in order: first anyone from "Who's who?" the player left unmarked (even if
 * they only ever sent money), then the payees the rules couldn't place, biggest spend first. On real
 * statements the top 20 unknown payees cover about three quarters of unknown spending.
 */
export function unknownPayees(txns: Categorised[], labels: Labels, limit = 20, people: string[] = []): PayeeCard[] {
  const isLabelled = (k: string) => Boolean(labels[k]);
  const unknown = txns.filter((t) => spend(t) && t.ruleConfidence === "low" && !isLabelled(payeeKey(t.counterparty)));
  const unknownTotal = sum(unknown);
  const byKey = new Map<string, Categorised[]>();
  for (const t of txns) {
    const k = payeeKey(t.counterparty);
    byKey.set(k, [...(byKey.get(k) ?? []), t]);
  }
  const received = (k: string) => sum((byKey.get(k) ?? []).filter((t) => t.type === "CR"));

  const first = people.filter((k) => !isLabelled(k) && byKey.has(k)).map((k) => buildCard(k, byKey.get(k)!, received(k), unknownTotal));
  const seen = new Set(first.map((c) => c.key));
  const groups = new Map<string, Categorised[]>();
  for (const t of unknown) {
    const k = payeeKey(t.counterparty);
    if (!seen.has(k)) groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const rest = [...groups.keys()]
    .map((k) => buildCard(k, (byKey.get(k) ?? []).filter((t) => !(t.type === "DR" && t.ruleConfidence !== "low")), received(k), unknownTotal))
    .sort((a, b) => b.total - a.total);
  return [...first, ...rest].slice(0, Math.max(limit, first.length));
}
