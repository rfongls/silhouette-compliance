import { EntKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { consumeEntitlementTx, PaymentRequiredError } from "@/lib/entitlements";
import { runGapAnalysis, demoAssessment } from "@/lib/analysis/engine";
import { defaultStandards } from "@/lib/analysis/standards";
import { prisma } from "@/lib/prisma";

const MAX_DOC_CHARS = 180000;

export async function POST(req: Request) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const body = await req.json().catch(() => ({}));
  if (body.demo === true) return NextResponse.json({ result: demoAssessment(body.orgName, body.industry) });
  const docs = Array.isArray(body.documents) ? body.documents.map((d: any) => ({ name: String(d.name || "document.txt"), text: String(d.text || "") })) : [];
  if (!docs.length || docs.every((d: any) => !d.text.trim())) return NextResponse.json({ error: "At least one document text payload is required" }, { status: 400 });
  const totalChars = docs.reduce((n: number, d: any) => n + d.text.length, 0);
  if (totalChars > MAX_DOC_CHARS) return NextResponse.json({ error: "Document payload exceeds cost guard" }, { status: 413 });
  const accountId = guard.session.user.accountId;
  const industry = String(body.industry || "health-center");
  const standards = Array.isArray(body.standards) && body.standards.length ? body.standards.map(String).slice(0, 6) : defaultStandards(industry);

  try {
    const created = await prisma.$transaction(async (tx) => {
      await consumeEntitlementTx(tx, accountId, EntKind.ASSESSMENT_CREDIT, 1);
      const ledger = await tx.usageLedger.create({ data: { accountId, kind: "assessment", status: "succeeded", orgsBilled: 1, amountCents: Number(process.env.ASSESSMENT_RATE_CENTS || 25000) } });
      const assessment = await tx.assessment.create({ data: { accountId, orgId: String(body.orgId || body.orgName || "org"), orgName: body.orgName ? String(body.orgName) : undefined, industry, status: "RUNNING", ledgerId: ledger.id } });
      return { assessment, ledger };
    });

    const boards = await prisma.controlBoard.findMany({ where: { industry, standardKey: { in: standards }, status: "PUBLISHED" } });
    const controls = boards.flatMap((b) => Array.isArray(b.controls) ? b.controls as any[] : []);
    const boardCite = boards.length ? boards.map((b) => `${b.standardKey} v${b.version}`).join("; ") : "No published board - direct standard prompt";
    const { result, usage } = await runGapAnalysis({ orgName: body.orgName, industry, standards, documents: docs, controls, boardCite });
    const saved = await prisma.assessment.update({ where: { id: created.assessment.id }, data: { status: "DELIVERED", score: result.compliance_score, posture: result.overall_posture, result, boardCite } });
    await prisma.usageLedger.update({ where: { id: created.ledger.id }, data: { assessmentId: saved.id, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } });
    return NextResponse.json({ assessmentId: saved.id, result });
  } catch (err) {
    if (err instanceof PaymentRequiredError) return NextResponse.json({ error: "Confirmed assessment credit required" }, { status: 402 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
