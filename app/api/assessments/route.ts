import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const assessments = await prisma.assessment.findMany({ where: { accountId: guard.session.user.accountId }, orderBy: { createdAt: "desc" }, select: { id: true, orgId: true, orgName: true, industry: true, createdAt: true, score: true, posture: true, status: true, boardCite: true, refineUsed: true } });
  return NextResponse.json({ assessments });
}
