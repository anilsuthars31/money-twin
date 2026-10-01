import { BORROWED_FROM_FRIEND, FRIEND_THEIR_SHARE, payeeKey } from "@/lib/categories";

// Money with friends, netted per friend from what the player said it was (Who's who / the cards):
// - you sent, "lending to them"                → they owe you            (category "Friend", DR)
// - they sent, "paying me back"                → less owed to you        (category "Friend", CR)
// - they sent, "I borrowed from them"          → you owe them            (BORROWED_FROM_FRIEND)
// - you sent, "my share of things we did"      → your own spending       (Food / Entertainment)
// - they sent, "their share of things I paid"  → money back on spending  (FRIEND_THEIR_SHARE)
// Paying back can only cancel what they owe, never turn into a debt of yours: it may be for a loan
// from before this statement. Used by the upload screens and the replay report alike.

export interface FriendLine {
  key: string;
  name: string; // nickname if given, else the payee name
  lent: number;
  paidBack: number;
  borrowed: number;
  net: number; // > 0: they owe you, < 0: you owe them
}

interface Txn {
  type: "DR" | "CR";
  amount: number;
  category: string;
  counterparty: string;
}

export function netFriends(txns: Txn[], nameOf: (counterparty: string) => string = (c) => c) {
  const by = new Map<string, FriendLine>();
  const line = (t: Txn) => {
    const key = payeeKey(t.counterparty);
    const l = by.get(key) ?? { key, name: nameOf(t.counterparty), lent: 0, paidBack: 0, borrowed: 0, net: 0 };
    by.set(key, l);
    return l;
  };
  for (const t of txns) {
    if (t.category === "Friend" && t.type === "DR") line(t).lent += t.amount;
    else if (t.category === "Friend" && t.type === "CR") line(t).paidBack += t.amount;
    else if (t.category === BORROWED_FROM_FRIEND && t.type === "CR") line(t).borrowed += t.amount;
  }
  const friends = [...by.values()]
    .map((l) => ({ ...l, net: Math.max(0, l.lent - l.paidBack) - l.borrowed }))
    .filter((l) => Math.round(l.net) !== 0)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  return {
    friends,
    owedToYou: friends.reduce((s, f) => s + Math.max(0, f.net), 0),
    youOwe: friends.reduce((s, f) => s + Math.max(0, -f.net), 0),
  };
}

/** Money with friends is never income or spending of its own (their share offsets your spending). */
export const FRIEND_MONEY = new Set(["Friend", FRIEND_THEIR_SHARE, BORROWED_FROM_FRIEND]);
