"use client";

import { useState } from "react";
import { demoOrgName } from "@/lib/demo";
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

function newOrg(name = ""): ReviewedOrg {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, documents: [], text: "" };
}

function orgDocuments(orgs: ReviewedOrg[]) {
  return orgs.flatMap((org) => {
    const label = org.name || "Unnamed organization";
    if (org.documents.length) {
      return org.documents.map((doc) => ({ name: `${label} / ${doc.name}`, text: `Organization: ${label}\n\n${doc.text}` }));
    }
    return org.text.trim() ? [{ name: `${label} policy text`, text: `Organization: ${label}\n\n${org.text}` }] : [];
  });
}

export function IrpClient({ demo }: { demo: boolean }) {
  const [clientName, setClientName] = useState(demo ? "Demo Client Group" : "");
  const [industry, setIndustry] = useState("health-center");
  const [orgs, setOrgs] = useState<ReviewedOrg[]>(demo ? [{
    ...newOrg(demoOrgName("health-center")),
    documents: [{ name: "demo-irp.txt", text: "Demo incident response policy text." }]
  }] : [newOrg("")]);
  const [loading, setLoading] = useState(false);
  const [quoting, setQuoting] = useState(false);
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
    withinGuard: true
  } : null);
  const [result, setResult] = useState<any>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);

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
        [...files].map(async (file) => ({
          name: file.name,
          text: await file.text()
        }))
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
    if (demo) setOrgs((rows) => rows.map((org, index) => index === 0 ? { ...org, name: demoOrgName(nextIndustry) } : org));
    clearQuote();
  }

  async function estimate() {
    const validOrgs = orgs.map((org) => ({ ...org, name: org.name.trim() })).filter((org) => org.name);
    if (!clientName.trim()) return alert("Enter the client or umbrella organization name.");
    if (!validOrgs.length) return alert("Add at least one organization being reviewed.");
    const documents = orgDocuments(validOrgs);
    if (!documents.length) return alert("Upload or paste policy text for at least one reviewed organization.");
    setQuoting(true);
    const res = await fetch("/api/run-quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ module: "irp", orgNames: validOrgs.map((org) => org.name), documents })
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
    setLoading(true);
    const res = await fetch("/api/assess", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        demo,
        orgName: clientName || validOrgs[0]?.name,
        industry,
        orgNames: validOrgs.map((org) => org.name),
        orgCount: validOrgs.length,
        quoteId: acceptedQuote?.id,
        documents
      })
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return alert(data.error || "Assessment failed");
    setResult(data.result);
    setAssessmentId(data.assessmentId || null);
  }

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

          <div className="card" style={{ padding: 14, background: "rgba(255,255,255,.58)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <div>
                <div className="mono">Organizations reviewed</div>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>Each named organization becomes a separate $250 IRP invoice line item.</p>
              </div>
              <button className="btn secondary" type="button" onClick={addOrg}>Add org</button>
            </div>
            {orgs.map((org, index) => (
              <div key={org.id} className="card" style={{ padding: 12, marginTop: 10, background: "rgba(255,255,255,.68)" }}>
                <label>
                  Organization {index + 1}
                  <input className="input" value={org.name} onChange={(e) => updateOrg(org.id, { name: e.target.value })} placeholder="Organization being assessed" />
                </label>
                <label>
                  Policy uploads
                  <input className="input" type="file" multiple accept=".txt,.md,.csv,.json,.html,.xml" onChange={(e) => readFiles(org.id, e.target.files)} />
                </label>
                {org.status ? <p className="muted" style={{ fontSize: 13, margin: 0 }}>{org.status}</p> : null}
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

          {!demo ? <button className="btn secondary" onClick={estimate} disabled={quoting}>{quoting ? "Estimating..." : "Estimate run"}</button> : null}
          {acceptedQuote ? <RunQuoteSummary quote={acceptedQuote} /> : null}
          {!demo && acceptedQuote ? (
            <CheckoutButton module="irp" quantity={acceptedQuote.orgCount} quoteId={acceptedQuote.id}>Purchase {acceptedQuote.orgCount} org credit{acceptedQuote.orgCount === 1 ? "" : "s"}</CheckoutButton>
          ) : null}
          <button className="btn" onClick={run} disabled={loading || (!demo && !acceptedQuote)}>{loading ? "Generating..." : demo ? "Run demo" : "Run assessment"}</button>
          <p className="muted" style={{ fontSize: 13 }}>Payment is verified server-side before any model call. Uploaded source text is used in memory for this request only. IRP billing is fixed at $250 per organization assessed.</p>
        </div>
      </div>
      <div className="card">
        <div className="mono">Result</div>
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
            <h3>Findings</h3>
            <table className="table">
              <tbody>{(result.findings || []).map((finding: any) => <tr key={finding.control_id + finding.finding}><td>{finding.control_id}</td><td>{finding.status}</td><td>{finding.risk_level}</td><td>{finding.finding}</td></tr>)}</tbody>
            </table>
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              {assessmentId ? (
                <>
                  <a className="btn secondary" href={`/api/assessments/${assessmentId}/export?format=report`} target="_blank">Report</a>
                  <a className="btn secondary" href={`/api/assessments/${assessmentId}/export?format=deck`} target="_blank">Deck</a>
                  <a className="btn secondary" href={`/api/assessments/${assessmentId}/export?format=json`} target="_blank">JSON</a>
                </>
              ) : <span className="badge">Demo exports disabled</span>}
            </div>
          </>
        ) : <p className="muted">Generated reports appear here. Demo mode returns static sample data and never calls the model.</p>}
      </div>
    </div>
  );
}
