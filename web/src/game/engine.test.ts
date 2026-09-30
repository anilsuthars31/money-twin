import { describe, expect, test } from "vitest";
import { DEMO_MONTHS, getPersona } from "./personas";
import {
  DEFAULT_PLAN,
  applyAbilities,
  goalMove,
  lessonContextFrom,
  suggestPlan,
  walletOf,
  withCarryOver,
  isDelivery,
  isMicro,
  planAmounts,
  plannable,
  reportCard,
  simulateMonth,
  smartSplit,
  type Decisions,
} from "./engine";
import { LESSON_ORDER, lessonFor } from "./lessons";
import type { CharacterType, Persona, Plan } from "./types";

const TYPES: CharacterType[] = ["student", "first-job", "professional"];
const CITIES = ["Bengaluru", "Mumbai", "Jaipur", "Kolkata"];
const RECKLESS_PLAN: Plan = { needs: 60, wants: 40, savings: 0, emergency: 0 };

/** Pick the option that spends least (saving into the goal counts double). */
const careful = (p: Persona): Decisions =>
  Object.fromEntries(
    p.choices.map((c) => {
      const cost = c.options.map((o) => (o.spend?.amount ?? 0) - (o.toGoal ?? 0) * 2);
      return [c.id, cost.indexOf(Math.min(...cost))];
    }),
  );
const reckless = (p: Persona): Decisions => Object.fromEntries(p.choices.map((c) => [c.id, 0]));

describe("personas", () => {
  test.each(TYPES)("%s: every month has one decision per week and stays inside the month", (type) => {
    for (const month of DEMO_MONTHS) {
      const p = getPersona(type, "Bengaluru", month);
      const mm = `2026-0${month}-`;
      expect(p.transactions.every((t) => t.datetime.startsWith(mm))).toBe(true);
      expect(p.choices.map((c) => c.week)).toEqual([1, 2, 3, 4]);
    }
  });

  test("life stage changes the story", () => {
    const [s, f, w] = TYPES.map((t) => getPersona(t, "Pune"));
    expect(new Set([s.copy.intro.headline, f.copy.intro.headline, w.copy.intro.headline]).size).toBe(3);
    expect(s.monthlyIncome).toBeLessThan(f.monthlyIncome);
    expect(f.monthlyIncome).toBeLessThan(w.monthlyIncome);
    expect(f.transactions.some((t) => t.category === "Rent")).toBe(true);
    expect(s.transactions.some((t) => t.category === "Rent")).toBe(false);
  });

  test("city changes names, trips and rent", () => {
    const blr = getPersona("student", "Bengaluru");
    const mum = getPersona("student", "Mumbai");
    expect(mum.city).toBe("Mumbai");
    expect(mum.choices[1].title).toMatch(/Lonavala/);
    expect(blr.choices[1].title).toMatch(/Nandi/);
    expect(mum.transactions.some((t) => t.counterparty === "Mumbai Local")).toBe(true);
    expect(blr.transactions.some((t) => t.counterparty === "Mumbai Local")).toBe(false);
    const rent = (p: Persona) => p.transactions.find((t) => t.category === "Rent")!.amount;
    expect(rent(getPersona("first-job", "Mumbai"))).toBeGreaterThan(rent(getPersona("first-job", "Jaipur")));
  });

  test("unknown cities still work", () => {
    expect(getPersona("first-job", "Indore").copy.intro.headline).toContain("Indore");
  });
});

