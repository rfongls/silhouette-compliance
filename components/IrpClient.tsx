"use client";

import { useEffect, useState } from "react";
import { demoOrgName } from "@/lib/demo";
import { defaultStandards, INDUSTRY_STANDARDS } from "@/lib/analysis/standards";
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

type AssessmentScope = "self" | "network";

type DemoPolicySection = {
  number: string;
  title: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
  note?: string;
};

const DEMO_POLICY_NAME = "JCHC-Incident-Response-Plan-v3.2-2026.pdf";
const DEMO_POLICY_SECTIONS: readonly DemoPolicySection[] = [
  {
    number: "1",
    title: "Purpose",
    paragraphs: ["This plan establishes the coordinated process Johnson Community Health Center uses to identify, report, assess, contain, eradicate, and recover from information security incidents that may affect clinical operations, workforce members, patients, business partners, or protected information."]
  },
  {
    number: "2",
    title: "Scope",
    paragraphs: ["This plan applies to all workforce members, facilities, information systems, medical devices, cloud services, vendors, and records owned or operated by JCHC. It covers suspected and confirmed events involving electronic protected health information, personally identifiable information, payment information, or interruption of essential patient-care services."]
  },
  {
    number: "3",
    title: "Authority and References",
    bullets: ["HIPAA Security Rule, 45 CFR Part 164", "HITECH Act breach notification requirements", "NIST SP 800-53 Rev. 5 incident response controls", "JCHC Business Continuity and Disaster Recovery Plan"]
  },
  {
    number: "4",
    title: "Incident Classification",
    bullets: ["Severity 1: active threat to patient safety, widespread outage, or confirmed large-scale disclosure", "Severity 2: confirmed compromise with limited operational impact", "Severity 3: suspected event requiring investigation", "Severity 4: policy violation or low-impact event contained by routine operations"]
  },
  {
    number: "5",
    title: "Roles and Responsibilities",
    bullets: ["Incident Commander: Chief Information Security Officer", "Privacy Officer: evaluates privacy impact and required notifications", "IT Operations: isolates affected systems, preserves logs, and restores services", "Clinical Operations: coordinates downtime procedures and patient-care priorities", "Communications Lead: prepares approved internal and external messaging", "Legal Counsel: advises on regulatory, contractual, and law-enforcement obligations"]
  },
  {
    number: "6",
    title: "Reporting and Activation",
    paragraphs: ["Workforce members must immediately report suspected incidents to the Service Desk or Privacy Office. The Service Desk records the event, alerts the on-call security lead, and opens an incident record. The Incident Commander determines severity and activates the response team when escalation is required."]
  },
  {
    number: "7",
    title: "Response Procedures",
    bullets: ["Identification: validate the event, affected systems, data types, and business impact", "Containment: isolate affected assets while preserving patient-care continuity", "Eradication: remove malicious artifacts, close exploited access paths, and validate remediation", "Recovery: restore from approved backups, monitor restored systems, and obtain operational approval", "Closure: document decisions, evidence, costs, notifications, and corrective actions"]
  },
  {
    number: "8",
    title: "Communications and Notification",
    paragraphs: ["The Privacy Officer determines whether patients, regulators, business partners, law enforcement, or the media require notification. Communications must be approved by Legal Counsel and the Communications Lead before release. Notification timing will follow applicable legal and contractual requirements."],
    note: "The plan does not include a notification decision matrix, named regulatory clocks, or after-hours contact procedures."
  },
  {
    number: "9",
    title: "Evidence Handling",
    paragraphs: ["Responders must preserve relevant logs, system images, messages, access records, and decision notes. Evidence is recorded in the incident record with the collector, date, source, and storage location. Legal Counsel may initiate formal chain-of-custody procedures when litigation or law-enforcement involvement is anticipated."]
  },
  {
    number: "10",
    title: "Recovery and Return to Operations",
    paragraphs: ["System owners validate that security controls are restored before production use. Clinical Operations confirms that patient-care workflows are available, and the Incident Commander authorizes return to normal operations. Enhanced monitoring remains in place until the response team closes the incident."]
  },
  {
    number: "11",
    title: "Testing, Training, and Improvement",
    paragraphs: ["New workforce members receive incident reporting training. The Security Office may schedule tabletop exercises based on available resources. Material incidents are reviewed for lessons learned, and recommended improvements are presented to the Compliance Committee."],
    note: "The plan does not define a required exercise cadence, accountable owner, completion deadline, or method for tracking corrective actions."
  },
  {
    number: "12",
    title: "Records Retention and Review",
    paragraphs: ["Incident records, supporting evidence, and after-action documentation are retained for three years. The Security Office reviews this plan annually and after material changes to technology, operations, or regulatory requirements."],
    note: "The three-year retention period does not meet the six-year HIPAA documentation retention requirement."
  }
];

