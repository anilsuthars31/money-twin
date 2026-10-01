"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHARACTER_TYPES } from "@/game/character";
import { twinNameProblem } from "@/game/twin-name";
import type { Character } from "@/game/types";
import { TwinAvatar } from "./avatar";

/**
 * Shown after signing in when the account has no twin yet but this browser has one: the player
 * decides whether that twin becomes theirs, instead of it being attached silently.
 */
export function TwinChoice({ twin, onKeep, onNew }: { twin: Character; onKeep: () => void; onNew: () => void }) {
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  const junk = twinNameProblem(twin.name) !== null;
  const stage = CHARACTER_TYPES.find((t) => t.type === twin.type)?.label;

  useEffect(() => first.current?.focus(), []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-background/80 p-4 backdrop-blur-sm sm:place-items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="twin-choice-title"
        className="mx-auto w-full max-w-md rounded-3xl bg-card p-5 ring-1 ring-white/10 shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-300 motion-reduce:animate-none"
      >
        <h2 id="twin-choice-title" className="text-xl font-bold text-balance">
          Use this twin or create a new one?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Your account doesn&apos;t have a twin yet. This device has one from earlier.
        </p>

        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3">
          <TwinAvatar seed={twin.avatarSeed} className="size-14" />
          <div className="min-w-0">
            <div className="truncate font-semibold">{twin.name}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" aria-hidden /> {twin.city} · {stage}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <Button
            ref={first}
            size="xl"
            className="w-full"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onKeep();
            }}
          >
            {junk ? `Use ${twin.name} and rename it` : `Use ${twin.name}`}
          </Button>
          <Button
            size="xl"
            variant="ghost"
            className="w-full ring-1 ring-white/10"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onNew();
            }}
          >
            <Plus data-icon="inline-start" /> Create a new twin
          </Button>
        </div>
      </div>
    </div>
  );
}
