import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { estimateRunQuote, quoteExpiresAt, type QuoteModule } from "@/lib/run-quotes";

const modules = new Set(["irp", "sra", "proposal"]);

export async function POST(req: Request) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const body = await req.json().catch(() => ({}));
  const module = String(body.module || "irp") as QuoteModule;
  if (!modules.has(module)) return NextResponse.json({ error: "Invalid module" }, { status: 400 });

  const estimate = estimateRunQuote({
    module,
    orgCount: body.orgCount,
    orgNames: Array.isArray(body.orgNames) ? body.orgNames : undefined,
    documents: Array.isArray(body.documents) ? body.documents : undefined,
    text: typeof body.text === "string" ? body.text : undefined
  });

  const quote = await prisma.runQuote.create({
    data: {
      accountId: guard.session.user.accountId,
      module: estimate.module,
      kind: estimate.kind,
      orgNames: estimate.orgNames,
      orgCount: estimate.orgCount,
      documentCount: estimate.documentCount,
      charCount: estimate.charCount,
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
