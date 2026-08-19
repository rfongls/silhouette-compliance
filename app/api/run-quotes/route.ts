import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { estimateRunQuote, quoteExpiresAt, type QuoteModule } from "@/lib/run-quotes";
import { defaultStandards } from "@/lib/analysis/standards";
import { IRP_CONTROL_BATCH_SIZE, scoringPassCount } from "@/lib/analysis/scoring";
import { loadPublishedControlSet } from "@/lib/control-boards";
import { quoteSourceDigest } from "@/lib/document-integrity";

const modules = new Set(["irp", "sra", "proposal"]);

export async function POST(req: Request) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const body = await req.json().catch(() => ({}));
  const module = String(body.module || "irp") as QuoteModule;
  if (!modules.has(module)) return NextResponse.json({ error: "Invalid module" }, { status: 400 });
  if (module === "irp" && body.phiAttested !== true) {
    return NextResponse.json({ error: "Confirm that the uploader reviewed the files and removed PHI before creating an estimate." }, { status: 400 });
  }

  const documents: any[] | undefined = Array.isArray(body.documents) ? body.documents : undefined;
  let analysisPasses: number | undefined;
  let analysisRequestCount: number | undefined;
  if (module === "irp") {
    const industry = String(body.industry || "health-center");
    const standards = Array.isArray(body.standards) && body.standards.length
      ? body.standards.map(String).slice(0, 6)
      : defaultStandards(industry);
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
      })))
    : undefined;

  const quote = await prisma.runQuote.create({
    data: {
      accountId: guard.session.user.accountId,
      module: estimate.module,
      kind: estimate.kind,
      orgNames: estimate.orgNames,
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
      expiresAt: quoteExpiresAt()
    }
  });

  return NextResponse.json({ quote: { id: quote.id, ...estimate, expiresAt: quote.expiresAt } });
}
