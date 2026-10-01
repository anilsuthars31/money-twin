"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, GraduationCap, HandCoins, History, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CameInParts } from "@/components/twin/came-in";
import { CountUp } from "@/components/twin/count-up";
import { ENVELOPE_STYLE } from "@/components/twin/envelope-bars";
import { inr } from "@/game/engine";
import type { FriendMode, RealTxn } from "@/game/replay/real-month";
import { categoriesFor, changePct, monthsOf, monthSummary, PARTIAL_MONTH, topPayees } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import { TrendChart } from "./trend-chart";

// "Where your money goes": the player's saved months, read in the browser from their account.

const SHOW_CATEGORIES = 6;
const SHOW_PAYEES = 8;

type Load =
  | { state: "loading" }
  | { state: "error"; signedOut: boolean }
  | { state: "ready"; txns: RealTxn[]; nicknames: Record<string, string>; friendModes: Record<string, FriendMode> };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return (await res.json()) as T;
}

async function loadAll(): Promise<Load> {
  try {
    const [{ transactions }, { overrides }] = await Promise.all([
      getJson<{ transactions: RealTxn[] }>("/api/transactions?limit=5000"),
      getJson<{ overrides: { key: string; nickname?: string; friendMode?: FriendMode }[] }>("/api/overrides"),
    ]);
    const nicknames: Record<string, string> = {};
    const friendModes: Record<string, FriendMode> = {};
    for (const o of overrides) {
      if (o.nickname) nicknames[o.key] = o.nickname;
      if (o.friendMode) friendModes[o.key] = o.friendMode;
    }
    return { state: "ready", txns: transactions, nicknames, friendModes };
  } catch (e) {
    return { state: "error", signedOut: (e as { status?: number }).status === 401 };
  }
}

/** "↑ 12%" (amber: spending went up) or "↓ 8%" (green), or "new" when last month had none. */
function Change({ now, before, className }: { now: number; before: number | null; className?: string }) {
  if (before === null) return null;
  if (before === 0)
    return <span className={cn("rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground", className)}>new</span>;
  const pct = changePct(now, before)!;
  if (pct === 0) return <span className={cn("text-[11px] text-muted-foreground", className)}>same</span>;
  const up = pct > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn("num inline-flex items-center gap-0.5 text-[11px] font-semibold", up ? "text-alert" : "text-money", className)}
      aria-label={`${up ? "up" : "down"} ${Math.abs(pct)}% from last month`}
    >
      <Icon className="size-3" aria-hidden />
      {Math.abs(pct)}%
    </span>
  );
}

