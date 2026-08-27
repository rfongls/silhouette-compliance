export type NetworkAssessment = {
  assessmentId: string;
  orgName: string;
  result: any;
  reused?: boolean;
};

const SEVERITY_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

function posture(score: number) {
  if (score >= 85) return "Compliant";
  if (score >= 50) return "Partially Compliant";
  return "Non-Compliant";
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function severity(value: unknown) {
  const normalized = String(value || "Medium").toLocaleLowerCase();
  return Object.keys(SEVERITY_RANK).find((item) => item.toLocaleLowerCase() === normalized) || "Medium";
}

export function buildNetworkReport(networkName: string, assessments: NetworkAssessment[]) {
  const organizations = assessments.map((assessment) => {
    const result = assessment.result || {};
    return {
      assessment_id: assessment.assessmentId,
      organization_name: assessment.orgName,
      compliance_score: Number(result.compliance_score || 0),
      overall_posture: result.overall_posture || posture(Number(result.compliance_score || 0)),
      bucket_scores: result.bucket_scores || {},
      score_breakdown: result.score_breakdown || {},
      findings: Array.isArray(result.findings) ? result.findings : [],
      reused: Boolean(assessment.reused)
    };
  });
  const complianceScore = average(organizations.map((organization) => organization.compliance_score));
  const bucketKeys = [...new Set(organizations.flatMap((organization) => Object.keys(organization.bucket_scores)))];
  const bucketScores = Object.fromEntries(bucketKeys.map((bucketId) => {
    const rows = organizations.map((organization) => organization.bucket_scores[bucketId]).filter(Boolean);
    return [bucketId, {
      label: rows[0]?.label || bucketId,
      description: rows[0]?.description || "",
      score: average(rows.map((row) => Number(row.score || 0))),
      points_possible: rows[0]?.points_possible || 0,
      points_earned: Number((rows.reduce((sum, row) => sum + Number(row.points_earned || 0), 0) / Math.max(1, rows.length)).toFixed(1)),
      organizations_reviewed: rows.length,
      controls_reviewed: rows.reduce((sum, row) => sum + Number(row.controls_reviewed || 0), 0)
    }];
  }));
  const standardKeys = [...new Set(organizations.flatMap((organization) => Object.keys(organization.score_breakdown)))];
  const scoreBreakdown = Object.fromEntries(standardKeys.map((standard) => {
    const rows = organizations
      .map((organization) => organization.score_breakdown[standard])
      .filter((row) => row && Number.isFinite(Number(row.score)));
    return [standard, {
      score: average(rows.map((row) => Number(row.score))),
      organizations_reviewed: rows.length,
      controls_reviewed: rows.reduce((sum, row) => sum + Number(row.controls_reviewed || 0), 0)
    }];
  }));

  const controls = new Map<string, any>();
  for (const organization of organizations) {
    for (const finding of organization.findings) {
      if (finding.status === "Yes") continue;
      const controlId = String(finding.control_id || finding.control_name || "Unidentified control");
      const findingKey = `${finding.bucket_id || "control"}::${finding.capability || finding.control_name || controlId}`.toLocaleLowerCase();
      const current = controls.get(findingKey) || {
        control_id: controlId,
        bucket_id: finding.bucket_id,
        bucket_label: finding.bucket_label,
        capability: finding.capability,
        control_name: finding.control_name || controlId,
        requirement: finding.requirement || "",
        risk_level: severity(finding.risk_level),
        standards: [],
        affected_organizations: [],
        organization_findings: []
      };
      if (SEVERITY_RANK[severity(finding.risk_level)] > SEVERITY_RANK[current.risk_level]) current.risk_level = severity(finding.risk_level);
      current.standards = [...new Set([...current.standards, ...(finding.standards || []).map(String)])];
      current.affected_organizations.push(organization.organization_name);
      current.organization_findings.push({
        organization_name: organization.organization_name,
        status: finding.status,
        evidence: finding.evidence || "",
        finding: finding.finding || finding.gap_description || ""
      });
      controls.set(findingKey, current);
    }
  }
  const commonGaps = [...controls.values()]
    .map((control) => ({ ...control, affected_count: control.affected_organizations.length }))
    .sort((left, right) => right.affected_count - left.affected_count || SEVERITY_RANK[right.risk_level] - SEVERITY_RANK[left.risk_level]);
  const majorityThreshold = Math.max(1, Math.ceil(organizations.length / 2));
  const networkPriorities = commonGaps.filter((control) => control.affected_count >= majorityThreshold);
  const severityCounts = Object.fromEntries(Object.keys(SEVERITY_RANK).map((level) => [
    level.toLocaleLowerCase(),
    commonGaps.filter((control) => control.risk_level === level).length
  ]));

  return {
    report_type: "network",
    network_name: networkName,
    organization_count: organizations.length,
    compliance_score: complianceScore,
    overall_posture: posture(complianceScore),
    posture_summary: `${networkName} has an average IRP compliance score of ${complianceScore}/100 across ${organizations.length} assessed organization${organizations.length === 1 ? "" : "s"}.`,
    bucket_scores: bucketScores,
    score_breakdown: scoreBreakdown,
    severity_counts: severityCounts,
    organizations,
    common_gaps: commonGaps,
    network_priorities: networkPriorities,
    generated_at: new Date().toISOString()
  };
}
