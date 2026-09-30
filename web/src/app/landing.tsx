"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import Lenis from "lenis";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowRight, Gamepad2, Lock, Tags } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { TwinAvatar } from "@/components/twin/avatar";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

// WebGL is only for the hero, loaded after first paint so the page never waits on three.js.
const CoinOrbit = dynamic(() => import("@/components/three/coin-orbit"), { ssr: false });

/** Skip 3D for reduced motion, data saver, or clearly low-end phones. */
function canRun3D() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return false;
  if ((nav.deviceMemory ?? 8) < 4 || (nav.hardwareConcurrency ?? 8) < 4) return false;
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

const CHIPS = [
  { text: "11 Swiggy orders", sub: "Happiness +5 · Stress +6", tone: "text-alert", pos: "left-0 top-6 -rotate-3" },
  { text: "+₹8,000 from home", sub: "Stress −10", tone: "text-money", pos: "right-0 top-24 rotate-2" },
  { text: "Chai tab ₹1,745", sub: "43 tiny UPI payments", tone: "text-happy", pos: "left-2 bottom-4 rotate-1" },
];

const STEPS = [
  {
    icon: Gamepad2,
    title: "Play a demo month",
    body: "Your twin lives through a hostel student's month. Choices, surprises, and a report card at the end. No sign-up.",
  },
  {
    icon: Lock,
    title: "Bring it to life",
    body: "Add your bank statement when you're ready. It's read on your phone, and the file never leaves it.",
  },
  {
    icon: Tags,
    title: "Teach your twin",
    body: "Tell it who \"Manjunath S\" is: the canteen, your PG, a friend. Every lesson comes from your own spending.",
  },
];

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const [show3D, setShow3D] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- needs browser APIs, so it can't run during SSR
  useEffect(() => setShow3D(canRun3D()), []);

  // Smooth scroll on the landing page only.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true });
    return () => lenis.destroy();
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      // Only decoration moves. The headline, CTA and steps are plain server-rendered HTML, visible
      // the moment the page loads, whether or not JavaScript or scrolling has happened.
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-chip]", { y: 12, scale: 0.96, stagger: 0.12, duration: 0.6, ease: "power3.out" });
        gsap.to("[data-hero-avatar]", { y: -8, duration: 2.6, ease: "sine.inOut", yoyo: true, repeat: -1 });
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="mx-auto w-full max-w-md px-4 sm:max-w-lg">
      <header className="flex items-center justify-between py-5">
        <span className="font-display text-lg font-bold tracking-tight">
          Money<span className="text-money">Twin</span>
        </span>
        <Link href="/play/demo" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Play demo
        </Link>
      </header>

      <section className="flex min-h-[calc(100svh-4.5rem)] flex-col justify-center pb-10">
        <div className="relative mx-auto h-72 w-full max-w-sm">
          {show3D && (
            <div className="absolute inset-x-0 -inset-y-6 animate-in fade-in duration-1000">
              <CoinOrbit />
            </div>
          )}
          <div data-hero-avatar className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <TwinAvatar seed="Aarav-hostel" className="size-44" />
          </div>
          {CHIPS.map((c) => (
            <div
              key={c.text}
              data-chip
              className={cn(
                "absolute rounded-2xl bg-card/90 px-3.5 py-2.5 ring-1 ring-white/10 backdrop-blur shadow-lg shadow-black/30",
                c.pos,
              )}
            >
              <div className={cn("num text-sm font-semibold", c.tone)}>{c.text}</div>
              <div className="text-[11px] text-muted-foreground">{c.sub}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <h1 className="text-[2.6rem] leading-[1.02] font-bold text-balance">
            Meet the version of you that lives on your <span className="text-money">real spending</span>.
          </h1>
          <p className="mx-auto mt-4 max-w-xs text-muted-foreground text-pretty">
            A life-sim game where your twin&apos;s month is shaped by your money, and every lesson comes from
            your own habits.
          </p>
          <div className="mt-8">
            <Link href="/create" className={cn(buttonVariants({ size: "xl" }), "w-full sm:w-auto sm:px-10")}>
              Create your twin <ArrowRight data-icon="inline-end" />
            </Link>
            <p className="mt-3 text-xs text-muted-foreground">No bank statement needed to start.</p>
          </div>
        </div>
      </section>

      <section className="space-y-3 pb-16">
        <h2 className="mb-5 text-2xl font-bold">How it works</h2>
        {STEPS.map((s, i) => (
          <div key={s.title} className="flex gap-4 rounded-3xl bg-card p-5 ring-1 ring-white/5">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-raised">
              <s.icon className="size-5 text-money" aria-hidden />
            </div>
            <div>
              <div className="text-xs text-muted-foreground num">Step {i + 1}</div>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">{s.body}</p>
            </div>
          </div>
        ))}
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        General money education only. Not investment advice.
      </footer>
    </div>
  );
}
