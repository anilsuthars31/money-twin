"use client";

import { useSyncExternalStore } from "react";
import type { Character, CharacterType } from "./types";

// The twin lives in localStorage, so playing needs no account. When signed in, TwinSync also keeps
// a copy in the account (MongoDB) so it follows the player across devices.

const KEY = "money-twin:character";
const listeners = new Set<() => void>();

export const CHARACTER_TYPES: { type: CharacterType; label: string; blurb: string }[] = [
  { type: "student", label: "Student", blurb: "Pocket money, hostel life" },
  { type: "first-job", label: "First job", blurb: "First salary, first rent" },
  { type: "professional", label: "Working pro", blurb: "EMIs, family, goals" },
];

/** Saves a change the player made (stamped now, so it wins when merged with the account copy). */
export function saveCharacter(c: Character) {
  applyCharacter({ ...c, updatedAt: new Date().toISOString() });
}

/** Writes a character as-is (used when restoring the copy from the account). */
export function applyCharacter(c: Character) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // Private mode or storage full: the twin just won't survive a reload.
  }
  cachedRaw = undefined;
  listeners.forEach((l) => l());
}

let cachedRaw: string | null | undefined;
let cached: Character | null = null;

export function readCharacter(): Character | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? (JSON.parse(raw) as Character) : null;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function subscribeCharacter(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** `undefined` while rendering on the server, `null` if no twin has been created yet. */
export function useCharacter(): Character | null | undefined {
  return useSyncExternalStore(subscribeCharacter, readCharacter, () => undefined);
}
