import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { deleteStoredReportPackage } from "@/lib/stored-reports";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;

  const accountId = guard.session.user.accountId;
  const deleted = await prisma.$transaction((tx) => deleteStoredReportPackage(tx, params.id, accountId));

  if (!deleted) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
