"use client";

import { useEffect, useRef, useState } from "react";
import { demoOrgName } from "@/lib/demo";
import { defaultStandards, INDUSTRY_STANDARDS } from "@/lib/analysis/standards";
import { DEMO_POLICY_NAME, DEMO_POLICY_SECTIONS, DEMO_POLICY_TEXT, demoAssessment } from "@/lib/analysis/irp-demo";
import { RunQuoteSummary, type RunQuote } from "@/components/RunQuoteSummary";
import { IrpReportBundle } from "@/components/IrpReportBundle";

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

type IrpWizardStep = 1 | 2 | 3 | 4 | 5;

const IRP_WIZARD_STEPS: Array<{ id: IrpWizardStep; label: string }> = [
  { id: 1, label: "Organization type" },
  { id: 2, label: "Industry" },
  { id: 3, label: "Standards" },
  { id: 4, label: "Policy files" },
  { id: 5, label: "Review and run" }
];

const INDUSTRY_CHOICES = [
  { value: "health-center", label: "Health Center / Healthcare", description: "Healthcare providers, health centers, care networks, and covered entities." },
  { value: "financial", label: "Financial", description: "Banks, credit unions, financial services, and regulated finance organizations." },
  { value: "education", label: "Education", description: "Schools, districts, colleges, universities, and education systems." },
  { value: "public-sector", label: "Public Sector", description: "Government agencies, municipalities, and public service organizations." },
  { value: "manufacturing", label: "Manufacturing / OT", description: "Manufacturers and organizations operating industrial or operational technology." },
  { value: "retail", label: "Retail", description: "Retailers, commerce platforms, and organizations handling payment environments." }
] as const;

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

