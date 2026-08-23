import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { sendIrpCompletionEmail } from "@/lib/report-email";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const quote = await prisma.runQuote.findFirst({ where: { id: params.id, accountId: guard.session.user.accountId, module: "irp" } });
  if (!quote) return NextResponse.json({ error: "Run quote not found" }, { status: 404 });
  if (!quote.reportRecipient && guard.session.user.email) {
    await prisma.runQuote.update({ where: { id: quote.id }, data: { reportRecipient: guard.session.user.email, reportEmailStatus: "PENDING", reportEmailError: null } });
  }
  const delivery = await sendIrpCompletionEmail(quote.id);
  return NextResponse.json({ delivery });
}
