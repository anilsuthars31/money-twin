import { DEFAULT_CONTEXT, XP_CORRECT, XP_TRIED } from "./lessons";
import { mergeReplay, type ReplayProgress } from "./replay-progress";
import type { SkillBook } from "./skills";
import type { Character } from "./types";

// Merging the twin kept in this browser with the copy in the player's account (pure, unit-tested).
// - Character: the most recently changed one wins.
// - Skills: learned lessons are combined (earliest date kept), and XP is recalculated from them,
//   so playing on two devices never loses a lesson or double-counts XP.
// - Lesson numbers (context): from whichever skill book changed last.
// - Replayed months: every month played on either side, the latest result for each.

export interface TwinCopy {
  character: Character | null;
  skills: SkillBook | null;
  replay?: ReplayProgress | null;
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
  const replay = mergeReplay(local.replay ?? null, account.replay ?? null);
  const merged: TwinCopy = { character, skills, replay };
  const differs = (side: TwinCopy) =>
    !same(merged.character, side.character) || !same(merged.skills, side.skills) || !same(merged.replay, side.replay);
  return { merged, updateLocal: differs(local), updateAccount: differs(account) };
}

/** Same twin on both sides (made once, maybe edited since): matched by when it was created, or its look. */
export const sameTwin = (a: Character, b: Character) => (!!a.createdAt && a.createdAt === b.createdAt) || a.avatarSeed === b.avatarSeed;

/**
 * What happens when a signed-in account meets the twin in this browser:
 * - the account has a twin and the browser has another one: the account's twin is used (whole);
 * - the account has no twin but the browser has one: ask "use this twin or create a new one?";
 * - otherwise (same twin, or only one side has one): merge as usual.
 */
export type SignInPlan =
  | { kind: "ask"; local: Character }
  | { kind: "use-account"; account: TwinCopy }
  | ({ kind: "merge" } & ReturnType<typeof mergeTwin>);

export function planSignIn(local: TwinCopy, account: TwinCopy): SignInPlan {
  if (local.character && !account.character) return { kind: "ask", local: local.character };
  if (local.character && account.character && !sameTwin(local.character, account.character)) return { kind: "use-account", account };
  return { kind: "merge", ...mergeTwin(local, account) };
}
