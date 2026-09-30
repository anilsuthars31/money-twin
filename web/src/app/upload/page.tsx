import type { Metadata } from "next";
import { auth } from "@/auth";
import { UploadFlow } from "./upload-flow";

export const metadata: Metadata = { title: "Bring your twin to life · Money Twin" };

// Open to everyone: the statement is read in the browser. Sign-in is asked for only when saving.
export default async function UploadPage() {
  const session = await auth();
  return <UploadFlow signedIn={!!session?.user} accountName={session?.user?.email ?? ""} />;
}
