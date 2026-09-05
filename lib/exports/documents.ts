import PDFDocument from "pdfkit";
import PptxGenJS from "pptxgenjs";
import type { ReportProfile } from "@/lib/report-profile";

type ReportExportOptions = { profile?: ReportProfile };

function internalReport(options?: ReportExportOptions) {
  return options?.profile === "internal";
}
import { standardLabel } from "@/lib/analysis/standards";
import { limitRoadmapActions, resolveRoadmapItem } from "@/lib/analysis/remediation";
import { capabilityReadinessSummary, capabilityReadinessText, NETWORK_SCORING_METHODOLOGY, readinessProfile, SCORING_METHODOLOGY } from "@/lib/report-readiness";
import { humanizeControlText, noEmDash, sanitizeForExport } from "@/lib/sanitize";

const COLORS = {
  ink: "#17131f",
  muted: "#6b7280",
  line: "#ddd8e8",
  purple: "#8b5cf6",
  purpleSoft: "#f4efff",
  dark: "#110f1d",
  white: "#ffffff",
  critical: "#b91c1c",
  high: "#b45309",
  medium: "#1d4ed8",
  low: "#047857"
} as const;

type PdfDoc = PDFKit.PDFDocument;
type TableColumn = { label: string; width: number; value: (row: any) => unknown };
type PdfNavigationEntry = { title: string; destination: string; pageNumber: number };
type PdfNavigation = { tocPageIndex: number; entries: PdfNavigationEntry[] };

function clean(value: unknown) {
  return noEmDash(String(value ?? ""));
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function priorityColor(value: unknown) {
  const priority = clean(value).toLocaleLowerCase();
  if (priority === "critical") return COLORS.critical;
  if (priority === "high") return COLORS.high;
  if (priority === "low") return COLORS.low;
  return COLORS.medium;
}

function scoreColor(score: number) {
  if (score >= 85) return COLORS.low;
  if (score >= 70) return COLORS.medium;
  if (score >= 50) return COLORS.high;
  return COLORS.critical;
}

function createPdf(title: string, draw: (doc: PdfDoc) => void, preparedBy = "Silhouette LLC") {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 46, right: 46, bottom: 76, left: 46 },
      bufferPages: true,
      info: { Title: clean(title), Author: clean(preparedBy), Subject: "Incident Response Plan Gap Analysis" }
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    draw(doc);
    addPdfFooters(doc, preparedBy);
    doc.end();
  });
}

function addPdfFooters(doc: PdfDoc, preparedBy: string) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    if (index === 0) continue;
    const previousBottomMargin = doc.page.margins.bottom;
    const previousX = doc.x;
    const previousY = doc.y;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 31;
    doc.save().strokeColor(COLORS.line).lineWidth(0.5).moveTo(46, y - 7).lineTo(doc.page.width - 46, y - 7).stroke();
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted)
      .text(`${clean(preparedBy)} | Incident Response Plan Analysis`, 46, y, { width: 360, height: 10, lineBreak: false })
      .text(`${index + 1} of ${range.count}`, doc.page.width - 110, y, { width: 64, height: 10, align: "right", lineBreak: false });
    doc.restore();
    doc.page.margins.bottom = previousBottomMargin;
    doc.x = previousX;
    doc.y = previousY;
  }
}

function cover(doc: PdfDoc, title: string, subtitle: string, preparedBy: string) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.dark);
  doc.fillColor(COLORS.white).font("Times-Bold").fontSize(34).text(clean(title), 54, 220, { width: doc.page.width - 108, lineGap: 5 });
  doc.rect(54, doc.y + 20, 330, 3).fill(COLORS.purple);
  doc.fillColor("#d7c4ff").font("Helvetica").fontSize(13).text(clean(subtitle), 54, doc.y + 30, { width: 430, lineGap: 4 });
  doc.fillColor("#a99bbc").font("Helvetica").fontSize(9).text(`Prepared by ${clean(preparedBy)}`, 54, doc.y + 14, { width: 430, lineGap: 3 });
}

function currentPageIndex(doc: PdfDoc) {
  const range = doc.bufferedPageRange();
  return range.start + range.count - 1;
}

function startPdfNavigation(doc: PdfDoc): PdfNavigation {
  doc.addPage();
  doc.outline.addItem("Table of Contents");
  return { tocPageIndex: currentPageIndex(doc), entries: [] };
}

function renderPdfNavigation(doc: PdfDoc, navigation: PdfNavigation) {
  const finalPageIndex = currentPageIndex(doc);
  doc.switchToPage(navigation.tocPageIndex);
  doc.x = 46;
  doc.y = 46;
  doc.fillColor(COLORS.purple).font("Times-Bold").fontSize(25).text("Table of Contents");
  doc.moveDown(0.3).fillColor(COLORS.muted).font("Helvetica").fontSize(9)
    .text("Select a section to move directly to that part of the report.");
  doc.moveDown(1.25);

  navigation.entries.forEach((entry, index) => {
    const top = doc.y;
    doc.fillColor(COLORS.purple).font("Helvetica-Bold").fontSize(8)
      .text(String(index + 1).padStart(2, "0"), 46, top + 2, { width: 28, goTo: entry.destination });
    doc.fillColor(COLORS.ink).font("Times-Bold").fontSize(14)
      .text(clean(entry.title), 82, top, { width: 390, goTo: entry.destination });
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(9)
      .text(String(entry.pageNumber), doc.page.width - 86, top + 3, { width: 40, align: "right", goTo: entry.destination });
    doc.strokeColor(COLORS.line).lineWidth(0.5)
      .moveTo(82, top + 28).lineTo(doc.page.width - 46, top + 28).stroke();
    doc.x = 46;
    doc.y = top + 43;
  });

  doc.switchToPage(finalPageIndex);
  doc.x = 46;
}

