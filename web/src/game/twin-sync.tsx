"use client";

import { useEffect } from "react";
import { applyCharacter, readCharacter, subscribeCharacter } from "./character";
import { DEFAULT_CONTEXT } from "./lessons";
import { applySkills, readSkills, subscribeSkills, type SkillBook } from "./skills";
import { mergeTwin, type TwinCopy } from "./twin-merge";

// Keeps the twin (character, XP, skills) in the player's account when they're signed in, so it
// follows them across devices. Signed out, it does nothing and the browser copy is all there is.

const SAVE_DELAY = 800; // ms: batch quick changes (e.g. several lessons) into one save

/** An untouched skill book counts as "no skills yet". */
const localSkills = (): SkillBook | null => {
  const b = readSkills();
  return !b.updatedAt && b.xp === 0 && Object.keys(b.learned).length === 0 ? null : b;
};

async function saveToAccount(twin: TwinCopy) {
  await fetch("/api/twin", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ character: twin.character ?? undefined, skills: twin.skills ?? undefined }),
    keepalive: true, // finish even if the player navigates away
  });
}

export function TwinSync() {
  useEffect(() => {
    let cancelled = false;
    let applying = false; // writes that came from the account shouldn't be sent straight back
    let timer: number | undefined;
    let unsubscribe = () => {};

    (async () => {
      const res = await fetch("/api/twin").catch(() => null);
      if (!res?.ok || cancelled) return; // signed out (401), offline, or the database is down
      const body = (await res.json()) as { twin: { character: TwinCopy["character"]; skills: SkillBook | null } | null };
      const account: TwinCopy = {
        character: body.twin?.character ?? null,
        skills: body.twin?.skills ? { ...body.twin.skills, context: body.twin.skills.context ?? DEFAULT_CONTEXT } : null,
      };
      const { merged, updateLocal, updateAccount } = mergeTwin({ character: readCharacter(), skills: localSkills() }, account);
      if (updateLocal) {
        applying = true;
        if (merged.character) applyCharacter(merged.character);
        if (merged.skills) applySkills(merged.skills);
        applying = false;
      }
      if (updateAccount) await saveToAccount(merged);
      if (cancelled) return;

      const onChange = () => {
        if (applying) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void saveToAccount({ character: readCharacter(), skills: localSkills() }), SAVE_DELAY);
      };
      const offChar = subscribeCharacter(onChange);
      const offSkills = subscribeSkills(onChange);
      unsubscribe = () => {
        offChar();
        offSkills();
      };
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);
  return null;
}
