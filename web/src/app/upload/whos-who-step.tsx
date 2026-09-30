"use client";

import { useState } from "react";
import { ArrowRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INCOME_CATEGORIES, TEACH_CATEGORIES, type FriendMode } from "@/lib/categories";
import type { PersonCandidate } from "@/lib/statement";
import { cn } from "@/lib/utils";

/**
 * What the player says about a person. "Other" always comes with a nickname and a category;
 * "Friend" with whether money sent to them was lending or their share of things done together.
 */
export type PersonTag =
  | { kind: "Family" | "Self" }
  | { kind: "Friend"; mode?: FriendMode }
  | { kind: "Other"; nickname: string; category: string };

/** The friend mode to save for a tag (if it's a friend). */
export const tagMode = (t: PersonTag): FriendMode | undefined => (t.kind === "Friend" ? (t.mode ?? "lend") : undefined);

/** A Friend you've sent money to must say whether it was lending or your share. */
export const needsFriendMode = (p: PersonCandidate, t: PersonTag | null) => t?.kind === "Friend" && p.sent > 0 && !t.mode;

const FRIEND_MODE_OPTIONS: { mode: FriendMode; label: string }[] = [
  { mode: "lend", label: "Lending to them" },
  { mode: "share", label: "My share of things we did together" },
];

/** The label saved for a tag: Family / Self / Friend, or the category chosen for "Other". */
export const tagCategory = (t: PersonTag): string => (t.kind === "Other" ? t.category : t.kind);

const OPTIONS: { kind: PersonTag["kind"]; label: string }[] = [
  { kind: "Family", label: "Family" },
  { kind: "Self", label: "Me (my other account)" },
  { kind: "Friend", label: "Friend" },
  { kind: "Other", label: "Other" },
];

/** Categories for "Other": the specific ones (people-type labels are the options above). */
export const OTHER_CATEGORIES: string[] = TEACH_CATEGORIES.filter((c) => !["Family", "Friend", "Other"].includes(c));

/** Someone who mostly pays *you* gets income reasons instead of spending categories. */
const paysYou = (p: PersonCandidate) => p.received > p.sent;

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function OtherForm({
  person,
  initial,
  onSave,
  onCancel,
}: {
  person: PersonCandidate;
  initial?: { nickname: string; category: string };
  onSave: (nickname: string, category: string) => void;
  onCancel: () => void;
}) {
  const [nickname, setNickname] = useState(initial?.nickname ?? "");
  const income = paysYou(person);
  const choices = income ? [...INCOME_CATEGORIES] : OTHER_CATEGORIES;
  const [category, setCategory] = useState<string | null>(
    initial && choices.includes(initial.category) ? initial.category : null,
  );
  const [tried, setTried] = useState(false);
  const name = nickname.trim();
  const id = `other-${person.key}`;
  return (
    <form
      className="mt-3 space-y-3 rounded-2xl bg-white/[0.04] p-3"
      aria-label={`Who is ${person.counterparty}?`}
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (name && category) onSave(name.slice(0, 40), category);
      }}
    >
      <div>
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Who is it?
        </label>
        <input
          id={`${id}-name`}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={40}
          placeholder="e.g. Gym trainer"
          autoComplete="off"
          aria-invalid={tried && !name}
          className="mt-1 h-11 w-full rounded-xl bg-white/[0.06] px-3 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-money/60"
        />
        {tried && !name && <p className="mt-1 text-xs text-alert">Give them a name you&apos;ll recognise.</p>}
      </div>
      <fieldset>
        <legend className="text-sm font-medium">{income ? "Why do they pay you?" : "What do you pay them for?"}</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={income ? "Why they pay you" : "Category"}>
          {choices.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "h-9 rounded-full px-3 text-sm ring-1 transition",
                category === c ? "bg-money/15 font-semibold text-money ring-money/60" : "bg-white/[0.04] ring-white/10 hover:bg-white/10",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        {tried && !category && <p className="mt-1 text-xs text-alert">Pick a category.</p>}
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="h-10 rounded-xl text-sm font-semibold ring-1 ring-white/10">
          Cancel
        </button>
        <button type="submit" className="h-10 rounded-xl bg-money/15 text-sm font-semibold text-money ring-1 ring-money/50">
          Save
        </button>
      </div>
    </form>
  );
}

/**
 * "Who's who?": people with real money going back and forth. The player says who they are; nobody
 * is pre-selected and there are no surname rules. Anyone left unmarked comes up in the swipe cards.
 */