function newSection(doc: PdfDoc, title: string, subtitle?: string, navigation?: PdfNavigation) {
  doc.addPage();
  const destination = `report-section-${(navigation?.entries.length || 0) + 1}`;
  if (navigation) {
    navigation.entries.push({ title: clean(title), destination, pageNumber: currentPageIndex(doc) + 1 });
    doc.outline.addItem(clean(title));
    doc.addNamedDestination(destination, "Fit");
  }
  doc.fillColor(COLORS.purple).font("Times-Bold").fontSize(23).text(clean(title));
  if (subtitle) doc.moveDown(0.25).fillColor(COLORS.muted).font("Helvetica").fontSize(9).text(clean(subtitle), { lineGap: 2 });
  doc.moveDown(0.75);
}

function heading(doc: PdfDoc, text: string) {
  const topGap = 14;
  ensureSpace(doc, 34 + topGap);
  doc.x = 46;
  doc.y += topGap;
  doc.fillColor(COLORS.ink).font("Times-Bold").fontSize(15).text(clean(text));
  doc.y += 6;
}

function body(doc: PdfDoc, text: unknown, options: PDFKit.Mixins.TextOptions = {}) {
  doc.x = 46;
  doc.fillColor(COLORS.ink).font("Helvetica").fontSize(9).text(clean(text), { lineGap: 3, ...options });
  doc.y += 5;
}

function ensureSpace(doc: PdfDoc, height: number) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom - 8) doc.addPage();
}

function metricCards(doc: PdfDoc, cards: Array<{ label: string; value: string; color?: string }>) {
  const gap = 10;
  const width = (doc.page.width - 92 - gap * (cards.length - 1)) / cards.length;
  const top = doc.y;
  cards.forEach((card, index) => {
    const x = 46 + index * (width + gap);
    const value = clean(card.value);
    const valueSize = value.length > 18 ? 11 : value.length > 13 ? 13 : value.length > 9 ? 16 : 22;
    doc.roundedRect(x, top, width, 72, 5).fillAndStroke("#faf9fc", COLORS.line);
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7).text(clean(card.label).toUpperCase(), x + 11, top + 12, { width: width - 22 });
    doc.fillColor(card.color || COLORS.ink).font("Helvetica-Bold").fontSize(valueSize).text(value, x + 11, top + 32, { width: width - 22, height: 27, ellipsis: true });
  });
  doc.x = 46;
  doc.y = top + 90;
}

function renderTable(doc: PdfDoc, columns: TableColumn[], rows: any[], fontSize = 7.5) {
  const left = 46;
  const headerHeight = 27;
  const padding = 5;

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(left, y, columns.reduce((sum, column) => sum + column.width, 0), headerHeight).fill(COLORS.purpleSoft);
    let x = left;
    columns.forEach((column) => {
      doc.fillColor("#5b4b75").font("Helvetica-Bold").fontSize(6.5).text(clean(column.label).toUpperCase(), x + padding, y + 8, { width: column.width - padding * 2, lineBreak: false });
      x += column.width;
    });
    doc.x = left;
    doc.y = y + headerHeight;
  };

  drawHeader();
  rows.forEach((row) => {
    const values = columns.map((column) => clean(column.value(row)) || "-");
    doc.font("Helvetica").fontSize(fontSize);
    const rowHeight = Math.max(22, ...values.map((value, index) => doc.heightOfString(value, { width: columns[index].width - padding * 2, lineGap: 1 }) + padding * 2));
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - 8) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    let x = left;
    columns.forEach((column, index) => {
      doc.fillColor(COLORS.ink).font("Helvetica").fontSize(fontSize).text(values[index], x + padding, y + padding, { width: column.width - padding * 2, lineGap: 1 });
      x += column.width;
    });
    doc.strokeColor(COLORS.line).lineWidth(0.4).moveTo(left, y + rowHeight).lineTo(x, y + rowHeight).stroke();
    doc.x = left;
    doc.y = y + rowHeight;
  });
  doc.x = left;
  doc.y += 10;
}

function renderAssessmentBasis(doc: PdfDoc, report: any, standards: Array<[string, any]>) {
  const snapshots = Array.isArray(report.control_board?.snapshot) ? report.control_board.snapshot : [];
  const snapshotsByStandard = new Map(
    snapshots.map((snapshot: any) => [clean(snapshot.standardKey).toLocaleLowerCase(), snapshot])
  );
  const boardRows = standards.map(([standard, coverage]) => {
    const snapshot = snapshotsByStandard.get(clean(standard).toLocaleLowerCase()) as any;
    return {
      standard,
      version: snapshot?.version ? `v${clean(snapshot.version)}` : "Not recorded",
      source: snapshot?.sourceTitle || "Not recorded",
      sourceVersion: snapshot?.sourceVersion || "Not recorded",
      controlsReviewed: number(coverage?.controls_reviewed)
    };
  });

  heading(doc, "Assessment Basis");
  doc.fillColor(COLORS.purple).font("Helvetica-Bold").fontSize(7).text("CONTROL BOARD INVENTORY", { width: 500 });
  doc.moveDown(0.35);
  renderTable(doc, [
    { label: "Publication", width: 150, value: (row) => standardLabel(row.standard) },
    { label: "Board", width: 55, value: (row) => row.version },
    { label: "Official source", width: 205, value: (row) => `${row.source}\n${row.sourceVersion}` },
    { label: "Controls reviewed", width: 90, value: (row) => row.controlsReviewed }
  ], boardRows);

  ensureSpace(doc, 52);
  doc.moveDown(0.65).fillColor(COLORS.purple).font("Helvetica-Bold").fontSize(7).text("SCORING FRAMEWORK", { width: 500 });
  doc.moveDown(0.35);
  renderTable(doc, [
    { label: "Assessment rule", width: 135, value: (row) => row.rule },
    { label: "How it is applied", width: 365, value: (row) => row.application }
  ], [
    { rule: "Evidence rating", application: "Yes = 1 point; Partial = 0.5 points; No = 0 points." },
    { rule: "Priority weighting", application: "Critical = 4; High = 3; Medium = 2; Low = 1." },
    { rule: "Capability scoring", application: "Applicable controls are grouped into curated IRP capability buckets. Bucket point budgets normalize the readiness index to 100." },
    { rule: "Essential controls", application: "A missing essential control caps its capability bucket at 50. A partially evidenced essential control caps it at 75." },
    { rule: "Standards alignment", application: "Each publication remains a separate alignment view and is not counted again in the overall readiness calculation." },
    { rule: "Interpretation", application: SCORING_METHODOLOGY }
  ], 7.2);
}