export function DashboardApp() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [picked, setPicked] = useState<string | null>(null);
  const [allCats, setAllCats] = useState(false);

  useEffect(() => {
    let live = true;
    void loadAll().then((l) => live && setLoad(l));
    return () => {
      live = false;
    };
  }, []);

  const months = useMemo(
    () => (load.state === "ready" ? monthsOf(load.txns, load.nicknames, load.friendModes) : []),
    [load],
  );
  const summaries = useMemo(() => months.map(monthSummary), [months]);
  const key = picked ?? summaries.at(-1)?.key ?? "";
  const i = months.findIndex((m) => m.key === key);
  const month = months[i];
  const prev = i > 0 ? months[i - 1] : undefined;
  const now = summaries[i];
  const before = i > 0 ? summaries[i - 1] : undefined;
  const cats = useMemo(() => (month ? categoriesFor(month, prev) : []), [month, prev]);
  const payees = useMemo(() => (month ? topPayees(month, SHOW_PAYEES) : []), [month]);

  const pick = (k: string) => {
    setPicked(k);
    setAllCats(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-12">
      <header className="flex items-center gap-2 py-4">
        <Link href="/" className="grid size-10 place-items-center rounded-full hover:bg-white/5" aria-label="Home">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-lg font-bold">Where your money goes</h1>
      </header>

      {load.state === "loading" && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading your months">
          <div className="h-10 animate-pulse rounded-full bg-card/70" />
          <div className="h-40 animate-pulse rounded-3xl bg-card" />
          <div className="h-56 animate-pulse rounded-3xl bg-card/70" />
        </div>
      )}

      {load.state === "error" && (
        <section className="rounded-3xl bg-alert/10 p-5 ring-1 ring-alert/30">
          <h2 className="text-xl font-bold">{load.signedOut ? "Your session ended" : "Couldn't load your months"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {load.signedOut ? "Sign in again to see your money." : "Check your connection and try again."}
          </p>
          {load.signedOut ? (
            <Link href="/account?callbackUrl=%2Fdashboard" className={cn(buttonVariants({ size: "lg" }), "mt-4")}>
              Sign in
            </Link>
          ) : (
            <Button
              size="lg"
              className="mt-4"
              onClick={() => {
                setLoad({ state: "loading" });
                void loadAll().then(setLoad);
              }}
            >
              Try again
            </Button>
          )}
        </section>
      )}

      {load.state === "ready" && !month && (
        <section className="rounded-3xl bg-card p-6 text-center ring-1 ring-white/5">
          <h2 className="text-2xl font-bold text-balance">Nothing saved yet</h2>
          <p className="mt-2 text-sm text-muted-foreground text-pretty">
            Add your Kotak statement to see where your money goes, month by month. The file is read on your device and never
            uploaded.
          </p>
          <Link href="/upload" className={cn(buttonVariants({ size: "xl" }), "mt-5 w-full")}>
            <Upload data-icon="inline-start" /> Add a statement
          </Link>
        </section>
      )}

      {month && now && (
        <div className="space-y-3">
          {/* Month chips, newest on the right like the chart */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Month">
            {summaries.map((m) => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={m.key === key}
                onClick={() => pick(m.key)}
                className={cn(
                  "h-9 shrink-0 rounded-full px-4 text-sm font-semibold ring-1 transition active:scale-[0.97]",
                  m.key === key ? "bg-money text-background ring-money" : "bg-white/[0.04] text-muted-foreground ring-white/10 hover:bg-white/10",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <section data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5" aria-label={`${now.label} summary`}>
            <div className="text-sm text-muted-foreground">Spent in {now.label.split(" ")[0]}</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <CountUp key={now.key} from={0} value={now.spent} className="num text-4xl font-bold leading-none" />
              {before && before.spent > 0 && (
                <span className="text-sm text-muted-foreground">
                  {now.spent === before.spent ? (
                    `same as ${before.short}`
                  ) : (
                    <>
                      <span className={cn("num font-semibold", now.spent > before.spent ? "text-alert" : "text-money")}>
                        {inr(Math.abs(now.spent - before.spent))} {now.spent > before.spent ? "more" : "less"}
                      </span>{" "}
                      than {before.short}
                    </>
                  )}
                </span>
              )}
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-white/5 rounded-2xl bg-white/[0.03] py-3 text-center">
              <div>
                <div className="text-[11px] text-goal">Needs</div>
                <div className="num font-bold">{inr(now.needs)}</div>
              </div>
              <div>
                <div className="text-[11px] text-happy">Wants</div>
                <div className="num font-bold">{inr(now.wants)}</div>
              </div>
              <div>
                <div className="text-[11px] text-money">Came in</div>
                <div className="num font-bold">{inr(now.cameIn)}</div>
              </div>
            </div>
            <CameInParts parts={now.cameInParts} className="mt-3" />
            {now.count < PARTIAL_MONTH && (
              <p className="mt-3 text-xs text-muted-foreground">Only {now.count} payments saved: probably part of a month.</p>
            )}
            {now.lent > 0 && (
              <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                <HandCoins className="mt-0.5 size-4 shrink-0 text-happy" aria-hidden />
                <span>
                  Plus <span className="num font-semibold text-foreground">{inr(now.lent)}</span> lent to friends (not counted as
                  spending).
                </span>
              </p>
            )}
          </section>

          {summaries.length > 1 && (
            <section data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
              <h2 className="text-lg font-bold">Month by month</h2>
              <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-goal" /> Needs
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-happy" /> Wants
                </span>
              </div>
              <div className="mt-3">
                <TrendChart months={summaries} selected={key} onSelect={pick} />
              </div>
            </section>
          )}

          <section data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
            <h2 className="text-lg font-bold">By category</h2>
            {prev && <p className="mt-0.5 text-xs text-muted-foreground">Arrows compare with {before?.label.split(" ")[0]}.</p>}
            <ul className="mt-4 space-y-3.5" aria-label="Spending by category">
              {(allCats ? cats : cats.slice(0, SHOW_CATEGORIES)).map((c) => (
                <li key={c.category}>
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{c.category}</span>
                    <Change now={c.amount} before={c.previous} />
                    <span className="num ml-auto font-semibold">{inr(c.amount)}</span>
                    <span className="num w-9 text-right text-xs text-muted-foreground">{c.share}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={cn("h-full origin-left rounded-full transition-transform duration-700 ease-out motion-reduce:transition-none", ENVELOPE_STYLE[c.envelope].bar)}
                      style={{ width: `${(c.amount / Math.max(1, cats[0].amount)) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {cats.length > SHOW_CATEGORIES && (
              <button type="button" onClick={() => setAllCats((v) => !v)} className="mt-4 text-sm font-semibold text-money">
                {allCats ? "Show fewer" : `Show all ${cats.length}`}
              </button>
            )}
            {cats.some((c) => c.category === "Not yet taught") && (
              <Link
                href="/upload"
                className="mt-4 flex items-center gap-3 rounded-2xl bg-goal/10 p-3 text-sm ring-1 ring-goal/30 hover:bg-goal/15"
              >
                <GraduationCap className="size-4 shrink-0 text-goal" aria-hidden />
                <span className="flex-1">Some payees aren&apos;t taught yet. Teach your twin who they are.</span>
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            )}
          </section>

          <section data-card className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
            <h2 className="text-lg font-bold">Top payees</h2>
            <ol className="mt-3 divide-y divide-white/5" aria-label="Top payees">
              {payees.map((p, n) => (
                <li key={p.key} className="flex items-center gap-3 py-2.5">
                  <span className="num w-5 text-center text-xs font-semibold text-muted-foreground">{n + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.category} · {p.count} {p.count === 1 ? "payment" : "payments"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="num block text-sm font-semibold">{inr(p.amount)}</span>
                    <span className="num block text-[11px] text-muted-foreground">{p.share}%</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <Link
            href="/replay"
            className="flex items-center gap-3 rounded-3xl bg-white/[0.03] p-4 text-sm ring-1 ring-white/5 hover:ring-white/15"
          >
            <History className="size-4 text-money" aria-hidden />
            <span className="flex-1">Replay {now.label.split(" ")[0]} with your twin</span>
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}
