import { prisma } from "@/lib/prisma";

type OAuthAccount = {
  provider?: string;
  providerAccountId?: string;
} | null | undefined;

function profileValue(profile: unknown, key: string) {
  if (!profile || typeof profile !== "object") return undefined;
  const value = (profile as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function recordEarlyAccessInterest(
  user: { email?: string | null; name?: string | null },
  account: OAuthAccount,
  profile?: unknown
) {
  const email = user.email?.trim().toLowerCase();
  const provider = account?.provider?.trim();
  const providerAccountId = account?.providerAccountId?.trim();

  if (!email || !provider || !providerAccountId) return null;

  return prisma.earlyAccessInterest.upsert({
    where: {
      provider_providerAccountId: { provider, providerAccountId }
    },
    create: {
      email,
      name: user.name?.trim() || profileValue(profile, "name"),
      provider,
      providerAccountId,
      providerUsername: profileValue(profile, "login") || profileValue(profile, "preferred_username")
    },
    update: {
      email,
      name: user.name?.trim() || profileValue(profile, "name"),
      providerUsername: profileValue(profile, "login") || profileValue(profile, "preferred_username")
    },
    select: { id: true }
  });
}

export async function requestEarlyAccessNotification(id: string) {
  return prisma.earlyAccessInterest.updateMany({
    where: { id },
    data: {
      status: "notify_requested",
      notifyRequested: true,
      notifyRequestedAt: new Date()
    }
  });
}
