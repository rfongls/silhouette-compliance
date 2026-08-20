import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const guard = await requireSession("admin");
  if ("response" in guard) return guard.response;
  const { id, reviewConfirmed, reviewNotes } = await req.json();
  if (reviewConfirmed !== true) return NextResponse.json({ error: "Reviewer confirmation is required before setting a base control." }, { status: 400 });
  if (!String(reviewNotes || "").trim()) return NextResponse.json({ error: "Reviewer notes are required before setting a base control." }, { status: 400 });
  const draft = await prisma.controlBoard.findUnique({ where: { id: String(id) } });
  if (!draft || draft.status !== "DRAFT") return NextResponse.json({ error: "Draft board not found" }, { status: 404 });
  const sourceUrls = Array.isArray(draft.sourceUrls) ? draft.sourceUrls : [];
  if (!draft.sourceTitle || !draft.sourceVersion || !draft.sourceHash || !sourceUrls.length) {
    return NextResponse.json({ error: "Board provenance is incomplete. Add source title, version, URL, and source hash before publishing." }, { status: 409 });
  }
  await prisma.$transaction([
    prisma.controlBoard.updateMany({ where: { industry: draft.industry, standardKey: draft.standardKey, status: "PUBLISHED" }, data: { status: "ARCHIVED" } }),
    prisma.controlBoard.update({ where: { id: draft.id }, data: { status: "PUBLISHED", publishedAt: new Date(), reviewedBy: guard.session.user.email || guard.session.user.id, reviewedAt: new Date(), reviewNotes: String(reviewNotes).trim() } })
  ]);
  return NextResponse.json({ ok: true });
}
