import { INDUSTRY_STANDARDS } from "@/lib/analysis/standards";
import { prisma } from "@/lib/prisma";
import { humanizeControlText } from "@/lib/sanitize";

export type NormalizedControl = {
  id: string;
  standard: string;
  category: string;
  requirement: string;
  risk_level: string;
  source_url?: string;
  source_section?: string;
  source_quote?: string;
  extraction_batch?: string;
};

const CONTROL_PRIORITIES = new Set(["Critical", "High", "Medium", "Low"]);

export function validateControlBoardForPublication(controls: NormalizedControl[]) {
  for (const control of controls) {
    if (!control.category.trim()) throw new Error(`Control ${control.id} needs a category before publication.`);
    if (!CONTROL_PRIORITIES.has(control.risk_level)) {
      throw new Error(`Control ${control.id} has invalid priority ${control.risk_level || "(blank)"}. Use Critical, High, Medium, or Low.`);
    }
  }
  return controls;
}

export function standardBelongsToIndustry(industry: string, standardKey: string) {
  return Boolean(INDUSTRY_STANDARDS[industry]?.standards.some((standard) => standard.key === standardKey));
}

export function standardsByIndustry() {
  return Object.fromEntries(
    Object.entries(INDUSTRY_STANDARDS).map(([industry, def]) => [
      industry,
      def.standards.map((standard) => ({ key: standard.key, label: standard.label, default: standard.default }))
    ])
  );
}

export function normalizeControlImport(value: unknown, fallbackStandard = ""): NormalizedControl[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  const controls = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && "controls" in parsed ? (parsed as any).controls : null);
  if (!Array.isArray(controls)) throw new Error("Control import must be a JSON array or an object with a controls array.");
  const normalized = controls
    .map((control, index): NormalizedControl | null => {
      if (!control || typeof control !== "object") return null;
      const row = control as Record<string, unknown>;
      const id = String(row.id || row.control_id || row.controlId || row.requirement_id || row.key || `control-${index + 1}`).trim();
      const requirement = humanizeControlText(row.requirement || row.description || row.text || row.control || "");
      if (!id || !requirement) return null;
      const optional = (key: string) => {
        const value = String(row[key] || "").trim();
        return value || undefined;
      };
      return {
        id,
        standard: String(row.standard || row.framework || fallbackStandard).trim() || fallbackStandard,
        category: String(row.category || row.family || "").trim(),
        requirement,
        risk_level: String(row.risk_level || row.riskLevel || row.priority || "Medium").trim(),
        source_url: optional("source_url"),
        source_section: optional("source_section"),
        source_quote: optional("source_quote"),
        extraction_batch: optional("extraction_batch")
      };
    })
    .filter((control): control is NormalizedControl => control !== null);
  if (!normalized.length) throw new Error("No valid controls found. Each control needs an id/control_id and requirement/description field.");
  return normalized;
}

export async function loadPublishedControlSet(industry: string, standards: string[]) {
  const boards = await prisma.controlBoard.findMany({
    where: { industry, standardKey: { in: standards }, status: "PUBLISHED" },
    orderBy: [{ standardKey: "asc" }, { version: "desc" }]
  });
  const byStandard = new Map<string, (typeof boards)[number]>();
  for (const board of boards) {
    if (!byStandard.has(board.standardKey)) byStandard.set(board.standardKey, board);
  }
  const missing = standards.filter((standard) => !byStandard.has(standard));
  if (missing.length) throw new Error(`Missing published control boards: ${missing.join(", ")}`);

  const selectedBoards = standards.map((standard) => byStandard.get(standard)!);
  const unreviewed = selectedBoards.filter((board) => !board.sourceTitle || !board.sourceVersion || !board.sourceHash || !board.reviewedBy || !board.reviewedAt);
  if (unreviewed.length) {
    throw new Error(`Published control boards are missing source or reviewer provenance: ${unreviewed.map((board) => board.standardKey).join(", ")}`);
  }
  const controls = selectedBoards.flatMap((board) =>
    validateControlBoardForPublication(
      normalizeControlImport(board.controls, board.standardKey).map((control) => ({ ...control, standard: board.standardKey }))
    )
  );
  if (!controls.length) throw new Error("Published control boards do not contain valid controls.");

  return {
    boards: selectedBoards,
    controls,
    cite: selectedBoards.map((board) => `${board.standardKey} v${board.version}`).join("; "),
    snapshot: selectedBoards.map((board) => ({
      id: board.id,
      standardKey: board.standardKey,
      version: board.version,
      sourceTitle: board.sourceTitle,
      sourceVersion: board.sourceVersion,
      sourceHash: board.sourceHash,
      publishedAt: board.publishedAt
    }))
  };
}
