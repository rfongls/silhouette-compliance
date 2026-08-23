import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { centsForKind, kindFromModule, priceForKind, stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";

function quoteOrgNames(value: unknown, quantity: number) {
  const names = Array.isArray(value) ? value.map((name) => String(name || "").trim()).filter(Boolean) : [];
  return names.length ? names.slice(0, quantity) : Array.from({ length: quantity }, (_, index) => `Organization ${index + 1}`);
}

export async function POST(req: Request) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const body = await req.json().catch(() => ({}));
  const quoteId = typeof body.quoteId === "string" ? body.quoteId : "";
  const quote = quoteId ? await prisma.runQuote.findFirst({
    where: { id: quoteId, accountId: guard.session.user.accountId, status: { in: ["QUOTED", "CHECKOUT_STARTED"] }, expiresAt: { gt: new Date() } }
  }) : null;
  if (quoteId && !quote) return NextResponse.json({ error: "This run quote is no longer available for checkout." }, { status: 409 });
  const kind = quote?.kind || kindFromModule(String(body.module || "irp"));
  const quantity = quote ? quote.creditsToPurchase : Math.max(1, Math.min(100, Number(body.quantity || body.orgCount || 1)));
  if (quote && quantity <= 0) return NextResponse.json({ error: "This run is already funded." }, { status: 409 });
  const price = priceForKind(kind);
  if (!price) return NextResponse.json({ error: `Missing Stripe price for ${kind}` }, { status: 500 });
  const baseUrl = env("APP_BASE_URL") || env("NEXTAUTH_URL", "http://localhost:3000");
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = quote && kind === "ASSESSMENT_CREDIT"
    ? quoteOrgNames(quote.orgNames, quote.orgCount).slice(quote.creditsApplied, quote.creditsApplied + quantity).map((name) => ({
      price_data: {
        currency: env("STRIPE_CURRENCY", "usd"),
        unit_amount: centsForKind(kind),
        product_data: { name: `IRP Gap Analysis - ${name}` }
      },
      quantity: 1
    }))
    : [{ price, quantity }];
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: quote ? `${baseUrl}/app/irp/checkout-complete?status=success&quoteId=${quote.id}` : `${baseUrl}/app?checkout=success&module=${kind}`,
      cancel_url: quote ? `${baseUrl}/app/irp/checkout-complete?status=cancelled&quoteId=${quote.id}` : `${baseUrl}/app?checkout=cancelled&module=${kind}`,
      metadata: {
        accountId: guard.session.user.accountId,
        kind,
        quantity: String(quantity),
        amountCents: String(centsForKind(kind) * quantity),
        quoteId: quote?.id || ""
      }
    });
  } catch (error) {
    console.error("Stripe checkout session creation failed", error);
    return NextResponse.json({ error: "Checkout is temporarily unavailable. Please try again shortly." }, { status: 502 });
  }
  if (quote) await prisma.runQuote.update({ where: { id: quote.id }, data: { status: "CHECKOUT_STARTED", acceptedAt: new Date(), stripeRef: session.id } });
  return NextResponse.json({ url: session.url });
}
