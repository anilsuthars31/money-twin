import type { Metadata } from "next";
import { CreateTwin } from "./create-twin";

export const metadata: Metadata = { title: "Create your twin · Money Twin" };

export default function CreatePage() {
  return <CreateTwin />;
}
