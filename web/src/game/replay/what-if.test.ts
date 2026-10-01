import { describe, expect, test } from "vitest";
import { DEFAULT_PLAN } from "../engine";
import type { CharacterType } from "../types";
import { firstJob, freelancer, hostelStudent } from "./fixtures";
import { buildRealMonth, cameIn, monthMoney, type RealMonth, type RealTxn } from "./real-month";
import { replayReport, simulateReplay } from "./replay";
import { applyChoices, findMoments, MAX_MOMENTS, type WhatIfChoices } from "./what-if";

const players: [string, () => RealMonth, CharacterType][] = [
  ["student", hostelStudent, "student"],
  ["first job", firstJob, "first-job"],
  ["freelancer", freelancer, "professional"],
];

function playWhatIf(make: () => RealMonth, type: CharacterType, pick: (id: string) => "real" | "better") {
  const m = make();
  const real = simulateReplay(m, DEFAULT_PLAN, type);
  const moments = findMoments(real);
  const choices: WhatIfChoices = Object.fromEntries(moments.map((x) => [x.id, pick(x.id)]));
  const whatIf = simulateReplay(applyChoices(m, moments, choices), DEFAULT_PLAN, type);
  return { moments, real: replayReport(real), whatIf: replayReport(whatIf) };
}

describe("What if? moments", () => {
  test("2-3 moments a month at real key events, in date order, each with a skill", () => {
    const kinds: Record<string, string[]> = {};
    for (const [name, make, type] of players) {
      const { moments } = playWhatIf(make, type, () => "real");
      expect(moments.length, name).toBeGreaterThanOrEqual(2);
      expect(moments.length, name).toBeLessThanOrEqual(MAX_MOMENTS);
      expect(moments.map((x) => x.day)).toEqual([...moments.map((x) => x.day)].sort((a, b) => a - b));
      for (const x of moments) {
        expect(x.better.saves, x.id).toBeGreaterThan(0);
        expect(x.better.lesson).toBeTruthy();
        expect(`${x.title} ${x.body} ${x.better.label} ${x.better.outcome}`).not.toMatch(/NaN|undefined/);
      }
      kinds[name] = moments.map((x) => x.kind);
    }
    expect(kinds.student).toEqual(expect.arrayContaining(["impulse", "delivery"]));
    expect(kinds.freelancer).toEqual(expect.arrayContaining(["impulse", "cash"]));
    expect(kinds.freelancer).not.toContain("delivery"); // she doesn't order in
  });

  test("the impulse moment uses the real purchase, and the 24-hour rule skips it", () => {
    const { moments } = playWhatIf(hostelStudent, "student", () => "real");
    const buy = moments.find((x) => x.kind === "impulse")!;
    expect(buy).toMatchObject({ day: 6, week: 1, title: "₹1,299 at AMAZON RETAIL", better: { lesson: "impulse", saves: 1299 } });
  });

  test("'Same as real' changes nothing; better moves save exactly what they say", () => {
    for (const [name, make, type] of players) {
      const same = playWhatIf(make, type, () => "real");
      expect(same.whatIf.savingsKept, name).toBe(same.real.savingsKept);
      expect(same.whatIf.grade, name).toBe(same.real.grade);

      const better = playWhatIf(make, type, () => "better");
      const promised = better.moments.reduce((s, x) => s + x.better.saves, 0);
      expect(better.whatIf.savingsKept - better.real.savingsKept, name).toBe(promised);
      expect(better.whatIf.spent, name).toBe(better.real.spent - promised);
      expect(better.whatIf.score, name).toBeGreaterThanOrEqual(better.real.score - 5); // money only gets better
    }
  });

  test("cooking twice swaps the two biggest orders for groceries", () => {
    const m = hostelStudent();
    const moments = findMoments(simulateReplay(m, DEFAULT_PLAN, "student"));
    const cook = moments.find((x) => x.kind === "delivery")!;
    const after = applyChoices(m, moments, { delivery: "better" });
    expect(after.txns.length).toBe(m.txns.length);
    expect(after.txns.filter((t) => t.counterparty === "Groceries for dinner")).toHaveLength(2);
    expect(monthMoney(m).spent - monthMoney(after).spent).toBe(cook.better.saves);
  });
});

describe("replay order and 'came in'", () => {
  let n = 0;
  const t = (day: number, over: Partial<RealTxn>): RealTxn => ({
    id: `o${++n}`,
    datetime: `2026-08-${String(day).padStart(2, "0")}T12:00:00+05:30`,
    amount: 100,
    type: "DR",
    channel: "UPI",
    counterparty: "Someone",
    category: "Shopping",
    confidence: "user",
    ...over,
  });

  test("money that comes in during a week lands before that week's payments", () => {
    const m = buildRealMonth("2026-08", [
      t(1, { type: "CR", category: "Salary/Stipend", amount: 10000, counterparty: "Employer" }),
      t(2, { amount: 3400, counterparty: "Big Store" }), // more than Wants (30% of 10,000) by 400...
      t(5, { type: "CR", category: "Refund", amount: 500, counterparty: "Big Store" }), // ...covered by a refund later that week
    ]);
    const sim = simulateReplay(m, DEFAULT_PLAN, "first-job");
    expect(sim.weeks[0].raids).toEqual([]);
  });

  test("events in a week are shown in date order", () => {
    for (const make of [hostelStudent, firstJob, freelancer]) {
      for (const w of simulateReplay(make(), DEFAULT_PLAN, "student").weeks) {
        const days = w.events.map((e) => e.day!);
        expect(days.every((d) => typeof d === "number")).toBe(true);
        expect(days).toEqual([...days].sort((a, b) => a - b));
      }
    }
  });

  test("'came in' is one number: income + refunds + friends paying back", () => {
    const m = hostelStudent();
    const money = monthMoney(m);
    const report = replayReport(simulateReplay(m, DEFAULT_PLAN, "student"));
    expect(report.cameIn).toBe(cameIn(money));
    expect(report.cameIn).toBe(8000 + 1500 + 300); // pocket money, extra from home, Arjun paying back
    expect(report.cameInParts).toEqual([
      { label: "income", amount: 9500 },
      { label: "from friends", amount: 300 },
    ]);
  });
});
