"use client";

import { useSyncExternalStore } from "react";
import { ABILITY_OF, DEFAULT_CONTEXT, XP_CORRECT, XP_TRIED, type LessonContext } from "./lessons";
import type { Ability, LessonId } from "./types";

// The Money Skills book: learned lessons, XP and the abilities they unlock. Saved on this device.

export interface SkillBook {
  xp: number;
  learned: Partial<Record<LessonId, { correct: boolean; at: string }>>;
  /** Numbers from the last month played, so replayed lessons still use the player's own money. */
  context: LessonContext;
}

const KEY = "money-twin:skills";
const EMPTY: SkillBook = { xp: 0, learned: {}, context: DEFAULT_CONTEXT };
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: SkillBook = EMPTY;

function read(): SkillBook {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cached;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? { ...EMPTY, ...(JSON.parse(raw) as SkillBook) } : EMPTY;
    } catch {
      cached = EMPTY;
    }
  }
  return cached;
}

function write(book: SkillBook) {
  try {
    localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    cached = book; // storage blocked: keep it for this session
  }
  cachedRaw = undefined;
  listeners.forEach((l) => l());
}

/** Records a finished lesson. XP is only awarded the first time. Returns the XP earned. */
export function learnLesson(id: LessonId, correct: boolean): number {
  const book = read();
  if (book.learned[id]) return 0;
  const xp = correct ? XP_CORRECT : XP_TRIED;
  write({ ...book, xp: book.xp + xp, learned: { ...book.learned, [id]: { correct, at: new Date().toISOString() } } });
  return xp;
}

export function saveLessonContext(context: LessonContext) {
  write({ ...read(), context });
}

export function resetSkills() {
  write(EMPTY);
}

export function abilitiesOf(book: SkillBook): Ability[] {
  return (Object.keys(book.learned) as LessonId[]).flatMap((id) => (ABILITY_OF[id] ? [ABILITY_OF[id]!] : []));
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSkills(): SkillBook {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
