import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { auth } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReplayApp } from "./replay-app";

export const metadata: Metadata = { title: "Replay your months · Money Twin" };

// Your real months live in your account, so replaying them needs sign-in. Without it, the demo is always there.
export default async function ReplayPage() {
  const session = await auth();
  if (session?.user) return <ReplayApp />;
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col px-4">
      <header className="py-4">
        <Link href="/" className="grid size-10 place-items-center rounded-full hover:bg-white/5" aria-label="Home">
          <ArrowLeft className="size-5" />
        </Link>
      </header>
      <main className="flex flex-1 flex-col justify-center pb-16">
        <section className="rounded-3xl bg-card p-6 text-center ring-1 ring-white/5">
          <History className="mx-auto size-8 text-money" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold text-balance">Replay your real past</h1>
          <p className="mt-2 text-sm text-muted-foreground text-pretty">
            Sign in to replay the months you&apos;ve saved. Each one becomes a chapter with its own report card.
          </p>
          <Link href="/account?callbackUrl=%2Freplay" className={cn(buttonVariants({ size: "xl" }), "mt-5 w-full")}>
            Sign in
          </Link>
          <Link href="/play/demo" className="mt-3 block text-sm text-money underline-offset-4 hover:underline">
            Play the demo month instead
          </Link>
        </section>
      </main>
    </div>
  );
}
