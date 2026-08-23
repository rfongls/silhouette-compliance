"use client";

import { useMemo, useState } from "react";

type AssessmentExport = {
  assessmentId: string;
  orgName: string;
  reused?: boolean;
};

type FindingFilter = "all" | "critical" | "high" | "medium" | "low" | `standard:${string}`;

const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;

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
  const [openPhases, setOpenPhases] = useState<Set<string>>(() => new Set([result.remediation_roadmap?.phases?.[0]?.name].filter(Boolean)));
  const findings = Array.isArray(result.findings) ? result.findings : [];
  const actionable = findings.filter((finding: any) => finding.status !== "Yes");
  const standards = useMemo<string[]>(() => [...new Set<string>(findings.flatMap((finding: any) => finding.standards || []).map(String))], [findings]);
  const visibleFindings = findings.filter((finding: any) => findingMatches(finding, filter));
  const severityCounts = Object.fromEntries(SEVERITIES.map((severity) => [
    severity,
    actionable.filter((finding: any) => findingSeverity(finding) === severity).length
  ]));
  const score = Number(result.compliance_score || 0);

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
        <span className={`irp-posture-badge ${postureClass(score)}`}>{result.overall_posture}</span>
        {!demo && assessments.length === 1 ? <div className="irp-export-actions">
          <a className="btn secondary" href={`/api/assessments/${assessments[0].assessmentId}/export?format=report`} target="_blank">Export report</a>
          <a className="btn secondary" href={`/api/assessments/${assessments[0].assessmentId}/export?format=deck`} target="_blank">Export deck</a>
          <a className="btn secondary" href={`/api/assessments/${assessments[0].assessmentId}/export?format=json`} target="_blank">Export JSON</a>
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
        <small>actionable finding{severityCounts[severity] === 1 ? "" : "s"}</small>
      </button>)}
    </section>

    <section className="irp-posture-panel">
      <div className="irp-posture-copy">
        <span className="mono">Overall posture</span>
        <h3>{result.overall_posture}</h3>
        <p>{result.posture_summary}</p>
        <p className="muted">The score reflects the submitted policy evidence. Operational effectiveness should also be validated through interviews, evidence review, and exercises.</p>
      </div>
      <div className="irp-standard-scores">
        <span className="mono">Selected standard scores</span>
        {Object.entries(result.score_breakdown || {}).map(([standard, breakdown]: [string, any]) => <div className="irp-standard-score" key={standard}>
          <div><b>{standard.toLocaleUpperCase()}</b><span>{breakdown.controls_reviewed} controls</span></div>
          <div className="irp-score-track"><span style={{ width: `${Math.max(0, Math.min(100, Number(breakdown.score || 0)))}%` }} /></div>
          <strong>{breakdown.score}</strong>
        </div>)}
      </div>
      <div className={`irp-overall-score ${postureClass(score)}`}>
        <span>Overall score</span>
        <b>{score}</b>
        <small>/100</small>
        <em>{result.counts?.total || findings.length} controls reviewed</em>
      </div>
    </section>

    <section className="irp-findings-section">
      <div className="irp-section-heading">
        <div><span className="mono">Control review</span><h3>Detailed findings</h3></div>
        <span className="muted">Evidence is traced to the submitted policy.</span>
      </div>
      <div className="irp-filter-bar" aria-label="Filter findings">
        <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All <span>{findings.length}</span></button>
        {SEVERITIES.map((severity) => <button type="button" key={severity} className={filter === severity.toLocaleLowerCase() ? "active" : ""} onClick={() => setFilter(severity.toLocaleLowerCase() as FindingFilter)}>{severity} <span>{severityCounts[severity]}</span></button>)}
        {standards.map((standard) => <button type="button" key={standard} className={filter === `standard:${standard}` ? "active" : ""} onClick={() => setFilter(`standard:${standard}` as FindingFilter)}>{standard} <span>{findings.filter((finding: any) => (finding.standards || []).includes(standard)).length}</span></button>)}
      </div>
      <div className="irp-findings-table-wrap">
        <table className="table irp-findings-table">
          <thead><tr><th>Control</th><th>Requirement</th><th>Status</th><th>Evidence in plan</th><th>Finding</th></tr></thead>
          <tbody>{visibleFindings.map((finding: any) => <tr key={`${finding.control_id}-${finding.finding}`}>
            <td><b>{finding.control_id}</b><span>{(finding.standards || []).join(", ")}</span></td>
            <td>{finding.requirement || finding.control_name}</td>
            <td><span className={`irp-status status-${String(finding.status).toLocaleLowerCase()}`}>{finding.status}</span></td>
            <td>{finding.evidence || "Not addressed"}</td>
            <td><span className={`irp-priority severity-${findingSeverity(finding).toLocaleLowerCase()}`}>{findingSeverity(finding)}</span><p>{finding.finding}</p></td>
          </tr>)}</tbody>
        </table>
        {!visibleFindings.length ? <div className="irp-empty-filter">No findings match this filter.</div> : null}
      </div>
    </section>

    {result.remediation_roadmap?.phases?.length ? <section className="irp-roadmap">
      <div className="irp-section-heading"><div><span className="mono">Action plan</span><h3>30 / 60 / 90 day remediation roadmap</h3></div></div>
      <div className="irp-roadmap-list">
        {result.remediation_roadmap.phases.map((phase: any) => {
          const isOpen = openPhases.has(phase.name);
          return <article key={phase.name} className={`severity-${phase.color || "medium"}`}>
            <button type="button" className="irp-roadmap-toggle" onClick={() => togglePhase(phase.name)} aria-expanded={isOpen}>
              <span className="irp-roadmap-dot" />
              <span><b>{phase.name}</b><small>{phase.timeframe}</small></span>
              <em>{phase.items?.length || 0} action{phase.items?.length === 1 ? "" : "s"}</em>
              <strong aria-hidden="true">{isOpen ? "-" : "+"}</strong>
            </button>
            {isOpen ? <div className="irp-roadmap-items">
              {phase.items?.length ? phase.items.map((item: any) => <div key={`${phase.name}-${item.number}-${item.title}`}>
                <span>{item.number}</span>
                <div><b>{item.title}</b><p>{item.description}</p><footer>{(item.references || []).map((reference: string) => <small key={reference}>{reference}</small>)}</footer></div>
              </div>) : <p className="muted">No actions assigned to this phase.</p>}
            </div> : null}
          </article>;
        })}
      </div>
    </section> : null}

    <footer className="irp-report-footer">
      <div><b>Data handling</b><span>{result.data_handling?.message || "Submitted policy text is processed in memory for this assessment and is not stored."}</span></div>
      {demo ? <span className="irp-demo-note">Curated demo report. Downloads are disabled.</span> : null}
    </footer>

    {!demo && assessments.length > 1 ? <section className="irp-assessment-exports">
      <div className="irp-section-heading"><div><span className="mono">Deliverables</span><h3>Organization reports</h3></div></div>
      {assessments.map((assessment) => <div key={assessment.assessmentId}>
        <div><b>{assessment.orgName}</b>{assessment.reused ? <span className="badge">Existing result reused</span> : null}</div>
        <div className="irp-export-actions">
          <a className="btn secondary" href={`/api/assessments/${assessment.assessmentId}/export?format=report`} target="_blank">Report</a>
          <a className="btn secondary" href={`/api/assessments/${assessment.assessmentId}/export?format=deck`} target="_blank">Deck</a>
          <a className="btn secondary" href={`/api/assessments/${assessment.assessmentId}/export?format=json`} target="_blank">JSON</a>
        </div>
      </div>)}
    </section> : null}
  </div>;
}
