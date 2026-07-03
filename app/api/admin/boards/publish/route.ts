import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const guard = await requireSession("admin");
  if ("response" in guard) return guard.response;
  const { id } = await req.json();
  const draft = await prisma.controlBoard.findUnique({ where: { id: String(id) } });
  if (!draft || draft.status !== "DRAFT") return NextResponse.json({ error: "Draft board not found" }, { status: 404 });
  await prisma.$transaction([
    prisma.controlBoard.updateMany({ where: { industry: draft.industry, standardKey: draft.standardKey, status: "PUBLISHED" }, data: { status: "ARCHIVED" } }),
    prisma.controlBoard.update({ where: { id: draft.id }, data: { status: "PUBLISHED", publishedAt: new Date() } })
  ]);
  return NextResponse.json({ ok: true });
}