function renderRoadmap(doc: PdfDoc, phases: any[], findings: any[] = []) {
  limitRoadmapActions(phases).forEach((phase, phaseIndex) => {
    const color = COLORS.purple;
    const items = Array.isArray(phase.items) ? phase.items : [];
    ensureSpace(doc, 54);
    const top = doc.y;
    doc.roundedRect(46, top, doc.page.width - 92, 39, 5).fillAndStroke(COLORS.purpleSoft, COLORS.line);
    doc.fillColor(color).font("Helvetica-Bold").fontSize(7).text(`PHASE ${String(phaseIndex + 1).padStart(2, "0")}`, 60, top + 16, { width: 54 });
    doc.fillColor(COLORS.ink).font("Times-Bold").fontSize(13).text(clean(phase.name), 122, top + 8, { width: 262 });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5).text(clean(phase.timeframe), 122, top + 24, { width: 262 });
    doc.fillColor(color).font("Helvetica-Bold").fontSize(7).text("IMPLEMENTATION HORIZON", doc.page.width - 172, top + 16, { width: 120, align: "right" });
    doc.x = 46;
    doc.y = top + 47;

    items.forEach((rawItem: any, itemIndex: number) => {
      const item = resolveRoadmapItem(rawItem, findings);
      doc.font("Helvetica-Bold").fontSize(9);
      const title = clean(item.title);
      const detailRows = [
        ["IMPLEMENT", clean(item.implementation)],
        ["DELIVERABLE", clean(item.deliverable)],
        ["VALIDATE", clean(item.validation)]
      ];
      const references = Array.isArray(item.references) ? item.references.map(clean).join(" | ") : "";
      const titleHeight = doc.heightOfString(title, { width: 455, lineGap: 1 });
      doc.font("Helvetica").fontSize(8);
      const detailsHeight = detailRows.reduce((height, row) => height + Math.max(11, doc.heightOfString(row[1], { width: 375, lineGap: 2 })) + 4, 0);
      const referencesHeight = references ? 13 : 0;
      const height = Math.max(76, 22 + titleHeight + detailsHeight + referencesHeight);
      ensureSpace(doc, height + 5);
      const y = doc.y;
      doc.roundedRect(46, y, doc.page.width - 92, height, 4).strokeColor(COLORS.line).stroke();
      doc.fillColor(color).font("Helvetica-Bold").fontSize(7).text(String(item.number || itemIndex + 1).padStart(2, "0"), 58, y + 12, { width: 16, align: "left" });
      doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(9).text(title, 82, y + 9, { width: 455, lineGap: 1 });
      let detailY = y + 14 + titleHeight;
      detailRows.forEach(([label, value]) => {
        doc.fillColor(COLORS.purple).font("Helvetica-Bold").fontSize(6.5).text(label, 82, detailY + 1, { width: 72 });
        doc.fillColor("#374151").font("Helvetica").fontSize(8).text(value, 156, detailY, { width: 381, lineGap: 2 });
        detailY += Math.max(11, doc.heightOfString(value, { width: 381, lineGap: 2 })) + 4;
      });
      if (references) doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(6.5).text(`MAPPED CONTROLS  ${references}`, 82, y + height - 11, { width: 455 });
      doc.x = 46;
      doc.y = y + height + 6;
    });
    doc.moveDown(0.35);
  });
}

function standardNames(row: any) {
  const values = Array.isArray(row.standards) && row.standards.length
    ? row.standards
    : row.standard
      ? [row.standard]
      : [];
  return values.map((value: string) => standardLabel(value)).join(", ") || "Not recorded";
}

function renderFindings(doc: PdfDoc, findings: any[]) {
  findings.forEach((finding, index) => {
    ensureSpace(doc, 76);
    const top = doc.y;
    const priority = clean(finding.risk_level || "Medium");
    const status = clean(finding.status || "Not evidenced");
    const capability = clean(finding.capability || finding.control_name || finding.control_id || "Capability finding");
    const controlIds = Array.isArray(finding.control_ids) && finding.control_ids.length
      ? finding.control_ids.map(clean).join(", ")
      : clean(finding.control_id || "Not recorded");

    doc.strokeColor(COLORS.line).lineWidth(0.6).moveTo(46, top).lineTo(doc.page.width - 46, top).stroke();
    doc.fillColor(priorityColor(priority)).font("Helvetica-Bold").fontSize(7.5)
      .text(priority.toUpperCase(), 46, top + 10, { width: 70, lineBreak: false });
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7.5)
      .text(status.toUpperCase(), 118, top + 10, { width: 90, lineBreak: false });
    doc.fillColor(COLORS.ink).font("Times-Bold").fontSize(12)
      .text(`${index + 1}. ${capability}`, 46, top + 26, { width: 500, lineGap: 1 });
    doc.x = 46;
    doc.moveDown(0.25);
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(6.8)
      .text(`CONTROLS  ${controlIds}   |   STANDARDS  ${standardNames(finding)}`, { width: 500, lineGap: 1 });
    doc.moveDown(0.35);
    body(doc, finding.finding || finding.requirement || "No finding narrative was recorded.", { width: 500, lineGap: 2 });
    doc.moveDown(0.7);
  });
}

function renderControlAppendix(doc: PdfDoc, controls: any[]) {
  controls.forEach((control, index) => {
    ensureSpace(doc, 94);
    const top = doc.y;
    const controlId = clean(control.control_id || control.id || `Control ${index + 1}`);
    const capability = clean(control.bucket_label || control.capability || control.category || "Uncategorized capability");
    const status = clean(control.status || "Not recorded");
    const priority = clean(control.risk_level || "Medium");

    doc.strokeColor(COLORS.line).lineWidth(0.6).moveTo(46, top).lineTo(doc.page.width - 46, top).stroke();
    doc.fillColor(COLORS.ink).font("Times-Bold").fontSize(11.5)
      .text(`${controlId}  |  ${capability}`, 46, top + 10, { width: 500, lineGap: 1 });
    doc.x = 46;
    doc.moveDown(0.2);
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(6.8)
      .text(`STANDARD  ${standardNames(control)}   |   STATUS  ${status.toUpperCase()}   |   PRIORITY  ${priority.toUpperCase()}`, { width: 500, lineGap: 1 });
    doc.moveDown(0.4);
    doc.fillColor(COLORS.purple).font("Helvetica-Bold").fontSize(7).text("REQUIREMENT", { width: 500 });
    body(doc, humanizeControlText(control.requirement) || "No requirement text was recorded.", { width: 500, lineGap: 2 });
    doc.moveDown(0.35);
    doc.fillColor(COLORS.purple).font("Helvetica-Bold").fontSize(7).text("DOCUMENTED EVIDENCE", { width: 500 });
    body(doc, control.evidence || control.evidence_quote || "No supporting evidence was identified in the submitted documentation.", { width: 500, lineGap: 2 });
    doc.moveDown(0.8);
  });
}

