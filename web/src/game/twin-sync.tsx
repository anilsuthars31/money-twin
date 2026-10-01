"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TwinChoice } from "@/components/twin/twin-choice";
import { applyCharacter, clearCharacter, readCharacter, subscribeCharacter } from "./character";
import { DEFAULT_CONTEXT } from "./lessons";
import { applyReplay, clearReplay, readReplay, subscribeReplay, type ReplayProgress } from "./replay-progress";
import { applySkills, clearSkills, readSkills, subscribeSkills, type SkillBook } from "./skills";
import { twinNameProblem } from "./twin-name";
import { mergeTwin, planSignIn, type TwinCopy } from "./twin-merge";
import type { Character } from "./types";

// Keeps the twin (character, XP, skills, replayed months) in the player's account when they're
// signed in, so it follows them across devices. Signed out, the browser copy is all there is.
//
// When an account meets the twin in this browser (see planSignIn):
// - the account's own twin always wins over a different one in the browser;
// - an account with no twin asks before taking the browser's ("Use this twin or create a new one?");
// - the same twin on both sides is merged.
// The layout passes the signed-in account (it re-renders when signing in or out changes the
// cookie), so switching accounts in one tab never attaches one person's twin to another's account.
// Checks run one at a time and are never abandoned half-way.

const SAVE_DELAY = 800; // ms: batch quick changes (e.g. several lessons) into one save

/** An untouched skill book counts as "no skills yet". */
const localSkills = (): SkillBook | null => {
  const b = readSkills();
  return !b.updatedAt && b.xp === 0 && Object.keys(b.learned).length === 0 ? null : b;
};

const localReplay = (): ReplayProgress | null => {
  const p = readReplay();
  return !p.updatedAt && Object.keys(p.months).length === 0 ? null : p;
};

const localTwin = (): TwinCopy => ({ character: readCharacter(), skills: localSkills(), replay: localReplay() });

async function saveToAccount(twin: TwinCopy) {
  await fetch("/api/twin", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      character: twin.character ?? undefined,
      skills: twin.skills ?? undefined,
      replay: twin.replay ?? undefined,
    }),
    keepalive: true, // finish even if the player navigates away
  }).catch(() => {});
}

interface AccountTwin {
  character: TwinCopy["character"];
  skills: SkillBook | null;
  replay?: ReplayProgress | null;
}

export function TwinSync({ userId }: { userId: string | null }) {
  const router = useRouter();
  const [ask, setAsk] = useState<{ local: Character; account: TwinCopy } | null>(null);
  const state = useRef({
    user: undefined as string | null | undefined,
    stop: () => {},
    applying: false,
    timer: 0,
    chain: Promise.resolve(),
  });

  /** Writes a twin into this browser without sending it straight back to the account. */
  const applyLocal = (twin: TwinCopy) => {
    const s = state.current;
    s.applying = true;
    if (twin.character) applyCharacter(twin.character);
    else clearCharacter();
    if (twin.skills) applySkills(twin.skills);
    else clearSkills();
    if (twin.replay) applyReplay(twin.replay);
    else clearReplay();
    s.applying = false;
  };

  /** From now on, changes made in this browser are saved to the account. */
  const follow = () => {
    const s = state.current;
    const onChange = () => {
      if (s.applying) return;
      window.clearTimeout(s.timer);
      s.timer = window.setTimeout(() => void saveToAccount(localTwin()), SAVE_DELAY);
    };
    const offs = [subscribeCharacter(onChange), subscribeSkills(onChange), subscribeReplay(onChange)];
    s.stop = () => {
      window.clearTimeout(s.timer);
      offs.forEach((off) => off());
    };
  };

  useEffect(() => {
    const s = state.current;
    const check = async () => {
      if (userId === s.user) return;
      // Signed in, out, or as someone else: start over for this account.
      s.stop();
      s.stop = () => {};
      s.user = userId;
      setAsk(null);
      if (!userId) return;

      const before = localTwin(); // what this browser had when this account showed up
      const res = await fetch("/api/twin").catch(() => null);
      if (!res?.ok) {
        s.user = undefined; // offline, or the database is down: try again next time
        return;
      }
      const body = (await res.json()) as { twin: AccountTwin | null };
      const account: TwinCopy = {
        character: body.twin?.character ?? null,
        skills: body.twin?.skills ? { ...body.twin.skills, context: body.twin.skills.context ?? DEFAULT_CONTEXT } : null,
        replay: body.twin?.replay ?? null,
      };
      // A twin made while this check was running was made signed in: it's simply this account's.
      const local = localTwin();
      const madeMeanwhile = !before.character && !!local.character;
      const plan = madeMeanwhile ? ({ kind: "merge", ...mergeTwin(local, account) } as const) : planSignIn(local, account);
      if (plan.kind === "ask") return setAsk({ local: plan.local, account });
      if (plan.kind === "use-account") applyLocal(plan.account);
      else {
        if (plan.updateLocal) applyLocal(plan.merged);
        if (plan.updateAccount) await saveToAccount(plan.merged);
      }
      follow();
    };
    s.chain = s.chain.then(check).catch(() => {});
  }, [userId]);

  useEffect(() => () => state.current.stop(), []);

  if (!ask) return null;
  return (
    <TwinChoice
      twin={ask.local}
      onKeep={async () => {
        const { merged } = mergeTwin(localTwin(), ask.account);
        setAsk(null);
        await saveToAccount(merged);
        follow();
        if (twinNameProblem(ask.local.name)) router.push("/edit-twin"); // a junk name has to be fixed to save
      }}
      onNew={() => {
        applyLocal({ character: null, skills: ask.account.skills, replay: ask.account.replay });
        setAsk(null);
        follow();
        router.push("/create");
      }}
    />
  );
}
