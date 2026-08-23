import { NextResponse } from "next/server";
import { EntKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = env("STRIPE_WEBHOOK_SECRET");
  if (!sig || !webhookSecret) return NextResponse.json({ error: "Webhook signature missing" }, { status: 400 });
  let event;
  try { event = stripe.webhooks.constructEvent(raw, sig, webhookSecret); }
  catch (err) { return NextResponse.json({ error: `Invalid signature: ${(err as Error).message}` }, { status: 400 }); }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const accountId = session.metadata?.accountId;
    const kind = session.metadata?.kind as EntKind | undefined;
    const quantity = Math.max(1, Number(session.metadata?.quantity || 1));
    const quoteId = session.metadata?.quoteId || undefined;
    if (accountId && kind && session.payment_status === "paid") {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.id}))`;
        const existing = await tx.usageLedger.findFirst({ where: { stripeRef: session.id, kind: "purchase", status: "succeeded" } });
        if (existing) return;
        if (quoteId) {
          const quote = await tx.runQuote.findFirst({ where: { id: quoteId, accountId } });
          if (!quote || quote.creditsToPurchase !== quantity) throw new Error("Stripe checkout does not match its run quote.");
          await tx.runQuote.update({ where: { id: quote.id }, data: { status: "PAID", stripeRef: session.id, acceptedAt: new Date() } });
        }
        await tx.entitlement.create({ data: { accountId, kind, balance: quantity, stripeRef: session.id, status: "ACTIVE" } });
        await tx.usageLedger.create({ data: { accountId, kind: "purchase", status: "succeeded", amountCents: Number(session.metadata?.amountCents || session.amount_total || 0), stripeRef: session.id, quoteId, orgsBilled: kind === "ASSESSMENT_CREDIT" ? quantity : undefined } });
      });
    }
  }
  return NextResponse.json({ received: true });
}
