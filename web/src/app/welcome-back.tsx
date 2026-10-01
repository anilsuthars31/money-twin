"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarRange, MapPin, Pencil, ShieldCheck, TriangleAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { TwinAvatar } from "@/components/twin/avatar";
import { CHARACTER_TYPES, useCharacter } from "@/game/character";
import { twinNameProblem } from "@/game/twin-name";
import { cn } from "@/lib/utils";

/** "Jul–Aug 2026", or "Sep 2024 – Apr 2026" across years. */
export function monthRange(fromIso: string, toIso: string): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const m = (d: Date) => d.toLocaleString("en-IN", { month: "short" });
  if (from.getFullYear() !== to.getFullYear()) return `${m(from)} ${from.getFullYear()} – ${m(to)} ${to.getFullYear()}`;
  return m(from) === m(to) ? `${m(from)} ${to.getFullYear()}` : `${m(from)}–${m(to)} ${to.getFullYear()}`;
}

/**
 * The landing page for someone who's signed in: no marketing hero, just a way back to their twin.
 * Two different things, kept visibly apart: the account ("Welcome back, Anil", avatar in the header)
 * and the twin (the character you play, with its own name and avatar, and an Edit twin link).
 * The twin is read on the client; the greeting comes from the server.
 */
export function WelcomeBack({
  firstName,
  accountLink,
  saved,
}: {
  firstName: string;
  accountLink: ReactNode;
  saved: { count: number; from: string; to: string } | null;
}) {
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
        <h1 className="text-4xl font-bold leading-tight text-balance">Welcome back, {firstName}</h1>

        <section aria-label="Your twin" className="mt-6 rounded-3xl bg-card p-5 ring-1 ring-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-money">Your twin</h2>
            {hasTwin && (
              <Link
                href="/edit-twin"
                className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <Pencil className="size-3.5" aria-hidden /> Edit twin
              </Link>
            )}
          </div>
          {twin === undefined ? (
            <div className="mt-3 h-20 animate-pulse rounded-2xl bg-white/[0.04]" aria-hidden />
          ) : twin ? (
            <>
              <div className="mt-3 flex items-center gap-4">
                <TwinAvatar seed={twin.avatarSeed} className="size-20" />
                <div className="min-w-0">
                  <div className="truncate font-display text-2xl font-bold">{twin.name}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">
                      {twin.city} · {CHARACTER_TYPES.find((t) => t.type === twin.type)?.label}
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground text-pretty">
                {twin.name} is ready for another month in {twin.city}.
              </p>
              {twinNameProblem(twin.name) && (
                <Link
                  href="/edit-twin"
                  className="mt-3 flex items-center gap-2 rounded-2xl bg-alert/10 p-3 text-sm ring-1 ring-alert/30 hover:bg-alert/15"
                >
                  <TriangleAlert className="size-4 shrink-0 text-alert" aria-hidden />
                  <span className="flex-1">Give your twin a real name so it can be saved to your account.</span>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground text-pretty">
              No twin on this device yet. Create one to start playing.
            </p>
          )}
        </section>

        <div className="mt-8 space-y-3">
          {/* Real months saved → replay them; otherwise the demo month (or make a twin first). */}
          <Link
            href={!hasTwin ? "/create" : saved ? "/replay" : "/play/demo"}
            className={cn(buttonVariants({ size: "xl" }), "w-full")}
          >
            Continue your twin <ArrowRight data-icon="inline-end" />
          </Link>
          {saved ? (
            <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
              <Link href="/dashboard" className="flex items-center gap-3">
                <CalendarRange className="size-5 shrink-0 text-money" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    <span className="num">{saved.count.toLocaleString("en-IN")}</span> transactions saved,{" "}
                    {monthRange(saved.from, saved.to)}
                  </span>
                  <span className="block text-xs text-muted-foreground">See where your money goes</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
              <Link href="/upload" className="mt-3 block text-sm text-money underline-offset-4 hover:underline">
                Add a newer statement
              </Link>
            </div>
          ) : (
            <Link
              href="/upload"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold ring-1 ring-money/40 transition-colors hover:bg-money/10"
            >
              <ShieldCheck className="size-4 text-money" /> Bring your twin to life with your statement
            </Link>
          )}
          <Link
            href="/skills"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-muted-foreground ring-1 ring-white/10 transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <BookOpen className="size-4 text-goal" /> Money Skills book
          </Link>
          {saved && hasTwin && (
            <Link href="/play/demo" className="block py-1 text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
              Play the demo month
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
