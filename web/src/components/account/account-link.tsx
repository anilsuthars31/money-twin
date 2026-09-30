import Link from "next/link";
import type { Session } from "next-auth";
import { TwinAvatar } from "@/components/twin/avatar";

/**
 * Header control: "Sign in" when signed out (returns to `from` afterwards), or the user's avatar
 * linking to /account when signed in. Takes the session from the page so it renders on the server.
 */
export function AccountLink({ session, from = "/" }: { session: Session | null; from?: string }) {
  const user = session?.user;
  if (!user) {
    return (
      <Link
        href={`/account?callbackUrl=${encodeURIComponent(from)}`}
        className="flex h-9 items-center rounded-full bg-white/[0.06] px-4 text-sm font-semibold text-foreground ring-1 ring-white/10 transition-colors hover:bg-white/10"
      >
        Sign in
      </Link>
    );
  }
  const label = user.name || user.email || "Your account";
  return (
    <Link
      href="/account"
      aria-label={`Your account (${label})`}
      title={label}
      className="block size-9 overflow-hidden rounded-full ring-2 ring-white/10 transition hover:ring-money/60"
    >
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <TwinAvatar seed={user.email ?? label} className="size-9 shadow-none ring-0" />
      )}
    </Link>
  );
}
