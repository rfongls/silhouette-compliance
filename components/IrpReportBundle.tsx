"use client";

import { useEffect, useState } from "react";
import { IrpReport } from "@/components/IrpReport";
import { NetworkIrpReport } from "@/components/NetworkIrpReport";

type Assessment = { assessmentId: string; orgName: string; result: any; reused?: boolean };

export function IrpReportBundle({ assessments, networkReport, quoteId, demo }: { assessments: Assessment[]; networkReport: any; quoteId: string | null; demo: boolean }) {
  const [selected, setSelected] = useState(networkReport ? "network" : assessments[0]?.assessmentId || "");
  useEffect(() => {
    setSelected(networkReport ? "network" : assessments[0]?.assessmentId || "");
  }, [networkReport, assessments]);
  const active = assessments.find((assessment) => assessment.assessmentId === selected) || assessments[0];
  if (!active && !networkReport) return null;
  return <>
    {(networkReport || assessments.length > 1) ? <nav className="irp-report-selector" aria-label="Assessment reports">
      {networkReport ? <button type="button" className={selected === "network" ? "active" : ""} onClick={() => setSelected("network")}>{networkReport.network_name} network report</button> : null}
      {assessments.map((assessment) => <button type="button" key={assessment.assessmentId} className={selected === assessment.assessmentId ? "active" : ""} onClick={() => setSelected(assessment.assessmentId)}>{assessment.orgName}</button>)}
    </nav> : null}
    {selected === "network" && networkReport && quoteId
      ? <NetworkIrpReport result={networkReport} quoteId={quoteId} />
      : active ? <IrpReport result={active.result} assessments={assessments} demo={demo} /> : null}
  </>;
}