export async function buildGapExecutivePdf(result: any, options?: ReportExportOptions) {
  const r = sanitizeForExport(result) as any;
  const org = clean(r.organization_name || "Organization");
  const preparedBy = clean(r.prepared_by || "Silhouette LLC");
  const findings = Array.isArray(r.findings) ? r.findings : [];
  const controls = Array.isArray(r.control_results) ? r.control_results : findings;
  const buckets = Object.values(r.bucket_scores || {}) as any[];
  const standards = Object.entries(r.score_breakdown || {}) as Array<[string, any]>;
  const score = number(r.compliance_score);
  const readiness = readinessProfile(score);
  const capabilitySummary = capabilityReadinessSummary(r.bucket_scores);
  const summaryCards = capabilitySummary.total ? [
    { label: "Total findings", value: String(findings.length), color: COLORS.purple },
    { label: "Established", value: String(capabilitySummary.established), color: COLORS.low },
    { label: "Developing", value: String(capabilitySummary.developing), color: COLORS.high },
    { label: "Priority areas", value: String(capabilitySummary.needsAttention), color: COLORS.critical }
  ] : [
    { label: "Readiness profile", value: readiness, color: scoreColor(score) },
    { label: "Controls reviewed", value: String(number(r.counts?.total) || controls.length) },
    { label: "Findings", value: String(findings.length) },
    { label: "Standards", value: String(standards.length) }
  ];

  return createPdf(`${org} - Incident Response Plan Gap Analysis`, (doc) => {
    cover(doc, org, `Incident Response Plan Gap Analysis${internalReport(options) ? " | Internal QA - Not for Customer Distribution" : ""}`, preparedBy);
    const navigation = startPdfNavigation(doc);
    newSection(doc, "Executive Summary", undefined, navigation);
    metricCards(doc, summaryCards);
    body(doc, capabilityReadinessText(capabilitySummary));
    body(doc, "This readiness profile reflects documented policy evidence. Operational effectiveness should also be validated through interviews, evidence review, and exercises.");

    if (buckets.length) {
      heading(doc, "Incident Response Capability Scores");
      renderTable(doc, [
        { label: "Capability", width: 236, value: (row) => row.label },
        { label: "Points", width: 94, value: (row) => `${row.points_earned} / ${row.points_possible}` },
        { label: "Score", width: 72, value: (row) => `${row.score}%` },
        { label: "Controls", width: 98, value: (row) => row.controls_reviewed }
      ], buckets);
      body(doc, "Fixed capability point budgets total 100. Control results within each capability determine the points earned.");
    }

    heading(doc, "Standards Documentation Coverage");
    renderTable(doc, [
      { label: "Standard", width: 200, value: (row) => standardLabel(row[0]) },
      { label: "Score", width: 65, value: (row) => `${row[1].score}/100` },
      { label: "Reviewed", width: 65, value: (row) => row[1].controls_reviewed },
      { label: "Met", width: 55, value: (row) => row[1].controls_met },
      { label: "Partial", width: 55, value: (row) => row[1].controls_partial },
      { label: "Failed", width: 60, value: (row) => row[1].controls_failed }
    ], standards);

    renderAssessmentBasis(doc, r, standards);
    heading(doc, "Data Handling");
    body(doc, `Uploader attestation: ${r.data_handling?.message || "No uploader data-handling attestation was recorded for this assessment."}`);
    body(doc, "This advisory disclosure does not affect the documented readiness analysis.");

    newSection(doc, "Priority Remediation Roadmap", "Five highest-leverage actions by implementation horizon", navigation);
    renderRoadmap(doc, Array.isArray(r.remediation_roadmap?.phases) ? r.remediation_roadmap.phases : [], findings);
    heading(doc, "Conclusion and Limitations");
    body(doc, "This assessment covers submitted documentation only. Operational controls and configurations not captured in reviewed artifacts are outside scope. Findings should be reviewed with compliance counsel before regulatory submission.");
    renderPdfNavigation(doc, navigation);
  }, preparedBy);
}

export async function buildGapFindingsPdf(result: any, options?: ReportExportOptions) {
  const r = sanitizeForExport(result) as any;
  const org = clean(r.organization_name || "Organization");
  const preparedBy = clean(r.prepared_by || "Silhouette LLC");
  const findings = Array.isArray(r.findings) ? r.findings : [];
  const controls = Array.isArray(r.control_results) ? r.control_results : findings;
  const standards = Object.keys(r.score_breakdown || {});
  const severityCounts = ["Critical", "High", "Medium", "Low"].map((severity) => ({
    label: severity,
    value: String(findings.filter((finding: any) => clean(finding.risk_level).toLocaleLowerCase() === severity.toLocaleLowerCase()).length),
    color: priorityColor(severity)
  }));

  const internal = internalReport(options);
  return createPdf(`${org} - ${internal ? "Internal IRP Control Matrix" : "IRP Findings and Evidence"}`, (doc) => {
    cover(doc, org, `${internal ? "Internal QA - Not for Customer Distribution | " : ""}Detailed IRP Findings and Evidence`, preparedBy);
    const navigation = startPdfNavigation(doc);
    newSection(doc, "Reviewer Overview", internal ? `${findings.length} findings and ${controls.length} control evaluation records` : `${findings.length} remediation findings`, navigation);
    metricCards(doc, severityCounts);
    body(doc, internal
      ? "Internal QA - Not for Customer Distribution. This document contains the complete remediation finding set and control-level evaluation matrix."
      : "This customer supporting document contains the complete remediation finding set and the mapped references needed to act on each finding. It does not disclose the full internal control library.");
    heading(doc, "Assessment Scope");
    body(doc, `Document: ${r.document_name || "Incident Response Plan"}`);
    body(doc, `Standards reviewed: ${standards.map((standard) => standardLabel(standard)).join(", ") || "Not recorded"}`);
    body(doc, `Control boards: ${r.control_board?.citation || "Not recorded"}`);

    newSection(doc, "Complete Remediation Findings", `${findings.length} documented findings across the selected control boards`, navigation);
    if (findings.length) renderFindings(doc, findings);
    else body(doc, "No remediation findings were recorded for this assessment.");

    if (internal) {
      newSection(doc, "Control Traceability Appendix", `${controls.length} control-level evaluation records`, navigation);
      if (controls.length) renderControlAppendix(doc, controls);
      else body(doc, "No control-level evaluation records were stored for this assessment.");
    }
    renderPdfNavigation(doc, navigation);
  }, preparedBy);
}

