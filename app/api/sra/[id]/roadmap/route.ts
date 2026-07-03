import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { draftRoadmap } from "@/lib/sra/engine";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const engagement = await prisma.sraEngagement.findFirst({ where: { id: params.id, accountId: guard.session.user.accountId } });
  if (!engagement) return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  const { roadmap } = await draftRoadmap((engagement.findings as any[]) || []);
  await prisma.sraEngagement.update({ where: { id: engagement.id }, data: { roadmap: roadmap as any, stage: "ROADMAP" } });
  return NextResponse.json({ roadmap });
}
