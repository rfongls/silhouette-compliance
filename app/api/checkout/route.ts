import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { centsForKind, kindFromModule, priceForKind, stripe } from "@/lib/stripe";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const body = await req.json().catch(() => ({}));
  const kind = kindFromModule(String(body.module || "irp"));
  const quantity = Math.max(1, Math.min(100, Number(body.quantity || body.orgCount || 1)));
  const price = priceForKind(kind);
  if (!price) return NextResponse.json({ error: `Missing Stripe price for ${kind}` }, { status: 500 });
  const baseUrl = env("APP_BASE_URL") || env("NEXTAUTH_URL", "http://localhost:3000");
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price, quantity }],
    success_url: `${baseUrl}/app?checkout=success&module=${kind}`,
    cancel_url: `${baseUrl}/app?checkout=cancelled&module=${kind}`,
    metadata: { accountId: guard.session.user.accountId, kind, quantity: String(quantity), amountCents: String(centsForKind(kind) * quantity) }
  });
  return NextResponse.json({ url: session.url });
}
