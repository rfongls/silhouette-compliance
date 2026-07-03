import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function requireSession(role?: "customer" | "admin") {
  const session = await auth();
  if (!session?.user?.id) {
    return { response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) } as const;
  }
  if (role && session.user.role !== role && !(role === "customer" && session.user.role === "admin")) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }
  return { session } as const;
}

export function accountIdFrom(session: { user: { accountId: string } }) {
  return session.user.accountId;
}
