import { EntKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { consumeEntitlementTx, PaymentRequiredError } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  try {
    await prisma.$transaction(async (tx) => {
      await consumeEntitlementTx(tx, guard.session.user.accountId, EntKind.PROPOSAL_CREDIT, 1);
      await tx.usageLedger.create({ data: { accountId: guard.session.user.accountId, kind: "proposal", status: "succeeded", amountCents: Number(process.env.PROPOSAL_RATE_CENTS || 9900) } });
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PaymentRequiredError) return NextResponse.json({ error: "Confirmed proposal credit required" }, { status: 402 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