describe("simulateMonth", () => {
  const p = getPersona("student", "Bengaluru");

  test("waits for each week's decision before playing the next week", () => {
    expect(simulateMonth(p, "student", DEFAULT_PLAN, {}).weeks).toHaveLength(1);
    expect(simulateMonth(p, "student", DEFAULT_PLAN, { [p.choices[0].id]: 0 }).weeks).toHaveLength(2);
    expect(simulateMonth(p, "student", DEFAULT_PLAN, careful(p)).weeks).toHaveLength(4);
  });

  test("at most two passive cards a week, stats in range, envelopes never negative", () => {
    for (const type of TYPES) {
      const q = getPersona(type, "Delhi");
      const sim = simulateMonth(q, type, RECKLESS_PLAN, reckless(q));
      for (const w of sim.weeks) {
        expect(w.events.length).toBeGreaterThanOrEqual(1);
        expect(w.events.length).toBeLessThanOrEqual(2);
        for (const v of [...w.statsAfterEvent.flatMap(Object.values), ...Object.values(w.statsAfterTxns)]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
        for (const v of Object.values(w.ledgerAfterTxns)) expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("a decision never rewrites weeks already played", () => {
    const first = simulateMonth(p, "student", DEFAULT_PLAN, {}).weeks[0];
    for (const d of [careful(p), reckless(p)]) {
      const full = simulateMonth(p, "student", DEFAULT_PLAN, d).weeks[0];
      expect({ ...full, choiceResult: undefined }).toEqual(first);
    }
  });

  test("Goal stat rises when money goes into Savings (regression)", () => {
    const trip = p.choices[1];
    const skip = trip.options.findIndex((o) => o.toGoal);
    const d = { [p.choices[0].id]: 1, [trip.id]: skip };
    const w2 = simulateMonth(p, "student", DEFAULT_PLAN, d).weeks[1];
    expect(w2.choiceResult!.stats.goal).toBeGreaterThan(w2.statsAfterEvent.at(-1)!.goal);
  });

  test("the plan sets the starting envelopes", () => {
    const plan = { needs: 40, wants: 40, savings: 20, emergency: 0 };
    const sim = simulateMonth(p, "student", plan, {});
    const l = sim.startLedger;
    expect(walletOf(l)).toBe(plannable(p));
    expect(sim.planned).toEqual(planAmounts(p, plan));
  });
});

describe("report card", () => {
  // A good plan covers the known bills (Smart split); a flat 50/30/20 doesn't fit a big rent.
  test.each(TYPES)("%s: a plan that covers the bills plus careful choices earns A or B in every city", (type) => {
    for (const city of CITIES) {
      const q = getPersona(type, city);
      expect(["A", "B"]).toContain(reportCard(q, type, smartSplit(q), careful(q)).grade);
    }
  });

  test.each(TYPES)("%s: no savings plan and saying yes to everything earns a D and a debt", (type) => {
    const q = getPersona(type, "Bengaluru");
    const r = reportCard(q, type, RECKLESS_PLAN, reckless(q));
    expect(r.grade).toBe("D");
    expect(r.debt).toBeGreaterThan(0);
  });

  test("the header ledger and the report agree on debt and savings (regression)", () => {
    for (const d of ["reckless", "careful"] as const) {
      const q = getPersona("student", "Bengaluru");
      const plan = d === "reckless" ? RECKLESS_PLAN : DEFAULT_PLAN;
      const r = reportCard(q, "student", plan, d === "reckless" ? reckless(q) : careful(q));
      // The header shows finalLedger: only one of savings/debt can be non-zero after repaying.
      expect(Math.min(r.finalLedger.savings, r.finalLedger.debt)).toBe(0);
      expect(r.debt).toBe(r.finalLedger.debt);
      expect(r.savingsKept).toBe(r.finalLedger.savings - r.finalLedger.debt);
      if (r.debt > 0) expect(r.headline).toContain(r.debt.toLocaleString("en-IN"));
    }
  });

  test("plan vs actual covers all three envelopes", () => {
    const q = getPersona("first-job", "Bengaluru");
    const r = reportCard(q, "first-job", DEFAULT_PLAN, careful(q));
    expect(r.envelopes.map((e) => e.env)).toEqual(["needs", "wants", "savings"]);
    expect(r.envelopes.reduce((s, e) => s + e.planned, 0)).toBe(plannable(q));
  });
});

describe("abilities", () => {
  test("wishlist and save-up options only appear once learned", () => {
    const q = getPersona("first-job", "Bengaluru", 9);
    const emi = (p: Persona) => p.choices.find((c) => c.tags?.includes("emi"))!;
    expect(emi(applyAbilities(q, [])).options.map((o) => o.label)).not.toContain("Wishlist for 24h");
    const learned = emi(applyAbilities(q, ["wishlist-24h", "save-up-instead"])).options.map((o) => o.label);
    expect(learned).toContain("Wishlist for 24h");
    expect(learned).toContain("Save up instead");
  });

  test("chai cap and cook nights change the month and help the grade", () => {
    const q = getPersona("student", "Bengaluru", 9);
    const better = applyAbilities(q, ["chai-cap", "cook-nights"]);
    expect(better.transactions.filter(isMicro).length).toBeLessThan(q.transactions.filter(isMicro).length);
    expect(better.transactions.filter(isDelivery).length).toBeLessThan(q.transactions.filter(isDelivery).length);
    const before = reportCard(q, "student", DEFAULT_PLAN, careful(q)).savingsKept;
    const after = reportCard(q, "student", DEFAULT_PLAN, careful(q), ["chai-cap", "cook-nights"]).savingsKept;
    expect(after).toBeGreaterThan(before);
  });

  test("smart split always sums to 100 and covers known bills", () => {
    for (const type of TYPES) {
      const q = getPersona(type, "Mumbai");
      const plan = smartSplit(q);
      expect(plan.needs + plan.wants + plan.savings).toBe(100);
      expect(planAmounts(q, plan).needs).toBeGreaterThanOrEqual(q.knownBills.reduce((s, b) => s + b.amount, 0));
    }
  });
});

describe("decision results (bug 1)", () => {
  // A reckless student runs out of Wants, so decisions cause transfers; later weeks cause more.
  const q = getPersona("student", "Bengaluru");
  const sim = simulateMonth(q, "student", RECKLESS_PLAN, reckless(q));

  test("a decision card only lists transfers that decision caused", () => {
    for (const w of sim.weeks) {
      const res = w.choiceResult!;
      const spend = w.choice!.options[reckless(q)[w.choice!.id]].spend?.amount ?? 0;
      for (const r of res.raids) expect(r.week).toBe(w.week);
      expect(res.raids.reduce((sum, r) => sum + r.amount, 0)).toBeLessThanOrEqual(spend);
    }
  });

  test("later payments never grow an earlier decision's list", () => {
    const early = simulateMonth(q, "student", RECKLESS_PLAN, { [q.choices[0].id]: 0 }).weeks[0].choiceResult!.raids;
    expect(sim.weeks[0].choiceResult!.raids).toEqual(early);
  });

  test("the saved amount matches what Wants actually had", () => {
    const trip = q.choices[1];
    const skip = trip.options.findIndex((o) => o.toGoal);
    const d = { [q.choices[0].id]: 0, [trip.id]: skip };
    const w2 = simulateMonth(q, "student", RECKLESS_PLAN, d).weeks[1];
    const before = w2.ledgerAfterTxns;
    const preview = goalMove(before, trip.options[skip].toGoal!);
    expect(w2.choiceResult!.toSavings + w2.choiceResult!.repaid).toBe(preview.move);
    expect(w2.choiceResult!.ledger.wants).toBe(before.wants - preview.move);
  });
});

describe("month carry-over", () => {
  const aug = getPersona("student", "Bengaluru", 8);
  const sep = getPersona("student", "Bengaluru", 9);
  const debtReport = reportCard(aug, "student", RECKLESS_PLAN, reckless(aug));
  const goodReport = reportCard(aug, "student", DEFAULT_PLAN, careful(aug));
  const carryOf = (r: typeof debtReport) => ({ closingBalance: r.finalLedger.savings, debt: r.debt });
  const mood = { happiness: debtReport.finalStats.happiness, stress: debtReport.finalStats.stress };

  test("the setup: one August ends in debt, one with money left", () => {
    expect(debtReport.debt).toBeGreaterThan(0);
    expect(goodReport.finalLedger.savings).toBeGreaterThan(0);
    expect(goodReport.debt).toBe(0);
  });

  test("September opens with August's closing balance, not the persona default", () => {
    expect(sep.openingBalance).toBe(900); // the hardcoded default this replaces
    const carried = withCarryOver(sep, carryOf(goodReport));
    expect(carried.openingBalance).toBe(goodReport.finalLedger.savings);
    expect(carried.carriedBalance).toBe(goodReport.finalLedger.savings);
    expect(carried.carriedDebt).toBeUndefined();
    expect(plannable(carried)).toBe(goodReport.finalLedger.savings + sep.monthlyIncome);
  });

  test("debt is repaid first, out of the new month's money", () => {
    const carried = withCarryOver(sep, carryOf(debtReport));
    expect(carried.carriedDebt).toBe(debtReport.debt);
    expect(plannable(carried)).toBe(debtReport.finalLedger.savings - debtReport.debt + sep.monthlyIncome);
    const sim = simulateMonth(carried, "student", DEFAULT_PLAN, {});
    expect(walletOf(sim.startLedger)).toBe(plannable(carried));
    expect(sim.startLedger.debt).toBe(0); // already paid back, not owed again
  });

  test("happiness and stress continue instead of resetting", () => {
    const carried = withCarryOver(sep, carryOf(debtReport));
    const sim = simulateMonth(carried, "student", DEFAULT_PLAN, {}, [], mood);
    expect(sim.startStats.happiness).toBe(mood.happiness);
    expect(sim.startStats.stress).toBe(mood.stress);
    const fresh = simulateMonth(carried, "student", DEFAULT_PLAN, {});
    expect(fresh.startStats.stress).not.toBe(mood.stress);
  });
});

describe("suggested plan", () => {
  const sep = getPersona("student", "Bengaluru", 9);
  const total = plannable(sep);

  test("goes halfway from last month toward 50/30/20 (45/45 spent → 50/35/15)", () => {
    const plan = suggestPlan(sep, { needsSpent: total * 0.45, wantsSpent: total * 0.45 });
    expect(plan).toEqual({ needs: 50, wants: 35, savings: 15, emergency: 0 });
  });

  test("never below known bills, always at least 10% savings, always 100%", () => {
    for (const type of TYPES) {
      const q = getPersona(type, "Mumbai", 9);
      const t = plannable(q);
      const plan = suggestPlan(q, { needsSpent: t * 0.9, wantsSpent: t * 0.6 });
      expect(plan.needs + plan.wants + plan.savings + plan.emergency).toBe(100);
      expect(plan.savings).toBeGreaterThanOrEqual(10);
      expect(planAmounts(q, plan).needs).toBeGreaterThanOrEqual(q.knownBills.reduce((sum, b) => sum + b.amount, 0));
    }
  });
});

describe("grading weights plan vs actual", () => {
  test("a D in Wants caps the month at C, even when the goal is reached", () => {
    // Plan tiny Wants, then say yes to everything: the goal can still be hit from leftovers.
    for (const type of TYPES) {
      const q = getPersona(type, "Bengaluru");
      const r = reportCard(q, type, { needs: 60, wants: 5, savings: 35, emergency: 0 }, reckless(q));
      const wants = r.envelopes.find((e) => e.env === "wants")!;
      expect(wants.grade).toBe("D");
      expect(["C", "D"]).toContain(r.grade);
      expect(r.score).toBeLessThanOrEqual(64);
    }
  });

  test("a C envelope caps the month at B", () => {
    const q = getPersona("first-job", "Bengaluru");
    const r = reportCard(q, "first-job", DEFAULT_PLAN, careful(q));
    const worst = r.envelopes.filter((e) => e.env !== "savings").map((e) => e.grade).sort().at(-1);
    if (worst === "C") expect(r.grade).not.toBe("A");
  });
});

describe("skip when Wants is empty", () => {
  test("nothing moves, and the result says so", () => {
    expect(goalMove({ wants: 0, debt: 0 }, 650)).toEqual({ move: 0, repaid: 0, toSavings: 0 });
    const trip = getPersona("student", "Bengaluru").choices[1];
    const skip = trip.options.find((o) => o.toGoal)!;
    expect(skip.emptyLabel).toBe("Skip it");
    expect(skip.emptyOutcome).toMatch(/nothing to move/);
    expect(skip.outcome).not.toMatch(/₹/); // amount comes from what actually moved
  });
});

describe("emergency envelope", () => {
  const q = getPersona("student", "Bengaluru", 9);
  const plan: Plan = { needs: 45, wants: 30, savings: 15, emergency: 10 };

  test("repairs come out of it first, protecting Savings", () => {
    const repair = q.choices.find((c) => c.tags?.includes("emergency"))!;
    const d = Object.fromEntries(q.choices.filter((c) => c.week <= repair.week).map((c) => [c.id, c === repair ? 0 : 1]));
    const w = simulateMonth(q, "student", plan, d, ["emergency-envelope"]).weeks[repair.week - 1];
    const cost = repair.options[0].spend!.amount;
    expect(w.choiceResult!.ledger.emergency).toBe(Math.max(0, w.ledgerAfterTxns.emergency - cost));
    expect(w.choiceResult!.ledger.savings).toBe(w.ledgerAfterTxns.savings);
  });

  test("it is reviewed on the report card", () => {
    const r = reportCard(q, "student", plan, careful(q), ["emergency-envelope"]);
    expect(r.envelopes.map((e) => e.env)).toContain("emergency");
  });
});

describe("lessons", () => {
  test("every lesson has a working quiz with default numbers", () => {
    for (const id of LESSON_ORDER) {
      const l = lessonFor(id);
      expect(l.quiz.options[l.quiz.answer]).toBeDefined();
    }
  });

  test("lessons use the player's own numbers", () => {
    const q = getPersona("student", "Bengaluru");
    const ctx = lessonContextFrom(q, reportCard(q, "student", DEFAULT_PLAN, careful(q)));
    expect(ctx.income).toBe(8000);
    const ef = lessonFor("emergency-fund", ctx);
    expect(ef.quiz.q).toContain("₹8,000");
    expect(ef.quiz.options[ef.quiz.answer]).toBe("₹24,000");
    expect(lessonFor("50-30-20", ctx).quiz.options[1]).toBe("₹1,600");

    const pro = getPersona("professional", "Mumbai");
    const proCtx = lessonContextFrom(pro, reportCard(pro, "professional", DEFAULT_PLAN, careful(pro)));
    expect(lessonFor("emergency-fund", proCtx).quiz.q).toContain(pro.monthlyIncome.toLocaleString("en-IN"));
    for (const id of LESSON_ORDER) {
      const l = lessonFor(id, proCtx);
      expect(new Set(l.quiz.options).size).toBe(4);
      expect(l.quiz.options[l.quiz.answer]).toBeDefined();
    }
  });
});
