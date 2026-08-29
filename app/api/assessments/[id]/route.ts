import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;

  const { id } = params;
  const result = await prisma.assessment.updateMany({
    where: {
      id,
      accountId: guard.session.user.accountId,
      status: { in: ["FAILED", "REFUNDED"] },
      recoveryDismissedAt: null
    },
    data: { recoveryDismissedAt: new Date() }
  });

  if (!result.count) {
    return NextResponse.json({ error: "Failed assessment was not found or was already canceled." }, { status: 404 });
  }

  return NextResponse.json({ dismissed: true });
}
