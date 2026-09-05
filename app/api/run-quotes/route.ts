import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { estimateRunQuote, normalizeOrgNames, quoteExpiresAt, quoteFunding, type QuoteModule } from "@/lib/run-quotes";
import { normalizeStandards } from "@/lib/analysis/standards";
import { IRP_CONTROL_BATCH_SIZE, scoringPassCount } from "@/lib/analysis/scoring";
import { profileIrpControls } from "@/lib/analysis/scoring-profile";
import { loadPublishedControlSet } from "@/lib/control-boards";
import { quoteSourceDigest } from "@/lib/document-integrity";
import { isEffectiveAdmin } from "@/lib/view-role";
import { getEntitlementBalance } from "@/lib/entitlements";
import { EntKind } from "@prisma/client";
import { centsForKind } from "@/lib/stripe";
import { irpPreflightResult, validateIrpDocuments, verifyIrpProvider, type IrpPreflightResult } from "@/lib/irp-preflight";
import type { IntegrityDocument } from "@/lib/document-integrity";

const modules = new Set(["irp", "sra", "proposal"]);

export async function POST(req: Request) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const body = await req.json().catch(() => ({}));
  const module = String(body.module || "irp") as QuoteModule;
  if (!modules.has(module)) return NextResponse.json({ error: "Invalid module" }, { status: 400 });
  if (module === "irp" && body.phiAttested !== true) {
    return NextResponse.json({ error: "Confirm that the uploader reviewed the files and removed PHI before starting the assessment." }, { status: 400 });
  }

  const documents: any[] | undefined = Array.isArray(body.documents) ? body.documents : undefined;
  let analysisPasses: number | undefined;
  let analysisRequestCount: number | undefined;
  let quoteIndustry = "";
  let quoteStandards: string[] = [];
  let preflight: IrpPreflightResult | undefined;
  const assessmentScope = body.assessmentScope === "network" ? "network" : "self";
  const parentOrgName = assessmentScope === "network" ? String(body.parentOrgName || "").trim() : null;
  const preparedBy = module === "irp" ? String(body.preparedBy || "").trim() : null;
  if (module === "irp") {
    if (!preparedBy) {
      return NextResponse.json({ error: "Enter the organization or author preparing this report." }, { status: 400 });
    }
    if (assessmentScope === "network" && !parentOrgName) {
      return NextResponse.json({ error: "Enter the network or parent organization name." }, { status: 400 });
    }
    const industry = String(body.industry || "health-center");
    const standards = normalizeStandards(industry, body.standards, body.allStandards === true);
    quoteIndustry = industry;
    quoteStandards = standards;
    try {
      const orgNames = normalizeOrgNames(body.orgNames, body.orgCount);
      const integrityDocuments: IntegrityDocument[] = (documents || []).map((document: any) => ({
        name: String(document?.name || "document.txt"),
        text: String(document?.text || ""),
        orgName: String(document?.orgName || orgNames[0] || "Organization 1").trim()
      }));
      const documentValidation = validateIrpDocuments(integrityDocuments, orgNames);
      const controlSet = await loadPublishedControlSet(industry, standards);
      const applicableControlCount = profileIrpControls(controlSet.controls).controls.length;
      analysisPasses = Math.max(1, Math.ceil(applicableControlCount / IRP_CONTROL_BATCH_SIZE));
      analysisRequestCount = scoringPassCount(applicableControlCount, documentValidation.maxCharsPerOrg) * Math.max(1, orgNames.length);
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 409 });
    }
  }

  const estimate = estimateRunQuote({
    module,
    orgCount: body.orgCount,
    orgNames: Array.isArray(body.orgNames) ? body.orgNames : undefined,
    documents,
    text: typeof body.text === "string" ? body.text : undefined,
    analysisPasses,
    analysisRequestCount
  });
  if (module === "irp" && !estimate.withinGuard) {
    return NextResponse.json({ error: estimate.warning || "This submission exceeds the current processing limits." }, { status: 413 });
  }
  if (module === "irp") {
    try {
      const orgNames = normalizeOrgNames(body.orgNames, body.orgCount);
      const integrityDocuments: IntegrityDocument[] = (documents || []).map((document: any) => ({
        name: String(document?.name || "document.txt"),
        text: String(document?.text || ""),
        orgName: String(document?.orgName || orgNames[0] || "Organization 1").trim()
      }));
      const documentValidation = validateIrpDocuments(integrityDocuments, orgNames);
      const provider = await verifyIrpProvider();
      preflight = irpPreflightResult({
        provider: provider.provider,
        model: provider.model,
        verifiedAt: provider.verifiedAt,
        maxCharsPerOrg: documentValidation.maxCharsPerOrg
      });
    } catch (error) {
      return NextResponse.json({ error: `Run preflight failed: ${(error as Error).message}` }, { status: 503 });
    }
  }
  const sourceDigest = module === "irp"
    ? quoteSourceDigest((documents || []).map((document: any) => ({
        name: String(document?.name || "document.txt"),
        text: String(document?.text || ""),
        orgName: String(document?.orgName || estimate.orgNames[0] || "Organization 1")
      })), JSON.stringify({ industry: quoteIndustry, standards: [...quoteStandards].sort(), assessmentScope, parentOrgName, preparedBy }))
    : undefined;
  const isAdmin = isEffectiveAdmin(guard.session);
  const balance = module === "irp" && !isAdmin
    ? await getEntitlementBalance(guard.session.user.accountId, EntKind.ASSESSMENT_CREDIT)
    : 0;
  const funding = quoteFunding(estimate.orgCount, balance, isAdmin);

  const quote = await prisma.runQuote.create({
    data: {
      accountId: guard.session.user.accountId,
      module: estimate.module,
      kind: estimate.kind,
      orgNames: estimate.orgNames,
      assessmentScope,
      parentOrgName,
      preparedBy,
      orgCount: estimate.orgCount,
      creditsApplied: funding.creditsApplied,
      creditsToPurchase: funding.creditsToPurchase,
      documentCount: estimate.documentCount,
      charCount: estimate.charCount,
      sourceDigest,
      estimatedInputTokens: estimate.estimatedInputTokens,
      estimatedOutputTokens: estimate.estimatedOutputTokens,
      estimatedModelCostCents: estimate.estimatedModelCostCents,
      customerAmountCents: estimate.customerAmountCents,
      marginCents: estimate.marginCents,
      withinGuard: estimate.withinGuard,
      preflight: preflight || undefined,
      preflightAt: preflight ? new Date(preflight.checkedAt) : undefined,
      status: funding.creditsToPurchase === 0 ? "PAID" : "QUOTED",
      acceptedAt: funding.creditsToPurchase === 0 ? new Date() : undefined,
      reportRecipient: null,
      reportEmailStatus: "DISABLED",
      expiresAt: quoteExpiresAt()
    }
  });

  const quoteResponse = isAdmin
    ? { id: quote.id, ...estimate, assessmentScope, parentOrgName, preparedBy, ...funding, preflight, status: quote.status, expiresAt: quote.expiresAt }
    : {
        id: quote.id,
        orgNames: estimate.orgNames,
        assessmentScope,
        parentOrgName,
        preparedBy,
        orgCount: estimate.orgCount,
        creditsApplied: funding.creditsApplied,
        creditsToPurchase: funding.creditsToPurchase,
        documentCount: estimate.documentCount,
        customerAmountCents: estimate.customerAmountCents,
        purchaseAmountCents: funding.creditsToPurchase * centsForKind(EntKind.ASSESSMENT_CREDIT),
        status: quote.status,
        withinGuard: estimate.withinGuard,
        warning: estimate.withinGuard ? undefined : "This submission exceeds the current processing limits. Reduce the upload size or split the run.",
        preflight: preflight ? { passed: preflight.passed, checkedAt: preflight.checkedAt, checks: preflight.checks } : undefined,
        expiresAt: quote.expiresAt
      };

  return NextResponse.json({ quote: quoteResponse });
}

export async function GET(req: Request) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Quote id is required" }, { status: 400 });
  const quote = await prisma.runQuote.findFirst({
    where: { id, accountId: guard.session.user.accountId },
    select: {
      id: true,
      status: true,
      orgCount: true,
      creditsApplied: true,
      creditsToPurchase: true,
      customerAmountCents: true,
      expiresAt: true
    }
  });
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  return NextResponse.json({ quote });
}
