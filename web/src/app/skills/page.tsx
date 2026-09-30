import type { Metadata } from "next";
import { SkillsBook } from "./skills-book";

export const metadata: Metadata = { title: "Money Skills · Money Twin" };

export default function SkillsPage() {
  return <SkillsBook />;
}
