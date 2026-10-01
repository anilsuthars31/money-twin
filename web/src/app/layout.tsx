import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { auth } from "@/auth";
import { HydrationMarker } from "@/components/app/hydration-marker";
import { TwinSync } from "@/game/twin-sync";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Money Twin",
  description: "Meet the version of you that lives on your real spending.",
};

export const viewport: Viewport = {
  themeColor: "#12162a",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Who's signed in, for TwinSync. Signing in or out changes the cookie, so this re-renders.
  const session = await auth().catch(() => null);
  return (
    <html
      lang="en-IN"
      suppressHydrationWarning // data-hydrated is added on the client after load
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <HydrationMarker />
        <TwinSync userId={session?.user?.id ?? null} />
        {children}
      </body>
    </html>
  );
}
