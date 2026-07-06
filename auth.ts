import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { bootstrapComplianceEnv, env, envList, hasEnvPair } from "@/lib/env";
import { prisma } from "@/lib/prisma";

bootstrapComplianceEnv();

const hasGoogleAuth = hasEnvPair("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
const hasGitHubAuth = hasEnvPair("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET");
const hasMicrosoftAuth = hasEnvPair("MICROSOFT_ENTRA_ID_CLIENT_ID", "MICROSOFT_ENTRA_ID_CLIENT_SECRET");
const microsoftIssuer = "https://login.microsoftonline.com/common/v2.0";
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
            clientId: env("GOOGLE_CLIENT_ID"),
            clientSecret: env("GOOGLE_CLIENT_SECRET")
          })
        ]
      : []),
    ...(hasGitHubAuth
      ? [
          GitHub({
            clientId: env("GITHUB_CLIENT_ID"),
            clientSecret: env("GITHUB_CLIENT_SECRET")
          })
        ]
      : []),
    ...(hasMicrosoftAuth
      ? [
          MicrosoftEntraID({
            clientId: env("MICROSOFT_ENTRA_ID_CLIENT_ID"),
            clientSecret: env("MICROSOFT_ENTRA_ID_CLIENT_SECRET"),
            issuer: microsoftIssuer
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


