import { INDUSTRY_STANDARDS } from "@/lib/analysis/standards";

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

export function normalizeControlImport(value: unknown) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  const controls = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && "controls" in parsed ? (parsed as any).controls : null);
  if (!Array.isArray(controls)) throw new Error("Control import must be a JSON array or an object with a controls array.");
  const normalized = controls
    .map((control, index) => {
      if (!control || typeof control !== "object") return null;
      const row = control as Record<string, unknown>;
      const id = String(row.id || row.control_id || row.controlId || row.requirement_id || row.key || `control-${index + 1}`).trim();
      const requirement = String(row.requirement || row.description || row.text || row.control || "").trim();
      if (!id || !requirement) return null;
      return {
        id,
        standard: String(row.standard || row.framework || "").trim(),
        category: String(row.category || row.family || "").trim(),
        requirement,
        risk_level: String(row.risk_level || row.riskLevel || row.priority || "Medium").trim()
      };
    })
    .filter(Boolean);
  if (!normalized.length) throw new Error("No valid controls found. Each control needs an id/control_id and requirement/description field.");
  return normalized;
}
