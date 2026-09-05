"use client";

import { useMemo, useState } from "react";
import { standardLabel } from "@/lib/analysis/standards";
import { capabilityReadinessSummary, capabilityReadinessText, NETWORK_SCORING_METHODOLOGY, readinessProfile } from "@/lib/report-readiness";
import type { ReportProfile } from "@/lib/report-profile";

const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;
const PRIORITY_ORDER: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

function postureClass(score: number) {
  if (score >= 85) return "strong";
  if (score >= 70) return "moderate";
  if (score >= 50) return "limited";
  return "weak";
}

export function NetworkIrpReport({ result, quoteId, profile = "customer" }: { result: any; quoteId: string; profile?: ReportProfile }) {
  const [sort, setSort] = useState<"affected" | "severity">("affected");
  const score = Number(result.compliance_score || 0);
  const readiness = readinessProfile(score);
  const capabilitySummary = capabilityReadinessSummary(result.bucket_scores);
  const organizations = Array.isArray(result.organizations) ? result.organizations : [];
  const gaps = useMemo(() => {
    const rows = Array.isArray(result.common_gaps) ? [...result.common_gaps] : [];
    return rows.sort((left: any, right: any) => sort === "severity"
      ? (PRIORITY_ORDER[right.risk_level] || 0) - (PRIORITY_ORDER[left.risk_level] || 0) || right.affected_count - left.affected_count
      : right.affected_count - left.affected_count || (PRIORITY_ORDER[right.risk_level] || 0) - (PRIORITY_ORDER[left.risk_level] || 0));
  }, [result.common_gaps, sort]);
  const totalFindings = SEVERITIES.reduce((total, severity) => total + Number(result.severity_counts?.[severity.toLocaleLowerCase()] || 0), 0);
  const internal = profile === "internal";
  const exportProfile = `profile=${internal ? "internal" : "customer"}`;

  return <div className="irp-web-report irp-network-report">
    {internal ? <div className="irp-internal-watermark">Internal QA - Not for Customer Distribution</div> : null}
    <header className="irp-report-heading">
      <div>
        <span className="mono">Network incident response plan gap analysis</span>
        <h2>{result.network_name}</h2>
        <p>{organizations.length} independent organization report{organizations.length === 1 ? "" : "s"} consolidated into this network report.</p>
      </div>
      <div className="irp-report-heading-actions">
        <span className={`irp-posture-badge ${postureClass(score)}`}>{readiness}</span>
        <div className="irp-export-actions">
          <a className="btn secondary" href={`/api/run-quotes/${quoteId}/export?format=report&${exportProfile}`}>Export PDF</a>
          <a className="btn secondary" href={`/api/run-quotes/${quoteId}/export?format=deck&${exportProfile}`}>Export deck</a>
        </div>
      </div>
    </header>

    <section className="irp-severity-strip" aria-label="Network findings by priority">
      {SEVERITIES.map((severity) => <div key={severity} className={`irp-severity-card severity-${severity.toLocaleLowerCase()}`}>
        <span>{severity}</span>
        <b>{result.severity_counts?.[severity.toLocaleLowerCase()] || 0}</b>
      </div>)}
    </section>

    <section className="irp-posture-panel">
      <div className="irp-posture-copy">
        <span className="mono">Network readiness profile</span>
        <h3>{readiness}</h3>
        <p>{capabilityReadinessText(capabilitySummary)}</p>
        <p className="muted">The network profile summarizes capability readiness across independently assessed organizations. Each organization remains available as its own report.</p>
      </div>
      <div className="irp-standard-scores">
        <span className="mono">Standards documentation coverage</span>
        {Object.entries(result.score_breakdown || {}).map(([standard, breakdown]: [string, any]) => <div className="irp-standard-score" key={standard}>
          <div><b>{standardLabel(standard)}</b><span>{breakdown.organizations_reviewed} organizations</span></div>
          <div className="irp-score-track"><span style={{ width: `${Math.max(0, Math.min(100, Number(breakdown.score || 0)))}%` }} /></div>
          <strong>{breakdown.score}</strong>
        </div>)}
      </div>
      <div className="irp-overall-score findings">
        <span>Total findings</span>
        <b>{totalFindings || gaps.length}</b>
      </div>
    </section>

    <details className="irp-scoring-methodology">
      <summary>Scoring methodology</summary>
      <p>{NETWORK_SCORING_METHODOLOGY}</p>
    </details>

    {Object.keys(result.bucket_scores || {}).length ? <section className="irp-bucket-section">
      <div className="irp-section-heading">
        <div><span className="mono">Capability readiness model</span><h3>Network capability averages</h3></div>
        <span className="muted">Each value is the average capability score across independently assessed organizations.</span>
      </div>
      <div className="irp-bucket-grid">
        {Object.entries(result.bucket_scores || {}).map(([bucketId, bucket]: [string, any]) => <article className="irp-bucket-card" key={bucketId}>
          <header><div><h4>{bucket.label}</h4><p>{bucket.description}</p></div><strong>{bucket.points_earned}<small> / {bucket.points_possible}</small></strong></header>
          <div className="irp-score-track"><span style={{ width: `${Math.max(0, Math.min(100, Number(bucket.score || 0)))}%` }} /></div>
          <footer><span>{bucket.score}%</span><span>{bucket.organizations_reviewed} organizations</span><span>{bucket.controls_reviewed} controls</span></footer>
        </article>)}
      </div>
    </section> : null}

    <section>
      <div className="irp-section-heading"><div><span className="mono">Organization comparison</span><h3>Independent results</h3></div></div>
      <div className="irp-findings-table-wrap">
        <table className="table irp-network-org-table">
          <thead><tr><th>Organization</th><th>Readiness</th><th>Capability profile</th>{Object.keys(result.score_breakdown || {}).map((standard) => <th key={standard}>{standardLabel(standard)}</th>)}</tr></thead>
          <tbody>{organizations.map((organization: any) => <tr key={organization.assessment_id}>
            <td><b>{organization.organization_name}</b></td>
            <td><span className={`irp-posture-badge ${postureClass(Number(organization.compliance_score || 0))}`}>{readinessProfile(organization.compliance_score)}</span></td>
            <td>{capabilityReadinessText(capabilityReadinessSummary(organization.bucket_scores))}</td>
            {Object.keys(result.score_breakdown || {}).map((standard) => <td key={standard}>{organization.score_breakdown?.[standard]?.score ?? "-"}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section>
      <div className="irp-section-heading">
        <div><span className="mono">Cross-organization analysis</span><h3>Common control gaps</h3></div>
        <label className="irp-network-sort">Sort by <select className="select" value={sort} onChange={(event) => setSort(event.target.value as "affected" | "severity")}><option value="affected">Organizations affected</option><option value="severity">Priority</option></select></label>
      </div>
      <div className="irp-findings-table-wrap">
        <table className="table irp-network-gap-table">
          <thead><tr><th>Control</th><th>Priority</th><th>Requirement</th><th>Organizations affected</th><th>Coverage</th></tr></thead>
          <tbody>{gaps.map((gap: any) => <tr key={gap.control_id}>
            <td><b>{gap.control_id}</b><span>{(gap.standards || []).map((standard: string) => standardLabel(standard)).join(", ")}</span></td>
            <td><span className={`irp-priority severity-${String(gap.risk_level || "medium").toLocaleLowerCase()}`}>{gap.risk_level}</span></td>
            <td>{gap.requirement || gap.control_name}</td>
            <td>{(gap.affected_organizations || []).join(", ")}</td>
            <td><b>{gap.affected_count}/{organizations.length}</b></td>
          </tr>)}</tbody>
        </table>
        {!gaps.length ? <div className="irp-empty-filter">No cross-organization gaps were identified.</div> : null}
      </div>
    </section>

    <section>
      <div className="irp-section-heading"><div><span className="mono">Network priorities</span><h3>Systemic remediation focus</h3></div></div>
      <div className="irp-network-priority-list">
        {(result.network_priorities || []).map((priority: any) => <article key={priority.control_id}>
          <div><b>{priority.control_id}</b><span className={`irp-priority severity-${String(priority.risk_level || "medium").toLocaleLowerCase()}`}>{priority.risk_level}</span></div>
          <h4>{priority.control_name}</h4>
          <p>{priority.requirement}</p>
          <small>{priority.affected_count} of {organizations.length} organizations affected: {(priority.affected_organizations || []).join(", ")}</small>
        </article>)}
      </div>
    </section>
  </div>;
}
