import assert from "node:assert/strict";
import test from "node:test";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { buildNetworkFindingsPdf, buildNetworkGapPdf } from "../lib/exports/documents";
import { buildNetworkReport } from "../lib/network-report";

test("network report keeps the parent identity separate from child organizations", () => {
  const report = buildNetworkReport("Hawaii Care Network", [
    {
      assessmentId: "a1",
      orgName: "Center Alpha",
      result: {
        compliance_score: 80,
        overall_posture: "Partially Compliant",
        score_breakdown: { hipaa: { score: 70, controls_reviewed: 10 } },
        findings: [{ control_id: "IR-1", risk_level: "High", status: "No", standards: ["HIPAA"], requirement: "Maintain an IRP" }]
      }
    },
    {
      assessmentId: "a2",
      orgName: "Center Beta",
      result: {
        compliance_score: 90,
        overall_posture: "Compliant",
        score_breakdown: { hipaa: { score: 90, controls_reviewed: 10 } },
        findings: [{ control_id: "IR-1", risk_level: "Critical", status: "Partial", standards: ["HIPAA"], requirement: "Maintain an IRP" }]
      }
    }
  ]);

  assert.equal(report.network_name, "Hawaii Care Network");
  assert.deepEqual(report.organizations.map((row) => row.organization_name), ["Center Alpha", "Center Beta"]);
  assert.equal(report.organization_count, 2);
  assert.equal(report.compliance_score, 85);
  assert.equal(report.score_breakdown.hipaa.score, 80);
  assert.equal(report.common_gaps[0].affected_count, 2);
  assert.equal(report.common_gaps[0].risk_level, "Critical");
});

test("network report supports a single child without treating the parent as a billed child", () => {
  const report = buildNetworkReport("Parent Organization", [{
    assessmentId: "a1",
    orgName: "Only Health Center",
    result: { compliance_score: 61, findings: [], score_breakdown: {} }
  }]);
  assert.equal(report.organization_count, 1);
  assert.equal(report.organizations[0].organization_name, "Only Health Center");
  assert.equal(report.network_name, "Parent Organization");
});

test("network PDF exports separate executive analysis from organization evidence", async () => {
  const assessments = [
    {
      assessmentId: "a1",
      orgName: "Center Alpha",
      result: {
        compliance_score: 70,
        score_breakdown: { hipaa: { score: 70, controls_reviewed: 1 } },
        findings: [{ control_id: "IR-1", risk_level: "High", status: "No", standards: ["HIPAA"], requirement: "Maintain an IRP", finding: "Center Alpha needs a documented IRP." }],
        control_results: [{ control_id: "IR-1", risk_level: "High", status: "No", standards: ["HIPAA"], requirement: "Maintain an IRP", evidence: "Not addressed" }]
      }
    },
    {
      assessmentId: "a2",
      orgName: "Center Beta",
      result: {
        compliance_score: 80,
        score_breakdown: { hipaa: { score: 80, controls_reviewed: 1 } },
        findings: [{ control_id: "IR-2", risk_level: "Medium", status: "Partial", standards: ["HIPAA"], requirement: "Test the IRP", finding: "Center Beta needs a complete exercise record." }],
        control_results: [{ control_id: "IR-2", risk_level: "Medium", status: "Partial", standards: ["HIPAA"], requirement: "Test the IRP", evidence: "An exercise cadence is documented." }]
      }
    }
  ];
  const network = buildNetworkReport("Hawaii Care Network", assessments);
  const executive = await pdf(await buildNetworkGapPdf(network));
  const detailed = await pdf(await buildNetworkFindingsPdf(network, assessments));

  assert.match(executive.text, /Network Executive Summary/);
  assert.match(executive.text, /Common Capability Gaps/);
  assert.doesNotMatch(executive.text, /Organization Findings and Evidence/);
  assert.match(detailed.text, /Organization Findings and Evidence/);
  assert.match(detailed.text, /Center Alpha/);
  assert.match(detailed.text, /Center Beta/);
  assert.match(detailed.text, /Center Alpha needs a documented IRP/);
  assert.match(detailed.text, /Center Beta needs a complete exercise record/);
  assert.match(detailed.text, /Control Traceability/);
});
