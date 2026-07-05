import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const hasGoogleAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const hasGitHubAuth = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
const hasMicrosoftAuth = Boolean(
  process.env.MICROSOFT_ENTRA_ID_CLIENT_ID && process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET
);

function envList(name: string) {
  return new Set((process.env[name] || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
}

const adminEmails = envList("ADMIN_EMAILS");
const adminGitHubLogins = envList("ADMIN_GITHUB_LOGINS");

function isBootstrapAdmin(user: { email?: string | null }, account?: { provider?: string } | null, profile?: unknown) {
  const email = user.email?.toLowerCase();
  if (email && adminEmails.has(email)) return true;
  if (account?.provider !== "github") return false;
  const login = typeof profile === "object" && profile && "login" in profile ? String((profile as { login?: unknown }).login || "").toLowerCase() : "";
  return Boolean(login && adminGitHubLogins.has(login));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  pages: { signIn: "/signin" },
  providers: [
    ...(hasGoogleAuth
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!
          })
        ]
      : []),
    ...(hasGitHubAuth
      ? [
          GitHub({
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!
          })
        ]
      : []),
    ...(hasMicrosoftAuth
      ? [
          MicrosoftEntraID({
            clientId: process.env.MICROSOFT_ENTRA_ID_CLIENT_ID!,
            clientSecret: process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET!,
            issuer: process.env.MICROSOFT_ENTRA_ID_ISSUER || undefined
          })
        ]
      : [])
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (user.id && isBootstrapAdmin(user, account, profile)) {
        await prisma.user.update({ where: { id: user.id }, data: { role: "admin" } }).catch(() => undefined);
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        const dbUser = user as typeof user & { role?: string; accountId?: string };
        session.user.role = isBootstrapAdmin(user) ? "admin" : dbUser.role || "customer";
        session.user.accountId = dbUser.accountId || user.id;
      }
      return session;
    }
  }
});


