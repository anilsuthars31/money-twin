"use client";

import { useSyncExternalStore } from "react";
import type { Grade } from "./engine";
import type { Plan, Stats } from "./types";

// Replay progress: the real months the player has replayed, with their grade and how the twin
// felt at the end. Mood carries into the next month played. Saved on this device and, when
// signed in, in the account (TwinSync). Only results are kept, never transactions.

export interface MonthResult {
  grade: Grade;
  score: number; // 0-100
  savingsKept: number; // ₹, negative if the plan ran short
  stats: Stats; // at the end of the month
  plan: Plan;
  playedAt: string; // ISO
  /** "What if?" moments: how much more the What-if you kept than the real you (0 if all "Same as real"). */
  whatIfSaved?: number;
  realGrade?: Grade; // the grade with every moment "Same as real"
}

export interface ReplayProgress {
  months: Record<string, MonthResult>; // "2026-08" → result
  updatedAt?: string;
}

const KEY = "money-twin:replay";
const EMPTY: ReplayProgress = { months: {} };
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: ReplayProgress = EMPTY;

export function readReplay(): ReplayProgress {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cached;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed = raw ? (JSON.parse(raw) as ReplayProgress) : EMPTY;
      cached = { ...EMPTY, ...parsed, months: parsed.months ?? {} };
    } catch {
      cached = EMPTY;
    }
  }
  return cached;
}

/** Writes progress as-is (used directly when restoring the copy from the account). */
export function applyReplay(p: ReplayProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    cached = p; // storage blocked: keep it for this session
  }
  cachedRaw = undefined;
  listeners.forEach((l) => l());
}

/** Forgets replay progress in this browser (the account copy, if any, is untouched). */
export function clearReplay() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  cached = EMPTY;
  cachedRaw = undefined;
  listeners.forEach((l) => l());
}

/** Records a replayed month. Playing it again replaces the old result. */
export function saveMonthResult(key: string, result: Omit<MonthResult, "playedAt">) {
  const p = readReplay();
  const at = new Date().toISOString();
  applyReplay({ months: { ...p.months, [key]: { ...result, playedAt: at } }, updatedAt: at });
}

/** What-if savings across every month replayed. */
export const totalWhatIfSaved = (p: ReplayProgress) => Object.values(p.months).reduce((s, r) => s + Math.max(0, r.whatIfSaved ?? 0), 0);

/** How the twin feels going into a month: the end of the latest earlier month played, if any. */
export function moodBefore(p: ReplayProgress, key: string): Pick<Stats, "happiness" | "stress"> | undefined {
  const earlier = Object.keys(p.months)
    .filter((k) => k < key)
    .sort()
    .at(-1);
  if (!earlier) return undefined;
  const { happiness, stress } = p.months[earlier].stats;
  return { happiness, stress };
}

const stamp = (s?: string) => (s ? Date.parse(s) || 0 : 0);

/** Browser + account copies: every month played on either, the latest result for each. */
export function mergeReplay(a: ReplayProgress | null, b: ReplayProgress | null): ReplayProgress | null {
  if (!a || !b) return a ?? b;
  const months = { ...b.months };
  for (const [key, r] of Object.entries(a.months)) {
    if (!months[key] || stamp(r.playedAt) >= stamp(months[key].playedAt)) months[key] = r;
  }
  const updatedAt = stamp(a.updatedAt) >= stamp(b.updatedAt) ? a.updatedAt : b.updatedAt;
  return { months, ...(updatedAt && { updatedAt }) };
}

export function subscribeReplay(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useReplayProgress(): ReplayProgress {
  return useSyncExternalStore(subscribeReplay, readReplay, () => EMPTY);
}
