"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CircleCheck, LogIn, RotateCcw, ShieldCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { payeeKey } from "@/lib/categories";
import {
  applyLabels,
  displayName,
  familyCandidates,
  friendBalances,
  processStatements,
  StatementError,
  summarise,
  toApiTransaction,
  understoodShare,
  unknownPayees,
  type Categorised,
  type FriendModes,
  type FriendReceivedModes,
  type Labels,
} from "@/lib/statement";
import { cn } from "@/lib/utils";
import { WhosWhoStep, tagCategory, tagMode, tagReceived, type PersonTag } from "./whos-who-step";
import { PickStep, type PickedFile } from "./pick-step";
import { PrivacyStep } from "./privacy-step";
import { TeachCards, type Decision } from "./teach-cards";
import { UnderstandingMeter } from "./understanding-meter";

type Step = "privacy" | "pick" | "summary" | "family" | "teach" | "review" | "saving" | "saved";

interface Parsed {
  transactions: Categorised[]; // categorised only: the raw file and descriptions are gone by now
  files: { name: string; rows: number }[];
  duplicatesRemoved: number;
  existing: Labels; // labels already saved in the account, applied automatically
  existingNicknames: Record<string, string>; // nicknames saved with those labels
  existingModes: FriendModes; // lending or share, for friends labelled before
  existingReceived?: FriendReceivedModes; // what money from those friends was
}

