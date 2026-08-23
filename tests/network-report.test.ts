import assert from "node:assert/strict";
import test from "node:test";
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
