import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { deleteEvidenceBlob } from "@/lib/sra/storage";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const engagement = await prisma.sraEngagement.findFirst({ where: { id: params.id, accountId: guard.session.user.accountId }, include: { evidence: true } });
  if (!engagement) return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  await Promise.all(engagement.evidence.map((e) => deleteEvidenceBlob(e.storageKey)));
  await prisma.sraEvidence.deleteMany({ where: { engagementId: engagement.id } });
  return NextResponse.json({ purged: true });
}