export function WhosWhoStep({
  people,
  tags,
  onTag,
  onContinue,
}: {
  people: PersonCandidate[];
  tags: Record<string, PersonTag | null>;
  onTag: (key: string, tag: PersonTag | null) => void;
  onContinue: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const unmarked = people.filter((p) => !tags[p.key]).length;
  const friendQuestionOpen = people.some((p) => needsFriendMode(p, tags[p.key] ?? null));

  return (
    <div className="space-y-3">
      <section className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
        <div className="text-xs font-medium text-money">Teach your twin · 1 of 2</div>
        <h2 className="mt-1 text-2xl font-bold leading-tight text-balance">Who&apos;s who?</h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          These people send or receive real money with you. Money with friends counts as splits and loans, not spending, and
          transfers to your own other account don&apos;t count at all.
        </p>
      </section>

      {people.length === 0 ? (
        <p className="rounded-3xl bg-card p-5 text-sm text-muted-foreground ring-1 ring-white/5">
          Nobody stands out in these statements. You can still label people on the next cards.
        </p>
      ) : (
        <ul className="space-y-2">
          {people.map((p) => {
            const tag = tags[p.key] ?? null;
            const isEditing = editing === p.key;
            return (
              <li key={p.key} className="rounded-3xl bg-card p-4 ring-1 ring-white/5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-semibold">{tag?.kind === "Other" ? tag.nickname : p.counterparty}</span>
                  <span className="num shrink-0 text-xs text-muted-foreground">{p.count} payments</span>
                </div>
                <div className="num mt-0.5 text-sm text-muted-foreground">
                  {tag?.kind === "Other" && <span className="mr-1">{p.counterparty} ·</span>}
                  {p.sent > 0 && <>You sent {inr(p.sent)}</>}
                  {p.sent > 0 && p.received > 0 && " · "}
                  {p.received > 0 && <span className="text-money">they sent {inr(p.received)}</span>}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={`Who is ${p.counterparty}?`}>
                  {OPTIONS.map((o) => {
                    const on = tag?.kind === o.kind || (isEditing && o.kind === "Other");
                    return (
                      <button
                        key={o.kind}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={`${p.counterparty}: ${o.label}`}
                        onClick={() => {
                          if (o.kind === "Other") return setEditing(isEditing ? null : p.key);
                          setEditing(null);
                          onTag(p.key, tag?.kind === o.kind ? null : { kind: o.kind }); // tap again to un-mark
                        }}
                        className={cn(
                          "min-h-10 rounded-xl px-2 text-sm font-semibold ring-1 transition",
                          on ? "bg-money/15 text-money ring-money/60" : "bg-white/[0.03] text-muted-foreground ring-white/10 hover:bg-white/[0.07]",
                        )}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>

                {tag?.kind === "Friend" && p.sent > 0 && (
                  <fieldset className="mt-3 rounded-2xl bg-white/[0.04] p-3">
                    <legend className="px-1 text-sm font-medium">Money you sent them was mostly:</legend>
                    <div className="mt-1.5 grid gap-1.5" role="radiogroup" aria-label={`Money you sent ${p.counterparty} was mostly`}>
                      {FRIEND_MODE_OPTIONS.map((o) => (
                        <button
                          key={o.mode}
                          type="button"
                          role="radio"
                          aria-checked={tag.mode === o.mode}
                          onClick={() => onTag(p.key, { kind: "Friend", mode: o.mode })}
                          className={cn(
                            "min-h-10 rounded-xl px-3 text-left text-sm font-medium ring-1 transition",
                            tag.mode === o.mode ? "bg-money/15 text-money ring-money/60" : "bg-white/[0.03] ring-white/10 hover:bg-white/[0.07]",
                          )}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 px-1 text-xs text-muted-foreground">
                      {tag.mode === "share"
                        ? "What you paid counts as your own spending (food, outings)."
                        : tag.mode === "lend"
                          ? "What you sent counts as money they owe you."
                          : "Only lending counts as money they owe you."}
                    </p>
                  </fieldset>
                )}

                {tag?.kind === "Other" && !isEditing && (
                  <button
                    type="button"
                    onClick={() => setEditing(p.key)}
                    className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="size-3" /> {tag.category} · change
                  </button>
                )}
                {isEditing && (
                  <OtherForm
                    person={p}
                    initial={tag?.kind === "Other" ? { nickname: tag.nickname, category: tag.category } : undefined}
                    onCancel={() => setEditing(null)}
                    onSave={(nickname, category) => {
                      onTag(p.key, { kind: "Other", nickname, category });
                      setEditing(null);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Button size="xl" className="w-full" onClick={onContinue} disabled={editing !== null || friendQuestionOpen}>
        Next: who are the rest? <ArrowRight data-icon="inline-end" />
      </Button>
      {friendQuestionOpen && (
        <p className="text-center text-xs text-muted-foreground">Answer how you sent money to each friend first.</p>
      )}
      {unmarked > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {unmarked} {unmarked === 1 ? "person" : "people"} not marked here will come up in the next cards.
        </p>
      )}
    </div>
  );
}
