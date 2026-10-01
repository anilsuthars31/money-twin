import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardApp } from "./dashboard-app";

export const metadata: Metadata = { title: "Where your money goes · Money Twin" };

// Your saved months live in your account, so the dashboard needs sign-in.
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/account?callbackUrl=%2Fdashboard");
  return <DashboardApp />;
}
