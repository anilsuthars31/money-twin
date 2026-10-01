"use client";

import { useEffect, useRef } from "react";

// Dev-only email sign-in. What you type is kept as a draft in this tab, so a reload while the page
// is still loading (the dev server compiling the page, or a hot reload) never throws it away.
const DRAFT_KEY = "money-twin:dev-login-email";

export function DevLoginForm({ action, callbackUrl }: { action: (form: FormData) => Promise<void>; callbackUrl: string }) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    try {
      if (el.value) sessionStorage.setItem(DRAFT_KEY, el.value); // typed before the page was ready
      else el.value = sessionStorage.getItem(DRAFT_KEY) ?? "";
    } catch {
      // storage blocked: nothing to restore
    }
  }, []);

  const save = (value: string) => {
    try {
      sessionStorage.setItem(DRAFT_KEY, value);
    } catch {}
  };

  return (
    <form action={action} className="rounded-2xl border border-dashed border-white/15 p-3">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <label htmlFor="dev-email" className="text-xs font-medium text-muted-foreground">
        Dev login (local only, for testing)
      </label>
      <div className="mt-2 flex gap-2">
        <input
          ref={input}
          id="dev-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="tester@example.com"
          onInput={(e) => save(e.currentTarget.value)}
          className="h-11 min-w-0 flex-1 rounded-xl bg-white/[0.06] px-3 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-money/60"
        />
        <button type="submit" className="h-11 rounded-xl bg-raised px-4 text-sm font-semibold ring-1 ring-white/10">
          Sign in
        </button>
      </div>
    </form>
  );
}
