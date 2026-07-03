import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  pages: { signIn: "/signin" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || "placeholder",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "placeholder"
    }),
    MicrosoftEntraID({
      clientId: process.env.MICROSOFT_ENTRA_ID_CLIENT_ID || "placeholder",
      clientSecret: process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET || "placeholder",
      issuer: process.env.MICROSOFT_ENTRA_ID_ISSUER || undefined
    })
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        const dbUser = user as typeof user & { role?: string; accountId?: string };
        session.user.role = dbUser.role || "customer";
        session.user.accountId = dbUser.accountId || user.id;
      }
      return session;
    }
  }
});