export const buildGapPdf = buildGapExecutivePdf;

export async function buildNetworkGapPdf(result: any, options?: ReportExportOptions) {
  const r = sanitizeForExport(result) as any;
  const preparedBy = clean(r.prepared_by || "Silhouette LLC");
  const organizations = Array.isArray(r.organizations) ? r.organizations : [];
  const gaps = Array.isArray(r.common_gaps) ? r.common_gaps : [];
  const score = number(r.compliance_score);
  const readiness = readinessProfile(score);
  const capabilitySummary = capabilityReadinessSummary(r.bucket_scores);
  const totalFindings = ["critical", "high", "medium", "low"].reduce((total, priority) => total + number(r.severity_counts?.[priority]), 0) || gaps.length;
  const summaryCards = capabilitySummary.total ? [
    { label: "Total findings", value: String(totalFindings), color: COLORS.purple },
    { label: "Established", value: String(capabilitySummary.established), color: COLORS.low },
    { label: "Developing", value: String(capabilitySummary.developing), color: COLORS.high },
    { label: "Priority areas", value: String(capabilitySummary.needsAttention), color: COLORS.critical }
  ] : [
    { label: "Readiness profile", value: readiness, color: scoreColor(score) },
    { label: "Organizations", value: String(organizations.length) },
    { label: "Common gaps", value: String(gaps.length) }
  ];
  return createPdf(`${clean(r.network_name)} - Network IRP Gap Analysis`, (doc) => {
    cover(doc, clean(r.network_name || "Healthcare Network"), `Network Incident Response Plan Gap Analysis | ${organizations.length} organizations${internalReport(options) ? " | Internal QA - Not for Customer Distribution" : ""}`, preparedBy);
    const navigation = startPdfNavigation(doc);
    newSection(doc, "Network Executive Summary", undefined, navigation);
    metricCards(doc, summaryCards);
    body(doc, capabilityReadinessText(capabilitySummary));
    body(doc, `This network profile summarizes documented capability readiness across ${organizations.length} independently assessed organizations.`);
    heading(doc, "Capability Averages");
    renderTable(doc, [
      { label: "Capability", width: 250, value: (row) => row.label },
      { label: "Points", width: 95, value: (row) => `${row.points_earned} / ${row.points_possible}` },
      { label: "Score", width: 75, value: (row) => `${row.score}%` },
      { label: "Organizations", width: 80, value: (row) => row.organizations_reviewed }
    ], Object.values(r.bucket_scores || {}));
    heading(doc, "Organization Comparison");
    renderTable(doc, [
      { label: "Organization", width: 210, value: (row) => row.organization_name },
      { label: "Readiness", width: 105, value: (row) => readinessProfile(row.compliance_score) },
      { label: "Capability profile", width: 185, value: (row) => capabilityReadinessText(capabilityReadinessSummary(row.bucket_scores)) }
    ], organizations);
    heading(doc, "Assessment Basis");
    body(doc, NETWORK_SCORING_METHODOLOGY);
    newSection(doc, "Common Capability Gaps", "Ranked by organizations affected and priority", navigation);
    renderTable(doc, [
      { label: "Priority", width: 55, value: (row) => row.risk_level },
      { label: "Capability", width: 95, value: (row) => row.control_name || row.control_id },
      { label: "Requirement", width: 185, value: (row) => humanizeControlText(row.requirement) },
      { label: "Organizations", width: 115, value: (row) => (row.affected_organizations || []).join(", ") },
      { label: "Coverage", width: 50, value: (row) => `${row.affected_count}/${organizations.length}` }
    ], gaps, 6.6);
    renderPdfNavigation(doc, navigation);
  }, preparedBy);
}

type NetworkAssessmentExport = { orgName: string; result: any };

