import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { auth, devLoginEnabled, googleConfigured, signIn, signOut } from "@/auth";
import { safeCallbackUrl } from "@/lib/safe-redirect";
import { AccountPanel } from "./account-panel";

export const metadata: Metadata = { title: "Account · Money Twin" };

// Server component: reads the session, shows sign-in or the account panel.
export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const session = await auth();
  const { error, signedOut, callbackUrl } = await searchParams;
  // Where to go after signing in: the page the user came from, or this page by default.
  const returnTo = safeCallbackUrl(callbackUrl);

  // The hidden callbackUrl field is re-checked on the server; never trust it as sent.
  async function google(form: FormData) {
    "use server";
    await signIn("google", { redirectTo: safeCallbackUrl(form.get("callbackUrl")) });
  }
  async function devLogin(form: FormData) {
    "use server";
    await signIn("dev-login", {
      email: String(form.get("email") ?? ""),
      redirectTo: safeCallbackUrl(form.get("callbackUrl")),
    });
  }
  async function logout() {
    "use server";
    // Land on the account page, not the landing page, so it's obvious the sign-out worked.
    await signOut({ redirectTo: "/account?signedOut=1" });
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16">
      <header className="flex items-center gap-2 py-4">
        <Link href="/" className="grid size-10 place-items-center rounded-full hover:bg-white/5" aria-label="Home">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-lg font-semibold">Your account</h1>
      </header>

      {session?.user ? (
        <AccountPanel
          name={session.user.name ?? ""}
          email={session.user.email ?? ""}
          image={session.user.image ?? ""}
          signOutAction={logout}
        />
      ) : (
        <section className="rounded-3xl bg-card p-5 ring-1 ring-white/5">
          <h2 className="text-2xl font-bold leading-tight text-balance">Save your twin&apos;s real months</h2>
          <p className="mt-2 text-[15px] text-muted-foreground text-pretty">
            Sign in to keep your categorised transactions and payee labels between visits. The demo month works without an
            account.
          </p>

          {signedOut && (
            <p role="status" className="mt-4 rounded-2xl bg-money/10 p-3 text-sm text-money ring-1 ring-money/30">
              You&apos;re signed out. Next time, Google will ask which account to use.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-2xl bg-alert/10 p-3 text-sm text-alert ring-1 ring-alert/30">
              Sign-in didn&apos;t work. Please try again.
            </p>
          )}

          <div className="mt-5 space-y-3">
            {googleConfigured ? (
              <form action={google}>
                <input type="hidden" name="callbackUrl" value={returnTo} />
                <button
                  type="submit"
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-foreground text-base font-semibold text-background transition active:scale-[0.98]"
                >
                  <GoogleMark /> Continue with Google
                </button>
              </form>
            ) : (
              <p className="rounded-2xl bg-white/[0.04] p-3 text-sm text-muted-foreground">
                Google sign-in isn&apos;t set up yet. Add <code className="text-foreground">AUTH_GOOGLE_ID</code> and{" "}
                <code className="text-foreground">AUTH_GOOGLE_SECRET</code> to <code className="text-foreground">web/.env.local</code>.
              </p>
            )}

            {devLoginEnabled && (
              <form action={devLogin} className="rounded-2xl border border-dashed border-white/15 p-3">
                <input type="hidden" name="callbackUrl" value={returnTo} />
                <label htmlFor="dev-email" className="text-xs font-medium text-muted-foreground">
                  Dev login (local only, for testing)
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="dev-email"
                    name="email"
                    type="email"
                    required
                    placeholder="tester@example.com"
                    className="h-11 min-w-0 flex-1 rounded-xl bg-white/[0.06] px-3 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-money/60"
                  />
                  <button type="submit" className="h-11 rounded-xl bg-raised px-4 text-sm font-semibold ring-1 ring-white/10">
                    Sign in
                  </button>
                </div>
              </form>
            )}
          </div>

          <p className="mt-5 flex gap-2 text-xs text-muted-foreground text-pretty">
            <ShieldCheck className="size-4 shrink-0 text-money" aria-hidden />
            Bank statements are read on your device and never uploaded. Only categorised transactions are saved to your
            account, and you can delete them anytime.
          </p>
        </section>
      )}
    </div>
  );
}

/** Google's "G" mark, as Google's sign-in branding guidelines require. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