function AssessmentStatusPanel({ operation, progress, elapsedSeconds }: { operation: AssessmentOperation; progress: number; elapsedSeconds: number }) {
  const label = operation.state === "SUBMITTING" ? "Starting"
    : operation.state === "RUNNING" ? "Running"
      : operation.state === "COMPLETED" ? "Completed"
        : "Failed";
  const active = operation.state === "SUBMITTING" || operation.state === "RUNNING";
  return (
    <div className="card subcard" role="status" aria-live="polite" style={{ padding: 14, margin: "16px 0 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="mono">Live job status</div>
          <b>{operation.state === "COMPLETED" ? "Report ready" : operation.state === "FAILED" ? "Assessment stopped" : "Assessment processing"}</b>
        </div>
        <span className={operation.state === "FAILED" ? "badge locked" : active ? "badge warning" : "badge"}>{label}</span>
      </div>
      <p className="muted" style={{ margin: "10px 0 8px" }}>{operation.message}</p>
      <div style={{ height: 8, background: "var(--surface-nested)", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent)", transition: "width 220ms ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: operation.rows.length ? 12 : 0 }}>
        <span className="muted" style={{ fontSize: 13 }}>{progress}% complete</span>
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
      {active ? <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>This status is stored server-side and reconnects after a page refresh. Progress updates after each completed model pass.</p> : null}
    </div>
  );
}

export function IrpClient({ demo, isAdmin, characterLimitPerOrg, availableStandardsByIndustry }: { demo: boolean; isAdmin: boolean; characterLimitPerOrg: number; availableStandardsByIndustry: Record<string, string[]> }) {
  const [wizardStep, setWizardStep] = useState<IrpWizardStep>(1);
  const [furthestWizardStep, setFurthestWizardStep] = useState<IrpWizardStep>(1);
  const [wizardError, setWizardError] = useState("");
  const [assessmentScope, setAssessmentScope] = useState<AssessmentScope>("self");
  const [parentOrgName, setParentOrgName] = useState("");
  const [industry, setIndustry] = useState("health-center");
  const [standards, setStandards] = useState(availableDefaults("health-center", availableStandardsByIndustry, demo));
  const [orgs, setOrgs] = useState<ReviewedOrg[]>(demo ? [{
    ...newOrg(demoOrgName("health-center")),
    documents: [{ name: DEMO_POLICY_NAME, text: DEMO_POLICY_TEXT }]
  }] : [newOrg("")]);
  const [quoting, setQuoting] = useState(false);
  const [checkoutState, setCheckoutState] = useState<"IDLE" | "OPENING" | "WAITING" | "PAID" | "FAILED">("IDLE");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const assessmentStarting = useRef(false);
  const resultSectionRef = useRef<HTMLElement | null>(null);
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
  const [networkReport, setNetworkReport] = useState<any>(null);
  const [reportQuoteId, setReportQuoteId] = useState<string | null>(null);
  const [operation, setOperation] = useState<AssessmentOperation | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const deployedStandards = demo ? null : new Set(availableStandardsByIndustry[industry] || []);
  const standardOptions = (INDUSTRY_STANDARDS[industry]?.standards || []).filter((standard) => !deployedStandards || deployedStandards.has(standard.key));
  const allStandardsSelected = standardOptions.length > 0 && standardOptions.every((standard) => standards.includes(standard.key));
  const operationActive = operation?.state === "SUBMITTING" || operation?.state === "RUNNING";
  const acceptedQuoteReportReady = Boolean(result && acceptedQuote && reportQuoteId === acceptedQuote.id);

  useEffect(() => {
    if (!result) return;
    const frame = window.requestAnimationFrame(() => {
      resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [result]);

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
        setWizardStep(5);
        setFurthestWizardStep(5);
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
          setNetworkReport(data.networkReport || null);
          setReportQuoteId(operation.quoteId);
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
    if (!demo) {
      setAcceptedQuote(null);
      setCheckoutState("IDLE");
      setCheckoutMessage("");
    }
  }

  function wizardStepError(step: IrpWizardStep) {
    if (step === 1 && assessmentScope === "network" && !parentOrgName.trim()) {
      return "Enter the network or parent organization name before continuing.";
    }
    if (step === 3 && !standards.length) {
      return "Select at least one published standard before continuing.";
    }
    if (step === 4) {
      const scopedOrgs = assessmentScope === "self" ? orgs.slice(0, 1) : orgs;
      if (!scopedOrgs.length || scopedOrgs.some((org) => !org.name.trim())) {
        return assessmentScope === "self"
          ? "Enter the organization name before continuing."
          : "Enter a name for every organization or health center before continuing.";
      }
      if (scopedOrgs.some((org) => !org.documents.length && !org.text.trim())) {
        return "Upload or paste policy content for every organization before continuing.";
      }
      if (!phiAttested) {
        return "Confirm that the uploaded files were reviewed and PHI was removed before continuing.";
      }
    }
    return "";
  }

  function showWizardStep(step: IrpWizardStep) {
    if (step > furthestWizardStep) return;
    setWizardError("");
    setWizardStep(step);
  }

  function continueWizard() {
    const error = wizardStepError(wizardStep);
    if (error) {
      setWizardError(error);
      return;
    }
    const nextStep = Math.min(5, wizardStep + 1) as IrpWizardStep;
    setWizardError("");
    setWizardStep(nextStep);
    setFurthestWizardStep((current) => Math.max(current, nextStep) as IrpWizardStep);
  }

  function backWizard() {
    setWizardError("");
    setWizardStep((current) => Math.max(1, current - 1) as IrpWizardStep);
  }

  function changeAssessmentScope(nextScope: AssessmentScope) {
    setAssessmentScope(nextScope);
    clearQuote();
  }

  function changeParentOrgName(value: string) {
    setParentOrgName(value);
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
    if (assessmentScope === "network" && !parentOrgName.trim()) {
      alert("Enter the network or parent organization name.");
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
        body: JSON.stringify({ module: "irp", assessmentScope, parentOrgName: assessmentScope === "network" ? parentOrgName.trim() : null, industry, standards, orgNames: validOrgs.map((org) => org.name), documents, phiAttested })
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

  async function executeAssessment(runQuote: RunQuote) {
    if (assessmentStarting.current) return;
    if (!runQuote.withinGuard) return alert("This document set exceeds the current processing guard. Reduce the upload size or split the run.");
    const scopedOrgs = assessmentScope === "self" ? orgs.slice(0, 1) : orgs;
    const validOrgs = scopedOrgs.map((org) => ({ ...org, name: org.name.trim() })).filter((org) => org.name);
    const documents = orgDocuments(validOrgs);
    if (!documents.length) return alert("Upload or paste policy text before running.");
    if (!phiAttested) return alert("Confirm that you reviewed the files and removed PHI before running.");
    assessmentStarting.current = true;
    setElapsedSeconds(0);
    setResult(null);
    setAssessmentId(null);
    setAssessments([]);
    setNetworkReport(null);
    setReportQuoteId(runQuote.id);
    setOperation({
      state: "SUBMITTING",
      quoteId: runQuote.id,
      startedAt: Date.now(),
      message: "Submitting the assessment and verifying payment, quote integrity, and published control boards.",
      rows: []
    });
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          demo: false,
          assessmentScope,
          parentOrgName: assessmentScope === "network" ? parentOrgName.trim() : null,
          orgName: validOrgs[0]?.name,
          industry,
          standards,
          orgNames: validOrgs.map((org) => org.name),
          orgCount: validOrgs.length,
          quoteId: runQuote.id,
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
      if (data.processing) {
        const rows = Array.isArray(data.assessments) ? data.assessments as AssessmentProgress[] : [];
        setOperation((current) => current ? {
          ...current,
          state: "RUNNING",
          quoteId: data.quoteId || runQuote.id,
          message: "This assessment is already processing. Reconnected to its persisted progress.",
          rows
        } : current);
        return;
      }
      setResult(data.result);
      setAssessmentId(data.assessmentId || null);
      setAssessments(Array.isArray(data.assessments) ? data.assessments : data.assessmentId ? [{ assessmentId: data.assessmentId, orgName: data.result?.organization_name || validOrgs[0]?.name || "Organization", result: data.result }] : []);
      setNetworkReport(data.networkReport || null);
      setReportQuoteId(data.quoteId || runQuote.id);
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
    } finally {
      assessmentStarting.current = false;
    }
  }

  async function waitForPayment(quoteId: string) {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const response = await fetch(`/api/run-quotes?id=${encodeURIComponent(quoteId)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not verify checkout status.");
      if (data.quote?.status === "PAID") return;
      if (["EXPIRED", "CANCELLED", "FAILED"].includes(data.quote?.status)) throw new Error("Checkout did not complete. Prepare a new run when you are ready.");
      setCheckoutMessage("Waiting for verified payment. Complete checkout in the new window and keep this assessment tab open.");
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }
    throw new Error("Payment verification timed out. Your confirmed payment remains on the account; prepare the run again to continue.");
  }

  async function purchaseAndRun(runQuote: RunQuote) {
    if (checkoutState === "OPENING" || checkoutState === "WAITING") return;
    const checkoutWindow = window.open("", "_blank");
    setCheckoutState("OPENING");
    setCheckoutMessage("Opening secure checkout...");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quoteId: runQuote.id })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || "Checkout could not be opened.");
      if (checkoutWindow) checkoutWindow.location.href = data.url;
      else throw new Error("Your browser blocked the checkout window. Allow popups for this site and try again.");
      setCheckoutState("WAITING");
      await waitForPayment(runQuote.id);
      setCheckoutState("PAID");
      setCheckoutMessage("Payment verified. Starting the confirmed assessment now.");
      await executeAssessment({ ...runQuote, status: "PAID" });
    } catch (error) {
      checkoutWindow?.close();
      const message = error instanceof Error ? error.message : "Checkout could not be completed.";
      setCheckoutState("FAILED");
      setCheckoutMessage(message);
      alert(message);
    }
  }

  async function run() {
    if (demo) {
      const demoResult = demoAssessment("", industry);
      setElapsedSeconds(0);
      setResult(demoResult);
      setAssessmentId("demo");
      setAssessments([{ assessmentId: "demo", orgName: demoResult.organization_name, result: demoResult }]);
      setNetworkReport(null);
      setReportQuoteId("demo");
      setOperation({
        state: "COMPLETED",
        quoteId: "demo",
        startedAt: Date.now(),
        message: "Curated sample report ready. No upload or external AI request was made.",
        rows: []
      });
      return;
    }
    if (!acceptedQuote) {
      await createRunQuote();
      return;
    }
    if ((acceptedQuote.creditsToPurchase || 0) > 0 && !isAdmin) await purchaseAndRun(acceptedQuote);
    else await executeAssessment(acceptedQuote);
  }

  const operationProgress = operation ? progressPercent(operation.rows, operation.state) : 0;
  const reviewOrgs = assessmentScope === "self" ? orgs.slice(0, 1) : orgs;
  const selectedIndustry = INDUSTRY_CHOICES.find((choice) => choice.value === industry);
  const selectedStandardLabels = standardOptions
    .filter((standard) => standards.includes(standard.key))
    .map((standard) => standard.label);

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
                  <div><dt>Approved by</dt><dd>Compliance and Risk Committee</dd></div>
                  <div><dt>Classification</dt><dd>Internal Use</dd></div>
                  <div><dt>Review cycle</dt><dd>Annual and event driven</dd></div>
                  <div><dt>Next review</dt><dd>March 1, 2027</dd></div>
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
        <h2>{IRP_WIZARD_STEPS.find((step) => step.id === wizardStep)?.label}</h2>
        <p className="muted irp-process-intro">Complete each step to configure the assessment, confirm its scope, and start the report.</p>
        <div className="irp-flow-steps" aria-label="Assessment workflow">
          {IRP_WIZARD_STEPS.map((step) => (
            <button
              key={step.id}
              type="button"
              className={step.id === wizardStep ? "active" : step.id < wizardStep || step.id <= furthestWizardStep ? "complete" : ""}
              onClick={() => showWizardStep(step.id)}
              disabled={step.id > furthestWizardStep}
              aria-current={step.id === wizardStep ? "step" : undefined}
            >
              <b>{step.id}</b>
              <span>{step.label}</span>
            </button>
          ))}
        </div>
        <div className="form">
          {wizardStep === 1 ? <section className="irp-wizard-page">
            <div className="mono">Step 1 of 5</div>
            <h3>Who is this assessment for?</h3>
            <p className="muted">Choose whether the report covers your organization or a group of organizations beneath a client, association, or network.</p>
            <div className="irp-choice-grid">
              <button className={`irp-choice${assessmentScope === "self" ? " selected" : ""}`} type="button" onClick={() => changeAssessmentScope("self")} aria-pressed={assessmentScope === "self"}>
                <b>My organization</b>
                <span>Assess one incident response plan for your own organization.</span>
              </button>
              <button className={`irp-choice${assessmentScope === "network" ? " selected" : ""}`} type="button" onClick={() => changeAssessmentScope("network")} aria-pressed={assessmentScope === "network"}>
                <b>Client or network</b>
                <span>Assess multiple organizations and produce independent reports plus a consolidated network report.</span>
              </button>
            </div>
            {assessmentScope === "network" ? <label className="irp-wizard-field">
              Network or parent organization name
              <input className="input" value={parentOrgName} onChange={(event) => changeParentOrgName(event.target.value)} placeholder="Network, association, or parent organization" />
              <span className="muted">This name labels the consolidated report and is not an additional billed organization.</span>
            </label> : null}
          </section> : null}

          {wizardStep === 2 ? <section className="irp-wizard-page">
            <div className="mono">Step 2 of 5</div>
            <h3>What industry is this assessment for?</h3>
            <p className="muted">The selected industry determines which published control boards are available for scoring.</p>
            <div className="irp-choice-grid irp-industry-grid">
              {INDUSTRY_CHOICES.map((choice) => (
                <button key={choice.value} className={`irp-choice${industry === choice.value ? " selected" : ""}`} type="button" onClick={() => changeIndustry(choice.value)} aria-pressed={industry === choice.value}>
                  <b>{choice.label}</b>
                  <span>{choice.description}</span>
                </button>
              ))}
            </div>
          </section> : null}

          {wizardStep === 3 ? <section className="irp-wizard-page">
            <div className="mono">Step 3 of 5</div>
            <h3>Which standards should be used for scoring?</h3>
            <p className="muted">Select all applicable published control boards. Each standard receives its own weighted score in the final report.</p>
            <fieldset className="irp-standards-control">
              <legend className="sr-only">Standards used for scoring</legend>
              {standardOptions.length ? <label className="irp-standard-option irp-standard-all">
                <input type="checkbox" checked={allStandardsSelected} onChange={toggleAllStandards} />
                <span><b>All {INDUSTRY_STANDARDS[industry]?.label || "domain"} standards</b><small>Use every published standard available for this industry.</small></span>
              </label> : <div className="badge locked">No published base controls are available for this domain.</div>}
              <div className="irp-standard-grid">
                {standardOptions.map((standard) => (
                  <label className="irp-standard-option" key={standard.key}>
                    <input type="checkbox" checked={standards.includes(standard.key)} onChange={() => toggleStandard(standard.key)} />
                    <span><b>{standard.label}</b>{standard.default ? <small>Recommended default</small> : null}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section> : null}

          {wizardStep === 4 ? <section className="irp-wizard-page">
            <div className="irp-stage-heading">
              <div>
                <div className="mono">Step 4 of 5</div>
                <h3>{assessmentScope === "self" ? "Add the organization and policy files" : "Add the organizations and policy files"}</h3>
                <p className="muted">
                  {assessmentScope === "self" ? "The organization name appears on its completed report." : `Each organization beneath ${parentOrgName.trim()} receives an independent report and becomes one $250 invoice line item.`}
                </p>
              </div>
              {assessmentScope === "network" ? <button className="btn secondary" type="button" onClick={addOrg}>Add organization</button> : null}
            </div>
            <div className={assessmentScope === "network" ? "irp-org-grid" : undefined}>
              {reviewOrgs.map((org, index) => (
                <div key={org.id} className="irp-org-entry">
                  <label>
                    {assessmentScope === "self" ? "Organization name" : `Organization or health center ${index + 1}`}
                    <input className="input" value={org.name} onChange={(event) => updateOrg(org.id, { name: event.target.value })} placeholder={assessmentScope === "self" ? "Your organization name" : "Organization or health center name"} />
                  </label>
                  <label>
                    Policy files
                    <input className="input" type="file" multiple accept=".pdf,application/pdf,.txt,.md,.csv,.json,.html,.xml" onChange={(event) => readFiles(org.id, event.target.files)} />
                  </label>
                  {org.status ? <p className="muted irp-file-status">{org.status}</p> : null}
                  <p className="muted irp-file-help">
                    {(org.documents.length ? org.documents.reduce((sum, document) => sum + document.text.length, 0) : org.text.length).toLocaleString()} of {characterLimitPerOrg.toLocaleString()} characters. Oversized submissions are blocked before checkout and are never truncated.
                  </p>
                  <p className="muted irp-file-help">Searchable PDFs are converted to flat text in memory. Scanned PDFs require OCR.</p>
                  {org.documents.length ? <div className="irp-file-list">{org.documents.map((document) => <span className="badge" key={`${org.id}-${document.name}`}>{document.name}</span>)}</div> : null}
                  <label>
                    Or paste policy text
                    <textarea className="textarea" value={org.text} onChange={(event) => updateOrg(org.id, { text: event.target.value, documents: [] })} placeholder="Paste extracted policy text for this organization." />
                  </label>
                  {assessmentScope === "network" ? <button className="btn ghost" type="button" onClick={() => removeOrg(org.id)} disabled={orgs.length === 1}>Remove organization</button> : null}
                </div>
              ))}
            </div>
            <label className="irp-attestation">
              <input type="checkbox" checked={phiAttested} onChange={(event) => { setPhiAttested(event.target.checked); clearQuote(); }} />
              <span><b>Uploader data review</b><span className="muted">I confirm that I reviewed these files and removed protected health information (PHI). This attestation appears in the assessment report.</span></span>
            </label>
          </section> : null}

          {wizardStep === 5 ? <section className="irp-wizard-page">
            <div className="mono">Step 5 of 5</div>
            <h3>Review and run the assessment</h3>
            <p className="muted">Confirm the scope below before preparing the run. Once confirmed, the quote is locked to this organization and policy set.</p>
            <dl className="irp-review-summary">
              <div><dt>Assessment</dt><dd>{assessmentScope === "self" ? "My organization" : `Client or network: ${parentOrgName.trim()}`}</dd></div>
              <div><dt>Industry</dt><dd>{selectedIndustry?.label || industry}</dd></div>
              <div><dt>Standards</dt><dd>{selectedStandardLabels.join(", ")}</dd></div>
              <div><dt>Organizations</dt><dd>{reviewOrgs.length}: {reviewOrgs.map((org) => org.name.trim()).join(", ")}</dd></div>
              <div><dt>Report access</dt><dd>Secure account history</dd></div>
            </dl>
            {!acceptedQuote && !operation ? <div className="irp-run-stage">
              <div><b>Ready to prepare the run</b><p className="muted">This confirms the organization count, invoice line items, and required payment before analysis starts.</p></div>
              <button className="btn" type="button" onClick={run} disabled={operationActive || quoting}>{quoting ? "Preparing confirmation..." : "Prepare run"}</button>
            </div> : null}
            {acceptedQuote ? <section className="irp-confirmation">
              <div className="mono">Run confirmation</div>
              <h3>{acceptedQuote.orgCount} organization{acceptedQuote.orgCount === 1 ? "" : "s"} will be assessed</h3>
              {acceptedQuote.assessmentScope === "network" && acceptedQuote.parentOrgName ? <p className="muted">Network report: <b>{acceptedQuote.parentOrgName}</b>. The parent name is not an additional billed organization.</p> : null}
              <div className="irp-confirmation-grid">
                <div><span className="mono">Invoice total</span><b>${(acceptedQuote.customerAmountCents / 100).toFixed(2)}</b></div>
                {!isAdmin ? <div><span className="mono">Existing credits</span><b>{acceptedQuote.creditsApplied || 0}</b></div> : null}
                <div><span className="mono">{isAdmin ? "Admin run" : "Purchase required"}</span><b>{isAdmin ? "Comped" : `$${((acceptedQuote.purchaseAmountCents || 0) / 100).toFixed(2)}`}</b></div>
                <div><span className="mono">Report access</span><b>Saved to this account</b></div>
              </div>
              <p className="muted irp-invoice-lines">Invoice line items: {acceptedQuote.orgNames.join(", ")}</p>
              {acceptedQuote.preflight?.passed ? <div className="irp-preflight" role="status">
                <div><span className="badge ready">Preflight passed</span>{isAdmin && acceptedQuote.preflight.provider && acceptedQuote.preflight.model ? <b>{acceptedQuote.preflight.provider} / {acceptedQuote.preflight.model}</b> : null}</div>
                <p className="muted">Validated before payment: {acceptedQuote.preflight.checks.join(", ")}.</p>
              </div> : null}
              {checkoutMessage ? <p className={checkoutState === "FAILED" ? "badge locked" : "badge warning"} role="status" aria-live="polite">{checkoutMessage}</p> : null}
              <div className="irp-confirmation-actions">
                <button className="btn secondary" type="button" onClick={() => { clearQuote(); setWizardStep(4); }} disabled={operationActive || checkoutState === "OPENING" || checkoutState === "WAITING"}>Edit assessment</button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => acceptedQuoteReportReady ? resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) : void run()}
                  disabled={operationActive || checkoutState === "OPENING" || checkoutState === "WAITING"}
                >
                  {operationActive ? "Assessment running" : checkoutState === "OPENING" ? "Opening checkout" : checkoutState === "WAITING" ? "Waiting for payment" : acceptedQuoteReportReady ? "View completed report" : isAdmin || !(acceptedQuote.creditsToPurchase || 0) ? "Confirm and run" : `Purchase ${acceptedQuote.creditsToPurchase} org credit${acceptedQuote.creditsToPurchase === 1 ? "" : "s"} and run`}
                </button>
              </div>
              {!isAdmin && (acceptedQuote.creditsToPurchase || 0) > 0 ? <p className="muted irp-checkout-help">Checkout opens in a separate window. Keep this tab open until the assessment is accepted. Completed reports are saved to secure account history.</p> : null}
            </section> : null}
            {operation && !result ? <AssessmentStatusPanel operation={operation} progress={operationProgress} elapsedSeconds={elapsedSeconds} /> : null}
            {isAdmin && acceptedQuote ? <RunQuoteSummary quote={acceptedQuote} /> : null}
            <p className="muted irp-processing-note">{isAdmin ? "Admin runs are comped while model usage and cost are recorded." : "Purchased credits are verified server-side before any model call."} Uploaded source text is used in memory for this request only. IRP billing is fixed at $250 per organization assessed.</p>
          </section> : null}

          {wizardError ? <p className="irp-wizard-error" role="alert">{wizardError}</p> : null}
          <div className="irp-wizard-actions">
            {wizardStep > 1 ? <button className="btn secondary" type="button" onClick={backWizard} disabled={operationActive}>Back</button> : <span />}
            {wizardStep < 5 ? <button className="btn" type="button" onClick={continueWizard}>Continue</button> : null}
          </div>
        </div>
      </section>
      )}
      {result ? <section ref={resultSectionRef} className="card irp-result-card">
        <div className="mono">Assessment result</div>
        <IrpReportBundle assessments={assessments} networkReport={networkReport} quoteId={reportQuoteId} demo={demo} />
      </section> : null}
    </div>
  );
}
