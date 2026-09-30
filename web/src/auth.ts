import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { isDevLoginEnabled } from "@/lib/dev-login";
import { User } from "@/models/User";

// Auth.js with Google sign-in. Sessions are JWTs; the user's MongoDB id rides along in the token,
// so API routes know whose data to read without an extra lookup.

export const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

/** Email-only sign-in for Postman and automated tests. Never available in a production build. */
export const devLoginEnabled = isDevLoginEnabled(process.env);

const providers: NextAuthConfig["providers"] = [];
// prompt=select_account: Google always shows its account chooser, so signing out and back in
// (or switching accounts) is a real choice instead of an instant silent sign-in.
if (googleConfigured) providers.push(Google({ authorization: { params: { prompt: "select_account" } } }));
if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      authorize: async (credentials) => {
        const parsed = z.object({ email: z.email() }).safeParse(credentials);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        return { id: email, email, name: email.split("@")[0] };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/account" },
  callbacks: {
    async jwt({ token, user, account }) {
      // Runs with `user` set only at sign-in: create or update the users document once.
      if (user?.email) {
        await connectDb();
        const doc = await User.findOneAndUpdate(
          { email: user.email.toLowerCase() },
          {
            $set: { name: user.name ?? "", image: user.image ?? "", lastSignInAt: new Date() },
            $addToSet: { providers: account?.provider ?? "unknown" },
          },
          { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
        );
        token.uid = doc._id.toString();
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});
