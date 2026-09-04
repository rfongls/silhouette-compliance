"use client";

import { useMemo, useState } from "react";
import { standardLabel } from "@/lib/analysis/standards";
import { resolveRoadmapItem } from "@/lib/analysis/remediation";
import { capabilityReadinessSummary, capabilityReadinessText, readinessProfile, SCORING_METHODOLOGY } from "@/lib/report-readiness";
import { humanizeControlText } from "@/lib/sanitize";

type AssessmentExport = {
  assessmentId: string;
  orgName: string;
  reused?: boolean;
};

type FindingFilter = "all" | "critical" | "high" | "medium" | "low" | `standard:${string}`;
type PrioritySort = "none" | "high-first" | "low-first";

const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;
const PRIORITY_ORDER = { Critical: 4, High: 3, Medium: 2, Low: 1 } as const;

function findingSeverity(finding: any) {
  const value = String(finding?.risk_level || "Medium").toLocaleLowerCase();
  return SEVERITIES.find((severity) => severity.toLocaleLowerCase() === value) || "Medium";
}

function findingMatches(finding: any, filter: FindingFilter) {
  if (filter === "all") return true;
  if (filter.startsWith("standard:")) {
    const standard = filter.slice("standard:".length).toLocaleLowerCase();
    return (finding.standards || []).some((value: string) => value.toLocaleLowerCase() === standard);
  }
  return findingSeverity(finding).toLocaleLowerCase() === filter;
}

function postureClass(score: number) {
  if (score >= 85) return "strong";
  if (score >= 70) return "moderate";
  if (score >= 50) return "limited";
  return "weak";
}

