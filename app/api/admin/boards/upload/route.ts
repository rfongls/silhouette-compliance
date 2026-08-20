import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { normalizeControlImport, standardBelongsToIndustry, validateControlBoardForPublication } from "@/lib/control-boards";
import { prisma } from "@/lib/prisma";

function sourceUrls(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : String(value || "").split(/[\r\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function parseJson(value: unknown) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function restoreBackup(value: unknown) {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== "object" || (parsed as any).kind !== "silhouette-control-board-backup" || (parsed as any).schemaVersion !== 1) {
    throw new Error("Select a Silhouette control-board backup with schema version 1.");
  }
  const rows = (parsed as any).boards;
  if (!Array.isArray(rows) || !rows.length) throw new Error("The control-board backup does not contain any boards.");
  if (rows.length > 100) throw new Error("A control-board backup cannot contain more than 100 boards.");

  const prepared = rows.map((row: any) => {
    const industry = String(row?.industry || "");
    const standardKey = String(row?.standardKey || "");
    if (!standardBelongsToIndustry(industry, standardKey)) throw new Error(`The backup contains an invalid domain and standard pair: ${industry}/${standardKey}.`);
    const controls = validateControlBoardForPublication(normalizeControlImport(row?.controls, standardKey).map((control) => ({ ...control, standard: standardKey })));
    const urls = sourceUrls(row?.sourceUrls);
    const sourceTitle = String(row?.sourceTitle || "").trim();
    const sourceVersion = String(row?.sourceVersion || "").trim();
    if (!sourceTitle || !sourceVersion || !urls.length) throw new Error(`The backup provenance is incomplete for ${industry}/${standardKey}.`);
    return {
      industry,
      standardKey,
      controls,
      sourceTitle,
      sourceVersion,
      sourceUrls: urls,
      sourceHash: String(row?.sourceHash || "").trim() || crypto.createHash("sha256").update(JSON.stringify(controls)).digest("hex"),
      retrievedAt: row?.retrievedAt ? new Date(row.retrievedAt) : new Date(),
      backupVersion: Number(row?.version || 0)
    };
  });
  const uniqueKeys = new Set(prepared.map((row) => `${row.industry}:${row.standardKey}`));
  if (uniqueKeys.size !== prepared.length) throw new Error("The backup contains more than one published board for the same domain and standard.");
  if (prepared.some((row) => Number.isNaN(row.retrievedAt.getTime()))) throw new Error("The backup contains an invalid source retrieval date.");

  const existing = await prisma.controlBoard.findMany({
    where: { OR: prepared.map((row) => ({ industry: row.industry, standardKey: row.standardKey })) },
    select: { industry: true, standardKey: true, version: true }
  });
  const latestVersions = new Map<string, number>();
  for (const board of existing) {
    const key = `${board.industry}:${board.standardKey}`;
    latestVersions.set(key, Math.max(latestVersions.get(key) || 0, board.version));
  }
  return prisma.$transaction(prepared.map((row) => {
    const key = `${row.industry}:${row.standardKey}`;
    return prisma.controlBoard.create({
      data: {
        industry: row.industry,
        standardKey: row.standardKey,
        version: (latestVersions.get(key) || 0) + 1,
        status: "DRAFT",
        controls: row.controls,
        controlCount: row.controls.length,
        sourceTitle: row.sourceTitle,
        sourceVersion: row.sourceVersion,
        sourceUrls: row.sourceUrls,
        sourceHash: row.sourceHash,
        retrievedAt: row.retrievedAt,
        reviewNotes: `Restored from exported board version ${row.backupVersion || "unknown"}. Admin review and publication are required before scoring.`
      }
    });
  }));
}

export async function POST(req: Request) {
  const guard = await requireSession("admin");
  if ("response" in guard) return guard.response;
  const body = await req.json().catch(() => ({}));

  if (body.mode === "restore") {
    try {
      const boards = await restoreBackup(body.backupJson);
      return NextResponse.json({ boards });
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  const industry = String(body.industry || "");
  const standardKey = String(body.standardKey || "");
  if (!standardBelongsToIndustry(industry, standardKey)) return NextResponse.json({ error: "Selected standard is not configured for this domain." }, { status: 400 });

  let controls: ReturnType<typeof normalizeControlImport>;
  try {
    controls = validateControlBoardForPublication(normalizeControlImport(body.controlsJson ?? body.controls, standardKey).map((control) => ({ ...control, standard: standardKey })));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  const sourceTitle = String(body.sourceTitle || "").trim();
  const sourceVersion = String(body.sourceVersion || "").trim();
  const urls = sourceUrls(body.sourceUrls);
  const reviewNotes = String(body.reviewNotes || "").trim();
  if (!sourceTitle || !sourceVersion || !urls.length || !reviewNotes) {
    return NextResponse.json({ error: "Source title, source version, at least one source URL, and review notes are required." }, { status: 400 });
  }

  const latest = await prisma.controlBoard.findFirst({ where: { industry, standardKey }, orderBy: { version: "desc" } });
  const board = await prisma.controlBoard.create({
    data: {
      industry,
      standardKey,
      version: (latest?.version || 0) + 1,
      status: "DRAFT",
      controls,
      controlCount: controls.length,
      sourceTitle,
      sourceVersion,
      sourceUrls: urls,
      sourceHash: crypto.createHash("sha256").update(JSON.stringify(controls)).digest("hex"),
      retrievedAt: new Date(),
      reviewNotes
    }
  });
  return NextResponse.json({ board });
}