export async function buildNetworkFindingsPdf(result: any, assessments: NetworkAssessmentExport[], options?: ReportExportOptions) {
  const r = sanitizeForExport(result) as any;
  const preparedBy = clean(r.prepared_by || "Silhouette LLC");
  const rows = assessments.map((assessment) => ({
    orgName: clean(assessment.orgName || assessment.result?.organization_name || "Organization"),
    result: sanitizeForExport(assessment.result || {}) as any
  }));
  const gaps = Array.isArray(r.common_gaps) ? r.common_gaps : [];
  const totalFindings = rows.reduce((total, row) => total + (Array.isArray(row.result.findings) ? row.result.findings.length : 0), 0);
  const totalControls = rows.reduce((total, row) => {
    const controls = Array.isArray(row.result.control_results) ? row.result.control_results : row.result.findings;
    return total + (Array.isArray(controls) ? controls.length : 0);
  }, 0);
  const standards = new Set(rows.flatMap((row) => Object.keys(row.result.score_breakdown || {})));

  const internal = internalReport(options);
  return createPdf(`${clean(r.network_name)} - ${internal ? "Internal Network IRP Control Matrix" : "Network IRP Findings and Evidence"}`, (doc) => {
    cover(doc, clean(r.network_name || "Healthcare Network"), `${internal ? "Internal QA - Not for Customer Distribution | " : ""}Detailed Network IRP Findings and Evidence | ${rows.length} organizations`, preparedBy);
    const navigation = startPdfNavigation(doc);
    newSection(doc, "Reviewer Overview", "Complete organization findings and control-level evidence", navigation);
    metricCards(doc, [
      { label: "Organizations", value: String(rows.length) },
      { label: "Findings", value: String(totalFindings), color: COLORS.purple },
      { label: "Controls reviewed", value: String(totalControls) },
      { label: "Standards", value: String(standards.size) }
    ]);
    body(doc, internal
      ? "Internal QA - Not for Customer Distribution. This document contains complete organization findings and control-level evaluation matrices."
      : "This customer supporting document contains complete organization remediation findings and their mapped references without disclosing the full internal control library.");

    newSection(doc, "Cross-Organization Findings", "Common capability gaps ranked by organizations affected and priority", navigation);
    if (gaps.length) {
      renderTable(doc, [
        { label: "Priority", width: 55, value: (row) => row.risk_level },
        { label: "Capability", width: 95, value: (row) => row.control_name || row.control_id },
        { label: "Requirement", width: 185, value: (row) => humanizeControlText(row.requirement) },
        { label: "Organizations", width: 115, value: (row) => (row.affected_organizations || []).join(", ") },
        { label: "Coverage", width: 50, value: (row) => `${row.affected_count}/${rows.length}` }
      ], gaps, 6.6);
    } else {
      body(doc, "No cross-organization findings were recorded.");
    }

    newSection(doc, "Organization Findings and Evidence", `${rows.length} independently assessed organizations`, navigation);
    rows.forEach((row, index) => {
      if (index > 0) doc.addPage();
      heading(doc, row.orgName);
      const findings = Array.isArray(row.result.findings) ? row.result.findings : [];
      const controls = Array.isArray(row.result.control_results) ? row.result.control_results : findings;
      body(doc, `${findings.length} findings | ${controls.length} control evaluation records`);
      heading(doc, "Complete Remediation Findings");
      if (findings.length) renderFindings(doc, findings);
      else body(doc, "No remediation findings were recorded for this organization.");
      if (internal) {
        heading(doc, "Control Traceability");
        if (controls.length) renderControlAppendix(doc, controls);
        else body(doc, "No control-level evaluation records were stored for this organization.");
      }
    });
    renderPdfNavigation(doc, navigation);
  }, preparedBy);
}

function addDeckFooter(pptx: PptxGenJS, slide: PptxGenJS.Slide, label: string, preparedBy: string) {
  slide.addShape(pptx.ShapeType.line, { x: 0.55, y: 7.08, w: 12.23, h: 0, line: { color: "D8D2E4", pt: 0.6 } });
  slide.addText(clean(label), { x: 0.55, y: 7.13, w: 8.5, h: 0.18, fontFace: "Aptos", fontSize: 6.5, color: "71697E", margin: 0 });
  slide.addText(clean(preparedBy), { x: 9.5, y: 7.13, w: 3.28, h: 0.18, fontFace: "Aptos", fontSize: 6.5, color: "71697E", align: "right", margin: 0, fit: "shrink" });
}

function addDeckTitle(slide: PptxGenJS.Slide, eyebrow: string, title: string, subtitle?: string) {
  slide.addText(clean(eyebrow).toUpperCase(), { x: 0.65, y: 0.38, w: 6, h: 0.22, fontFace: "Aptos", fontSize: 7.5, bold: true, color: "8B5CF6", charSpacing: 2.5, margin: 0 });
  slide.addText(clean(title), { x: 0.65, y: 0.72, w: 11.9, h: 0.52, fontFace: "Georgia", fontSize: 27, bold: true, color: "17131F", margin: 0 });
  if (subtitle) slide.addText(clean(subtitle), { x: 0.65, y: 1.28, w: 11.8, h: 0.35, fontFace: "Aptos", fontSize: 11, color: "71697E", margin: 0 });
}

function addBulletList(slide: PptxGenJS.Slide, items: string[], options?: { x?: number; y?: number; w?: number; h?: number; fontSize?: number }) {
  const text = items.map((item) => ({ text: clean(item), options: { bullet: { indent: 14 }, breakLine: true, hanging: 4 } }));
  slide.addText(text as any, { x: options?.x ?? 0.78, y: options?.y ?? 1.8, w: options?.w ?? 11.6, h: options?.h ?? 4.85, fontFace: "Aptos", fontSize: options?.fontSize ?? 15, color: "302A39", breakLine: false, margin: 4, valign: "top", paraSpaceAfter: 11 });
}

async function outputDeck(pptx: PptxGenJS) {
  const output = await pptx.write({ outputType: "nodebuffer" });
  if (typeof output === "string") return Buffer.from(output);
  if (output instanceof ArrayBuffer) return Buffer.from(output);
  if (output instanceof Uint8Array) return Buffer.from(output);
  throw new Error("PowerPoint generation returned an unsupported output type.");
}

