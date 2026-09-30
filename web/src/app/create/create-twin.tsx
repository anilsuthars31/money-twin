"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowLeft, ArrowRight, Briefcase, Building2, ChevronRight, GraduationCap, MapPin, Shuffle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TwinAvatar } from "@/components/twin/avatar";
import { StatBars } from "@/components/twin/stat-bars";
import { CHARACTER_TYPES, saveCharacter } from "@/game/character";
import { STARTING_MOOD } from "@/game/engine";
import type { CharacterType } from "@/game/types";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

const TYPE_ICON: Record<CharacterType, LucideIcon> = {
  student: GraduationCap,
  "first-job": Briefcase,
  professional: Building2,
};

const CITIES = ["Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai", "Kolkata", "Jaipur"];

export function CreateTwin() {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [type, setType] = useState<CharacterType>("student");
  const [name, setName] = useState("");
  const [city, setCity] = useState("Bengaluru");
  const [look, setLook] = useState(1);

  const seed = `${name.trim().toLowerCase() || "twin"}-${look}`;
  const stats = { savings: 50, ...STARTING_MOOD[type], goal: 0 };
  const ready = name.trim().length > 0 && city.trim().length > 0;

  useGSAP(
    () => {
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-rise]", { y: 18, opacity: 0, stagger: 0.07, duration: 0.6, ease: "power3.out" });
      });
    },
    { scope: root },
  );

  const shuffle = () => {
    setLook((n) => n + 1);
    gsap.fromTo("[data-avatar]", { rotate: -8, scale: 0.92 }, { rotate: 0, scale: 1, duration: 0.5, ease: "back.out(2.5)" });
  };

  const start = () => {
    if (!ready) return;
    saveCharacter({ type, name: name.trim(), city: city.trim(), avatarSeed: seed, createdAt: new Date().toISOString() });
    router.push("/play/demo");
  };

  return (
    <div ref={root} className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-6">
      <header className="flex items-center gap-2 py-4">
        <Link href="/" className="grid size-10 place-items-center rounded-full hover:bg-white/5" aria-label="Back">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-lg font-semibold">Create your twin</h1>
      </header>

      {/* Preview: the character is always centred */}
      <section data-rise className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
        <div className="flex flex-col items-center">
          <div className="relative">
            <div data-avatar>
              <TwinAvatar seed={seed} className="size-32" />
            </div>
            <button
              type="button"
              onClick={shuffle}
              className="absolute -right-1 bottom-1 grid size-10 place-items-center rounded-full bg-raised ring-1 ring-white/10 hover:bg-white/10 active:scale-95 transition"
              aria-label="Shuffle look"
            >
              <Shuffle className="size-4 text-money" />
            </button>
          </div>
          <div className="mt-3 text-center">
            <div className="font-display text-2xl font-bold">{name.trim() || "Your twin"}</div>
            <div className="mt-0.5 flex items-center justify-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5" />
              {city || "Somewhere in India"} · {CHARACTER_TYPES.find((t) => t.type === type)!.label}
            </div>
          </div>
        </div>
        <StatBars stats={stats} className="mt-5" />
      </section>

      <section data-rise className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Life stage</h2>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Life stage">
          {CHARACTER_TYPES.map((t) => {
            const Icon = TYPE_ICON[t.type];
            const on = t.type === type;
            return (
              <button
                key={t.type}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setType(t.type)}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-2xl p-3 text-left ring-1 transition active:scale-[0.97]",
                  on ? "bg-money/10 ring-money/60" : "bg-card ring-white/5 hover:ring-white/15",
                )}
              >
                <Icon className={cn("size-5", on ? "text-money" : "text-muted-foreground")} />
                <span className="text-sm font-semibold leading-tight">{t.label}</span>
                <span className="text-[11px] leading-tight text-muted-foreground">{t.blurb}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section data-rise className="mt-6">
        <label htmlFor="twin-name" className="mb-2 block text-sm font-medium text-muted-foreground">
          Name
        </label>
        <input
          id="twin-name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 20))}
          onKeyDown={(e) => e.key === "Enter" && start()}
          placeholder="What should we call them?"
          autoComplete="off"
          className="h-14 w-full rounded-2xl bg-card px-4 text-lg ring-1 ring-white/5 outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-money/60"
        />
      </section>

      <section data-rise className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">City</h2>
          <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-hidden>
            Swipe for more <ChevronRight className="size-3.5" />
          </span>
        </div>
        {/* The fade on the right edge hints that the list keeps going. */}
        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_80%,transparent)]"
          role="radiogroup"
          aria-label="City"
        >
          {CITIES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === city}
              onClick={() => setCity(c)}
              className={cn(
                "h-10 shrink-0 rounded-full px-4 text-sm ring-1 transition",
                c === city ? "bg-money text-primary-foreground ring-money font-semibold" : "bg-card ring-white/5 hover:ring-white/15",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      <div className="mt-auto pt-8">
        <Button size="xl" className="w-full" disabled={!ready} onClick={start}>
          Start the demo month <ArrowRight data-icon="inline-end" />
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Your twin is saved on this device only.
        </p>
      </div>
    </div>
  );
}
