import type { Metadata } from "next";
import { EditTwin } from "./edit-twin";

export const metadata: Metadata = { title: "Edit your twin · Money Twin" };

export default function EditTwinPage() {
  return <EditTwin />;
}
