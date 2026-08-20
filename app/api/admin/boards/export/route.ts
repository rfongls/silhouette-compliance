import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { SCORING_POLICY_VERSION } from "@/lib/analysis/scoring";
import { CONTROL_BOARD_BUILD_VERSION } from "@/lib/official-control-sources";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token || token !== process.env.ADMIN_SNAPSHOT_TOKEN) {
    const guard = await requireSession("admin");
    if ("response" in guard) return guard.response;
  }
  const boards = await prisma.controlBoard.findMany({ where: { status: "PUBLISHED" }, orderBy: [{ industry: "asc" }, { standardKey: "asc" }] });
  return NextResponse.json({
    kind: "silhouette-control-board-backup",
    schemaVersion: 1,
    scoringPolicyVersion: SCORING_POLICY_VERSION,
    controlBoardBuildVersion: CONTROL_BOARD_BUILD_VERSION,
    exportedAt: new Date().toISOString(),
    boards
  }, {
    headers: { "content-disposition": `attachment; filename="silhouette-control-boards-${new Date().toISOString().slice(0, 10)}.json"` }
  });
}
