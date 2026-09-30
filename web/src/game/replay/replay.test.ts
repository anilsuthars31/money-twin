import { describe, expect, test } from "vitest";
import { DEFAULT_PLAN } from "../engine";
import { ledgerFromAmounts } from "../ledger";
import type { CharacterType } from "../types";
import { firstJob, freelancer, hostelStudent } from "./fixtures";
import { buildRealMonth, monthMoney, weeksOf, type RealMonth } from "./real-month";
import { realSplit, replayPlanAmounts, replayReport, simulateReplay } from "./replay";
import { MAX_EVENTS_PER_WEEK, TEMPLATES, type TemplateCtx } from "./templates";

const players: [string, () => RealMonth, CharacterType][] = [
  ["hostel student on ₹8,000", hostelStudent, "student"],
  ["first job on ₹30,000", firstJob, "first-job"],
  ["irregular-income freelancer", freelancer, "professional"],
];

const play = (make: () => RealMonth, type: CharacterType) => {
  const sim = simulateReplay(make(), DEFAULT_PLAN, type);
  return { sim, report: replayReport(sim), events: sim.weeks.flatMap((w) => w.events) };
};
const baseId = (id: string) => id.replace(/-\d+$/, "");
const storyOf = (make: () => RealMonth, type: CharacterType) => new Set(play(make, type).events.map((e) => baseId(e.id)));

/** A context for firing one template on its own, outside the weekly priority order. */
function ctxFor(m: RealMonth, week: number): TemplateCtx {
  const w = weeksOf(m)[week - 1];
  const day = (iso: string) => Number(iso.slice(8, 10));
  const money = monthMoney(m);
  const planned = replayPlanAmounts(money, DEFAULT_PLAN);
  return {
    m,
    week,
    from: w.from,
    to: w.to,
    weekTxns: m.txns.filter((t) => day(t.datetime) >= w.from && day(t.datetime) <= w.to),
    before: m.txns.filter((t) => day(t.datetime) < w.from),
    income: Math.max(1, money.income),
    planned,
    raids: [],
    ledger: ledgerFromAmounts(planned),
    autoSaved: 0,
    savingsStreak: 0,
    fired: new Set(),
  };
}
const fire = (id: string, c: TemplateCtx) => TEMPLATES.find((t) => t.id === id)!.fire(c);

describe("event template library", () => {
  test("has 40–60 templates with unique ids across every group", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(40);
    expect(TEMPLATES.length).toBeLessThanOrEqual(60);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    const groups = new Set(TEMPLATES.map((t) => t.group));
    for (const g of ["income", "food", "small-upi", "rent-bills", "shopping", "travel", "entertainment", "health-education", "friends", "family", "savings", "big-one-off", "consequence"]) {
      expect(groups, g).toContain(g);
    }
  });

  test("a big buy is scaled to income: ₹1,299 is big on ₹8,000, not on ₹30,000", () => {
    const student = fire("big-buy", ctxFor(hostelStudent(), 1));
    expect(student?.title).toBe("Big buy: ₹1,299");
    expect(student?.body).toContain("6 Aug");
    expect(fire("big-buy", ctxFor(firstJob(), 1))).toBeNull();
    // ₹2,499 at Myntra is 8% of ₹30,000: big for Rahul too.
    expect(fire("big-buy", ctxFor(firstJob(), 3))?.amount).toBe(2499);
  });

  test("nicknames from Teach your twin are used in the story", () => {
    const rent = fire("rent-day", ctxFor(firstJob(), 1));
    expect(rent?.body ?? rent?.title).toMatch(/PG owner/);
  });

  test("quiet months still get one event a week, and never more than the cap", () => {
    const empty = buildRealMonth("2026-08", [], {});
    const sim = simulateReplay(empty, DEFAULT_PLAN, "student");
    expect(sim.weeks).toHaveLength(4);
    for (const w of sim.weeks) {
      expect(w.events.length).toBeGreaterThan(0);
      expect(w.events.map((e) => e.tone)).not.toContain("bad"); // nothing happened, nothing went wrong
    }
    for (const [, make, type] of players) {
      for (const w of play(make, type).sim.weeks) expect(w.events.length).toBeLessThanOrEqual(MAX_EVENTS_PER_WEEK);
    }
  });
});

