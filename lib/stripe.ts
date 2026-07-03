import Stripe from "stripe";
import { EntKind } from "@prisma/client";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", { apiVersion: "2024-06-20" });

export function kindFromModule(module: string): EntKind {
  if (module === "sra") return "SRA_CREDIT";
  if (module === "proposal") return "PROPOSAL_CREDIT";
  return "ASSESSMENT_CREDIT";
}

export function priceForKind(kind: EntKind) {
  if (kind === "SRA_CREDIT") return process.env.STRIPE_PRICE_SRA_ENGAGEMENT;
  if (kind === "PROPOSAL_CREDIT") return process.env.STRIPE_PRICE_PROPOSAL;
  return process.env.STRIPE_PRICE_IRP_ASSESSMENT;
}

export function centsForKind(kind: EntKind) {
  if (kind === "SRA_CREDIT") return Number(process.env.SRA_RATE_CENTS || 150000);
  if (kind === "PROPOSAL_CREDIT") return Number(process.env.PROPOSAL_RATE_CENTS || 9900);
  return Number(process.env.ASSESSMENT_RATE_CENTS || 25000);
}
