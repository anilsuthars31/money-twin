"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { TwinAvatar } from "@/components/twin/avatar";
import { useCharacter } from "@/game/character";
import { cn } from "@/lib/utils";

/**
 * The landing page for someone who's signed in: no marketing hero, just a way back to their twin.
 * The twin itself lives on this device, so it's read on the client; the greeting comes from the server.
 */
export function WelcomeBack({ firstName, accountLink }: { firstName: string; accountLink: ReactNode }) {
  const twin = useCharacter(); // undefined while loading, null if no twin on this device yet
  const hasTwin = !!twin;

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col px-4">
      <header className="flex items-center justify-between py-5">
        <span className="font-display text-lg font-bold tracking-tight">
          Money<span className="text-money">Twin</span>
        </span>
        {accountLink}
      </header>

      <main className="flex flex-1 flex-col justify-center pb-16">
        <div className="flex flex-col items-center text-center">
          <TwinAvatar seed={twin?.avatarSeed ?? `welcome-${firstName}`} className="size-32" />
          <h1 className="mt-6 text-4xl font-bold leading-tight text-balance">Welcome back, {firstName}</h1>
          <p className="mt-3 max-w-xs text-muted-foreground text-pretty">
            {twin === undefined
              ? " "
              : hasTwin
                ? `${twin.name} is ready for another month in ${twin.city}.`
                : "Create your twin on this device to start playing."}
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <Link href={hasTwin ? "/play/demo" : "/create"} className={cn(buttonVariants({ size: "xl" }), "w-full")}>
            Continue your twin <ArrowRight data-icon="inline-end" />
          </Link>
          <Link
            href="/skills"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-muted-foreground ring-1 ring-white/10 transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <BookOpen className="size-4 text-goal" /> Money Skills book
          </Link>
        </div>
      </main>
    </div>
  );
}
