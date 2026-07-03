import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { draftSraFindings } from "@/lib/sra/engine";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const engagement = await prisma.sraEngagement.findFirst({ where: { id: params.id, accountId: guard.session.user.accountId }, include: { evidence: true } });
  if (!engagement) return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  const { findings, usage } = await draftSraFindings({ industry: engagement.industry, evidence: engagement.evidence.map((e) => e.parsed), inventory: engagement.inventory });
  const updated = await prisma.sraEngagement.update({ where: { id: engagement.id }, data: { findings: findings as any, stage: "FINDINGS" } });
  await prisma.usageLedger.create({ data: { accountId: guard.session.user.accountId, kind: "sra_findings", status: guard.session.user.role === "admin" ? "admin_comped" : "succeeded", inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } }).catch(() => undefined);
  return NextResponse.json({ findings: updated.findings });
}
