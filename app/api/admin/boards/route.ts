import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { normalizeControlImport, validateControlBoardForPublication } from "@/lib/control-boards";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const guard = await requireSession("admin");
  if ("response" in guard) return guard.response;
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const board = await prisma.controlBoard.findUnique({ where: { id } });
    if (!board) return NextResponse.json({ error: "Control board not found." }, { status: 404 });
    return NextResponse.json({ board });
  }
  const boards = await prisma.controlBoard.findMany({ orderBy: [{ industry: "asc" }, { standardKey: "asc" }, { version: "desc" }] });
  return NextResponse.json({ boards });
}

export async function PATCH(req: Request) {
  const guard = await requireSession("admin");
  if ("response" in guard) return guard.response;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const board = await prisma.controlBoard.findUnique({ where: { id } });
  if (!board || board.status !== "DRAFT") return NextResponse.json({ error: "Draft control board not found." }, { status: 404 });
  try {
    const controls = validateControlBoardForPublication(
      normalizeControlImport(body.controlsJson ?? body.controls, board.standardKey).map((control) => ({ ...control, standard: board.standardKey }))
    );
    const updated = await prisma.controlBoard.update({
      where: { id },
      data: { controls, controlCount: controls.length }
    });
    return NextResponse.json({ board: updated });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
