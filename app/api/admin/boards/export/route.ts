import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token || token !== process.env.ADMIN_SNAPSHOT_TOKEN) {
    const guard = await requireSession("admin");
    if ("response" in guard) return guard.response;
  }
  const boards = await prisma.controlBoard.findMany({ where: { status: "PUBLISHED" }, orderBy: [{ industry: "asc" }, { standardKey: "asc" }] });
  return NextResponse.json({ exportedAt: new Date().toISOString(), boards });
}
