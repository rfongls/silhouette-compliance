import { createHash, randomUUID } from "node:crypto";
import { AssessStatus, EntKind, Prisma } from "@prisma/client";
import { z } from "zod";
import { sanitizeForExport } from "@/lib/sanitize";

export const IRP_REPORT_PACKAGE_FORMAT = "silhouette-irp-report-package";
export const IRP_REPORT_PACKAGE_VERSION = 1;
export const IRP_REPORT_IMPORT_MAX_BYTES = 10 * 1024 * 1024;

const individualResultSchema = z.object({
  organization_name: z.string().trim().min(1).max(300),
  compliance_score: z.coerce.number().finite().min(0).max(100),
  overall_posture: z.string().trim().min(1).max(200),
  findings: z.array(z.unknown()).max(10000),
  score_breakdown: z.record(z.unknown()),
  remediation_roadmap: z.object({ phases: z.array(z.unknown()).max(1000) }).passthrough()
}).passthrough();

const networkResultSchema = z.object({
  network_name: z.string().trim().min(1).max(300),
  compliance_score: z.coerce.number().finite().min(0).max(100),
  overall_posture: z.string().trim().min(1).max(200),
  organizations: z.array(z.unknown()).min(1).max(100),
  score_breakdown: z.record(z.unknown()),
  common_gaps: z.array(z.unknown()).max(10000)
}).passthrough();

const portablePackageSchema = z.object({
  format: z.literal(IRP_REPORT_PACKAGE_FORMAT),
  version: z.literal(IRP_REPORT_PACKAGE_VERSION),
  exportedAt: z.string().optional(),
  scope: z.enum(["self", "network"]),
  parentOrgName: z.string().trim().min(1).max(300).nullable().optional(),
  assessments: z.array(z.object({
    orgName: z.string().trim().min(1).max(300).optional(),
    result: individualResultSchema
  })).max(100),
  networkReport: networkResultSchema.nullable().optional()
}).superRefine((value, context) => {
  if (!value.assessments.length && !value.networkReport) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "The package does not contain a report." });
  }
});

export type PortableIrpReport = {
  scope: "self" | "network";
  parentOrgName: string | null;
  assessments: Array<{ orgName: string; result: Record<string, unknown> }>;
  networkReport: Record<string, unknown> | null;
};

export class ReportImportError extends Error {}

function clean<T>(value: T) {
  return sanitizeForExport(value) as T;
}

export function buildPortableIrpReport(input: PortableIrpReport) {
  return {
    format: IRP_REPORT_PACKAGE_FORMAT,
    version: IRP_REPORT_PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    scope: input.scope,
    parentOrgName: input.parentOrgName,
    assessments: input.assessments.map((assessment) => ({ orgName: assessment.orgName, result: clean(assessment.result) })),
    networkReport: input.networkReport ? clean(input.networkReport) : null
  };
}

export function parsePortableIrpReport(raw: string): PortableIrpReport {
  if (!raw.trim()) throw new ReportImportError("Choose a non-empty Silhouette report JSON file.");
  if (Buffer.byteLength(raw, "utf8") > IRP_REPORT_IMPORT_MAX_BYTES) throw new ReportImportError("The report package exceeds the 10 MB import limit.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ReportImportError("The selected file is not valid JSON.");
  }

  const portable = portablePackageSchema.safeParse(parsed);
  if (portable.success) {
    return clean({
      scope: portable.data.scope,
      parentOrgName: portable.data.parentOrgName || null,
      assessments: portable.data.assessments.map((assessment) => ({
        orgName: assessment.orgName || assessment.result.organization_name,
        result: assessment.result
      })),
      networkReport: portable.data.networkReport || null
    });
  }

  const individual = individualResultSchema.safeParse(parsed);
  if (individual.success) {
    return clean({ scope: "self", parentOrgName: null, assessments: [{ orgName: individual.data.organization_name, result: individual.data }], networkReport: null });
  }

  const network = networkResultSchema.safeParse(parsed);
  if (network.success) {
    return clean({ scope: "network", parentOrgName: network.data.network_name, assessments: [], networkReport: network.data });
  }

  throw new ReportImportError("This file is not a supported Silhouette IRP report export.");
}

function reportDigest(report: PortableIrpReport) {
  return `report-import:${createHash("sha256").update(JSON.stringify(report)).digest("hex")}`;
}

function resultText(result: Record<string, unknown>, key: string) {
  const value = result[key];
  return typeof value === "string" ? value : null;
}

export async function importPortableIrpReport(tx: Prisma.TransactionClient, accountId: string, report: PortableIrpReport) {
  const sourceDigest = reportDigest(report);
  const existing = await tx.runQuote.findFirst({
    where: { accountId, module: "irp", sourceDigest, status: "CONSUMED", reportDeletedAt: null },
    select: { id: true }
  });
  if (existing) return { quoteId: existing.id, duplicate: true };

  const assessmentIds: string[] = [];
  for (const assessment of report.assessments) {
    const result = assessment.result;
    const controlBoard = result.control_board && typeof result.control_board === "object"
      ? result.control_board as Record<string, unknown>
      : {};
    const created = await tx.assessment.create({
      data: {
        orgId: `import-${randomUUID()}`,
        orgName: assessment.orgName,
        accountId,
        industry: resultText(result, "industry") || "imported",
        status: AssessStatus.DELIVERED,
        score: Number(result.compliance_score || 0),
        posture: resultText(result, "overall_posture"),
        result: result as Prisma.InputJsonValue,
        boardCite: resultText(controlBoard, "citation"),
        modelProvider: "imported",
        promptVersion: "report-import-v1",
        documentCount: 0,
        sourceCharCount: 0,
        sourceSetHash: sourceDigest,
        progressStage: "DELIVERED",
        progressMessage: "Imported from a portable Silhouette report package.",
        progressCurrent: 1,
        progressTotal: 1,
        progressUpdatedAt: new Date(),
        reviewStatus: "IMPORTED"
      },
      select: { id: true }
    });
    assessmentIds.push(created.id);
  }

  const networkOrganizations = Array.isArray(report.networkReport?.organizations)
    ? report.networkReport.organizations as Array<Record<string, unknown>>
    : [];
  const orgNames = report.assessments.length
    ? report.assessments.map((assessment) => assessment.orgName)
    : networkOrganizations.map((organization) => String(organization.organization_name || "Organization"));
  const parentOrgName = report.parentOrgName
    || (report.scope === "network" ? resultText(report.networkReport || {}, "network_name") : null)
    || orgNames[0]
    || "Imported IRP report";

  const quote = await tx.runQuote.create({
    data: {
      accountId,
      module: "irp",
      kind: EntKind.ASSESSMENT_CREDIT,
      orgNames,
      assessmentScope: report.scope,
      parentOrgName,
      orgCount: Math.max(1, orgNames.length),
      sourceDigest,
      status: "CONSUMED",
      acceptedAt: new Date(),
      networkResult: report.networkReport ? report.networkReport as Prisma.InputJsonValue : undefined,
      networkGeneratedAt: report.networkReport ? new Date() : undefined,
      reportAssessmentIds: assessmentIds,
      reportRecipient: null,
      reportEmailStatus: "IMPORTED",
      expiresAt: new Date()
    },
    select: { id: true }
  });

  return { quoteId: quote.id, duplicate: false };
}
