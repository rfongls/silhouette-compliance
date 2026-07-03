import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const engagement = await prisma.sraEngagement.findFirst({ where: { id: params.id, accountId: guard.session.user.accountId }, include: { evidence: true } });
  if (!engagement) return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  return NextResponse.json({ engagement });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const body = await req.json();
  const engagement = await prisma.sraEngagement.updateMany({ where: { id: params.id, accountId: guard.session.user.accountId }, data: { stage: body.stage, scope: body.scope, inventory: body.inventory, findings: body.findings, roadmap: body.roadmap, status: body.status } });
  if (!engagement.count) return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
