import { describe, expect, test } from "vitest";
import { buildRealMonth, displayCategory, flowOf, ist, monthKeyOf, monthMoney, nameOf, openingBalance, type RealTxn } from "./real-month";

let n = 0;
const t = (over: Partial<RealTxn>): RealTxn => ({
  id: `t${++n}`,
  datetime: "2026-08-10T13:00:00+05:30",
  amount: 100,
  type: "DR",
  channel: "UPI",
  counterparty: "Someone",
  category: "Food",
  confidence: "high",
  ...over,
});

describe("real month model", () => {
  test("dates are read in India time", () => {
    expect(ist("2026-07-31T18:45:00.000Z")).toMatchObject({ year: 2026, month: 8, day: 1, hour: 0 });
    expect(monthKeyOf("2026-07-31T18:45:00.000Z")).toBe("2026-08");
    expect(monthKeyOf("2026-07-31T18:00:00.000Z")).toBe("2026-07"); // 11:30pm on 31 July
  });

  test("each category flows to the right place", () => {
    expect(flowOf(t({ category: "Rent/PG", amount: 9000 }))).toBe("need");
    expect(flowOf(t({ category: "Food", amount: 60 }))).toBe("need"); // chai-sized: essential
    expect(flowOf(t({ category: "Food", amount: 400 }))).toBe("want");
    expect(flowOf(t({ category: "Shopping", amount: 1200 }))).toBe("want");
    expect(flowOf(t({ category: "Friend", amount: 500 }))).toBe("lent");
    expect(flowOf(t({ category: "Friend", type: "CR" }))).toBe("friend-back");
    expect(flowOf(t({ category: "Salary/Stipend", type: "CR" }))).toBe("income");
    expect(flowOf(t({ category: "Family Support", type: "CR" }))).toBe("income");
    expect(flowOf(t({ category: "Refund", type: "CR" }))).toBe("extra");
    expect(flowOf(t({ category: "Self Transfer", type: "CR" }))).toBe("ignore");
    expect(flowOf(t({ category: "Internal (ignore)" }))).toBe("ignore");
  });

  test("the month keeps only its own transactions, oldest first, and knows the opening balance", () => {
    const txns = [
      t({ datetime: "2026-08-05T10:00:00+05:30", amount: 300, balance: 4700 }),
      t({ datetime: "2026-08-01T09:00:00+05:30", category: "Family Support", type: "CR", amount: 8000, balance: 9000 }),
      t({ datetime: "2026-07-30T10:00:00+05:30", amount: 50 }),
      t({ datetime: "2026-08-03T10:00:00+05:30", category: "Rent/PG", amount: 4000, balance: 5000 }),
    ];
    const m = buildRealMonth("2026-08", txns, { someone: "Canteen uncle" });
    expect(m.label).toBe("August 2026");
    expect(m.days).toBe(31);
    expect(m.txns.map((x) => x.amount)).toEqual([8000, 4000, 300]);
    expect(openingBalance(m)).toBe(1000); // 9,000 after the 8,000 came in
    expect(monthMoney(m)).toMatchObject({ opening: 1000, income: 8000, spent: 4300, needs: 4000, wants: 300 });
    expect(nameOf(m, "Someone")).toBe("Canteen uncle");
  });

  test("one name per idea in the report", () => {
    expect(displayCategory("Food & Dining")).toBe("Food");
    expect(displayCategory("Rent")).toBe("Rent/PG");
    expect(displayCategory("Paid to People")).toBe("Not yet taught");
  });
});
