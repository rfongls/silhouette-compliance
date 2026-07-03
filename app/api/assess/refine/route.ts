import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { callAnthropicJson } from "@/lib/analysis/anthropic";
import { buildSystemPrompt } from "@/lib/analysis/prompts";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const { assessmentId, note } = await req.json();
  const assessment = await prisma.assessment.findFirst({ where: { id: String(assessmentId), accountId: guard.session.user.accountId } });
  if (!assessment?.result) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  if (assessment.refineUsed) return NextResponse.json({ error: "Refinement already used" }, { status: 409 });
  const prompt = `A prior analysis produced this JSON result. Apply the reviewer correction faithfully, keep what is correct, recompute counts and score, and return the same schema. No em dashes.\n\nREVIEWER CORRECTION:\n${String(note || "").slice(0, 4000)}\n\nPRIOR RESULT JSON:\n${JSON.stringify(assessment.result).slice(0, 60000)}`;
  const { json, usage } = await callAnthropicJson(buildSystemPrompt({ industry: assessment.industry, standards: [] }), prompt);
  const updated = await prisma.assessment.update({ where: { id: assessment.id }, data: { result: json as any, refineUsed: true, score: Number((json as any).compliance_score || assessment.score), posture: String((json as any).overall_posture || assessment.posture) } });
  await prisma.usageLedger.create({ data: { accountId: guard.session.user.accountId, kind: "refine", status: "succeeded", assessmentId: assessment.id, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } }).catch(() => undefined);
  return NextResponse.json({ result: updated.result });
}
