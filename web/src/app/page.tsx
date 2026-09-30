import { auth } from "@/auth";
import { AccountLink } from "@/components/account/account-link";
import { Landing } from "./landing";
import { WelcomeBack } from "./welcome-back";

// Signed out: the marketing hero. Signed in: "Welcome back" and a way straight back to the twin.
export default async function Home() {
  const session = await auth();
  const accountLink = <AccountLink session={session} from="/" />;
  if (session?.user) {
    const name = session.user.name || session.user.email?.split("@")[0] || "there";
    return <WelcomeBack firstName={name.split(" ")[0]} accountLink={accountLink} />;
  }
  return <Landing accountLink={accountLink} />;
}
