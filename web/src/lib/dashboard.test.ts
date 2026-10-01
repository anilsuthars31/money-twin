import { describe, expect, test } from "vitest";
import { firstJob, hostelStudent } from "@/game/replay/fixtures";
import type { RealTxn } from "@/game/replay/real-month";
import { categoriesFor, changePct, compact, monthsOf, monthSummary, topPayees } from "./dashboard";

/** Rahul's August, plus a July where delivery cost half as much and there was no Myntra order. */
function twoMonths() {
  const aug = firstJob().txns;
  const jul: RealTxn[] = aug
    .filter((t) => t.counterparty !== "MYNTRA")
    .map((t) => ({
      ...t,
      id: `jul-${t.id}`,
      datetime: t.datetime.replace("2026-08-", "2026-07-"),
      amount: /swiggy|zomato/i.test(t.counterparty) ? Math.round(t.amount / 2) : t.amount,
    }));
  return { txns: [...aug, ...jul], nicknames: { shanthipg: "PG owner" } };
}

describe("where your money goes", () => {
  test("months come out oldest first, with totals that match the replay rules", () => {
    const { txns, nicknames } = twoMonths();
    const months = monthsOf(txns, nicknames);
    expect(months.map((m) => m.key)).toEqual(["2026-07", "2026-08"]);
    const aug = monthSummary(months[1]);
    expect(aug).toMatchObject({ key: "2026-08", label: "August 2026", short: "Aug", income: 30000 });
    expect(aug.needs + aug.wants).toBe(aug.spent);
    expect(monthSummary(months[0]).spent).toBeLessThan(aug.spent);
  });

  test("categories are compared with last month", () => {
    const [jul, aug] = monthsOf(twoMonths().txns);
    const cats = categoriesFor(aug, jul);
    expect(cats[0]).toMatchObject({ category: "Rent/PG", envelope: "needs", amount: 9500, previous: 9500 });
    const shopping = cats.find((c) => c.category === "Shopping")!;
    expect(shopping.amount).toBe(1299 + 2499);
    expect(shopping.previous).toBe(1299);
    expect(changePct(shopping.amount, shopping.previous)).toBe(192);
    expect(cats.reduce((s, c) => s + c.share, 0)).toBeGreaterThanOrEqual(97); // rounding
    // No previous month: nothing to compare with.
    expect(categoriesFor(jul).every((c) => c.previous === null)).toBe(true);
  });

  test("top payees use nicknames, and money lent to friends isn't spending", () => {
    const m = monthsOf(hostelStudent().txns, { manjunaths: "Canteen uncle" })[0];
    const payees = topPayees(m, 5);
    expect(payees).toHaveLength(5);
    expect(payees.map((p) => p.name)).toContain("Canteen uncle");
    expect(payees.map((p) => p.name)).not.toContain("Arjun P");
    expect(payees[0].amount).toBeGreaterThanOrEqual(payees[1].amount);
    const canteen = payees.find((p) => p.name === "Canteen uncle")!;
    expect(canteen).toMatchObject({ category: "Food", count: 31 });
  });

  test("change is null when there's nothing to compare", () => {
    expect(changePct(500, 0)).toBeNull();
    expect(changePct(500, null)).toBeNull();
    expect(changePct(500, 1000)).toBe(-50);
  });
});

test("chart axis labels stay honest", () => {
  expect(compact(2500)).toBe("₹2.5k");
  expect(compact(12000)).toBe("₹12k");
  expect(compact(800)).toBe("₹800");
  expect(compact(125000)).toBe("₹1.3L");
});
