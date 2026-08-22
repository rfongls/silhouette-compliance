"use client";

import { useEffect, useState } from "react";
import { demoOrgName } from "@/lib/demo";
import { defaultStandards, INDUSTRY_STANDARDS } from "@/lib/analysis/standards";
import { CheckoutButton } from "@/components/CheckoutButton";
import { RunQuoteSummary, type RunQuote } from "@/components/RunQuoteSummary";

type UploadedDoc = {
  name: string;
  text: string;
};

type ReviewedOrg = {
  id: string;
  name: string;
  documents: UploadedDoc[];
  text: string;
  status?: string;
};

type AssessmentProgress = {
  id: string;
  orgName: string | null;
  status: "PENDING" | "RUNNING" | "DELIVERED" | "FAILED" | "REFUNDED";
  createdAt: string;
  updatedAt: string;
  progressStage: string | null;
  progressMessage: string | null;
  progressCurrent: number;
  progressTotal: number;
  progressUpdatedAt: string | null;
  quoteId: string | null;
  result?: any;
};

type AssessmentOperation = {
  state: "SUBMITTING" | "RUNNING" | "COMPLETED" | "FAILED";
  quoteId: string | null;
  startedAt: number;
  message: string;
  rows: AssessmentProgress[];
};

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
}

function progressPercent(rows: AssessmentProgress[], state: AssessmentOperation["state"]) {
  if (state === "COMPLETED") return 100;
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.progressTotal), 0);
  const current = rows.reduce((sum, row) => sum + Math.min(Math.max(0, row.progressCurrent), Math.max(0, row.progressTotal)), 0);
  return total ? Math.min(99, Math.round((current / total) * 100)) : 0;
}

function newOrg(name = ""): ReviewedOrg {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, documents: [], text: "" };
}

function orgDocuments(orgs: ReviewedOrg[]) {
  return orgs.flatMap((org) => {
    const label = org.name || "Unnamed organization";
    if (org.documents.length) {
        return org.documents.map((doc) => ({ name: `${label} / ${doc.name}`, orgName: label, text: `Organization: ${label}\n\n${doc.text}` }));
    }
    return org.text.trim() ? [{ name: `${label} policy text`, orgName: label, text: `Organization: ${label}\n\n${org.text}` }] : [];
  });
}

function availableDefaults(industry: string, available: Record<string, string[]>, demo: boolean) {
  const deployed = demo ? (INDUSTRY_STANDARDS[industry]?.standards || []).map((standard) => standard.key) : (available[industry] || []);
  const defaults = defaultStandards(industry).filter((standard) => deployed.includes(standard));
  return defaults.length ? defaults : deployed.slice(0, 1);
}

