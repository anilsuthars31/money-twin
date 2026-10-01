import { describe, expect, test } from "vitest";
import { DEFAULT_PLAN } from "./engine";
import { mergeReplay, moodBefore, totalWhatIfSaved, type MonthResult, type ReplayProgress } from "./replay-progress";
import { mergeTwin } from "./twin-merge";

const result = (grade: MonthResult["grade"], playedAt: string, happiness = 60, stress = 30): MonthResult => ({
  grade,
  score: { A: 90, B: 75, C: 60, D: 40 }[grade],
  savingsKept: 1000,
  stats: { savings: 50, happiness, stress, goal: 80 },
  plan: DEFAULT_PLAN,
  playedAt,
});

describe("replay progress", () => {
  test("mood carries from the latest earlier month played", () => {
    const p: ReplayProgress = {
      months: { "2026-06": result("C", "2026-09-01T00:00:00Z", 40, 70), "2026-07": result("B", "2026-09-02T00:00:00Z", 55, 45) },
    };
    expect(moodBefore(p, "2026-08")).toEqual({ happiness: 55, stress: 45 });
    expect(moodBefore(p, "2026-07")).toEqual({ happiness: 40, stress: 70 });
    expect(moodBefore(p, "2026-06")).toBeUndefined();
  });

  test("What-if savings add up across months", () => {
    const p: ReplayProgress = {
      months: {
        "2026-06": { ...result("C", "2026-09-01T00:00:00Z"), whatIfSaved: 1299 },
        "2026-07": { ...result("B", "2026-09-02T00:00:00Z"), whatIfSaved: 0 },
        "2026-08": result("A", "2026-09-03T00:00:00Z"), // played before What-if existed
      },
    };
    expect(totalWhatIfSaved(p)).toBe(1299);
  });

  test("merging keeps every month played on either device, the latest result for each", () => {
    const phone: ReplayProgress = {
      months: { "2026-07": result("C", "2026-09-01T00:00:00Z"), "2026-08": result("A", "2026-09-05T00:00:00Z") },
      updatedAt: "2026-09-05T00:00:00Z",
    };
    const laptop: ReplayProgress = {
      months: { "2026-06": result("D", "2026-09-02T00:00:00Z"), "2026-07": result("B", "2026-09-03T00:00:00Z") },
      updatedAt: "2026-09-03T00:00:00Z",
    };
    const m = mergeReplay(phone, laptop)!;
    expect(Object.fromEntries(Object.entries(m.months).map(([k, r]) => [k, r.grade]))).toEqual({ "2026-06": "D", "2026-07": "B", "2026-08": "A" });
    expect(m.updatedAt).toBe("2026-09-05T00:00:00Z");
    expect(mergeReplay(null, laptop)).toBe(laptop);
  });

  test("the twin merge syncs replay progress both ways", () => {
    const local = { character: null, skills: null, replay: { months: { "2026-08": result("B", "2026-09-05T00:00:00Z") } } };
    const r = mergeTwin(local, { character: null, skills: null, replay: null });
    expect(r.updateAccount).toBe(true);
    expect(r.updateLocal).toBe(false);
    const back = mergeTwin({ character: null, skills: null }, r.merged);
    expect(back.updateLocal).toBe(true);
    expect(back.merged.replay?.months["2026-08"].grade).toBe("B");
  });
});