export function IrpReport({ result, assessments, demo }: { result: any; assessments: AssessmentExport[]; demo: boolean }) {
  const [filter, setFilter] = useState<FindingFilter>("all");
  const [prioritySort, setPrioritySort] = useState<PrioritySort>("none");
  const [openPhases, setOpenPhases] = useState<Set<string>>(() => new Set([result.remediation_roadmap?.phases?.[0]?.name].filter(Boolean)));
  const findings = Array.isArray(result.findings) ? result.findings : [];
  const controlResults = Array.isArray(result.control_results) ? result.control_results : findings;
  const bucketScores = Object.entries(result.bucket_scores || {}) as Array<[string, any]>;
  const actionable = findings.filter((finding: any) => finding.status !== "Yes");
  const standards = useMemo<string[]>(() => Object.keys(result.score_breakdown || {}), [result.score_breakdown]);
  const visibleFindings = findings.filter((finding: any) => findingMatches(finding, filter));
  if (prioritySort !== "none") {
    visibleFindings.sort((left: any, right: any) => {
      const difference = PRIORITY_ORDER[findingSeverity(right)] - PRIORITY_ORDER[findingSeverity(left)];
      return prioritySort === "high-first" ? difference : -difference;
    });
  }
  const severityCounts = Object.fromEntries(SEVERITIES.map((severity) => [
    severity,
    actionable.filter((finding: any) => findingSeverity(finding) === severity).length
  ]));
  const score = Number(result.compliance_score || 0);
  const readiness = readinessProfile(score);
  const capabilitySummary = capabilityReadinessSummary(result.bucket_scores);

  function togglePhase(name: string) {
    setOpenPhases((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return <div className="irp-web-report">
    <header className="irp-report-heading">
      <div>
        <span className="mono">Incident Response Plan gap analysis</span>
        <h2>{result.organization_name}</h2>
        <p>{result.document_name || "Incident Response Plan"}{demo ? " | Fictional demonstration report" : ""}</p>
      </div>
      <div className="irp-report-heading-actions">
        <span className={`irp-posture-badge ${postureClass(score)}`}>{readiness}</span>
        {!demo && assessments.length === 1 ? <div className="irp-export-actions">
          <a className="btn secondary" href={`/api/assessments/${assessments[0].assessmentId}/export?format=report`}>Export PDF</a>
          <a className="btn secondary" href={`/api/assessments/${assessments[0].assessmentId}/export?format=deck`}>Export deck</a>
        </div> : null}
      </div>
    </header>

    <section className="irp-severity-strip" aria-label="Actionable findings by priority">
      {SEVERITIES.map((severity) => <button
        type="button"
        key={severity}
        className={`irp-severity-card severity-${severity.toLocaleLowerCase()} ${filter === severity.toLocaleLowerCase() ? "active" : ""}`}
        onClick={() => setFilter(severity.toLocaleLowerCase() as FindingFilter)}
      >
        <span>{severity}</span>
        <b>{severityCounts[severity]}</b>
      </button>)}
    </section>

    <section className="irp-posture-panel">
      <div className="irp-posture-copy">
        <span className="mono">IRP readiness profile</span>
        <h3>{readiness}</h3>
        <p>{capabilityReadinessText(capabilitySummary)}</p>
        <p className="muted">This profile reflects documented policy evidence. Operational effectiveness should also be validated through interviews, evidence review, and exercises.</p>
      </div>
      <div className="irp-standard-scores">
        <span className="mono">Standards documentation coverage</span>
        {Object.entries(result.score_breakdown || {}).map(([standard, breakdown]: [string, any]) => <div className="irp-standard-score" key={standard}>
          <div><b>{standardLabel(standard)}</b><span>{breakdown.controls_reviewed} controls</span></div>
          <div className="irp-score-track"><span style={{ width: `${Math.max(0, Math.min(100, Number(breakdown.score || 0)))}%` }} /></div>
          <strong>{breakdown.score}</strong>
        </div>)}
      </div>
      <div className="irp-overall-score findings">
        <span>Total findings</span>
        <b>{actionable.length}</b>
      </div>
    </section>

    <details className="irp-scoring-methodology">
      <summary>Scoring methodology</summary>
      <p>{SCORING_METHODOLOGY}</p>
    </details>

    {bucketScores.length ? <section className="irp-bucket-section">
      <div className="irp-section-heading">
        <div><span className="mono">Capability readiness model</span><h3>Incident response capabilities</h3></div>
        <span className="muted">Each capability has a fixed point budget. Standards provide traceability into these scores.</span>
      </div>
      <div className="irp-bucket-grid">
        {bucketScores.map(([bucketId, bucket]) => <article className="irp-bucket-card" key={bucketId}>
          <header><div><h4>{bucket.label}</h4><p>{bucket.description}</p></div><strong>{bucket.points_earned}<small> / {bucket.points_possible}</small></strong></header>
          <div className="irp-score-track"><span style={{ width: `${Math.max(0, Math.min(100, Number(bucket.score || 0)))}%` }} /></div>
          <footer><span>{bucket.score}%</span><span>{bucket.controls_reviewed} controls</span>{bucket.essential_controls ? <span>{bucket.essential_controls} essential</span> : null}</footer>
        </article>)}
      </div>
    </section> : null}

    <section className="irp-findings-section">
      <div className="irp-section-heading">
        <div><span className="mono">Remediation findings</span><h3>Consolidated findings</h3></div>
        <span className="muted">Related control gaps are grouped into actionable capabilities. Full control traceability follows.</span>
      </div>
      <div className="irp-filter-bar" aria-label="Filter findings">
        <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All <span>{findings.length}</span></button>
        {SEVERITIES.map((severity) => <button type="button" key={severity} className={filter === severity.toLocaleLowerCase() ? "active" : ""} onClick={() => setFilter(severity.toLocaleLowerCase() as FindingFilter)}>{severity} <span>{severityCounts[severity]}</span></button>)}
        {standards.map((standard) => <button type="button" key={standard} className={filter === `standard:${standard}` ? "active" : ""} onClick={() => setFilter(`standard:${standard}` as FindingFilter)}>{standardLabel(standard)} <span>{findings.filter((finding: any) => (finding.standards || []).includes(standard)).length}</span></button>)}
      </div>
      <div className="irp-findings-table-wrap">
        <table className="table irp-findings-table">
          <thead><tr><th>Capability</th><th>Mapped controls</th><th>Status</th><th>Evidence in plan</th><th aria-sort={prioritySort === "none" ? "none" : prioritySort === "high-first" ? "descending" : "ascending"}><button type="button" className="irp-sort-button" onClick={() => setPrioritySort((current) => current === "high-first" ? "low-first" : "high-first")}>Priority <span>{prioritySort === "high-first" ? "H-L" : prioritySort === "low-first" ? "L-H" : "Sort"}</span></button></th><th>Finding</th></tr></thead>
          <tbody>{visibleFindings.map((finding: any) => <tr key={`${finding.control_id}-${finding.finding}`}>
            <td><b>{finding.capability || finding.control_name || finding.control_id}</b><span>{finding.bucket_label || (finding.standards || []).map((standard: string) => standardLabel(standard)).join(", ")}</span></td>
            <td><b>{finding.control_count || finding.control_ids?.length || 1}</b><span>{(finding.standards || []).map((standard: string) => standardLabel(standard)).join(", ")}</span></td>
            <td><span className={`irp-status status-${String(finding.status).toLocaleLowerCase()}`}>{finding.status}</span></td>
            <td>{finding.evidence || "Not addressed"}</td>
            <td><span className={`irp-priority severity-${findingSeverity(finding).toLocaleLowerCase()}`}>{findingSeverity(finding)}</span></td>
            <td><p>{finding.finding}</p></td>
          </tr>)}</tbody>
        </table>
        {!visibleFindings.length ? <div className="irp-empty-filter">No findings match this filter.</div> : null}
      </div>
    </section>

    {controlResults.length ? <details className="irp-traceability">
      <summary><span><b>Control traceability appendix</b><small>{controlResults.length} applicable controls with source evidence and evaluation status</small></span><strong>View controls</strong></summary>
      <div className="irp-findings-table-wrap">
        <table className="table irp-traceability-table">
          <thead><tr><th>Bucket</th><th>Control</th><th>Standard</th><th>Status</th><th>Priority</th><th>Requirement and evidence</th></tr></thead>
          <tbody>{controlResults.map((control: any, index: number) => <tr key={`${control.control_id}-${control.standards?.join("-")}-${index}`}>
            <td>{control.bucket_label || "Control review"}</td>
            <td><b>{control.control_id}</b></td>
            <td>{(control.standards || []).map((standard: string) => standardLabel(standard)).join(", ")}</td>
            <td><span className={`irp-status status-${String(control.status).toLocaleLowerCase()}`}>{control.status}</span></td>
            <td><span className={`irp-priority severity-${findingSeverity(control).toLocaleLowerCase()}`}>{findingSeverity(control)}</span></td>
            <td><b>{humanizeControlText(control.requirement || control.control_name)}</b><p>{control.evidence || "Not addressed"}</p></td>
          </tr>)}</tbody>
        </table>
      </div>
    </details> : null}

    {result.remediation_roadmap?.phases?.length ? <section className="irp-roadmap">
      <div className="irp-section-heading"><div><span className="mono">Action plan</span><h3>30 / 60 / 90 day remediation roadmap</h3></div></div>
      <div className="irp-roadmap-list">
        {result.remediation_roadmap.phases.map((phase: any, phaseIndex: number) => {
          const isOpen = openPhases.has(phase.name);
          return <article key={phase.name} className={`severity-${phase.color || "medium"}`}>
            <button type="button" className="irp-roadmap-toggle" onClick={() => togglePhase(phase.name)} aria-expanded={isOpen}>
              <span className="irp-roadmap-phase">Phase {phaseIndex + 1}</span>
              <span><b>{phase.name}</b><small>{phase.timeframe}</small></span>
              <em>{phase.items?.length || 0} action{phase.items?.length === 1 ? "" : "s"}</em>
              <strong aria-hidden="true">{isOpen ? "-" : "+"}</strong>
            </button>
            {isOpen ? <div className="irp-roadmap-items">
              {phase.items?.length ? phase.items.map((rawItem: any) => {
                const item = resolveRoadmapItem(rawItem, findings);
                return <div key={`${phase.name}-${item.number}-${item.title}`}>
                  <span>{String(item.number || 1).padStart(2, "0")}</span>
                  <div className="irp-roadmap-action">
                    <b>{item.title}</b>
                    <dl>
                      <div><dt>Implement</dt><dd>{item.implementation}</dd></div>
                      <div><dt>Deliverable</dt><dd>{item.deliverable}</dd></div>
                      <div><dt>Validate</dt><dd>{item.validation}</dd></div>
                    </dl>
                    <footer>
                      {(item.references || []).length ? <span>Mapped controls</span> : null}
                      {(item.references || []).map((reference: string) => <small key={reference}>{reference}</small>)}
                    </footer>
                  </div>
                </div>;
              }) : <p className="muted">No actions assigned to this phase.</p>}
            </div> : null}
          </article>;
        })}
      </div>
    </section> : null}

    {!demo ? <footer className="irp-report-footer">
      <div><b>Data handling</b><span>{result.data_handling?.message || "Submitted policy text is processed in memory for this assessment and is not stored."}</span></div>
    </footer> : null}

    {!demo && assessments.length > 1 ? <section className="irp-assessment-exports">
      <div className="irp-section-heading"><div><span className="mono">Deliverables</span><h3>Organization reports</h3></div></div>
      {assessments.map((assessment) => <div key={assessment.assessmentId}>
        <div><b>{assessment.orgName}</b>{assessment.reused ? <span className="badge">Existing result reused</span> : null}</div>
        <div className="irp-export-actions">
          <a className="btn secondary" href={`/api/assessments/${assessment.assessmentId}/export?format=report`} target="_blank">Report</a>
          <a className="btn secondary" href={`/api/assessments/${assessment.assessmentId}/export?format=deck`} target="_blank">Deck</a>
        </div>
      </div>)}
    </section> : null}
  </div>;
}
