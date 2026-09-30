"use client";

import { useEffect, useState, useTransition } from "react";
import { LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { TwinAvatar } from "@/components/twin/avatar";
import { cn } from "@/lib/utils";

interface Me {
  user: { email: string; name: string; createdAt: string };
  counts: { transactions: number; overrides: number };
  twin: boolean;
}

const CONFIRM_WORD = "DELETE";

export function AccountPanel({
  name,
  email,
  image,
  signOutAction,
}: {
  name: string;
  email: string;
  image: string;
  signOutAction: () => Promise<void>;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setMe)
      .catch(() => setLoadError(true));
  }, []);

  function deleteEverything() {
    setDeleteError(null);
    startTransition(async () => {
      const res = await fetch("/api/me", { method: "DELETE" });
      if (!res.ok) {
        setDeleteError("Couldn't delete right now. Nothing was removed. Please try again.");
        return;
      }
      await signOutAction();
    });
  }

  return (
    <div className="space-y-3">
      <section className="flex items-center gap-4 rounded-3xl bg-card p-5 ring-1 ring-white/5">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="size-14 rounded-full ring-1 ring-white/10" referrerPolicy="no-referrer" />
        ) : (
          <TwinAvatar seed={email} className="size-14" />
        )}
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{name || email.split("@")[0]}</div>
          <div className="truncate text-sm text-muted-foreground">{email}</div>
        </div>
      </section>

      <section className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
        <h2 className="text-lg font-bold">What&apos;s saved</h2>
        {loadError ? (
          <p className="mt-2 text-sm text-alert">Couldn&apos;t load your data. Is the database running?</p>
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/[0.04] p-3">
              <dt className="text-xs text-muted-foreground">Transactions</dt>
              <dd className="num text-2xl font-bold">{me ? me.counts.transactions.toLocaleString("en-IN") : "–"}</dd>
            </div>
            <div className="rounded-2xl bg-white/[0.04] p-3">
              <dt className="text-xs text-muted-foreground">Payee labels</dt>
              <dd className="num text-2xl font-bold">{me ? me.counts.overrides.toLocaleString("en-IN") : "–"}</dd>
            </div>
            <div className="col-span-2 rounded-2xl bg-white/[0.04] p-3">
              <dt className="text-xs text-muted-foreground">Twin</dt>
              <dd className="font-semibold">{me ? (me.twin ? "Character, XP and skills saved" : "Not saved yet") : "–"}</dd>
            </div>
          </dl>
        )}
        <p className="mt-4 flex gap-2 text-xs text-muted-foreground text-pretty">
          <ShieldCheck className="size-4 shrink-0 text-money" aria-hidden />
          Statement files are read on your device and never uploaded. Only categorised transactions, your payee labels and
          your twin (character, XP and skills) are stored here.
        </p>
      </section>

      <form action={signOutAction}>
        <button
          type="submit"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-raised text-sm font-semibold ring-1 ring-white/10 hover:bg-white/10"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </form>

      <section className="rounded-3xl bg-alert/[0.06] p-5 ring-1 ring-alert/25">
        <h2 className="text-lg font-bold">Delete all my data</h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Removes everything saved in your account: every transaction, all payee labels and nicknames, your twin (character,
          XP and skills), and the account itself. This can&apos;t be undone.
        </p>
        <p className="mt-2 text-sm text-muted-foreground text-pretty">
          A copy of your twin also lives in this browser so you can play without an account. It stays, and would be saved to
          your account again if you sign in. To remove it too, clear this site&apos;s data in your browser settings.
        </p>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-alert ring-1 ring-alert/40 hover:bg-alert/10"
          >
            <Trash2 className="size-4" /> Delete all my data
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <label htmlFor="confirm-delete" className="block text-sm">
              Type <span className="font-mono font-semibold text-alert">{CONFIRM_WORD}</span> to confirm
            </label>
            <input
              id="confirm-delete"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoFocus
              className="h-12 w-full rounded-xl bg-white/[0.06] px-3 font-mono outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-alert/60"
            />
            {deleteError && (
              <p role="alert" className="text-sm text-alert">
                {deleteError}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setTyped("");
                }}
                className="h-12 rounded-2xl bg-raised text-sm font-semibold ring-1 ring-white/10"
              >
                Keep my data
              </button>
              <button
                type="button"
                disabled={typed !== CONFIRM_WORD || pending}
                onClick={deleteEverything}
                className={cn(
                  "h-12 rounded-2xl text-sm font-semibold transition",
                  typed === CONFIRM_WORD ? "bg-alert text-background" : "bg-alert/20 text-alert/60",
                  "disabled:cursor-not-allowed",
                )}
              >
                {pending ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
