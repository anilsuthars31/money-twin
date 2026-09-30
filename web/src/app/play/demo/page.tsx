import type { Metadata } from "next";
import { DemoMonth } from "./demo-month";

export const metadata: Metadata = { title: "Demo month · Money Twin" };

export default function DemoPage() {
  return <DemoMonth />;
}