// While a signed-out player goes to sign in, the categorised transactions wait in this tab's
// sessionStorage (never the file or descriptions). Cleared as soon as they're saved.
const PENDING_KEY = "money-twin:pending-upload";
interface Pending {
  v: 2;
  parsed: Parsed;
  tags: Record<string, PersonTag | null>;
  decisions: Decision[];
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const monthYear = (iso: string) => new Date(iso).toLocaleString("en-IN", { month: "short", year: "numeric" });
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export function UploadFlow({ signedIn, accountName }: { signedIn: boolean; accountName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("privacy");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<Record<string, PersonTag | null>>({});
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [resumed, setResumed] = useState(false);
  const [saved, setSaved] = useState<{ inserted: number; received: number; labels: number } | null>(null);

  // Coming back from sign-in: pick up exactly where the player left off.
  useEffect(() => {
    let pending: Pending | null = null;
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      pending = raw ? (JSON.parse(raw) as Pending) : null;
    } catch {
      pending = null;
    }
    if (pending?.v !== 2) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring browser-only state after sign-in
    setParsed(pending.parsed);
    setTags(pending.tags);
    setDecisions(pending.decisions);
    setResumed(true);
    setStep("review");
  }, []);

  /** Labels from this session: "Who's who?" answers and card answers. */
  const newLabels = useMemo<Labels>(() => {
    const out: Labels = {};
    for (const [key, tag] of Object.entries(tags)) if (tag) out[key] = tagCategory(tag);
    for (const d of decisions) if (d.category) out[d.key] = d.category;
    return out;
  }, [tags, decisions]);

  /** Nicknames from this session ("Gym trainer"), shown instead of raw UPI names. */
  const newNicknames = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [key, tag] of Object.entries(tags)) if (tag?.kind === "Other") out[key] = tag.nickname;
    for (const d of decisions) if (d.nickname) out[d.key] = d.nickname;
    return out;
  }, [tags, decisions]);
  const nicknames = useMemo(() => ({ ...(parsed?.existingNicknames ?? {}), ...newNicknames }), [parsed, newNicknames]);

  /** For friends: was money sent to them lending or their share of outings? */
  const newModes = useMemo<FriendModes>(() => {
    const out: FriendModes = {};
    for (const [key, tag] of Object.entries(tags)) {
      const mode = tag ? tagMode(tag) : undefined;
      if (mode) out[key] = mode;
    }
    for (const d of decisions) if (d.category === "Friend") out[d.key] = d.friendMode ?? "lend";
    return out;
  }, [tags, decisions]);
  const modes = useMemo(() => ({ ...(parsed?.existingModes ?? {}), ...newModes }), [parsed, newModes]);

  /** For friends: was money they sent paying you back, their share, or a loan to you? */
  const newReceived = useMemo<FriendReceivedModes>(() => {
    const out: FriendReceivedModes = {};
    for (const [key, tag] of Object.entries(tags)) {
      const r = tag ? tagReceived(tag) : undefined;
      if (r) out[key] = r;
    }
    for (const d of decisions) if (d.category === "Friend" && d.friendReceived) out[d.key] = d.friendReceived;
    return out;
  }, [tags, decisions]);
  const receivedModes = useMemo(() => ({ ...(parsed?.existingReceived ?? {}), ...newReceived }), [parsed, newReceived]);

  const labelled = useMemo(
    () => (parsed ? applyLabels(parsed.transactions, { ...parsed.existing, ...newLabels }, modes, receivedModes) : []),
    [parsed, newLabels, modes, receivedModes],
  );
  const friends = useMemo(() => friendBalances(labelled, nicknames), [labelled, nicknames]);
  const start = useMemo(
    () => (parsed ? understoodShare(applyLabels(parsed.transactions, parsed.existing, parsed.existingModes, parsed.existingReceived)) : 0),
    [parsed],
  );
  const understood = useMemo(() => understoodShare(labelled), [labelled]);
  const summary = useMemo(() => (parsed ? summarise(labelled) : null), [parsed, labelled]);
  const people = useMemo(() => (parsed ? familyCandidates(parsed.transactions).filter((p) => !parsed.existing[p.key]) : []), [parsed]);
  // The card queue is fixed once teaching starts, so answering a card doesn't reshuffle the rest.
  const [cards, setCards] = useState<ReturnType<typeof unknownPayees>>([]);

  async function onFiles(files: PickedFile[]) {
    setBusy(true);
    setError(null);
    try {
      let existing: Labels = {};
      let existingNicknames: Record<string, string> = {};
      let existingModes: FriendModes = {};
      let existingReceived: FriendReceivedModes = {};
      if (signedIn) {
        const res = await fetch("/api/overrides");
        if (res.ok) {
          const body = (await res.json()) as {
            overrides: { key: string; category: string; nickname?: string; friendMode?: "lend" | "share"; friendReceived?: FriendReceivedModes[string] }[];
          };
          existing = Object.fromEntries(body.overrides.map((o) => [o.key, o.category]));
          existingNicknames = Object.fromEntries(body.overrides.filter((o) => o.nickname).map((o) => [o.key, o.nickname!]));
          existingModes = Object.fromEntries(body.overrides.filter((o) => o.friendMode).map((o) => [o.key, o.friendMode!]));
          existingReceived = Object.fromEntries(body.overrides.filter((o) => o.friendReceived).map((o) => [o.key, o.friendReceived!]));
        }
      }
      const out = await processStatements(files, existing);
      setParsed({
        transactions: out.transactions,
        files: out.files,
        duplicatesRemoved: out.duplicatesRemoved,
        existing,
        existingNicknames,
        existingModes,
        existingReceived,
      });
      setTags({});
      setDecisions([]);
      setStep("summary");
    } catch (err) {
      setError(err instanceof StatementError ? err.message : "Couldn't read that file. Is it a Kotak statement CSV?");
    } finally {
      setBusy(false);
    }
  }

  function startTeaching() {
    if (!parsed) return;
    setStep(people.length ? "family" : "teach");
  }

  function toCards() {
    if (!parsed) return;
    // Anyone left unmarked in "Who's who?" comes first in the cards.
    const tagged: Labels = {};
    for (const [key, tag] of Object.entries(tags)) if (tag) tagged[key] = tagCategory(tag);
    const unmarked = people.filter((p) => !tags[p.key]).map((p) => p.key);
    setCards(unknownPayees(parsed.transactions, { ...parsed.existing, ...tagged }, 20, unmarked));
    setStep("teach");
  }

  function goSignIn() {
    if (!parsed) return;
    const pending: Pending = { v: 2, parsed, tags, decisions };
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch {
      setError("Your browser blocked temporary storage, so this can't continue after sign-in. Sign in first, then add the statement.");
      return;
    }
    router.push(`/account?callbackUrl=${encodeURIComponent("/upload")}`);
  }

  async function save() {
    if (!parsed) return;
    setStep("saving");
    setError(null);
    try {
      let inserted = 0;
      let received = 0;
      for (const part of chunk(labelled.map(toApiTransaction), 1000)) {
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactions: part }),
        });
        if (res.status === 401) throw new Error("signed-out");
        if (!res.ok) throw new Error(`save failed (${res.status})`);
        const body = (await res.json()) as { inserted: number; received: number };
        inserted += body.inserted;
        received += body.received;
      }
      const names = new Map(parsed.transactions.map((t) => [payeeKey(t.counterparty), t.counterparty]));
      const overrides = Object.entries(newLabels).map(([key, category]) => ({
        counterparty: names.get(key) ?? key,
        category,
        ...(newNicknames[key] && { nickname: newNicknames[key] }),
        ...(category === "Friend" && { friendMode: modes[key] ?? "lend" }),
        ...(category === "Friend" && receivedModes[key] && { friendReceived: receivedModes[key] }),
      }));
      for (const part of chunk(overrides, 500)) {
        const res = await fetch("/api/overrides", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overrides: part }),
        });
        if (!res.ok) throw new Error(`labels failed (${res.status})`);
      }
      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {}
      setSaved({ inserted, received, labels: overrides.length });
      setStep("saved");
    } catch (err) {
      setStep("review");
      setError(
        (err as Error).message === "signed-out"
          ? "Your session ended. Sign in again to save."
          : "Couldn't save right now. Nothing was lost; try again in a moment.",
      );
    }
  }

  function startOver() {
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {}
    setParsed(null);
    setTags({});
    setDecisions([]);
    setResumed(false);
    setError(null);
    setStep("pick");
  }

  const back =
    step === "pick" ? "privacy" : step === "summary" ? "pick" : step === "family" ? "summary" : step === "teach" ? (people.length ? "family" : "summary") : step === "review" ? "teach" : null;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16">
      <header className="flex items-center gap-2 py-4">
        {back && !(step === "review" && resumed) ? (
          <button type="button" onClick={() => setStep(back as Step)} className="grid size-10 place-items-center rounded-full hover:bg-white/5" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <Link href="/" className="grid size-10 place-items-center rounded-full hover:bg-white/5" aria-label="Home">
            <ArrowLeft className="size-5" />
          </Link>
        )}
        <h1 className="text-lg font-semibold">Bring your twin to life</h1>
      </header>

      <div key={step} className="animate-in fade-in slide-in-from-right-4 duration-300 motion-reduce:animate-none">
        {step === "privacy" && <PrivacyStep onContinue={() => setStep("pick")} />}

        {step === "pick" && <PickStep busy={busy} error={error} onFiles={onFiles} />}

        {step === "summary" && parsed && summary && (
          <div className="space-y-3">
            <section className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
              <div className="flex items-center gap-2 text-xs font-medium text-money">
                <ShieldCheck className="size-4" aria-hidden /> Read on this device. Nothing sent.
              </div>
              <h2 className="mt-1 text-2xl font-bold leading-tight">
                {monthYear(summary.from)} to {monthYear(summary.to)}
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white/[0.04] p-3">
                  <dt className="text-xs text-muted-foreground">Transactions</dt>
                  <dd className="num text-2xl font-bold">{summary.transactions.toLocaleString("en-IN")}</dd>
                </div>
                <div className="rounded-2xl bg-white/[0.04] p-3">
                  <dt className="text-xs text-muted-foreground">Months</dt>
                  <dd className="num text-2xl font-bold">{summary.months}</dd>
                </div>
                <div className="rounded-2xl bg-white/[0.04] p-3">
                  <dt className="text-xs text-muted-foreground">Spent</dt>
                  <dd className="num text-2xl font-bold">{inr(summary.spent)}</dd>
                </div>
                <div className="rounded-2xl bg-white/[0.04] p-3">
                  <dt className="text-xs text-muted-foreground">Came in</dt>
                  <dd className="num text-2xl font-bold text-money">{inr(summary.received)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                {parsed.files.length} file{parsed.files.length === 1 ? "" : "s"}
                {parsed.duplicatesRemoved > 0 && `, ${parsed.duplicatesRemoved} overlapping rows merged`}
                {Object.keys(parsed.existing).length > 0 && `, ${Object.keys(parsed.existing).length} payees you taught before`}
              </p>
            </section>
            <UnderstandingMeter value={understood} />
            <p className="px-1 text-sm text-muted-foreground text-pretty">
              A lot of spending goes to people&apos;s names (local shops, your PG, friends) that no rule can place. A few quick
              answers teach your twin who they are.
            </p>
            <Button size="xl" className="w-full" onClick={startTeaching}>
              Teach your twin <ArrowRight data-icon="inline-end" />
            </Button>
            <button type="button" onClick={() => setStep("review")} className="block w-full py-2 text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
              Skip teaching for now
            </button>
          </div>
        )}

        {step === "family" && (
          <WhosWhoStep people={people} tags={tags} onTag={(k, t) => setTags((prev) => ({ ...prev, [k]: t }))} onContinue={toCards} />
        )}

        {step === "teach" && (
          <TeachCards
            cards={cards}
            decisions={decisions}
            understood={understood}
            startUnderstood={start}
            nicknameChips={[...new Set(Object.values(nicknames))]}
            onDecide={(d) => setDecisions((prev) => [...prev, d])}
            onUndo={() => setDecisions((prev) => prev.slice(0, -1))}
            onFinish={() => setStep("review")}
          />
        )}

        {(step === "review" || step === "saving") && parsed && summary && (
          <div className="space-y-3">
            {resumed && signedIn && (
              <p role="status" className="rounded-2xl bg-money/10 p-3 text-sm text-money ring-1 ring-money/30">
                Signed in{accountName ? ` as ${accountName}` : ""}. Your statement is ready to save.
              </p>
            )}
            <section className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
              <h2 className="text-2xl font-bold leading-tight">Ready to save your real months</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {summary.transactions.toLocaleString("en-IN")} transactions, {monthYear(summary.from)} to {monthYear(summary.to)}.{" "}
                {Object.keys(newLabels).length > 0 && `${Object.keys(newLabels).length} payees taught.`}
              </p>
              <UnderstandingMeter value={understood} from={start} className="mt-4" />
            </section>

            {friends.friends.length > 0 && <FriendsCard friends={friends} />}

            <section className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
              <h3 className="font-semibold">What gets saved to your account</h3>
              <ul className="mt-2 divide-y divide-white/5 text-sm" aria-label="Example of saved transactions">
                {labelled
                  .filter((t) => t.type === "DR" && t.category !== "Internal (ignore)" && t.channel !== "OTHER")
                  .slice(-3)
                  .reverse()
                  .map((t) => (
                    <li key={t.fingerprint} className="flex items-center gap-2 py-2">
                      <span className="num w-14 shrink-0 text-xs text-muted-foreground">
                        {new Date(t.datetime).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{displayName(t.counterparty, nicknames)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{t.category}</span>
                      <span className="num w-16 shrink-0 text-right font-semibold">{inr(t.amount)}</span>
                    </li>
                  ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground text-pretty">
                Date, amount, payee name and category, plus your labels. Never saved: the file, the bank&apos;s descriptions,
                reference numbers or your account number.
              </p>
            </section>

            {error && (
              <p role="alert" className="rounded-2xl bg-alert/10 p-3 text-sm text-alert ring-1 ring-alert/30">
                {error}
              </p>
            )}

            {signedIn ? (
              <Button size="xl" className="w-full" onClick={save} disabled={step === "saving"}>
                {step === "saving" ? "Saving…" : "Save to my account"}
              </Button>
            ) : (
              <section className="rounded-3xl bg-goal/10 p-5 ring-1 ring-goal/30">
                <h3 className="text-lg font-bold">Sign in to save your real months</h3>
                <p className="mt-1 text-sm text-muted-foreground text-pretty">
                  You&apos;ll come straight back here with everything you&apos;ve taught your twin. The file itself stays on this
                  device.
                </p>
                <Button size="xl" className="mt-4 w-full" onClick={goSignIn}>
                  <LogIn data-icon="inline-start" /> Sign in to save
                </Button>
              </section>
            )}
            <button type="button" onClick={startOver} className="flex w-full items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
              <RotateCcw className="size-4" /> Start over with a different file
            </button>
          </div>
        )}

        {step === "saved" && saved && summary && (
          <div className="space-y-3">
            <section className="rounded-3xl bg-card p-6 text-center ring-1 ring-money/30">
              <CircleCheck className="mx-auto size-12 text-money" aria-hidden />
              <h2 className="mt-3 text-2xl font-bold">Your twin knows your real months</h2>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">
                {saved.inserted.toLocaleString("en-IN")} new transactions saved
                {saved.received > saved.inserted && ` (${(saved.received - saved.inserted).toLocaleString("en-IN")} were already there)`}
                {saved.labels > 0 && `, and ${saved.labels} payee labels`}.
              </p>
              <UnderstandingMeter value={understood} from={start} className="mt-4 text-left" />
            </section>
            {friends.friends.length > 0 && <FriendsCard friends={friends} />}
            <p className="px-1 text-center text-sm text-muted-foreground">Next up: replay your real past, one month at a time.</p>
            <Link href="/replay" className={cn(buttonVariants({ size: "xl" }), "w-full")}>
              Replay your months <ArrowRight data-icon="inline-end" />
            </Link>
            <Link href="/account" className="block py-2 text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
              See what&apos;s saved
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/** Friends are splits and loans: netted per friend, never counted as income or spending. */
function FriendsCard({ friends }: { friends: ReturnType<typeof friendBalances> }) {
  return (
    <section className="rounded-3xl bg-card p-5 ring-1 ring-white/5" aria-label="Money with friends">
      <h3 className="font-semibold">Money with friends</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Money you lent, minus what they paid back. Your share of things you did together counts as your spending instead.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white/[0.04] p-3">
          <div className="text-xs text-muted-foreground">Friends owe you</div>
          <div className="num text-xl font-bold text-money">{inr(friends.owedToYou)}</div>
        </div>
        <div className="rounded-2xl bg-white/[0.04] p-3">
          <div className="text-xs text-muted-foreground">You owe friends</div>
          <div className="num text-xl font-bold text-alert">{inr(friends.youOwe)}</div>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-white/5 text-sm">
        {friends.friends.slice(0, 5).map((f) => (
          <li key={f.key} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate">{f.name}</span>
            <span className={cn("num shrink-0 font-semibold", f.net > 0 ? "text-money" : "text-alert")}>
              {f.net > 0 ? `owes you ${inr(f.net)}` : `you owe ${inr(-f.net)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
