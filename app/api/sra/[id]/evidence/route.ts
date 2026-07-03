import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { parseEvidence, putEncryptedEvidence } from "@/lib/sra/storage";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const engagement = await prisma.sraEngagement.findFirst({ where: { id: params.id, accountId: guard.session.user.accountId } });
  if (!engagement) return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") || "file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const text = bytes.toString("utf8");
  const parsed = parseEvidence(file.name, text);
  const storageKey = await putEncryptedEvidence(guard.session.user.accountId, engagement.id, file.name, bytes);
  const evidence = await prisma.sraEvidence.create({ data: { engagementId: engagement.id, kind, filename: file.name, parsed: parsed as any, storageKey } });
  await prisma.sraEngagement.update({ where: { id: engagement.id }, data: { stage: "EVIDENCE" } });
  return NextResponse.json({ evidence });
}