export async function buildGapPptx(result: any, options?: ReportExportOptions) {
  const r = sanitizeForExport(result) as any;
  const org = clean(r.organization_name || "Organization");
  const preparedBy = clean(r.prepared_by || "Silhouette LLC");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = preparedBy;
  pptx.subject = "Incident Response Plan Gap Analysis";
  pptx.title = `${org} - Incident Response Plan Gap Analysis`;
  pptx.company = preparedBy;
  pptx.theme = { headFontFace: "Georgia", bodyFontFace: "Aptos" };

  const coverSlide = pptx.addSlide();
  coverSlide.background = { color: "110F1D" };
  coverSlide.addText(org, { x: 0.78, y: 1.45, w: 11.7, h: 1.05, fontFace: "Georgia", fontSize: 34, bold: true, color: "FFFFFF", margin: 0, fit: "shrink" });
  coverSlide.addShape(pptx.ShapeType.rect, { x: 0.78, y: 2.82, w: 4.25, h: 0.05, fill: { color: "8B5CF6" }, line: { color: "8B5CF6" } });
  coverSlide.addText("Incident Response Plan Gap Analysis", { x: 0.78, y: 3.12, w: 9, h: 0.45, fontFace: "Aptos", fontSize: 17, color: "D7C4FF", margin: 0 });
  coverSlide.addText(`Prepared by ${preparedBy}`, { x: 0.78, y: 3.72, w: 9, h: 0.3, fontFace: "Aptos", fontSize: 10, color: "A99BBC", margin: 0, fit: "shrink" });
  if (internalReport(options)) coverSlide.addText("INTERNAL QA - NOT FOR CUSTOMER DISTRIBUTION", { x: 0.78, y: 6.7, w: 8, h: 0.2, fontFace: "Aptos", fontSize: 7.5, color: "A99BBC", margin: 0 });

  const score = number(r.compliance_score);
  const readiness = readinessProfile(score);
  const capabilitySummary = capabilityReadinessSummary(r.bucket_scores);
  const summary = pptx.addSlide();
  addDeckTitle(summary, "Executive summary", `${readiness} IRP Readiness`, capabilityReadinessText(capabilitySummary));
  summary.addText(readiness.toUpperCase(), { x: 0.72, y: 2.22, w: 2.3, h: 0.72, fontFace: "Aptos Display", fontSize: 25, bold: true, color: scoreColor(score).slice(1), align: "center", margin: 0, fit: "shrink" });
  summary.addText("READINESS PROFILE", { x: 0.72, y: 3.05, w: 2.3, h: 0.25, fontFace: "Aptos", fontSize: 8, bold: true, color: "71697E", align: "center", charSpacing: 1.5, margin: 0 });
  summary.addText("Capability-based assessment", { x: 0.72, y: 3.44, w: 2.3, h: 0.35, fontFace: "Aptos", fontSize: 7.5, color: "71697E", align: "center", margin: 0, fit: "shrink" });
  const counts = ["critical", "high", "medium", "low"].map((key) => ({ key, value: number(r.counts?.[key]) }));
  counts.forEach((entry, index) => {
    const x = 3.45 + (index % 2) * 4.45;
    const y = 2.0 + Math.floor(index / 2) * 1.42;
    summary.addShape(pptx.ShapeType.roundRect, { x, y, w: 4.05, h: 1.05, rectRadius: 0.04, fill: { color: "FAF9FC" }, line: { color: "DDD8E8", pt: 0.8 } });
    summary.addText(entry.key.toUpperCase(), { x: x + 0.22, y: y + 0.18, w: 2.2, h: 0.2, fontFace: "Aptos", fontSize: 7.5, bold: true, color: priorityColor(entry.key).slice(1), margin: 0 });
    summary.addText(String(entry.value), { x: x + 0.22, y: y + 0.46, w: 2.2, h: 0.36, fontFace: "Aptos Display", fontSize: 23, bold: true, color: "17131F", margin: 0 });
  });
  addDeckFooter(pptx, summary, `${org} | IRP Gap Analysis`, preparedBy);

  const capabilities = Object.values(r.bucket_scores || {}) as any[];
  const capabilitySlide = pptx.addSlide();
  addDeckTitle(capabilitySlide, "Capability readiness model", "Incident Response Capabilities", "Weighted capability evidence supports a consistent readiness profile and trend index.");
  capabilities.slice(0, 12).forEach((bucket, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 0.75 + column * 6.15;
    const y = 1.83 + row * 0.78;
    const earned = number(bucket.points_earned);
    const possible = Math.max(1, number(bucket.points_possible));
    capabilitySlide.addText(clean(bucket.label), { x, y, w: 3.35, h: 0.23, fontFace: "Aptos", fontSize: 10, bold: true, color: "302A39", margin: 0, fit: "shrink" });
    capabilitySlide.addShape(pptx.ShapeType.rect, { x: x + 3.45, y: y + 0.02, w: 1.65, h: 0.13, fill: { color: "E8E4EE" }, line: { color: "E8E4EE" } });
    capabilitySlide.addShape(pptx.ShapeType.rect, { x: x + 3.45, y: y + 0.02, w: 1.65 * Math.min(1, earned / possible), h: 0.13, fill: { color: "8B5CF6" }, line: { color: "8B5CF6" } });
    capabilitySlide.addText(`${earned}/${possible}`, { x: x + 5.18, y: y - 0.02, w: 0.65, h: 0.22, fontFace: "Aptos", fontSize: 9, bold: true, color: "17131F", align: "right", margin: 0 });
  });
  addDeckFooter(pptx, capabilitySlide, `${org} | IRP Gap Analysis`, preparedBy);

  const standardsSlide = pptx.addSlide();
  addDeckTitle(standardsSlide, "Traceability", "Standards Documentation Coverage", "Each selected publication remains separately measured and identifiable.");
  const standards = Object.entries(r.score_breakdown || {}) as Array<[string, any]>;
  standards.forEach(([standard, value], index) => {
    const y = 1.92 + index * 0.68;
    standardsSlide.addText(standardLabel(standard), { x: 0.82, y, w: 4.2, h: 0.27, fontFace: "Aptos", fontSize: 11, bold: true, color: "302A39", margin: 0, fit: "shrink" });
    standardsSlide.addShape(pptx.ShapeType.rect, { x: 5.15, y: y + 0.03, w: 5.7, h: 0.16, fill: { color: "E8E4EE" }, line: { color: "E8E4EE" } });
    standardsSlide.addShape(pptx.ShapeType.rect, { x: 5.15, y: y + 0.03, w: 5.7 * Math.min(1, number(value.score) / 100), h: 0.16, fill: { color: "8B5CF6" }, line: { color: "8B5CF6" } });
    standardsSlide.addText(`${number(value.score)}/100`, { x: 11.05, y: y - 0.03, w: 1.05, h: 0.25, fontFace: "Aptos", fontSize: 10, bold: true, color: "17131F", align: "right", margin: 0 });
  });
  addDeckFooter(pptx, standardsSlide, `${org} | IRP Gap Analysis`, preparedBy);

  const findings = Array.isArray(r.findings) ? r.findings : [];
  for (let offset = 0; offset < Math.min(findings.length, 16); offset += 8) {
    const slide = pptx.addSlide();
    addDeckTitle(slide, "Findings", offset === 0 ? "Priority Findings" : "Priority Findings, Continued", "Highest-priority documented gaps for leadership action.");
    addBulletList(slide, findings.slice(offset, offset + 8).map((finding: any) => `${finding.risk_level} | ${finding.capability || finding.control_name || finding.control_id}: ${finding.finding}`), { y: 1.78, h: 4.95, fontSize: 12.5 });
    addDeckFooter(pptx, slide, `${org} | IRP Gap Analysis`, preparedBy);
  }

  const phases = limitRoadmapActions(Array.isArray(r.remediation_roadmap?.phases) ? r.remediation_roadmap.phases : []);
  phases.forEach((phase: any, index: number) => {
    const slide = pptx.addSlide();
    addDeckTitle(slide, `Roadmap phase ${index + 1}`, clean(phase.name), clean(phase.timeframe));
    addBulletList(slide, (phase.items || []).map((rawItem: any) => {
      const item = resolveRoadmapItem(rawItem, findings);
      const references = Array.isArray(item.references) && item.references.length ? ` Mapped controls: ${item.references.join(", ")}.` : "";
      return `${item.title}: ${item.implementation} Deliverable: ${item.deliverable}. Validate: ${item.validation}.${references}`;
    }), { y: 1.85, h: 4.85, fontSize: 12 });
    addDeckFooter(pptx, slide, `${org} | Priority Remediation Roadmap`, preparedBy);
  });

  const close = pptx.addSlide();
  close.background = { color: "110F1D" };
  close.addText("NEXT STEPS", { x: 0.78, y: 1.2, w: 4, h: 0.25, fontFace: "Aptos", fontSize: 8, bold: true, color: "D7C4FF", charSpacing: 3, margin: 0 });
  close.addText("Remediate. Test. Reassess.", { x: 0.78, y: 2.0, w: 11.7, h: 0.9, fontFace: "Georgia", fontSize: 35, bold: true, color: "FFFFFF", margin: 0 });
  close.addText("Prioritize critical capability gaps, validate implementation evidence, and measure progress against the same published control baseline.", { x: 0.78, y: 3.25, w: 9.8, h: 0.72, fontFace: "Aptos", fontSize: 16, color: "D7C4FF", margin: 0 });
  return outputDeck(pptx);
}

