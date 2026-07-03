import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const roles = new Set(["customer", "admin"]);

export async function PATCH(req: Request) {
  const guard = await requireSession("admin");
  if ("response" in guard) return guard.response;

  const { userId, role } = await req.json();
  const nextRole = String(role || "");
  if (!roles.has(nextRole)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: String(userId) } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (target.id === guard.session.user.id && nextRole !== "admin") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) return NextResponse.json({ error: "Cannot remove the last admin" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: target.id },
    data: { role: nextRole },
    select: { id: true, name: true, email: true, role: true, accountId: true, createdAt: true }
  });

  return NextResponse.json({ user });
}
