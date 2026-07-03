import { NextResponse } from "next/server";
import { EntKind } from "@prisma/client";
import { grantEntitlement } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) return NextResponse.json({ error: "Webhook signature missing" }, { status: 400 });
  let event;
  try { event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET); }
  catch (err) { return NextResponse.json({ error: `Invalid signature: ${(err as Error).message}` }, { status: 400 }); }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const accountId = session.metadata?.accountId;
    const kind = session.metadata?.kind as EntKind | undefined;
    const quantity = Math.max(1, Number(session.metadata?.quantity || 1));
    if (accountId && kind) {
      await grantEntitlement(accountId, kind, quantity, session.id);
      await prisma.usageLedger.create({ data: { accountId, kind: "purchase", status: "succeeded", amountCents: Number(session.metadata?.amountCents || session.amount_total || 0), stripeRef: session.id, orgsBilled: kind === "ASSESSMENT_CREDIT" ? quantity : undefined } });
    }
  }
  return NextResponse.json({ received: true });
}
