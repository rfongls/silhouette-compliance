import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { estimateRunQuote, quoteExpiresAt, type QuoteModule } from "@/lib/run-quotes";
import { normalizeStandards } from "@/lib/analysis/standards";
import { IRP_CONTROL_BATCH_SIZE, scoringPassCount } from "@/lib/analysis/scoring";
import { loadPublishedControlSet } from "@/lib/control-boards";
import { quoteSourceDigest } from "@/lib/document-integrity";
import { isEffectiveAdmin } from "@/lib/view-role";
import { getEntitlementBalance } from "@/lib/entitlements";
import { EntKind } from "@prisma/client";

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
  const assessmentScope = body.assessmentScope === "network" ? "network" : "self";
  const parentOrgName = assessmentScope === "network" ? String(body.parentOrgName || "").trim() : null;
  if (module === "irp") {
    if (assessmentScope === "network" && !parentOrgName) {
      return NextResponse.json({ error: "Enter the network or parent organization name." }, { status: 400 });
    }
    const industry = String(body.industry || "health-center");
    const standards = normalizeStandards(industry, body.standards, body.allStandards === true);
    quoteIndustry = industry;
    quoteStandards = standards;
    try {
      const controlSet = await loadPublishedControlSet(industry, standards);
      const orgNames = Array.isArray(body.orgNames) ? body.orgNames.map(String) : [];
      const counts = (documents || []).reduce((result: Record<string, number>, document: any) => {
        const orgName = String(document?.orgName || orgNames[0] || "Organization 1");
        result[orgName] = (result[orgName] || 0) + String(document?.text || "").length;
        return result;
      }, {});
      const maxCharsPerOrg = Math.max(0, ...Object.values(counts));
      analysisPasses = Math.max(1, Math.ceil(controlSet.controls.length / IRP_CONTROL_BATCH_SIZE));
      analysisRequestCount = scoringPassCount(controlSet.controls.length, maxCharsPerOrg) * Math.max(1, Object.keys(counts).length);
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
  const sourceDigest = module === "irp"
    ? quoteSourceDigest((documents || []).map((document: any) => ({
        name: String(document?.name || "document.txt"),
        text: String(document?.text || ""),
        orgName: String(document?.orgName || estimate.orgNames[0] || "Organization 1")
      })), JSON.stringify({ industry: quoteIndustry, standards: [...quoteStandards].sort(), assessmentScope, parentOrgName }))
    : undefined;
  const isAdmin = isEffectiveAdmin(guard.session);
  if (module === "irp" && !isAdmin) {
    const balance = await getEntitlementBalance(guard.session.user.accountId, EntKind.ASSESSMENT_CREDIT);
    if (balance < estimate.orgCount) {
      return NextResponse.json({ error: `This assessment requires ${estimate.orgCount} organization credit${estimate.orgCount === 1 ? "" : "s"}. Purchase the remaining credits before running it.` }, { status: 402 });
    }
  }

  const quote = await prisma.runQuote.create({
    data: {
      accountId: guard.session.user.accountId,
      module: estimate.module,
      kind: estimate.kind,
      orgNames: estimate.orgNames,
      assessmentScope,
      parentOrgName,
      orgCount: estimate.orgCount,
      documentCount: estimate.documentCount,
      charCount: estimate.charCount,
      sourceDigest,
      estimatedInputTokens: estimate.estimatedInputTokens,
      estimatedOutputTokens: estimate.estimatedOutputTokens,
      estimatedModelCostCents: estimate.estimatedModelCostCents,
      customerAmountCents: estimate.customerAmountCents,
      marginCents: estimate.marginCents,
      withinGuard: estimate.withinGuard,
      status: module === "irp" && !isAdmin ? "PAID" : "QUOTED",
      acceptedAt: module === "irp" && !isAdmin ? new Date() : undefined,
      expiresAt: quoteExpiresAt()
    }
  });

  const quoteResponse = isAdmin
    ? { id: quote.id, ...estimate, assessmentScope, parentOrgName, expiresAt: quote.expiresAt }
    : {
        id: quote.id,
        orgNames: estimate.orgNames,
        assessmentScope,
        parentOrgName,
        orgCount: estimate.orgCount,
        documentCount: estimate.documentCount,
        customerAmountCents: estimate.customerAmountCents,
        withinGuard: estimate.withinGuard,
        warning: estimate.withinGuard ? undefined : "This submission exceeds the current processing limits. Reduce the upload size or split the run.",
        expiresAt: quote.expiresAt
      };

  return NextResponse.json({ quote: quoteResponse });
}
