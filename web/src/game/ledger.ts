import type { Envelope, Ledger, Raid } from "./types";

// The envelope ledger shared by the demo month and "Replay your real past": envelopes funded from
// a plan, payments taken from their envelope, raids when one runs dry, debt as a last resort.

/** A fresh ledger for a month: planned savings start "locked" and move in a quarter each week. */
export function ledgerFromAmounts(a: Record<Envelope, number>): Ledger {
  return { needs: a.needs, wants: a.wants, emergency: a.emergency, savings: 0, locked: a.savings, debt: 0 };
}

/** Pay yourself first: move this week's share of planned savings into the Savings envelope. */
export function autoSave(l: Ledger, planned: number, week: number) {
  const move = Math.min(l.locked, week === 4 ? l.locked : Math.round(planned / 4));
  l.locked -= move;
  l.savings += move;
  return move;
}

/** Savings you can raid: what's already in the envelope plus what hasn't been moved in yet. */
export const saved = (l: Ledger) => l.savings + l.locked;

/** All the money you hold, across every envelope (debt not subtracted). */
export const walletOf = (l: Ledger) => l.needs + l.wants + l.emergency + l.savings + l.locked;

/** What a "save it" choice does: move from Wants, pay back any debt first, the rest into Savings. */
export function goalMove(l: Pick<Ledger, "wants" | "debt">, toGoal: number) {
  const move = Math.min(toGoal, Math.max(0, l.wants));
  const repaid = Math.min(l.debt, move);
  return { move, repaid, toSavings: move - repaid };
}

// When an envelope runs dry, raid the others in this order. The emergency envelope protects Savings.
export const RAID_ORDER: Record<Envelope, Envelope[]> = {
  wants: ["needs", "emergency", "savings"],
  needs: ["wants", "emergency", "savings"],
  emergency: ["needs", "wants", "savings"],
  savings: [],
};

/** Take a payment from its envelope; if it runs dry, raid the others, then borrow. */
export function spend(l: Ledger, env: Envelope, amount: number, week: number, day: number, raids: Raid[]) {
  l[env] -= amount;
  if (l[env] >= 0) return;
  let short = -l[env];
  l[env] = 0;
  for (const from of RAID_ORDER[env]) {
    const take = Math.min(from === "savings" ? saved(l) : l[from], short);
    if (take > 0) {
      if (from === "savings") {
        const fromLocked = Math.min(l.locked, take);
        l.locked -= fromLocked;
        l.savings -= take - fromLocked;
      } else {
        l[from] -= take;
      }
      short -= take;
      raids.push({ week, day, from, to: env, amount: take });
    }
    if (short === 0) return;
  }
  l.debt += short;
  raids.push({ week, day, from: "debt", to: env, amount: short });
}

/** Unplanned money in pays back debt first, then lands in Wants. */
export function receive(l: Ledger, amount: number) {
  const repay = Math.min(l.debt, amount);
  l.debt -= repay;
  l.wants += amount - repay;
}
