"use client";

import { useState } from "react";
import { ArrowRight, CloudOff, Download, Smartphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const FACTS = [
  {
    icon: Smartphone,
    title: "Read on your device",
    body: "Your statement is opened and understood right here in your browser.",
  },
  {
    icon: CloudOff,
    title: "The file is never uploaded",
    body: "Not the file, not the descriptions, not your account number. We never ask for bank passwords.",
  },
  {
    icon: Trash2,
    title: "Delete anytime",
    body: "Only categorised transactions are saved to your account, and one button removes them all.",
  },
];

export function PrivacyStep({ onContinue }: { onContinue: () => void }) {
  const [understood, setUnderstood] = useState(false);
  return (
    <div className="space-y-3">
      <section className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
        <h1 className="text-[1.7rem] font-bold leading-tight text-balance">Your statement stays on your phone</h1>
        <p id="privacy-summary" className="mt-2 text-[15px] leading-relaxed text-muted-foreground text-pretty">
          The file is read on your device and never uploaded; only categorised transactions are saved to your account, and
          you can delete them anytime.
        </p>
        <ul className="mt-5 space-y-4">
          {FACTS.map((f) => (
            <li key={f.title} className="flex gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-money/10">
                <f.icon className="size-5 text-money" aria-hidden />
              </div>
              <div>
                <div className="font-semibold">{f.title}</div>
                <p className="text-sm text-muted-foreground text-pretty">{f.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Download className="size-4 text-goal" aria-hidden /> Get your Kotak statement as CSV
        </h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Open Kotak net banking (the website, not the app) and go to Statements.</li>
          <li>Pick your savings account and a date range. Six months or more works best.</li>
          <li>Choose the CSV format and download. You can add several files; overlaps are handled.</li>
        </ol>
      </section>

      <div className="flex items-start gap-3 rounded-2xl bg-white/[0.04] p-4">
        <input
          id="privacy-consent"
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          aria-describedby="privacy-summary"
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-money"
        />
        <label htmlFor="privacy-consent" className="cursor-pointer text-sm text-pretty">
          I understand my file is read on this device, and only categorised transactions are saved if I choose to.
        </label>
      </div>

      <Button size="xl" className="w-full" disabled={!understood} onClick={onContinue}>
        Choose statement <ArrowRight data-icon="inline-end" />
      </Button>
    </div>
  );
}
