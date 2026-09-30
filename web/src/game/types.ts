// Shared game types. `Transaction` mirrors the output of parser/kotak_parser.py so the
// same engine can later run on real, categorised statements.

export type TxnType = "DR" | "CR";
export type Channel = "UPI" | "REV-UPI" | "CARD" | "ATM" | "BILLPAY" | "IMPS" | "OTHER";
export type Confidence = "high" | "medium" | "low" | "user";

export type Category =
  | "Food & Dining"
  | "Groceries"
  | "Transport"
  | "Shopping"
  | "Subscriptions & Apps"
  | "Bills & Recharge"
  | "Education"
  | "Health"
  | "Personal Care"
  | "Entertainment"
  | "Gifts"
  | "Paid to People"
  | "Family Support"
  | "Received from Friends"
  | "Refund"
  | "Cashback & Rewards"
  | "Salary"
  | "Rent"
  | "EMI & Loans"
  | "Sent to Family";

export interface Transaction {
  id: string;
  datetime: string; // ISO, local time
  description: string;
  amount: number; // always positive; `type` says direction
  type: TxnType;
  channel: Channel;
  counterparty: string;
  category: Category;
  confidence: Confidence;
}

export type CharacterType = "student" | "first-job" | "professional";

export interface Character {
  type: CharacterType;
  name: string;
  city: string;
  avatarSeed: string;
  createdAt: string;
}

// ---------------------------------------------------------------- budget envelopes

export type Envelope = "needs" | "wants" | "savings" | "emergency";

/** The player's plan for the month, in percent. Always sums to 100. Emergency stays 0 until unlocked. */
export type Plan = Record<Envelope, number>;

/** Money in each envelope right now. `debt` is what was borrowed once everything ran dry. */
export interface Ledger {
  needs: number;
  wants: number;
  emergency: number;
  savings: number;
  /** Planned savings not moved in yet: a quarter goes into Savings at the start of each week. */
  locked: number;
  debt: number;
}

/** Money moved between envelopes because one ran out. */
export interface Raid {
  week: number;
  day: number;
  from: Envelope | "debt";
  to: Envelope;
  amount: number;
}

export interface Stats {
  savings: number; // 0-100, all the money you hold vs what you started with
  happiness: number; // 0-100
  stress: number; // 0-100, lower is better
  goal: number; // 0-100, savings envelope vs the goal
}

export type StatKey = keyof Stats;
export type MoodDelta = Partial<Record<"happiness" | "stress", number>>;

// ---------------------------------------------------------------- personas & decisions

/** Words that change with the life stage, so one rules engine can tell every story. */
export interface PersonaCopy {
  intro: { headline: string; body: string }; // "{name}" is replaced with the twin's name
  incomeTitle: string; // "Pocket money landed" / "Salary day"
  incomeBody: string; // "{amount}" and "{day}" are replaced
  deliveryEarly: string;
  deliveryLate: string;
  quietWeek: string;
  borrowTitle: string; // "Borrowed {amount} from your roommate"
}

export interface Persona {
  id: string;
  type: CharacterType;
  title: string;
  city: string;
  copy: PersonaCopy;
  monthLabel: string; // e.g. "August 2026"
  year: number;
  month: number; // 1-12
  openingBalance: number;
  monthlyIncome: number; // expected money in (pocket money / salary)
  savingsGoal: number; // ₹ to have in the savings envelope by month end
  /** Last month's closing balance (the opening balance comes from it after a carry-over). */
  carriedBalance?: number;
  /** Debt from last month, already taken out of openingBalance before planning. */
  carriedDebt?: number;
  /** Bills you know are coming (rent, EMI, money home), shown while planning. */
  knownBills: { label: string; amount: number }[];
  transactions: Transaction[];
  choices: Choice[];
}

export type ChoiceTag = "sale" | "emi" | "emergency";

/** One decision per week, made at the end of that week. */
export interface Choice {
  id: string;
  week: number; // 1-4
  title: string;
  body: string;
  icon: IconName;
  tags?: ChoiceTag[];
  options: ChoiceOption[];
}

export interface ChoiceOption {
  label: string;
  outcome: string; // shown after picking
  spend?: { amount: number; counterparty: string; category: Category };
  toGoal?: number; // ₹ moved from Wants into Savings
  /** Shown instead when Wants is empty, so there's nothing to move ("Skip it" not "Skip, save it"). */
  emptyLabel?: string;
  emptyOutcome?: string;
  delta: MoodDelta;
  ability?: Ability; // only offered once this ability is unlocked
}

// ---------------------------------------------------------------- events & lessons

export type EventTone = "good" | "bad" | "neutral";

export type IconName =
  | "wallet"
  | "coffee"
  | "bike"
  | "shopping-bag"
  | "smartphone"
  | "users"
  | "alert"
  | "home"
  | "utensils"
  | "mountain"
  | "sparkles"
  | "piggy-bank"
  | "party"
  | "briefcase"
  | "credit-card"
  | "heart"
  | "gift"
  | "wrench"
  | "tv";

export interface GameEvent {
  id: string;
  week: number;
  icon: IconName;
  tone: EventTone;
  title: string;
  body: string;
  amount?: number; // ₹ shown big on the card
  delta: MoodDelta;
  lesson?: LessonId;
}

export type LessonId =
  | "upi-micro"
  | "impulse"
  | "delivery"
  | "running-low"
  | "50-30-20"
  | "emergency-fund"
  | "emi-trap"
  | "fixed-costs";

/** Abilities are earned by learning a lesson and change how the next month plays. */
export type Ability =
  | "wishlist-24h"
  | "chai-cap"
  | "cook-nights"
  | "smart-split"
  | "save-up-instead"
  | "weekly-pace"
  | "emergency-envelope";

export interface WeekResult {
  week: number;
  label: string; // "1–7 Aug"
  transactions: Transaction[];
  spent: number;
  received: number;
  autoSaved: number; // planned savings moved into Savings at the start of the week
  raids: Raid[]; // from this week's payments (and last week's decision)
  events: GameEvent[];
  choice?: Choice;
  ledgerAfterTxns: Ledger;
  statsAfterTxns: Stats;
  statsAfterEvent: Stats[]; // one snapshot per event, in order
  /** What the player's pick did, once they've picked. */
  choiceResult?: {
    raids: Raid[]; // only the transfers this decision caused
    toSavings: number; // what actually moved into Savings
    repaid: number; // what went to paying back debt instead
    ledger: Ledger;
    stats: Stats;
  };
}
