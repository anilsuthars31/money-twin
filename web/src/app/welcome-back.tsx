"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarRange, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { TwinAvatar } from "@/components/twin/avatar";
import { useCharacter } from "@/game/character";
import { cn } from "@/lib/utils";

/**
 * The landing page for someone who's signed in: no marketing hero, just a way back to their twin.
 * The twin itself lives on this device, so it's read on the client; the greeting comes from the server.
 */
/** "Jul–Aug 2026", or "Sep 2024 – Apr 2026" across years. */
export function monthRange(fromIso: string, toIso: string): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const m = (d: Date) => d.toLocaleString("en-IN", { month: "short" });
  if (from.getFullYear() !== to.getFullYear()) return `${m(from)} ${from.getFullYear()} – ${m(to)} ${to.getFullYear()}`;
  return m(from) === m(to) ? `${m(from)} ${to.getFullYear()}` : `${m(from)}–${m(to)} ${to.getFullYear()}`;
}

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
          {saved ? (
            <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
              <Link href="/account" className="flex items-center gap-3">
                <CalendarRange className="size-5 shrink-0 text-money" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    <span className="num">{saved.count.toLocaleString("en-IN")}</span> transactions saved,{" "}
                    {monthRange(saved.from, saved.to)}
                  </span>
                  <span className="block text-xs text-muted-foreground">Your real months, in your account</span>
                </span>
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
        </div>
      </main>
    </div>
  );
}
