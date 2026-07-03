import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const guard = await requireSession("admin");
  if ("response" in guard) return guard.response;
  const boards = await prisma.controlBoard.findMany({ orderBy: [{ industry: "asc" }, { standardKey: "asc" }, { version: "desc" }] });
  return NextResponse.json({ boards });
}