const DEMO_POLICY_TEXT = [
  "JOHNSON COMMUNITY HEALTH CENTER",
  "INFORMATION SECURITY INCIDENT RESPONSE PLAN",
  "Document ID: JCHC-SEC-IR-001 | Version: 3.2 | Effective: March 1, 2026",
  "Owner: Chief Information Security Officer | Classification: Internal Use",
  "Approved by: Compliance and Risk Committee",
  ...DEMO_POLICY_SECTIONS.flatMap((section) => [
    `\n${section.number}. ${section.title}`,
    ...(section.paragraphs || []),
    ...(section.bullets || []).map((item) => `- ${item}`),
    ...("note" in section ? [`Assessment note: ${section.note}`] : [])
  ])
].join("\n");

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

export function IrpClient({ demo, isAdmin, characterLimitPerOrg, availableStandardsByIndustry }: { demo: boolean; isAdmin: boolean; characterLimitPerOrg: number; availableStandardsByIndustry: Record<string, string[]> }) {
  const [assessmentScope, setAssessmentScope] = useState<AssessmentScope>("self");
  const [industry, setIndustry] = useState("health-center");
  const [standards, setStandards] = useState(availableDefaults("health-center", availableStandardsByIndustry, demo));
  const [orgs, setOrgs] = useState<ReviewedOrg[]>(demo ? [{
    ...newOrg(demoOrgName("health-center")),
    documents: [{ name: DEMO_POLICY_NAME, text: DEMO_POLICY_TEXT }]
  }] : [newOrg("")]);
  const [quoting, setQuoting] = useState(false);
  const [phiAttested, setPhiAttested] = useState(demo);
  const [acceptedQuote, setAcceptedQuote] = useState<RunQuote | null>(demo ? {
    id: "demo",
    orgNames: [demoOrgName("health-center")],
    orgCount: 1,
    documentCount: 1,
    charCount: DEMO_POLICY_TEXT.length,
    estimatedInputTokens: 6009,
    estimatedOutputTokens: 8000,
    estimatedModelCostCents: 14,
    customerAmountCents: 25000,
    marginCents: 24986,
    marginPercent: 99.9,
    charCountByOrg: { [demoOrgName("health-center")]: DEMO_POLICY_TEXT.length },
    maxCharsPerOrg: DEMO_POLICY_TEXT.length,
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

  function changeAssessmentScope(nextScope: AssessmentScope) {
    setAssessmentScope(nextScope);
    clearQuote();
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

  async function createRunQuote() {
    const scopedOrgs = assessmentScope === "self" ? orgs.slice(0, 1) : orgs;
    const validOrgs = scopedOrgs.map((org) => ({ ...org, name: org.name.trim() })).filter((org) => org.name);
    if (!validOrgs.length) {
      alert("Add at least one organization being reviewed.");
      return null;
    }
    if (!standards.length) {
      alert("No published base control board is available for this domain. An administrator must publish one before an assessment can run.");
      return null;
    }
    const documents = orgDocuments(validOrgs);
    if (!documents.length) {
      alert("Upload or paste policy text for at least one reviewed organization.");
      return null;
    }
    if (!phiAttested) {
      alert("Confirm that you reviewed the files and removed PHI before starting the assessment.");
      return null;
    }
    setQuoting(true);
    try {
      const res = await fetch("/api/run-quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ module: "irp", industry, standards, orgNames: validOrgs.map((org) => org.name), documents, phiAttested })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || (isAdmin ? "Estimate failed" : "The assessment could not be prepared."));
        return null;
      }
      setAcceptedQuote(data.quote);
      return data.quote as RunQuote;
    } finally {
      setQuoting(false);
    }
  }

  async function estimate() {
    await createRunQuote();
  }

  async function run() {
    const runQuote = !demo && !acceptedQuote ? await createRunQuote() : acceptedQuote;
    if (!demo && !runQuote) return;
    if (!demo && runQuote && !runQuote.withinGuard) return alert("This document set exceeds the current processing guard. Reduce the upload size or split the run.");
    const scopedOrgs = assessmentScope === "self" ? orgs.slice(0, 1) : orgs;
    const validOrgs = scopedOrgs.map((org) => ({ ...org, name: org.name.trim() })).filter((org) => org.name);
    const documents = orgDocuments(validOrgs);
    if (!documents.length) return alert("Upload or paste policy text before running.");
    if (!demo && !phiAttested) return alert("Confirm that you reviewed the files and removed PHI before running.");
    setElapsedSeconds(0);
    setResult(null);
    setAssessmentId(null);
    setAssessments([]);
    setOperation({
      state: "SUBMITTING",
      quoteId: runQuote?.id || null,
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
          orgName: validOrgs[0]?.name,
          industry,
          standards,
          orgNames: validOrgs.map((org) => org.name),
          orgCount: validOrgs.length,
          quoteId: runQuote?.id,
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
      setAssessments(Array.isArray(data.assessments) ? data.assessments : data.assessmentId ? [{ assessmentId: data.assessmentId, orgName: data.result?.organization_name || validOrgs[0]?.name || "Organization", result: data.result }] : []);
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
    <div className="irp-flow">
      {demo ? (
      <section className="card irp-process-card irp-demo-card">
        <div className="mono">Curated demo</div>
        <h2>Sample IRP assessment</h2>
        <p className="muted irp-process-intro">Review a realistic fictional healthcare IRP and open a curated gap-analysis report. Demo mode does not accept uploads, call an AI provider, or enable downloads.</p>
        <div className="irp-demo-grid">
          <section className="irp-demo-source">
            <div className="mono">Sample source</div>
            <div className="irp-demo-file">
              <div>
                <b>{DEMO_POLICY_NAME}</b>
                <span className="muted">Searchable PDF extract | Version 3.2 | Fictional organization</span>
              </div>
              <span className="badge">Read only</span>
            </div>
            <article className="irp-demo-document" aria-label="Sample incident response plan">
              <header>
                <span className="mono">Internal use</span>
                <h3>Johnson Community Health Center</h3>
                <h4>Information Security Incident Response Plan</h4>
                <dl>
                  <div><dt>Document ID</dt><dd>JCHC-SEC-IR-001</dd></div>
                  <div><dt>Version</dt><dd>3.2</dd></div>
                  <div><dt>Effective</dt><dd>March 1, 2026</dd></div>
                  <div><dt>Owner</dt><dd>Chief Information Security Officer</dd></div>
                </dl>
              </header>
              {DEMO_POLICY_SECTIONS.map((section) => (
                <section key={section.number}>
                  <h5>{section.number}. {section.title}</h5>
                  {(section.paragraphs || []).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {section.bullets?.length ? <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul> : null}
                </section>
              ))}
            </article>
          </section>
          <section className="irp-demo-scope">
            <div className="mono">Assessment scope</div>
            <dl>
              <div><dt>Organization</dt><dd>{demoOrgName("health-center")} <span className="muted">(fictional)</span></dd></div>
              <div><dt>Industry</dt><dd>Health Center / Healthcare</dd></div>
              <div><dt>Standards</dt><dd>HIPAA Security / Privacy and NIST SP 800-53 Rev. 5</dd></div>
              <div><dt>Output</dt><dd>Scored findings and remediation roadmap</dd></div>
            </dl>
            <button className="btn" type="button" onClick={run} disabled={operationActive}>
              {operationActive ? "Preparing sample report..." : result ? "View sample report again" : "View sample report"}
            </button>
          </section>
        </div>
      </section>
      ) : (
      <section className="card irp-process-card">
        <div className="mono">Policy processing</div>
        <h2>Configure IRP assessment</h2>
        <p className="muted irp-process-intro">Define the assessment scope, choose the published standards, then attach the policy set for each organization being reviewed.</p>
        <div className="irp-flow-steps" aria-label="Assessment workflow">
          <span><b>1</b> Assessment</span>
          <span><b>2</b> Standards</span>
          <span><b>3</b> Policy files</span>
          <span><b>4</b> Run and report</span>
        </div>
        <div className="form">
          <div className="irp-config-grid">
          <section className="irp-stage-panel">
            <div className="mono">1. Assessment</div>
            <h3>Scope and industry</h3>
          <fieldset className="irp-scope-control">
            <legend>Who is this assessment for?</legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
              <button className={assessmentScope === "self" ? "btn" : "btn secondary"} type="button" onClick={() => changeAssessmentScope("self")} aria-pressed={assessmentScope === "self"}>
                My organization
              </button>
              <button className={assessmentScope === "network" ? "btn" : "btn secondary"} type="button" onClick={() => changeAssessmentScope("network")} aria-pressed={assessmentScope === "network"}>
                Client or network
              </button>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>
              {assessmentScope === "self"
                ? "Assess one IRP for your own organization."
                : "Assess one or more organizations on behalf of a client or parent network. Include the parent as an organization if its own policy should be scored."}
            </p>
          </fieldset>
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
          </section>

          <section className="irp-stage-panel">
            <div className="mono">2. Standards</div>
            <h3>Controls used for scoring</h3>
          <fieldset className="irp-standards-control">
            <legend className="sr-only">Standards used for scoring</legend>
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
            <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>The assessment and final report use only these published control boards.</p>
          </fieldset>
          </section>
          </div>

          <section className="irp-policy-stage">
            <div className="irp-stage-heading">
              <div>
                <div className="mono">3. Policy files</div>
                <h3>Organizations and policy documents</h3>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                  {assessmentScope === "self" ? "This organization is one $250 IRP assessment." : "Each named organization becomes a separate $250 IRP invoice line item."}
                </p>
              </div>
              {assessmentScope === "network" ? <button className="btn secondary" type="button" onClick={addOrg}>Add org</button> : null}
            </div>
            <div className={assessmentScope === "network" ? "irp-org-grid" : undefined}>
            {(assessmentScope === "self" ? orgs.slice(0, 1) : orgs).map((org, index) => (
              <div key={org.id} className="irp-org-entry">
                <label>
                  {assessmentScope === "self" ? "Organization name" : `Organization ${index + 1}`}
                  <input className="input" value={org.name} onChange={(e) => updateOrg(org.id, { name: e.target.value })} placeholder={assessmentScope === "self" ? "Your organization name" : "Organization being assessed"} />
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
                {assessmentScope === "network" ? <button className="btn ghost" type="button" onClick={() => removeOrg(org.id)} disabled={orgs.length === 1}>Remove org</button> : null}
              </div>
            ))}
            </div>
          </section>

          {!demo ? (
            <label className="irp-attestation">
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

          <div className="irp-run-stage">
          <div>
            <div className="mono">4. Run and report</div>
            <p className="muted">{isAdmin ? "Review the internal run estimate if needed, then start the assessment." : "Start the assessment using the organization credits already assigned to your account."}</p>
          </div>
          <div className="irp-run-actions">
          {!demo && isAdmin ? <button className="btn secondary" onClick={estimate} disabled={quoting || !phiAttested}>{quoting ? "Estimating..." : "Estimate run"}</button> : null}
          <button className="btn" onClick={run} disabled={operationActive || quoting || (!demo && !phiAttested)}>{operationActive ? "Assessment running" : quoting ? "Preparing assessment..." : demo ? "Run demo" : "Run assessment"}</button>
          </div>
          </div>
          {isAdmin && acceptedQuote ? <RunQuoteSummary quote={acceptedQuote} /> : null}
          <p className="muted irp-processing-note">{isAdmin ? "Admin runs are comped while model usage and cost are recorded." : "Your purchased credits are verified server-side before any model call."} Uploaded source text is used in memory for this request only. The uploader is responsible for reviewing and removing PHI. IRP billing is fixed at $250 per organization assessed.</p>
        </div>
      </section>
      )}
      {operation || result ? <section className="card irp-result-card">
        <div className="mono">Assessment result</div>
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
            <div className="irp-report-heading">
              <div>
                <span className="mono">Incident Response Plan gap analysis</span>
                <h2>{result.organization_name}</h2>
                <p className="muted">{result.document_name || "Incident Response Plan"}{demo ? " | Fictional demonstration report" : ""}</p>
              </div>
              <span className="badge">{result.overall_posture}</span>
            </div>
            <div className="irp-executive-summary">
              <div className="irp-score-block">
                <span className="mono">Overall score</span>
                <div className="stat">{result.compliance_score}<span>/100</span></div>
              </div>
              <div>
                <h3>Executive summary</h3>
                <p>{result.posture_summary}</p>
                <p className="muted">The score reflects the submitted document only. Operational effectiveness should be validated through interviews, evidence review, and exercises.</p>
              </div>
            </div>
            {result.counts ? <div className="irp-gap-summary">
              <div><span>Total controls</span><b>{result.counts.total}</b></div>
              <div><span>Critical gaps</span><b>{result.counts.critical}</b></div>
              <div><span>High gaps</span><b>{result.counts.high}</b></div>
              <div><span>Medium gaps</span><b>{result.counts.medium}</b></div>
            </div> : null}
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
            <div className="irp-section-heading">
              <div><span className="mono">Control review</span><h3>Detailed findings</h3></div>
              <span className="muted">Evidence is traced to the submitted policy.</span>
            </div>
            {result.data_handling ? (
              <div className="card subcard" style={{ padding: 12, marginBottom: 12 }}>
                <b>Data handling</b>
                <p className="muted" style={{ margin: "5px 0 0", fontSize: 13 }}>{result.data_handling.message}</p>
              </div>
            ) : null}
            <div className="irp-findings-table-wrap">
              <table className="table irp-findings-table">
                <thead><tr><th>Control</th><th>Status</th><th>Risk</th><th>Evidence and finding</th></tr></thead>
                <tbody>{(result.findings || []).map((finding: any) => <tr key={finding.control_id + finding.finding}>
                  <td><b>{finding.control_id}</b><span>{(finding.standards || []).join(", ")}</span></td>
                  <td><span className={finding.status === "Yes" ? "badge" : finding.status === "Partial" ? "badge warning" : "badge locked"}>{finding.status}</span></td>
                  <td>{finding.risk_level}</td>
                  <td><b>{finding.finding}</b><span>{finding.evidence}</span></td>
                </tr>)}</tbody>
              </table>
            </div>
            {result.remediation_roadmap?.phases?.length ? <section className="irp-roadmap">
              <div className="irp-section-heading">
                <div><span className="mono">Action plan</span><h3>30 / 60 / 90 day remediation roadmap</h3></div>
              </div>
              <div className="irp-roadmap-grid">
                {result.remediation_roadmap.phases.map((phase: any) => <article key={phase.name}>
                  <span className="mono">{phase.timeframe}</span>
                  <h4>{phase.name}</h4>
                  {phase.items?.length ? <ol>{phase.items.map((item: any) => <li key={`${phase.name}-${item.number}-${item.title}`}><b>{item.title}</b><span>{item.description}</span><small>{(item.references || []).join(", ")}</small></li>)}</ol> : <p className="muted">No actions assigned to this phase.</p>}
                </article>)}
              </div>
            </section> : null}
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
            ) : demo ? <p className="muted" style={{ marginTop: 16 }}>This curated sample report is available in the demo view only.</p> : assessmentId ? null : null}
          </>
        ) : null}
      </section> : null}
    </div>
  );
}
