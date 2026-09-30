import { auth } from "@/auth";
import { AccountLink } from "@/components/account/account-link";
import { savedRange } from "@/lib/saved-range";
import { Landing } from "./landing";
import { WelcomeBack } from "./welcome-back";

// Signed out: the marketing hero. Signed in: "Welcome back", what's saved, and a way back to the twin.
export default async function Home() {
  const session = await auth();
  const accountLink = <AccountLink session={session} from="/" />;
  if (session?.user) {
    const name = session.user.name || session.user.email?.split("@")[0] || "there";
    // If the database is unreachable, still show the page, just without the saved summary.
    const saved = await savedRange(session.user.id).catch(() => null);
    return <WelcomeBack firstName={name.split(" ")[0]} accountLink={accountLink} saved={saved} />;
  }
  return <Landing accountLink={accountLink} />;
}
