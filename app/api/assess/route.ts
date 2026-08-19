import { EntKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { consumeEntitlementTx, PaymentRequiredError } from "@/lib/entitlements";
import { runGapAnalysis, demoAssessment } from "@/lib/analysis/engine";
import { defaultStandards } from "@/lib/analysis/standards";
import { prisma } from "@/lib/prisma";
import { isEffectiveAdmin } from "@/lib/view-role";
import { estimateRunQuote, normalizeOrgNames } from "@/lib/run-quotes";

const MAX_DOC_CHARS = 180000;
const QUOTE_TOLERANCE_MULTIPLIER = 1.1;

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
  const isAdmin = isEffectiveAdmin(guard.session);
  const orgNames = normalizeOrgNames(body.orgNames, body.orgCount);
  const quoteId = typeof body.quoteId === "string" ? body.quoteId : "";
  const quote = quoteId ? await prisma.runQuote.findFirst({
    where: {
      id: quoteId,
      accountId,
      module: "irp",
      status: { in: isAdmin ? ["QUOTED", "CHECKOUT_STARTED", "PAID"] : ["PAID"] },
      expiresAt: { gt: new Date() }
    }
  }) : null;
  const estimate = estimateRunQuote({ module: "irp", orgNames, documents: docs });
  if (!quote) return NextResponse.json({ error: "Accepted run quote required before assessment" }, { status: 428 });
  if (!quote.withinGuard) return NextResponse.json({ error: "Quote exceeds configured processing guard" }, { status: 413 });
  const quotedOrgNames = Array.isArray(quote.orgNames) ? quote.orgNames.map((name) => String(name || "").trim()).filter(Boolean) : [];
  const orgNamesMatch = quotedOrgNames.length === estimate.orgNames.length && quotedOrgNames.every((name, index) => name === estimate.orgNames[index]);
  if (!orgNamesMatch || estimate.charCount > Math.ceil(quote.charCount * QUOTE_TOLERANCE_MULTIPLIER)) {
    return NextResponse.json({ error: "Uploaded documents changed after quote. Please refresh the estimate." }, { status: 409 });
  }
  const industry = String(body.industry || "health-center");
  const standards = Array.isArray(body.standards) && body.standards.length ? body.standards.map(String).slice(0, 6) : defaultStandards(industry);
  const boards = await prisma.controlBoard.findMany({ where: { industry, standardKey: { in: standards }, status: "PUBLISHED" } });
  const controls = boards.flatMap((b) => Array.isArray(b.controls) ? b.controls as any[] : []);
  if (!controls.length) {
    return NextResponse.json({ error: "No published control board is available for this domain and standard set. Fetch or upload controls in Admin before running IRP scoring." }, { status: 409 });
  }
  const boardCite = boards.map((b) => `${b.standardKey} v${b.version}`).join("; ");

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (!isAdmin) await consumeEntitlementTx(tx, accountId, EntKind.ASSESSMENT_CREDIT, quote.orgCount);
      const ledger = await tx.usageLedger.create({ data: { accountId, kind: "assessment", status: isAdmin ? "admin_comped" : "succeeded", orgsBilled: quote.orgCount, amountCents: quote.customerAmountCents, quoteId: quote.id } });
      await tx.runQuote.update({ where: { id: quote.id }, data: { status: "CONSUMED" } });
      const assessment = await tx.assessment.create({ data: { accountId, orgId: String(body.orgId || body.orgName || "org"), orgName: body.orgName ? String(body.orgName) : undefined, industry, status: "RUNNING", ledgerId: ledger.id } });
      return { assessment, ledger };
    });

    const { result, usage } = await runGapAnalysis({ orgName: body.orgName, industry, standards, documents: docs, controls, boardCite });
    const saved = await prisma.assessment.update({ where: { id: created.assessment.id }, data: { status: "DELIVERED", score: result.compliance_score, posture: result.overall_posture, result, boardCite } });
    await prisma.usageLedger.update({ where: { id: created.ledger.id }, data: { assessmentId: saved.id, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } });
    return NextResponse.json({ assessmentId: saved.id, result });
  } catch (err) {
    if (err instanceof PaymentRequiredError) return NextResponse.json({ error: "Confirmed assessment credit required" }, { status: 402 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
