import { describe, expect, test } from "vitest";
import { DEFAULT_CONTEXT } from "./lessons";
import type { SkillBook } from "./skills";
import type { Character } from "./types";
import { mergeTwin, planSignIn, xpFor } from "./twin-merge";

const char = (name: string, updatedAt: string): Character => ({
  type: "student",
  name,
  city: "Pune",
  avatarSeed: name,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt,
});
const book = (learned: SkillBook["learned"], updatedAt: string, income = 8000): SkillBook => ({
  xp: xpFor(learned),
  learned,
  context: { ...DEFAULT_CONTEXT, income },
  updatedAt,
});

describe("merging the twin across devices", () => {
  test("a new device gets the account's twin", () => {
    const account = { character: char("Kavya", "2026-09-10T10:00:00Z"), skills: book({}, "2026-09-10T10:00:00Z") };
    const r = mergeTwin({ character: null, skills: null }, account);
    expect(r.merged).toEqual({ ...account, replay: null });
    expect(r.updateLocal).toBe(true);
    expect(r.updateAccount).toBe(false);
  });

  test("a twin made before signing in is saved to an empty account", () => {
    const local = { character: char("Aarav", "2026-09-10T10:00:00Z"), skills: null };
    const r = mergeTwin(local, { character: null, skills: null });
    expect(r.merged.character?.name).toBe("Aarav");
    expect(r.updateAccount).toBe(true);
    expect(r.updateLocal).toBe(false);
  });

  test("the most recently changed character wins", () => {
    const older = char("Old name", "2026-09-10T10:00:00Z");
    const newer = char("New name", "2026-09-12T10:00:00Z");
    expect(mergeTwin({ character: older, skills: null }, { character: newer, skills: null }).merged.character).toEqual(newer);
    expect(mergeTwin({ character: newer, skills: null }, { character: older, skills: null }).merged.character).toEqual(newer);
  });

  test("lessons learned on either device are combined and XP is recalculated, never double-counted", () => {
    const phone = book({ impulse: { correct: true, at: "2026-09-11T09:00:00Z" }, delivery: { correct: false, at: "2026-09-11T09:05:00Z" } }, "2026-09-11T09:05:00Z", 8000);
    const laptop = book({ impulse: { correct: false, at: "2026-09-12T09:00:00Z" }, "50-30-20": { correct: true, at: "2026-09-12T09:10:00Z" } }, "2026-09-12T09:10:00Z", 32000);
    const r = mergeTwin({ character: null, skills: phone }, { character: null, skills: laptop });
    const s = r.merged.skills!;
    expect(Object.keys(s.learned).sort()).toEqual(["50-30-20", "delivery", "impulse"]);
    expect(s.learned.impulse).toEqual({ correct: true, at: "2026-09-11T09:00:00Z" }); // earliest attempt kept
    expect(s.xp).toBe(30 + 10 + 30);
    expect(s.context.income).toBe(32000); // numbers from the newer book
    expect(r.updateLocal).toBe(true);
    expect(r.updateAccount).toBe(true);
  });

  test("nothing to do when both copies already match", () => {
    const twin = { character: char("Kavya", "2026-09-10T10:00:00Z"), skills: book({ impulse: { correct: true, at: "2026-09-10T10:00:00Z" } }, "2026-09-10T10:00:00Z") };
    const r = mergeTwin(twin, structuredClone(twin));
    expect(r.updateLocal).toBe(false);
    expect(r.updateAccount).toBe(false);
  });
});

describe("signing in with a twin in the browser", () => {
  const kavya = char("Kavya", "2026-09-10T10:00:00Z");
  const other: Character = { ...char("Rohan", "2026-09-12T10:00:00Z"), avatarSeed: "rohan-1", createdAt: "2026-09-12T09:00:00Z" };

  test("account has no twin, browser has one: ask first", () => {
    const plan = planSignIn({ character: kavya, skills: null }, { character: null, skills: null });
    expect(plan).toEqual({ kind: "ask", local: kavya });
  });

  test("account already has a twin: the account's twin wins, even if the browser's is newer", () => {
    const account = { character: kavya, skills: book({ impulse: { correct: true, at: "2026-09-10T10:00:00Z" } }, "2026-09-10T10:00:00Z") };
    const plan = planSignIn({ character: other, skills: book({ delivery: { correct: true, at: "2026-09-12T10:00:00Z" } }, "2026-09-12T10:00:00Z") }, account);
    expect(plan).toEqual({ kind: "use-account", account });
  });

  test("the same twin on both sides is merged as before (an edit on this device wins)", () => {
    const renamed = { ...kavya, name: "Kavya R", updatedAt: "2026-09-15T10:00:00Z" };
    const plan = planSignIn({ character: renamed, skills: null }, { character: kavya, skills: null });
    expect(plan.kind).toBe("merge");
    if (plan.kind === "merge") {
      expect(plan.merged.character?.name).toBe("Kavya R");
      expect(plan.updateAccount).toBe(true);
    }
  });

  test("no twin in the browser: the account's twin comes down", () => {
    const plan = planSignIn({ character: null, skills: null }, { character: kavya, skills: null });
    expect(plan).toMatchObject({ kind: "merge", updateLocal: true, merged: { character: kavya } });
  });
});
