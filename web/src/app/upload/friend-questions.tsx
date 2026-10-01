"use client";

import type { FriendMode, FriendReceived } from "@/lib/categories";
import { cn } from "@/lib/utils";

// What money with a friend was, asked only for the directions money actually went:
// you only sent → one question; they only sent → one question; both ways → both, labelled
// "What you sent" and "What they sent". Used in Who's who and on the swipe cards.

export interface FriendAnswers {
  mode?: FriendMode; // money you sent
  received?: FriendReceived; // money they sent
}

const SENT: { value: FriendMode; label: string; hint: string }[] = [
  { value: "lend", label: "Lending to them", hint: "They owe it back." },
  { value: "share", label: "My share of things we did together", hint: "Counts as your own spending (food, outings)." },
];

const RECEIVED: { value: FriendReceived; label: string; hint: string }[] = [
  { value: "payback", label: "Paying me back", hint: "Takes off what they owe you." },
  { value: "their-share", label: "Their share of things I paid for", hint: "Money back on your spending, not a loan." },
  { value: "borrowed", label: "I borrowed from them (I owe them)", hint: "Counts as money you owe them." },
];

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Every question that applies has an answer. */
export const friendAnswered = (sent: number, received: number, a: FriendAnswers) =>
  (sent <= 0 || !!a.mode) && (received <= 0 || !!a.received);

export function FriendQuestions({
  name,
  sent,
  received,
  answers,
  onChange,
  className,
}: {
  name: string;
  sent: number;
  received: number;
  answers: FriendAnswers;
  onChange: (next: FriendAnswers) => void;
  className?: string;
}) {
  const both = sent > 0 && received > 0;
  return (
    <div className={cn("space-y-2", className)}>
      {sent > 0 && (
        <Question
          legend={both ? `What you sent (${inr(sent)})` : "Money you sent them was mostly:"}
          sub={both ? "Money you sent them was mostly:" : undefined}
          aria={`Money you sent ${name} was mostly`}
          options={SENT}
          value={answers.mode}
          onPick={(mode) => onChange({ ...answers, mode })}
        />
      )}
      {received > 0 && (
        <Question
          legend={both ? `What they sent (${inr(received)})` : "Money they sent you was mostly:"}
          sub={both ? "Money they sent you was mostly:" : undefined}
          aria={`Money ${name} sent you was mostly`}
          options={RECEIVED}
          value={answers.received}
          onPick={(r) => onChange({ ...answers, received: r })}
        />
      )}
    </div>
  );
}

function Question<T extends string>({
  legend,
  sub,
  aria,
  options,
  value,
  onPick,
}: {
  legend: string;
  sub?: string;
  aria: string;
  options: { value: T; label: string; hint: string }[];
  value: T | undefined;
  onPick: (v: T) => void;
}) {
  const picked = options.find((o) => o.value === value);
  return (
    <fieldset className="rounded-2xl bg-white/[0.04] p-3">
      <legend className="px-1 text-sm font-semibold">{legend}</legend>
      {sub && <p className="px-1 text-xs text-muted-foreground">{sub}</p>}
      <div className="mt-1.5 grid gap-1.5" role="radiogroup" aria-label={aria}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onPick(o.value)}
            className={cn(
              "min-h-10 rounded-xl px-3 text-left text-sm font-medium ring-1 transition",
              value === o.value ? "bg-money/15 text-money ring-money/60" : "bg-white/[0.03] ring-white/10 hover:bg-white/[0.07]",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-2 px-1 text-xs text-muted-foreground">{picked ? picked.hint : "Pick one."}</p>
    </fieldset>
  );
}