describe("three different players get three different stories", () => {
  test.each(players)("%s: every event is filled in with real numbers", (_, make, type) => {
    const { events, report } = play(make, type);
    expect(events.length).toBeGreaterThanOrEqual(4);
    for (const e of events) {
      const text = `${e.title} ${e.body}`;
      expect(text, e.id).not.toMatch(/NaN|undefined|null|Infinity|\[object/);
      if (e.amount !== undefined) expect(Number.isFinite(e.amount), e.id).toBe(true);
    }
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    expect(report.categories.length).toBeGreaterThan(2);
    expect(["A", "B", "C", "D"]).toContain(report.grade);
    expect(report.envelopes.map((e) => e.env)).toEqual(["needs", "wants", "savings"]);
    expect(report.lessons.length).toBeGreaterThan(0);
    expect(report.lessonContext.income).toBe(Math.round(monthMoney(make()).income));
  });

  test("the stories differ, and each has events only it gets", () => {
    const [a, b, c] = players.map(([, make, type]) => storyOf(make, type));
    const only = (x: Set<string>, ...others: Set<string>[]) => [...x].filter((id) => !others.some((o) => o.has(id)));
    expect(only(a, b, c).length).toBeGreaterThan(0);
    expect(only(b, a, c).length).toBeGreaterThan(0);
    expect(only(c, a, b).length).toBeGreaterThan(0);
  });

  test("the student's month: money from home, tiny UPI payments, a friend who owes", () => {
    const { events, report } = play(hostelStudent, "student");
    const all = events.map((e) => `${e.title} ${e.body}`).join("\n");
    expect(all).toContain("₹8,000");
    expect(events.some((e) => baseId(e.id) === "money-from-home")).toBe(true);
    expect(report.friends.owedToYou).toBe(350); // lent 650, got 300 back
    expect(report.friends.friends[0]).toMatchObject({ name: "Arjun P", net: 350 });
    expect(report.lessonContext.microPerDay).toBeGreaterThan(0);
  });

  test("the first-job month: salary day, PG rent, fixed costs", () => {
    const { events, report } = play(firstJob, "first-job");
    const ids = events.map((e) => baseId(e.id));
    const all = events.map((e) => `${e.title} ${e.body}`).join("\n");
    expect(ids).toContain("salary-day");
    expect(all).toContain("₹30,000");
    expect(all).toContain("₹9,500");
    expect(report.lessonContext.fixedCosts).toBe(9500 + 3000 + 1850 + 349 + 650 + 800);
    // A "my share" friend isn't a loan.
    expect(report.friends.friends).toHaveLength(0);
  });

  test("the freelancer's month: income in pieces", () => {
    const { events, report } = play(freelancer, "professional");
    expect(events.map((e) => baseId(e.id))).toContain("income-in-pieces");
    expect(report.income).toBe(35000);
    expect(report.extra).toBe(350);
  });
});

describe("plan and report", () => {
  test("the plan splits what was in the account plus the month's income", () => {
    const money = monthMoney(firstJob());
    const planned = replayPlanAmounts(money, DEFAULT_PLAN);
    expect(planned.needs + planned.wants + planned.emergency + planned.savings).toBe(money.opening + money.income);
    const split = realSplit(money);
    expect(split.needs + split.wants).toBeGreaterThan(0);
  });

  test("a tighter plan for the same real month gets a lower grade", () => {
    const loose = replayReport(simulateReplay(firstJob(), { needs: 60, wants: 35, savings: 5, emergency: 0 }, "first-job"));
    const tight = replayReport(simulateReplay(firstJob(), { needs: 30, wants: 10, savings: 60, emergency: 0 }, "first-job"));
    expect(tight.score).toBeLessThan(loose.score);
    expect(tight.envelopes[0].actual).toBe(loose.envelopes[0].actual); // same real spending
  });
});