export function IrpClient({ demo, characterLimitPerOrg, availableStandardsByIndustry }: { demo: boolean; characterLimitPerOrg: number; availableStandardsByIndustry: Record<string, string[]> }) {
  const [clientName, setClientName] = useState(demo ? "Demo Client Group" : "");
  const [industry, setIndustry] = useState("health-center");
  const [standards, setStandards] = useState(availableDefaults("health-center", availableStandardsByIndustry, demo));
  const [orgs, setOrgs] = useState<ReviewedOrg[]>(demo ? [{
    ...newOrg(demoOrgName("health-center")),
    documents: [{ name: "demo-irp.txt", text: "Demo incident response policy text." }]
  }] : [newOrg("")]);
  const [quoting, setQuoting] = useState(false);
  const [phiAttested, setPhiAttested] = useState(demo);
  const [acceptedQuote, setAcceptedQuote] = useState<RunQuote | null>(demo ? {
    id: "demo",
    orgNames: [demoOrgName("health-center")],
    orgCount: 1,
    documentCount: 1,
    charCount: 35,
    estimatedInputTokens: 6009,
    estimatedOutputTokens: 8000,
    estimatedModelCostCents: 14,
    customerAmountCents: 25000,
    marginCents: 24986,
    marginPercent: 99.9,
    charCountByOrg: { [demoOrgName("health-center")]: 35 },
    maxCharsPerOrg: 35,
    characterLimitPerOrg,
    costLimitCents: 12500,
    withinGuard: true
  } : null);
  const [result, setResult] = useState<any>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Array<{ assessmentId: string; orgName: string; result: any; reused?: boolean }>>([]);
  const [operation, setOperation] = useState<AssessmentOperation | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const deployedStandards = demo ? null : new Set(availableStandardsByIndustry[industry] || []);
  const standardOptions = (INDUSTRY_STANDARDS[industry]?.standards || []).filter((standard) => !deployedStandards || deployedStandards.has(standard.key));
  const allStandardsSelected = standardOptions.length > 0 && standardOptions.every((standard) => standards.includes(standard.key));
  const operationActive = operation?.state === "SUBMITTING" || operation?.state === "RUNNING";

  useEffect(() => {
    if (!operationActive || !operation) return;
    const updateElapsed = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - operation.startedAt) / 1000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [operationActive, operation?.startedAt]);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    void fetch("/api/assessments?status=RUNNING", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const rows = Array.isArray(data?.assessments) ? data.assessments as AssessmentProgress[] : [];
        if (cancelled || !rows.length) return;
        const latestQuoteId = rows.find((row) => row.quoteId)?.quoteId || null;
        setOperation({
          state: "RUNNING",
          quoteId: latestQuoteId,
          startedAt: Date.parse(rows[0].createdAt) || Date.now(),
          message: "Restored an assessment currently running for this account.",
          rows
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [demo]);

  useEffect(() => {
    if (!operationActive || !operation?.quoteId || demo) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/assessments?quoteId=${encodeURIComponent(operation.quoteId!)}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        const rows = Array.isArray(data.assessments) ? data.assessments as AssessmentProgress[] : [];
        if (cancelled || !rows.length) return;
        const running = rows.some((row) => row.status === "RUNNING" || row.status === "PENDING");
        const delivered = rows.filter((row) => row.status === "DELIVERED" && row.result);
        const failed = rows.filter((row) => row.status === "FAILED" || row.status === "REFUNDED");
        const nextState: AssessmentOperation["state"] = running ? "RUNNING" : delivered.length ? "COMPLETED" : failed.length ? "FAILED" : "RUNNING";
        setOperation((current) => current ? {
          ...current,
          state: nextState,
          rows,
          message: running
            ? "Assessment processing is active. Progress is updated after each completed model pass."
            : delivered.length
              ? failed.length ? "Completed reports are ready; one or more organizations did not complete." : "Assessment processing completed."
              : "Assessment processing did not complete."
        } : current);
        if (delivered.length) {
          setResult(delivered[0].result);
          setAssessmentId(delivered[0].id);
          setAssessments(delivered.map((row) => ({ assessmentId: row.id, orgName: row.orgName || "Organization", result: row.result })));
        }
      } catch {
        // Keep the last persisted status visible while a poll temporarily fails.
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [demo, operationActive, operation?.quoteId]);

  function clearQuote() {
    if (!demo) setAcceptedQuote(null);
  }

  function updateOrg(id: string, patch: Partial<ReviewedOrg>) {
    setOrgs((rows) => rows.map((org) => org.id === id ? { ...org, ...patch } : org));
    clearQuote();
  }

  function addOrg() {
    setOrgs((rows) => [...rows, newOrg("")]);
    clearQuote();
  }

  function removeOrg(id: string) {
    setOrgs((rows) => rows.length === 1 ? rows : rows.filter((org) => org.id !== id));
    clearQuote();
  }

  async function readFiles(orgId: string, files: FileList | null) {
    if (!files?.length) return;
    updateOrg(orgId, { status: "Reading documents..." });
    try {
      const nextDocuments = await Promise.all(
        [...files].map(async (file) => {
          const isPdf = file.type === "application/pdf" || file.name.toLocaleLowerCase().endsWith(".pdf");
          if (!isPdf) return { name: file.name, text: await file.text() };

          const form = new FormData();
          form.append("file", file, file.name);
          const response = await fetch("/api/policy-documents/extract", { method: "POST", body: form });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(`${file.name}: ${result.error || "PDF text extraction failed."}`);
          return { name: file.name, text: String(result.text || "") };
        })
      );
      const text = nextDocuments.map((doc) => `# ${doc.name}\n\n${doc.text}`).join("\n\n");
      updateOrg(orgId, {
        documents: nextDocuments,
        text,
        status: `${nextDocuments.length} document${nextDocuments.length === 1 ? "" : "s"} queued.`
      });
    } catch (error) {
      updateOrg(orgId, { status: error instanceof Error ? error.message : "Could not read the selected files." });
    }
  }

  function changeIndustry(nextIndustry: string) {
    setIndustry(nextIndustry);
    setStandards(availableDefaults(nextIndustry, availableStandardsByIndustry, demo));
    if (demo) setOrgs((rows) => rows.map((org, index) => index === 0 ? { ...org, name: demoOrgName(nextIndustry) } : org));
    clearQuote();
  }

  function toggleAllStandards() {
    setStandards(allStandardsSelected ? availableDefaults(industry, availableStandardsByIndustry, demo) : standardOptions.map((standard) => standard.key));
    clearQuote();
  }

  function toggleStandard(standardKey: string) {
    setStandards((selected) => {
      if (selected.includes(standardKey)) return selected.length === 1 ? selected : selected.filter((key) => key !== standardKey);
      return [...selected, standardKey];
    });
    clearQuote();
  }

  async function estimate() {
    const validOrgs = orgs.map((org) => ({ ...org, name: org.name.trim() })).filter((org) => org.name);
    if (!clientName.trim()) return alert("Enter the client or umbrella organization name.");
    if (!validOrgs.length) return alert("Add at least one organization being reviewed.");
    if (!standards.length) return alert("No published base control board is available for this domain. An administrator must publish one before an assessment can run.");
    const documents = orgDocuments(validOrgs);
    if (!documents.length) return alert("Upload or paste policy text for at least one reviewed organization.");
    if (!phiAttested) return alert("Confirm that you reviewed the files and removed PHI before creating an estimate.");
    setQuoting(true);
    const res = await fetch("/api/run-quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ module: "irp", industry, standards, orgNames: validOrgs.map((org) => org.name), documents, phiAttested })
    });
    const data = await res.json();
    setQuoting(false);
    if (!res.ok) return alert(data.error || "Estimate failed");
    setAcceptedQuote(data.quote);
  }

  async function run() {
    if (!demo && !acceptedQuote) return alert("Create and accept a run estimate before starting the assessment.");
    if (!demo && acceptedQuote && !acceptedQuote.withinGuard) return alert("This document set exceeds the current processing guard. Reduce the upload size or split the run.");
    const validOrgs = orgs.map((org) => ({ ...org, name: org.name.trim() })).filter((org) => org.name);
    const documents = orgDocuments(validOrgs);
    if (!documents.length) return alert("Upload or paste policy text before running.");
    if (!demo && !phiAttested) return alert("Confirm that you reviewed the files and removed PHI before running.");
    setElapsedSeconds(0);
    setResult(null);
    setAssessmentId(null);
    setAssessments([]);
    setOperation({
      state: "SUBMITTING",
      quoteId: acceptedQuote?.id || null,
      startedAt: Date.now(),
      message: "Submitting the assessment and verifying payment, quote integrity, and published control boards.",
      rows: []
    });
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          demo,
          orgName: clientName || validOrgs[0]?.name,
          industry,
          standards,
          orgNames: validOrgs.map((org) => org.name),
          orgCount: validOrgs.length,
          quoteId: acceptedQuote?.id,
          phiAttested,
          documents
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data.error || "Assessment failed";
        setOperation((current) => current ? { ...current, state: "FAILED", message } : current);
        alert(message);
        return;
      }
      setResult(data.result);
      setAssessmentId(data.assessmentId || null);
      setAssessments(Array.isArray(data.assessments) ? data.assessments : data.assessmentId ? [{ assessmentId: data.assessmentId, orgName: data.result?.organization_name || clientName, result: data.result }] : []);
      setOperation((current) => current ? {
        ...current,
        state: "COMPLETED",
        message: Array.isArray(data.failed) && data.failed.length ? "Completed reports are ready; one or more organizations did not complete." : "Assessment processing completed.",
        rows: current.rows.map((row) => row.status === "RUNNING" ? { ...row, status: "DELIVERED", progressStage: "DELIVERED", progressMessage: "Assessment and report completed.", progressCurrent: row.progressTotal } : row)
      } : current);
    } catch {
      setOperation((current) => current ? {
        ...current,
        state: current.rows.some((row) => row.status === "RUNNING") ? "RUNNING" : "FAILED",
        message: current.rows.some((row) => row.status === "RUNNING")
          ? "The browser connection closed, but the server-side assessment is still running. Persisted progress will continue updating here."
          : "The assessment request could not be completed. No active server-side assessment was found."
      } : current);
    }
  }

  const operationProgress = operation ? progressPercent(operation.rows, operation.state) : 0;
  const operationLabel = operation?.state === "SUBMITTING" ? "Starting"
    : operation?.state === "RUNNING" ? "Running"
      : operation?.state === "COMPLETED" ? "Completed"
        : "Failed";

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(340px,.95fr) minmax(320px,1.05fr)" }}>
      <div className="card">
        <div className="mono">Upload console</div>
        <h2>Incident Response Plan</h2>
        <div className="form">
          <label>
            Client / umbrella organization
            <input className="input" value={clientName} onChange={(e) => { setClientName(e.target.value); clearQuote(); }} placeholder="Client organization or parent group" />
          </label>
          <label>
            Industry
            <select className="select" value={industry} onChange={(e) => changeIndustry(e.target.value)}>
              <option value="health-center">Health Center / Healthcare</option>
              <option value="financial">Financial</option>
              <option value="education">Education</option>
              <option value="public-sector">Public Sector</option>
              <option value="manufacturing">Manufacturing / OT</option>
              <option value="retail">Retail</option>
            </select>
          </label>

          <fieldset className="card subcard" style={{ padding: 14, margin: 0 }}>
            <legend style={{ padding: "0 6px" }}>Standards used for scoring</legend>
            {standardOptions.length ? <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <input type="checkbox" checked={allStandardsSelected} onChange={toggleAllStandards} />
              <b>All {INDUSTRY_STANDARDS[industry]?.label || "domain"} standards</b>
            </label> : <div className="badge locked">No published base controls are available for this domain.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
              {standardOptions.map((standard) => (
                <label key={standard.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={standards.includes(standard.key)} onChange={() => toggleStandard(standard.key)} />
                  <span>{standard.label}{standard.default ? " (default)" : ""}</span>
                </label>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>The estimate and final report use only these published control boards.</p>
          </fieldset>

          <div className="card subcard" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <div>
                <div className="mono">Organizations reviewed</div>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>Each named organization becomes a separate $250 IRP invoice line item.</p>
              </div>
              <button className="btn secondary" type="button" onClick={addOrg}>Add org</button>
            </div>
            {orgs.map((org, index) => (
              <div key={org.id} className="card nested-card" style={{ padding: 12, marginTop: 10 }}>
                <label>
                  Organization {index + 1}
                  <input className="input" value={org.name} onChange={(e) => updateOrg(org.id, { name: e.target.value })} placeholder="Organization being assessed" />
                </label>
                <label>
                  Policy uploads
                  <input className="input" type="file" multiple accept=".pdf,application/pdf,.txt,.md,.csv,.json,.html,.xml" onChange={(e) => readFiles(org.id, e.target.files)} />
                </label>
                {org.status ? <p className="muted" style={{ fontSize: 13, margin: 0 }}>{org.status}</p> : null}
                <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
                  {(org.documents.length ? org.documents.reduce((sum, doc) => sum + doc.text.length, 0) : org.text.length).toLocaleString()} of {characterLimitPerOrg.toLocaleString()} characters. Oversized submissions are blocked before checkout and are never truncated.
                </p>
                <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>PDF documents are converted to flat text in memory before analysis. Scanned PDFs require searchable text or OCR.</p>
                {org.documents.length ? (
                  <div style={{ marginTop: 8 }}>
                    {org.documents.map((doc) => <span className="badge" key={`${org.id}-${doc.name}`} style={{ marginRight: 6, marginBottom: 6 }}>{doc.name}</span>)}
                  </div>
                ) : null}
                <label>
                  Paste policy text
                  <textarea className="textarea" value={org.text} onChange={(e) => updateOrg(org.id, { text: e.target.value, documents: [] })} placeholder="Paste extracted policy text for this organization." />
                </label>
                <button className="btn ghost" type="button" onClick={() => removeOrg(org.id)} disabled={orgs.length === 1}>Remove org</button>
              </div>
            ))}
          </div>

          {!demo ? (
            <label className="card subcard" style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 14 }}>
              <input
                type="checkbox"
                checked={phiAttested}
                onChange={(event) => {
                  setPhiAttested(event.target.checked);
                  clearQuote();
                }}
                style={{ marginTop: 3 }}
              />
              <span>
                <b>Uploader data review</b>
                <span className="muted" style={{ display: "block", fontSize: 13, marginTop: 4 }}>
                  I confirm that I reviewed these files and removed protected health information (PHI). Silhouette does not inspect, classify, or certify uploads for PHI. This attestation will appear in the assessment report.
                </span>
              </span>
            </label>
          ) : null}

          {!demo ? <button className="btn secondary" onClick={estimate} disabled={quoting || !phiAttested}>{quoting ? "Estimating..." : "Estimate run"}</button> : null}
          {acceptedQuote ? <RunQuoteSummary quote={acceptedQuote} /> : null}
          {!demo && acceptedQuote ? (
            <CheckoutButton module="irp" quantity={acceptedQuote.orgCount} quoteId={acceptedQuote.id}>Purchase {acceptedQuote.orgCount} org credit{acceptedQuote.orgCount === 1 ? "" : "s"}</CheckoutButton>
          ) : null}
          <button className="btn" onClick={run} disabled={operationActive || (!demo && (!acceptedQuote || !phiAttested))}>{operationActive ? "Assessment running" : demo ? "Run demo" : "Run assessment"}</button>
          <p className="muted" style={{ fontSize: 13 }}>Payment is verified server-side before any model call. Uploaded source text is used in memory for this request only. The uploader is responsible for reviewing and removing PHI. IRP billing is fixed at $250 per organization assessed.</p>
        </div>
      </div>
      <div className="card">
        <div className="mono">Result</div>
        {operation ? (
          <div className="card subcard" role="status" aria-live="polite" style={{ padding: 14, margin: "12px 0 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div className="mono">Assessment status</div>
                <b>{operation.state === "COMPLETED" ? "Report ready" : operation.state === "FAILED" ? "Assessment stopped" : "Assessment processing"}</b>
              </div>
              <span className={operation.state === "FAILED" ? "badge locked" : operation.state === "RUNNING" || operation.state === "SUBMITTING" ? "badge warning" : "badge"}>{operationLabel}</span>
            </div>
            <p className="muted" style={{ margin: "10px 0 8px" }}>{operation.message}</p>
            <div style={{ height: 8, background: "var(--surface-nested)", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${operationProgress}%`, background: "var(--accent)", transition: "width 220ms ease" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: operation.rows.length ? 12 : 0 }}>
              <span className="muted" style={{ fontSize: 13 }}>{operationProgress}% complete</span>
              <span className="muted" style={{ fontSize: 13 }}>Elapsed {formatElapsed(elapsedSeconds)}</span>
            </div>
            {operation.rows.length ? (
              <table className="table">
                <thead><tr><th>Organization</th><th>Stage</th><th>Progress</th></tr></thead>
                <tbody>{operation.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.orgName || "Organization"}</td>
                    <td><span className={row.status === "FAILED" || row.status === "REFUNDED" ? "badge locked" : row.status === "RUNNING" ? "badge warning" : "badge"}>{row.progressStage || row.status}</span></td>
                    <td>
                      {row.progressMessage || "Waiting for the next status update."}
                      {row.progressTotal ? <><br/><span className="muted">{Math.min(row.progressCurrent, row.progressTotal)} of {row.progressTotal} analysis passes complete</span></> : null}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            ) : null}
            {operationActive ? <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>Keep this tab open while policy text remains in request memory. Progress updates after each completed model pass.</p> : null}
          </div>
        ) : null}
        {result ? (
          <>
            <h2>{result.organization_name}</h2>
            <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
              <div className="stat">{result.compliance_score}</div>
              <div>
                <b>{result.overall_posture}</b>
                <p className="muted" style={{ margin: 0 }}>{result.posture_summary}</p>
              </div>
            </div>
            {result.score_breakdown ? (
              <div style={{ marginTop: 16 }}>
                <div className="mono">Selected standard scores</div>
                <p className="muted" style={{ margin: "5px 0 10px", fontSize: 13 }}>Each selected standard is normalized to 100 points. The overall score is the equal average of these standard scores, with critical and high-priority controls weighted more heavily inside each standard.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
                  {Object.entries(result.score_breakdown).map(([standard, breakdown]: [string, any]) => (
                    <div className="card subcard" key={standard} style={{ padding: 12 }}>
                      <b>{standard.toLocaleUpperCase()}</b>
                      <div className="stat" style={{ fontSize: 30 }}>{breakdown.score}<span style={{ fontSize: 14 }}>/100</span></div>
                      <span className="muted" style={{ fontSize: 12 }}>{breakdown.controls_reviewed} controls reviewed</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <h3>Findings</h3>
            {result.data_handling ? (
              <div className="card subcard" style={{ padding: 12, marginBottom: 12 }}>
                <b>Data handling</b>
                <p className="muted" style={{ margin: "5px 0 0", fontSize: 13 }}>{result.data_handling.message}</p>
              </div>
            ) : null}
            <table className="table">
              <tbody>{(result.findings || []).map((finding: any) => <tr key={finding.control_id + finding.finding}><td>{finding.control_id}</td><td>{finding.status}</td><td>{finding.risk_level}</td><td>{finding.finding}</td></tr>)}</tbody>
            </table>
            {assessments.length ? (
              <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                {assessments.map((assessment) => (
                  <div className="card subcard" key={assessment.assessmentId} style={{ padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div><b>{assessment.orgName}</b>{assessment.reused ? <span className="badge" style={{ marginLeft: 8 }}>Existing result reused</span> : null}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <a className="btn secondary" href={`/api/assessments/${assessment.assessmentId}/export?format=report`} target="_blank">Report</a>
                        <a className="btn secondary" href={`/api/assessments/${assessment.assessmentId}/export?format=deck`} target="_blank">Deck</a>
                        <a className="btn secondary" href={`/api/assessments/${assessment.assessmentId}/export?format=json`} target="_blank">JSON</a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : assessmentId ? null : <span className="badge">Demo exports disabled</span>}
          </>
        ) : <p className="muted">{operationActive ? "The completed report will appear here automatically." : "Generated reports appear here. Demo mode returns static sample data and never calls the model."}</p>}
      </div>
    </div>
  );
}
