"use client";

import { useEffect, useState } from "react";
import { IrpReport } from "@/components/IrpReport";
import { NetworkIrpReport } from "@/components/NetworkIrpReport";
import type { ReportProfile } from "@/lib/report-profile";

type Assessment = { assessmentId: string; orgName: string; result: any; reused?: boolean };

export function IrpReportBundle({ assessments, networkReport, quoteId, demo, isAdmin = false }: { assessments: Assessment[]; networkReport: any; quoteId: string | null; demo: boolean; isAdmin?: boolean }) {
  const [selected, setSelected] = useState(networkReport ? "network" : assessments[0]?.assessmentId || "");
  const [profile, setProfile] = useState<ReportProfile>("customer");
  useEffect(() => {
    setSelected(networkReport ? "network" : assessments[0]?.assessmentId || "");
  }, [networkReport, assessments]);
  const active = assessments.find((assessment) => assessment.assessmentId === selected) || assessments[0];
  if (!active && !networkReport) return null;
  return <>
    {isAdmin ? <section className="irp-report-mode-bar" aria-label="Report audience">
      <div><span className="mono">Report audience</span><p>Switch the presentation without rerunning or changing the stored assessment.</p></div>
      <div className="irp-report-mode-switch" role="group" aria-label="Report audience selection">
        <button type="button" className={profile === "customer" ? "active" : ""} onClick={() => setProfile("customer")}>Customer report</button>
        <button type="button" className={profile === "internal" ? "active" : ""} onClick={() => setProfile("internal")}>Internal QA</button>
      </div>
    </section> : null}
    {isAdmin && profile === "internal" ? <div className="irp-internal-notice" role="status"><b>Internal - Not for Customer Distribution</b><span>Includes the complete control evaluation matrix and internal traceability detail.</span></div> : null}
    {(networkReport || assessments.length > 1) ? <nav className="irp-report-selector" aria-label="Assessment reports">
      {networkReport ? <button type="button" className={selected === "network" ? "active" : ""} onClick={() => setSelected("network")}>{networkReport.network_name} network report</button> : null}
      {assessments.map((assessment) => <button type="button" key={assessment.assessmentId} className={selected === assessment.assessmentId ? "active" : ""} onClick={() => setSelected(assessment.assessmentId)}>{assessment.orgName}</button>)}
    </nav> : null}
    {selected === "network" && networkReport && quoteId
      ? <NetworkIrpReport result={networkReport} quoteId={quoteId} profile={profile} />
      : active ? <IrpReport result={active.result} assessments={assessments} demo={demo} profile={profile} /> : null}
  </>;
}
