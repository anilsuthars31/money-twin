import { DEFAULT_CONTEXT, XP_CORRECT, XP_TRIED } from "./lessons";
import type { SkillBook } from "./skills";
import type { Character } from "./types";

// Merging the twin kept in this browser with the copy in the player's account (pure, unit-tested).
// - Character: the most recently changed one wins.
// - Skills: learned lessons are combined (earliest date kept), and XP is recalculated from them,
//   so playing on two devices never loses a lesson or double-counts XP.
// - Lesson numbers (context): from whichever skill book changed last.

export interface TwinCopy {
  character: Character | null;
  skills: SkillBook | null;
}

const stamp = (s?: string) => (s ? Date.parse(s) || 0 : 0);
const characterTime = (c: Character) => stamp(c.updatedAt) || stamp(c.createdAt);

export function xpFor(learned: SkillBook["learned"]): number {
  return Object.values(learned).reduce((sum, l) => sum + (l?.correct ? XP_CORRECT : XP_TRIED), 0);
}

function mergeSkills(a: SkillBook | null, b: SkillBook | null): SkillBook | null {
  if (!a || !b) return a ?? b;
  const learned: SkillBook["learned"] = { ...b.learned };
  for (const [id, entry] of Object.entries(a.learned) as [keyof SkillBook["learned"], { correct: boolean; at: string }][]) {
    const other = learned[id];
    learned[id] = !other || stamp(entry.at) < stamp(other.at) ? entry : other;
  }
  const newer = stamp(a.updatedAt) >= stamp(b.updatedAt) ? a : b;
  return {
    xp: xpFor(learned),
    learned,
    context: newer.context ?? DEFAULT_CONTEXT,
    updatedAt: newer.updatedAt ?? a.updatedAt ?? b.updatedAt,
  };
}

const same = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);

/** The merged twin, and which side needs updating to match it. */
export function mergeTwin(local: TwinCopy, account: TwinCopy) {
  const character =
    local.character && account.character
      ? characterTime(local.character) >= characterTime(account.character)
        ? local.character
        : account.character
      : (local.character ?? account.character);
  const skills = mergeSkills(local.skills, account.skills);
  const merged: TwinCopy = { character, skills };
  return {
    merged,
    updateLocal: !same(merged.character, local.character) || !same(merged.skills, local.skills),
    updateAccount: !same(merged.character, account.character) || !same(merged.skills, account.skills),
  };
}
