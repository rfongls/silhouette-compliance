import { EntKind, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class PaymentRequiredError extends Error {
  constructor(message = "Confirmed credit required") {
    super(message);
    this.name = "PaymentRequiredError";
  }
}

export async function getEntitlementBalance(accountId: string, kind: EntKind) {
  const rows = await prisma.entitlement.findMany({ where: { accountId, kind, status: "ACTIVE" } });
  return rows.reduce((sum, row) => sum + (row.balance ?? 0), 0);
}

export async function grantEntitlement(accountId: string, kind: EntKind, quantity: number, stripeRef?: string) {
  return prisma.entitlement.create({ data: { accountId, kind, balance: quantity, stripeRef, status: "ACTIVE" } });
}

export async function consumeEntitlementTx(tx: Prisma.TransactionClient | PrismaClient, accountId: string, kind: EntKind, quantity = 1) {
  if (process.env.BYPASS_PAYMENT_GATE === "true") return;
  const rows = await tx.entitlement.findMany({
    where: { accountId, kind, status: "ACTIVE", balance: { gt: 0 } },
    orderBy: { createdAt: "asc" }
  });
  let remaining = quantity;
  for (const row of rows) {
    if (remaining <= 0) break;
    const take = Math.min(row.balance ?? 0, remaining);
    await tx.entitlement.update({ where: { id: row.id }, data: { balance: { decrement: take } } });
    remaining -= take;
  }
  if (remaining > 0) throw new PaymentRequiredError();
}
