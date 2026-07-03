import { EntKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { consumeEntitlementTx, PaymentRequiredError } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const engagements = await prisma.sraEngagement.findMany({ where: { accountId: guard.session.user.accountId }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ engagements });
}

export async function POST(req: Request) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const body = await req.json();
  if (body.demo) return NextResponse.json({ engagement: { id: "demo", orgName: body.orgName || "Demo Health Center", industry: body.industry || "health-center", stage: "SCOPE", status: "ACTIVE" } });
  try {
    const engagement = await prisma.$transaction(async (tx) => {
      await consumeEntitlementTx(tx, guard.session.user.accountId, EntKind.SRA_CREDIT, 1);
      const e = await tx.sraEngagement.create({ data: { accountId: guard.session.user.accountId, orgName: String(body.orgName || "New engagement"), industry: String(body.industry || "health-center"), scope: body.scope || undefined } });
      await tx.usageLedger.create({ data: { accountId: guard.session.user.accountId, kind: "sra", status: "succeeded", amountCents: Number(process.env.SRA_RATE_CENTS || 150000) } });
      return e;
    });
    return NextResponse.json({ engagement });
  } catch (err) {
    if (err instanceof PaymentRequiredError) return NextResponse.json({ error: "Confirmed SRA credit required" }, { status: 402 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