export async function buildNetworkGapPptx(result: any, options?: ReportExportOptions) {
  const r = sanitizeForExport(result) as any;
  const network = clean(r.network_name || "Healthcare Network");
  const preparedBy = clean(r.prepared_by || "Silhouette LLC");
  const organizations = Array.isArray(r.organizations) ? r.organizations : [];
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = preparedBy;
  pptx.title = `${network} - Network IRP Gap Analysis`;
  pptx.company = preparedBy;

  const coverSlide = pptx.addSlide();
  coverSlide.background = { color: "110F1D" };
  coverSlide.addText(network, { x: 0.78, y: 1.45, w: 11.7, h: 1.05, fontFace: "Georgia", fontSize: 34, bold: true, color: "FFFFFF", margin: 0, fit: "shrink" });
  coverSlide.addText(`Network Incident Response Plan Gap Analysis | ${organizations.length} organizations`, { x: 0.78, y: 3.05, w: 10.8, h: 0.45, fontFace: "Aptos", fontSize: 16, color: "D7C4FF", margin: 0 });
  coverSlide.addText(`Prepared by ${preparedBy}`, { x: 0.78, y: 3.65, w: 9, h: 0.3, fontFace: "Aptos", fontSize: 10, color: "A99BBC", margin: 0, fit: "shrink" });
  if (internalReport(options)) coverSlide.addText("INTERNAL QA - NOT FOR CUSTOMER DISTRIBUTION", { x: 0.78, y: 6.7, w: 7.2, h: 0.2, fontFace: "Aptos", fontSize: 7.5, bold: true, color: "A99BBC", margin: 0 });

  const score = number(r.compliance_score);
  const readiness = readinessProfile(score);
  const capabilitySummary = capabilityReadinessSummary(r.bucket_scores);
  const summary = pptx.addSlide();
  addDeckTitle(summary, "Network readiness", `${readiness} IRP Readiness`, capabilityReadinessText(capabilitySummary));
  summary.addText(readiness.toUpperCase(), { x: 0.8, y: 2.2, w: 2.5, h: 0.75, fontFace: "Aptos Display", fontSize: 25, bold: true, color: scoreColor(score).slice(1), align: "center", margin: 0, fit: "shrink" });
  summary.addText("NETWORK READINESS PROFILE", { x: 0.8, y: 3.05, w: 2.5, h: 0.25, fontFace: "Aptos", fontSize: 8, bold: true, color: "71697E", align: "center", charSpacing: 1.5, margin: 0 });
  summary.addText("Capability-based assessment", { x: 0.8, y: 3.43, w: 2.5, h: 0.35, fontFace: "Aptos", fontSize: 7.5, color: "71697E", align: "center", margin: 0, fit: "shrink" });
  addBulletList(summary, organizations.map((organization: any) => {
    const profile = capabilityReadinessSummary(organization.bucket_scores);
    return `${organization.organization_name}: ${readinessProfile(organization.compliance_score)}; ${capabilityReadinessText(profile)}`;
  }), { x: 3.8, y: 1.9, w: 8.2, h: 4.8, fontSize: 13 });
  addDeckFooter(pptx, summary, `${network} | Network IRP Gap Analysis`, preparedBy);

  const priorities = Array.isArray(r.network_priorities) ? r.network_priorities : [];
  const prioritySlide = pptx.addSlide();
  addDeckTitle(prioritySlide, "Network priorities", "Coordinated Remediation", "Common gaps ranked by affected organizations and risk.");
  addBulletList(prioritySlide, priorities.slice(0, 10).map((priority: any) => `${priority.risk_level} | ${priority.control_name || priority.control_id}: ${priority.affected_count}/${organizations.length} organizations affected`), { y: 1.8, h: 5, fontSize: 13 });
  addDeckFooter(pptx, prioritySlide, `${network} | Network IRP Gap Analysis`, preparedBy);
  return outputDeck(pptx);
}
