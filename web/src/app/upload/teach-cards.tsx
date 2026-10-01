"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bike,
  CircleEllipsis,
  Clapperboard,
  GraduationCap,
  Heart,
  HeartPulse,
  Tag,
  House,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingBasket,
  Undo2,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { FriendMode, FriendReceived, TeachCategory } from "@/lib/categories";
import { FriendQuestions, friendAnswered, type FriendAnswers } from "./friend-questions";
import type { PayeeCard } from "@/lib/statement";
import { cn } from "@/lib/utils";
import { UnderstandingMeter } from "./understanding-meter";

const ICON: Record<TeachCategory, LucideIcon> = {
  Food: Utensils,
  "Rent/PG": House,
  Groceries: ShoppingBasket,
  Friend: Users,
  Family: Heart,
  Shopping: ShoppingBag,
  Transport: Bike,
  "Bills & Recharge": Receipt,
  Education: GraduationCap,
  Health: HeartPulse,
  Entertainment: Clapperboard,
  Travel: Plane,
  Other: CircleEllipsis,
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const SWIPE = 90; // px to count as a swipe

/** One answer: the category (null = skipped), an optional nickname, and for friends, lending or share. */
export type Decision = {
  key: string;
  category: TeachCategory | null;
  nickname?: string;
  friendMode?: FriendMode; // money you sent them
  friendReceived?: FriendReceived; // money they sent you
};

/**
 * One payee at a time: who they are in numbers, and six likely categories (the rest under "More").
 * Swipe right = the "Likely" category, swipe left = skip. Buttons and keys do the same, so swiping
 * is never required.
 */
export function TeachCards({
  cards,
  decisions,
  understood,
  startUnderstood,
  nicknameChips = [],
  onDecide,
  onUndo,
  onFinish,
}: {
  cards: PayeeCard[];
  decisions: Decision[];
  understood: number;
  startUnderstood: number;
  nicknameChips?: string[]; // nicknames used before, offered as quick picks
  onDecide: (d: Decision) => void;
  onUndo: () => void;
  onFinish: () => void;
}) {
  const index = decisions.length;
  const card = cards[index];
  const [more, setMore] = useState(false);
  const [naming, setNaming] = useState(false);
  const [nickname, setNickname] = useState("");
  const [askFriend, setAskFriend] = useState(false); // what the money with this friend was
  const [friendAnswers, setFriendAnswers] = useState<FriendAnswers>({});
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const drag = useRef<{ x: number; id: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const decide = useCallback(
    (category: TeachCategory | null, friend?: FriendAnswers) => {
      if (!card || leaving) return;
      // Friends: ask what the money was, for each direction it went, before recording it.
      if (category === "Friend" && !friendAnswered(card.total, card.moneyBack, friend ?? {})) return setAskFriend(true);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const name = nickname.trim().slice(0, 40);
      const commit = () => {
        onDecide({
          key: card.key,
          category,
          ...(category && name && { nickname: name }),
          ...(category === "Friend" && { friendMode: friend?.mode ?? "lend" }),
          ...(category === "Friend" && friend?.received && { friendReceived: friend.received }),
        });
        setLeaving(null);
        setDx(0);
        setMore(false);
        setNaming(false);
        setNickname("");
        setAskFriend(false);
        setFriendAnswers({});
      };
      if (reduce) return commit();
      setLeaving(category ? "right" : "left");
      window.setTimeout(commit, 180);
    },
    [card, leaving, nickname, onDecide],
  );

  // Keyboard: 1–6 pick, → likely, ← or S skip, Backspace undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card || askFriend || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 6) decide(card.suggestions[n - 1]);
      else if (e.key === "ArrowRight") decide(card.suggestions[0]);
      else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "s") decide(null);
      else if (e.key === "Backspace" && index > 0 && !leaving) onUndo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [askFriend, card, decide, index, leaving, onUndo]);

  if (!card) {
    return (
      <div className="space-y-3">
        <section className="rounded-3xl bg-card p-5 text-center ring-1 ring-white/5">
          <h2 className="text-2xl font-bold">That&apos;s everyone</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {decisions.filter((d) => d.category).length} payees labelled, {decisions.filter((d) => !d.category).length} skipped.
          </p>
        </section>
        <UnderstandingMeter value={understood} from={startUnderstood} />
        <button
          type="button"
          onClick={onFinish}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-semibold text-primary-foreground"
        >
          Review what gets saved
        </button>
        {index > 0 && (
          <button type="button" onClick={onUndo} className="flex h-11 w-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Undo2 className="size-4" /> Undo last
          </button>
        )}
      </div>
    );
  }

  const likely = card.suggestions[0];
  const top = card.suggestions.slice(0, 6);
  const rest = card.suggestions.slice(6);
  const offset = leaving === "right" ? 480 : leaving === "left" ? -480 : dx;
  const hint = dx > 30 ? `Likely: ${likely}` : dx < -30 ? "Skip" : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>Teach your twin · 2 of 2</span>
        <span className="num" aria-live="polite">
          Card {index + 1} of {cards.length}
        </span>
      </div>

      <article
        aria-label={`Who is ${card.counterparty}?`}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          drag.current = { x: e.clientX, id: e.pointerId };
          setDragging(true);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current?.id === e.pointerId) setDx(e.clientX - drag.current.x);
        }}
        onPointerUp={(e) => {
          if (drag.current?.id !== e.pointerId) return;
          drag.current = null;
          setDragging(false);
          if (dx > SWIPE) decide(likely);
          else if (dx < -SWIPE) decide(null);
          else setDx(0);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
          setDx(0);
        }}
        className={cn(
          "relative touch-pan-y select-none rounded-3xl bg-card p-5 ring-1 ring-white/10 shadow-xl shadow-black/25",
          !dragging && "transition-transform duration-200 ease-out motion-reduce:transition-none",
        )}
        style={{ transform: `translateX(${offset}px) rotate(${offset / 24}deg)`, opacity: leaving ? 0 : 1 }}
      >
        {hint && (
          <div
            className={cn(
              "absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-bold",
              dx > 0 ? "bg-money/20 text-money" : "bg-white/10 text-muted-foreground",
            )}
            aria-hidden
          >
            {hint}
          </div>
        )}
        <div className="text-xs font-medium text-goal">Who is this?</div>
        <h2 className="mt-1 text-[1.65rem] font-bold leading-tight break-words">{nickname.trim() || card.counterparty}</h2>
        {nickname.trim() && <div className="text-sm text-muted-foreground">{card.counterparty} on your statement</div>}
        <div className="num mt-1 text-lg">
          <span className="font-bold">{inr(card.total)}</span>
          <span className="text-muted-foreground"> · {card.count} payment{card.count === 1 ? "" : "s"}</span>
        </div>
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          <li>
            {card.range[0] === card.range[1] ? `Usually ${inr(card.range[0])}` : `Usually ${inr(card.range[0])}–${inr(card.range[1])}`},{" "}
            {card.when.replace(/^usually /, "")}
          </li>
          <li>
            Over {card.months} month{card.months === 1 ? "" : "s"}
            {card.sameDayMonthly ? ", around the same date each month" : ""}
          </li>
          {card.moneyBack > 0 && (
            <li className="text-money">
              {card.total > 0 ? `They've sent you ${inr(card.moneyBack)} too` : `They've sent you ${inr(card.moneyBack)}`}
            </li>
          )}
          <li className="num">{Math.round(card.share * 100)}% of what your twin doesn&apos;t understand yet</li>
        </ul>

        {naming ? (
          <div className="mt-3 rounded-2xl bg-white/[0.04] p-3">
            <label htmlFor={`nick-${card.key}`} className="text-sm font-medium">
              Nickname
            </label>
            <input
              id={`nick-${card.key}`}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={40}
              placeholder="e.g. Canteen uncle, PG owner"
              autoComplete="off"
              autoFocus
              className="mt-1 h-11 w-full rounded-xl bg-white/[0.06] px-3 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-money/60"
            />
            {nicknameChips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Nicknames you've used">
                {nicknameChips.slice(0, 8).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNickname(n)}
                    aria-label={`Use nickname ${n}`}
                    className={cn(
                      "h-8 rounded-full px-3 text-xs ring-1 transition",
                      nickname === n ? "bg-money/15 text-money ring-money/50" : "bg-white/[0.05] ring-white/10 hover:bg-white/10",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Then pick a category below. The nickname is shown instead of the UPI name.</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Tag className="size-3.5" aria-hidden /> Add a nickname
          </button>
        )}

        {askFriend && (
          <div className="mt-4 rounded-2xl bg-money/10 p-2 ring-1 ring-money/30">
            <FriendQuestions
              name={card.counterparty}
              sent={card.total}
              received={card.moneyBack}
              answers={friendAnswers}
              onChange={(a) => {
                setFriendAnswers(a);
                if (friendAnswered(card.total, card.moneyBack, a)) decide("Friend", a);
              }}
            />
            <button
              type="button"
              onClick={() => {
                setAskFriend(false);
                setFriendAnswers({});
              }}
              className="mt-2 px-2 text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Not a friend after all
            </button>
          </div>
        )}

        <div className={cn("mt-4 grid grid-cols-2 gap-2", askFriend && "hidden")}>
          {top.map((c, i) => {
            const Icon = ICON[c];
            return (
              <button
                key={c}
                type="button"
                onClick={() => decide(c)}
                aria-label={`${card.counterparty} is ${c}${i === 0 ? " (likely)" : ""}`}
                className={cn(
                  "flex h-12 items-center gap-2 rounded-2xl px-3 text-left text-sm font-semibold ring-1 transition active:scale-[0.97]",
                  i === 0 ? "bg-money/12 text-money ring-money/50" : "bg-raised ring-white/10 hover:bg-white/10",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{c}</span>
                {i === 0 && <span className="text-[10px] font-bold uppercase tracking-wide">Likely</span>}
              </button>
            );
          })}
        </div>

        {askFriend ? null : more ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {rest.map((c) => {
              const Icon = ICON[c];
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => decide(c)}
                  aria-label={`${card.counterparty} is ${c}`}
                  className="flex h-10 items-center gap-1.5 rounded-full bg-white/[0.05] px-3 text-sm ring-1 ring-white/10 hover:bg-white/10"
                >
                  <Icon className="size-3.5" aria-hidden /> {c}
                </button>
              );
            })}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMore(true)}
            aria-expanded={false}
            className="mt-2 h-10 w-full rounded-2xl text-sm font-medium text-muted-foreground ring-1 ring-white/10 hover:bg-white/5"
          >
            More categories
          </button>
        )}
      </article>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onUndo}
          // Not while a card is flying out: undo would remove the answer before it instead.
          disabled={index === 0 || leaving !== null}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold ring-1 ring-white/10 disabled:opacity-40"
        >
          <Undo2 className="size-4" /> Undo
        </button>
        <button
          type="button"
          onClick={() => decide(null)}
          aria-label={`Skip ${card.counterparty}`}
          className="h-12 rounded-2xl text-sm font-semibold ring-1 ring-white/10"
        >
          Skip
        </button>
      </div>
      <p className="text-center text-xs text-muted-foreground">Swipe right for &ldquo;{likely}&rdquo;, left to skip</p>

      <UnderstandingMeter value={understood} from={startUnderstood} />
      <button type="button" onClick={onFinish} className="block w-full py-2 text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
        Finish later and review
      </button>
    </div>
  );
}
