import type { Choice, ChoiceOption } from "../types";
import { fmt } from "./build";

// Decision templates shared by every persona. Amounts come from the persona, so a birthday gift is
// ₹300 for a student and ₹1,000 for a working professional. Abilities add extra options:
// "wishlist-24h" on sales, "save-up-instead" on EMI offers.

export function gift(week: number, who: string, amount: number, small: number): Choice {
  return {
    id: `gift-${week}`,
    week,
    icon: "gift",
    title: `${who}'s birthday`,
    body: `The group is pooling for a gift. Your share is ${fmt(amount)}.`,
    options: [
      {
        label: `Chip in ${fmt(amount)}`,
        outcome: "They loved it. Your name was on the card.",
        spend: { amount, counterparty: who, category: "Gifts" },
        delta: { happiness: 6 },
      },
      {
        label: `Just ${fmt(small)}`,
        outcome: "A smaller share, still on the card. Nobody minded.",
        spend: { amount: small, counterparty: who, category: "Gifts" },
        delta: { happiness: 2 },
      },
    ],
  };
}

export function trip(week: number, title: string, body: string, cost: number, payTo: string): Choice {
  return {
    id: `trip-${week}`,
    week,
    icon: "mountain",
    title,
    body,
    options: [
      {
        label: "I'm in",
        outcome: "Worth it. You'll be talking about this one for a while.",
        spend: { amount: cost, counterparty: payTo, category: "Entertainment" },
        delta: { happiness: 12, stress: -6 },
      },
      {
        label: "Skip, save it",
        outcome: "What you would have spent moves from Wants to Savings. The group photos sting a little.",
        emptyLabel: "Skip it",
        emptyOutcome: "You skip it. Wants was already empty, so there was nothing to move into Savings.",
        toGoal: cost,
        delta: { happiness: -5 },
      },
    ],
  };
}

const wishlist = (price: number): ChoiceOption => ({
  label: "Wishlist for 24h",
  outcome: `A day later you barely remember it. ${fmt(price)} stays in Wants. (24-hour rule)`,
  delta: { stress: -3, happiness: 1 },
  ability: "wishlist-24h",
});

export function sale(week: number, item: string, price: number, was: number, store: string): Choice {
  return {
    id: `sale-${week}`,
    week,
    icon: "shopping-bag",
    tags: ["sale"],
    title: `Sale: ${item} ${fmt(price)}`,
    body: `Down from ${fmt(was)}. The timer says 14 minutes left.`,
    options: [
      {
        label: "Buy now",
        outcome: "It's yours. Whether the budget agrees is another matter.",
        spend: { amount: price, counterparty: store, category: "Shopping" },
        delta: { happiness: 6, stress: 6 },
      },
      {
        label: "Skip it",
        outcome: "Sales come back every few weeks. Your Wants envelope thanks you.",
        delta: { happiness: -3, stress: -2 },
      },
      wishlist(price),
    ],
  };
}

/** A "No Cost EMI" offer: the first EMI plus a processing fee hits this month. */
export function emiOffer(week: number, item: string, total: number, months: number, lender: string): Choice {
  const monthly = Math.round(total / months);
  const fee = 199;
  return {
    id: `emi-${week}`,
    week,
    icon: item.toLowerCase().includes("tv") ? "tv" : "smartphone",
    tags: ["emi", "sale"],
    title: `${item} on "No Cost EMI"`,
    body: `${fmt(total)}, or "just ${fmt(monthly)} a month" for ${months} months. The form is ready.`,
    options: [
      {
        label: "Sign up",
        outcome: `${fmt(monthly)} is gone every month for ${months} months, plus a ${fmt(fee)} processing fee today.`,
        spend: { amount: monthly + fee, counterparty: lender, category: "EMI & Loans" },
        delta: { happiness: 8, stress: 10 },
      },
      {
        label: "Not now",
        outcome: "What you have works fine. Future salary stays yours.",
        delta: { stress: -3, happiness: -3 },
      },
      {
        label: "Save up instead",
        outcome: `${fmt(monthly)} goes into Savings each month. You'll own it outright, with no fee.`,
        emptyOutcome: "Wants is empty right now, so nothing moved yet. You'll start setting money aside next month.",
        toGoal: monthly,
        delta: { stress: -4, happiness: 1 },
        ability: "save-up-instead",
      },
      wishlist(monthly),
    ],
  };
}

export function freeTrial(week: number, service: string, price: number): Choice {
  return {
    id: `trial-${week}`,
    week,
    icon: "tv",
    title: `${service} free trial ends tomorrow`,
    body: `Then it's ${fmt(price)} a month, automatically. You've watched it twice.`,
    options: [
      {
        label: "Keep it",
        outcome: "Another subscription quietly joins the list.",
        spend: { amount: price, counterparty: service.toUpperCase(), category: "Subscriptions & Apps" },
        delta: { happiness: 2 },
      },
      {
        label: "Cancel it",
        outcome: `Cancelled with a day to spare. ${fmt(price)} a month you'll never miss.`,
        delta: { stress: -2 },
      },
    ],
  };
}

export function repair(week: number, what: string, cost: number, cheap: number, shop: string): Choice {
  return {
    id: `repair-${week}`,
    week,
    icon: "wrench",
    tags: ["emergency"],
    title: `${what}`,
    body: `The proper fix is ${fmt(cost)}. A local shop says ${fmt(cheap)}, no guarantees.`,
    options: [
      {
        label: `Fix it (${fmt(cost)})`,
        outcome: "Good as new. This is exactly what an emergency fund is for.",
        spend: { amount: cost, counterparty: shop, category: "Personal Care" },
        delta: { stress: -4 },
      },
      {
        label: `Cheap fix (${fmt(cheap)})`,
        outcome: "It works, mostly. You'll probably be back.",
        spend: { amount: cheap, counterparty: "Local Repair", category: "Personal Care" },
        delta: { stress: 4 },
      },
    ],
  };
}

export function festival(week: number, title: string, body: string, big: number, small: number, bigLabel: string, smallLabel: string): Choice {
  return {
    id: `festival-${week}`,
    week,
    icon: "party",
    title,
    body,
    options: [
      {
        label: bigLabel,
        outcome: "Family, food, noise. The best kind of expensive.",
        spend: { amount: big, counterparty: "Festival", category: "Gifts" },
        delta: { happiness: 12, stress: -4 },
      },
      {
        label: smallLabel,
        outcome: "Not quite the same, but they were happy to see you.",
        spend: { amount: small, counterparty: "Festival", category: "Gifts" },
        delta: { happiness: 4 },
      },
    ],
  };
}

export function scam(week: number, amount: number): Choice {
  return {
    id: `scam-${week}`,
    week,
    icon: "alert",
    title: "\"Guaranteed 4% a month\"",
    body: `A colleague's WhatsApp group promises doubled money in 18 months. Minimum ${fmt(amount)}. "Only for friends."`,
    options: [
      {
        label: `Put in ${fmt(amount)}`,
        outcome: "A week later the group admin stops replying. Guaranteed high returns are the classic sign of a scam.",
        spend: { amount, counterparty: "Vikram Traders", category: "Paid to People" },
        delta: { happiness: 2, stress: 15 },
      },
      {
        label: "Walk away",
        outcome: "Anyone promising guaranteed high returns is a red flag. Your money stays yours.",
        delta: { stress: -4 },
      },
    ],
  };
}
