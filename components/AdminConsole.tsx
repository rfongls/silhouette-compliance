"use client";

import { useEffect, useMemo, useState } from "react";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  accountId: string;
  createdAt: string;
};

type BoardRow = {
  id: string;
  industry: string;
  standardKey: string;
  version: number;
  status: string;
  controlCount: number;
  sourceTitle: string | null;
  sourceVersion: string | null;
  reviewedBy: string | null;
};

type LedgerRow = {
  id: string;
  kind: string;
  status: string;
  amountCents: number | null;
  stripeRef: string | null;
};

type DomainStandardPlan = {
  standardKey: string;
  label: string;
  default: boolean;
  available: boolean;
  manualUploadRequired: boolean;
  sourceTitle?: string;
  sourceVersion?: string;
  sourceUrls: string[];
  sourceHash: string | null;
  sourceScope?: string;
  refreshCadenceDays?: number;
  method?: "deterministic" | "grounded-ai";
  batchLabels?: string[];
  requestCount: number;
  estimatedInputTokens: number;
  deterministicControlCount?: number;
  provider?: string | null;
  model?: string | null;
  ready: boolean;
  needsDraft: boolean;
  updateStatus: "NEW" | "CHANGED" | "DRAFT" | "CURRENT" | "MANUAL" | "MISSING";
  readinessMessage: string;
  activeBase?: {
    version: number | null;
    publishedAt: string | null;
    hasBaseControl: boolean;
    sourceChanged: boolean;
    refreshDue: boolean;
    refreshDueAt: string | null;
  };
  pendingDraft?: {
    id: string;
    version: number;
    controlCount: number;
  } | null;
};

type DomainPlan = {
  industry: string;
  industryLabel: string;
  standards: DomainStandardPlan[];
  aggregate: {
    standardCount: number;
    automaticCount: number;
    manualCount: number;
    updateCount: number;
    requestCount: number;
    estimatedInputTokens: number;
    ready: boolean;
  };
};

type ExtractionRun = {
  id: string;
  industry: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  phase: "CHECKING_SOURCES" | "EXTRACTING" | "CREATING_DRAFTS" | "COMPLETED" | "FAILED";
  completedStandards: number;
  totalStandards: number;
  currentStandard: string | null;
  standards: {
    standardKey: string;
    label: string;
    status: "PENDING" | "RUNNING" | "COMPLETE" | "FAILED";
    message: string;
    controlCount?: number;
    boardId?: string;
  }[];
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
  sourceHashes: Record<string, string>;
};

type Props = {
  users: UserRow[];
  boards: BoardRow[];
  ledgers: LedgerRow[];
  standards: string[];
  standardsByIndustry: Record<string, { key: string; label: string; default: boolean }[]>;
  aiConfig: {
    provider: string;
    model: string;
    baseUrl: string;
    hasApiKey: boolean;
    keyStatus: "missing" | "stored" | "verified";
    keyVerifiedAt: string | null;
  };
};

const industries = [
  { value: "health-center", label: "Health Center / Healthcare" },
  { value: "financial", label: "Financial" },
  { value: "education", label: "Education" },
  { value: "public-sector", label: "Public Sector" },
  { value: "manufacturing", label: "Manufacturing / OT" },
  { value: "retail", label: "Retail" }
];

const modelOptions: Record<string, { label: string; value: string }[]> = {
  anthropic: [
    { label: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet-latest" },
    { label: "Claude 3.5 Haiku", value: "claude-3-5-haiku-latest" },
    { label: "Claude 3 Opus", value: "claude-3-opus-latest" }
  ],
  openai: [
    { label: "GPT-5.6 Sol - highest quality", value: "gpt-5.6-sol" },
    { label: "GPT-5.6 Terra - balanced", value: "gpt-5.6-terra" },
    { label: "GPT-5.6 Luna - lowest cost", value: "gpt-5.6-luna" },
    { label: "GPT-5.4", value: "gpt-5.4" },
    { label: "GPT-5.4 mini", value: "gpt-5.4-mini" },
    { label: "GPT-5.4 nano", value: "gpt-5.4-nano" },
    { label: "GPT-5", value: "gpt-5" },
    { label: "GPT-5 mini", value: "gpt-5-mini" },
    { label: "GPT-5 nano", value: "gpt-5-nano" },
    { label: "GPT-4o mini", value: "gpt-4o-mini" },
    { label: "GPT-4o", value: "gpt-4o" },
    { label: "GPT-4.1 mini", value: "gpt-4.1-mini" },
    { label: "GPT-4.1", value: "gpt-4.1" }
  ],
  deepseek: [
    { label: "DeepSeek Chat", value: "deepseek-chat" },
    { label: "DeepSeek Reasoner", value: "deepseek-reasoner" }
  ],
  "openai-compatible": [
    { label: "GPT-4o mini", value: "gpt-4o-mini" },
    { label: "GPT-4o", value: "gpt-4o" },
    { label: "DeepSeek Chat", value: "deepseek-chat" },
    { label: "DeepSeek Reasoner", value: "deepseek-reasoner" },
    { label: "Llama 3.1 70B Instruct", value: "llama-3.1-70b-instruct" },
    { label: "Qwen 2.5 72B Instruct", value: "qwen-2.5-72b-instruct" }
  ]
};

const providerBaseUrls: Record<string, string> = {
  anthropic: "",
  openai: "https://api.openai.com/v1/responses",
  deepseek: "https://api.deepseek.com/chat/completions",
  "openai-compatible": ""
};

function optionsFor(provider: string) {
  return modelOptions[provider] || modelOptions["openai-compatible"];
}

function defaultModelFor(provider: string) {
  return optionsFor(provider)[0]?.value || "";
}

async function readError(res: Response) {
  try {
    const data = await res.json();
    return data.error || "Request failed";
  } catch {
    return "Request failed";
  }
}

export function AdminConsole({ users: initialUsers, boards, ledgers, standards, standardsByIndustry, aiConfig }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [provider, setProvider] = useState(aiConfig.provider);
  const [model, setModel] = useState(aiConfig.model);
  const initialModelIsListed = optionsFor(aiConfig.provider).some((option) => option.value === aiConfig.model);
  const [customModel, setCustomModel] = useState(initialModelIsListed ? "" : aiConfig.model);
  const [modelChoice, setModelChoice] = useState(initialModelIsListed ? aiConfig.model : "__custom");
  const [baseUrl, setBaseUrl] = useState(aiConfig.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(aiConfig.hasApiKey);
  const [keyStatus, setKeyStatus] = useState(aiConfig.keyStatus);
  const [keyVerifiedAt, setKeyVerifiedAt] = useState(aiConfig.keyVerifiedAt);
  const [savingAISettings, setSavingAISettings] = useState(false);
  const [testingAIKey, setTestingAIKey] = useState(false);
  const [industry, setIndustry] = useState(industries[0].value);
  const [standardKey, setStandardKey] = useState(standardsByIndustry[industries[0].value]?.[0]?.key || standards[0] || "HIPAA");
  const [controlsJson, setControlsJson] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceVersion, setSourceVersion] = useState("");
  const [sourceUrls, setSourceUrls] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [backupJson, setBackupJson] = useState("");
  const [draftReview, setDraftReview] = useState<{ id: string; label: string; controlsJson: string; saved: boolean } | null>(null);
  const [status, setStatus] = useState("");
  const [domainPlan, setDomainPlan] = useState<DomainPlan | null>(null);
  const [extractionRun, setExtractionRun] = useState<ExtractionRun | null>(null);
  const drafts = useMemo(() => boards.filter((board) => board.status === "DRAFT"), [boards]);
  const providerModels = optionsFor(provider);
  const selectedStandards = standardsByIndustry[industry] || standards.map((standard) => ({ key: standard, label: standard, default: false }));
  const extractionIsStale = Boolean(extractionRun?.status === "RUNNING"
    && Date.now() - new Date(extractionRun.updatedAt).getTime() >= 45 * 60 * 1000);
  const extractionIsRunning = extractionRun?.status === "RUNNING" && !extractionIsStale;
  const extractionMatchesPlan = Boolean(domainPlan && extractionRun
    && Object.keys(extractionRun.sourceHashes || {}).length
    && Object.entries(extractionRun.sourceHashes || {}).every(([key, hash]) =>
      domainPlan.standards.some((plan) => plan.standardKey === key && plan.sourceHash === hash)));
  const runCanResume = Boolean(extractionRun && extractionMatchesPlan
    && (extractionRun.status === "FAILED" || extractionIsStale));
  const pendingPlanHashes = domainPlan?.standards
    .filter((plan) => plan.needsDraft && plan.sourceHash)
    .map((plan) => [plan.standardKey, plan.sourceHash] as const) || [];
  const extractionAlreadyCompleted = Boolean(extractionRun?.status === "COMPLETED"
    && pendingPlanHashes.length > 0
    && Object.keys(extractionRun.sourceHashes || {}).length === pendingPlanHashes.length
    && pendingPlanHashes.every(([key, hash]) => extractionRun.sourceHashes[key] === hash));

  async function refreshExtractionRun() {
    const res = await fetch("/api/admin/boards/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "status", industry })
    });
    if (!res.ok) return;
    const data = await res.json();
    setExtractionRun(data.run || null);
  }

  useEffect(() => {
    void refreshExtractionRun();
  }, [industry]);

  useEffect(() => {
    if (!extractionIsRunning) return;
    const timer = window.setInterval(() => void refreshExtractionRun(), 1500);
    return () => window.clearInterval(timer);
  }, [industry, extractionIsRunning]);

  function changeProvider(nextProvider: string) {
    setProvider(nextProvider);
    const nextModel = defaultModelFor(nextProvider);
    setModel(nextModel);
    setModelChoice(nextModel);
    setCustomModel("");
    setBaseUrl(providerBaseUrls[nextProvider] || "");
    setKeyStatus(hasApiKey ? "stored" : "missing");
    setKeyVerifiedAt(null);
    setDomainPlan(null);
  }

  function changeModelChoice(nextChoice: string) {
    setModelChoice(nextChoice);
    if (nextChoice !== "__custom") {
      setModel(nextChoice);
      setCustomModel("");
    } else {
      setModel(customModel);
    }
  }

  function changeCustomModel(nextModel: string) {
    setCustomModel(nextModel);
    setModel(nextModel);
  }

  function changeIndustry(nextIndustry: string) {
    setIndustry(nextIndustry);
    setDomainPlan(null);
    const nextStandards = standardsByIndustry[nextIndustry] || [];
    if (!nextStandards.some((standard) => standard.key === standardKey)) {
      setStandardKey(nextStandards[0]?.key || standards[0] || "HIPAA");
    }
  }

  async function updateRole(userId: string, role: string) {
    setStatus("Updating role...");
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, role })
    });
    if (!res.ok) return setStatus(await readError(res));
    const data = await res.json();
    setUsers((rows) => rows.map((row) => row.id === data.user.id ? data.user : row));
    setStatus("Role updated.");
  }

  async function saveAISettings() {
    setSavingAISettings(true);
    setStatus("Saving AI settings...");
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, model, baseUrl, apiKey })
    });
    if (!res.ok) {
      setSavingAISettings(false);
      return setStatus(await readError(res));
    }
    const data = await res.json();
    setProvider(data.aiConfig.provider);
    setModel(data.aiConfig.model);
    if (optionsFor(data.aiConfig.provider).some((option) => option.value === data.aiConfig.model)) {
      setModelChoice(data.aiConfig.model);
      setCustomModel("");
    } else {
      setModelChoice("__custom");
      setCustomModel(data.aiConfig.model);
    }
    setBaseUrl(data.aiConfig.baseUrl);
    setHasApiKey(data.aiConfig.hasApiKey);
    setKeyStatus(data.aiConfig.keyStatus);
    setKeyVerifiedAt(data.aiConfig.keyVerifiedAt);
    setApiKey("");
    setSavingAISettings(false);
    setStatus(data.aiConfig.keyStatus === "verified" ? "AI settings saved. API key is active and verified." : "AI settings saved. Test the stored key before running analysis.");
  }

  async function testAIKey() {
    setTestingAIKey(true);
    setStatus("Verifying the stored API key...");
    const res = await fetch("/api/admin/settings", { method: "POST" });
    if (!res.ok) {
      setTestingAIKey(false);
      setKeyStatus(hasApiKey ? "stored" : "missing");
      return setStatus(await readError(res));
    }
    const data = await res.json();
    setHasApiKey(data.aiConfig.hasApiKey);
    setKeyStatus(data.aiConfig.keyStatus);
    setKeyVerifiedAt(data.aiConfig.keyVerifiedAt);
    setTestingAIKey(false);
    setStatus("API key is active and verified.");
  }

  async function preflightBoard() {
    setStatus("Checking every official source configured for this domain...");
    const res = await fetch("/api/admin/boards/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "preflight", industry })
    });
    if (!res.ok) return setStatus(await readError(res));
    const data = await res.json();
    setDomainPlan(data.plan);
    setStatus("Domain source preflight complete. No AI request was made.");
  }

  async function extractBoard(onlyStandardKey?: string, resume = false) {
    if (!domainPlan || extractionIsRunning) return;
    const targetPlans = resume && extractionRun
      ? domainPlan.standards.filter((plan) => extractionRun.sourceHashes[plan.standardKey] === plan.sourceHash)
      : domainPlan.standards.filter((plan) => plan.needsDraft && (!onlyStandardKey || plan.standardKey === onlyStandardKey));
    if (!targetPlans.length) return setStatus("No new, changed, or resumable standards were found for this action.");
    const paidRequests = targetPlans.filter((plan) => plan.needsDraft).reduce((total, plan) => total + plan.requestCount, 0);
    const action = resume
      ? `Resume this control-board run from its saved checkpoints? Completed drafts and validated AI batches will be reused. Up to ${paidRequests} remaining paid AI request${paidRequests === 1 ? "" : "s"} may run.`
      : `Create ${targetPlans.length} reviewable control-board draft${targetPlans.length === 1 ? "" : "s"}? This will run ${paidRequests} paid AI request${paidRequests === 1 ? "" : "s"}. Current bases remain active until an admin reviews and publishes each draft.`;
    if (!window.confirm(action)) return;
    const sourceHashes = resume && extractionRun
      ? extractionRun.sourceHashes
      : Object.fromEntries(targetPlans.filter((plan) => plan.sourceHash).map((plan) => [plan.standardKey, plan.sourceHash as string]));
    const now = new Date().toISOString();
    setExtractionRun(resume && extractionRun ? {
      ...extractionRun,
      status: "RUNNING",
      phase: "CHECKING_SOURCES",
      currentStandard: null,
      completedAt: null,
      error: null,
      updatedAt: now
    } : {
      id: "starting",
      industry,
      status: "RUNNING",
      phase: "CHECKING_SOURCES",
      completedStandards: 0,
      totalStandards: targetPlans.length,
      currentStandard: null,
      standards: targetPlans.map((plan) => ({
        standardKey: plan.standardKey,
        label: plan.label,
        status: "PENDING",
        message: "Waiting for source validation"
      })),
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      error: null,
      sourceHashes
    });
    setStatus(resume ? "Resuming from saved standard and AI-batch checkpoints." : "Control extraction started. This page will update as each standard completes.");
    const res = await fetch("/api/admin/boards/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: onlyStandardKey ? "extract-standard" : "extract",
        industry,
        standardKey: onlyStandardKey,
        sourceHashes,
        confirmExtraction: true
      })
    });
    if (!res.ok) {
      setStatus(await readError(res));
      await refreshExtractionRun();
      return;
    }
    const data = await res.json();
    setExtractionRun(data.run || null);
    setStatus(data.resumed ? "The unfinished run resumed and its reviewable drafts are ready." : "Validated update drafts created. Existing base boards remain active pending review.");
  }

  async function readBackupFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setStatus("Reading control-board backup...");
    setBackupJson(await file.text());
    setStatus(`Loaded ${file.name}. Restore will create reviewable drafts only.`);
  }

  async function restoreBackup() {
    if (!backupJson.trim() || !window.confirm("Restore every board in this backup as a new draft? Existing base boards will remain active until each restored draft is reviewed and published.")) return;
    setStatus("Restoring control-board backup as drafts...");
    const res = await fetch("/api/admin/boards/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "restore", backupJson })
    });
    if (!res.ok) return setStatus(await readError(res));
    const data = await res.json();
    setStatus(`${data.boards.length} control-board draft${data.boards.length === 1 ? "" : "s"} restored.`);
    window.location.reload();
  }

  async function readControlsFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setStatus("Reading control import...");
    setControlsJson(await file.text());
    setStatus(`Loaded ${file.name}.`);
  }

  async function uploadBoard() {
    setStatus("Creating control board draft from uploaded JSON...");
    const res = await fetch("/api/admin/boards/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ industry, standardKey, controlsJson, sourceTitle, sourceVersion, sourceUrls, reviewNotes })
    });
    if (!res.ok) return setStatus(await readError(res));
    setStatus("Uploaded draft board created.");
    window.location.reload();
  }

  async function publishBoard(id: string) {
    if (!window.confirm("Set this reviewed draft as the base control set used for scoring? The current base for this industry and standard will be archived.")) return;
    const reviewNotes = window.prompt("Record what you reviewed before setting this as the base control:");
    if (!reviewNotes?.trim()) return setStatus("Base control update canceled. Review notes are required.");
    setStatus("Setting base control...");
    const res = await fetch("/api/admin/boards/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, reviewConfirmed: true, reviewNotes })
    });
    if (!res.ok) return setStatus(await readError(res));
    setStatus("Base control updated.");
    window.location.reload();
  }

  async function reviewDraft(board: BoardRow) {
    setStatus(`Loading ${board.standardKey} v${board.version} for priority review...`);
    const res = await fetch(`/api/admin/boards?id=${encodeURIComponent(board.id)}`);
    if (!res.ok) return setStatus(await readError(res));
    const data = await res.json();
    setDraftReview({
      id: board.id,
      label: `${board.industry} / ${board.standardKey} v${board.version}`,
      controlsJson: JSON.stringify(data.board.controls, null, 2),
      saved: false
    });
    setStatus("Review every category and priority before publishing this draft.");
  }

  async function saveDraftReview() {
    if (!draftReview) return;
    setStatus("Validating and saving reviewed control priorities...");
    const res = await fetch("/api/admin/boards", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: draftReview.id, controlsJson: draftReview.controlsJson })
    });
    if (!res.ok) return setStatus(await readError(res));
    setDraftReview({ ...draftReview, saved: true });
    setStatus("Draft categories and priorities saved. It is ready for final publication review.");
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {status ? <div className="badge" style={{ justifySelf: "start" }}>{status}</div> : null}

      <section className="card">
        <div className="mono">Access</div>
        <h2>Users</h2>
        <table className="table">
          <thead><tr><th>User</th><th>Account</th><th>Role</th><th>Created</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td><b>{user.name || "Unnamed"}</b><br/><span className="muted">{user.email || "No email"}</span></td>
                <td>{user.accountId}</td>
                <td>
                  <select className="select" value={user.role} onChange={(event) => updateRole(user.id, event.target.value)} style={{ maxWidth: 160 }}>
                    <option value="customer">Customer</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>{new Date(user.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="mono">AI Provider</div>
        <h2>Analysis Settings</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, alignItems: "end" }}>
          <label>Provider<select className="select" value={provider} onChange={(event) => changeProvider(event.target.value)}>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="deepseek">DeepSeek</option>
            <option value="openai-compatible">OpenAI-compatible</option>
          </select></label>
          <label>Model<select className="select" value={modelChoice} onChange={(event) => changeModelChoice(event.target.value)}>
            {providerModels.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            <option value="__custom">Custom model</option>
          </select></label>
          {modelChoice === "__custom" ? <label>Custom model<input className="input" value={customModel} onChange={(event) => changeCustomModel(event.target.value)} placeholder="provider-specific-model-id" /></label> : null}
          <label>Base URL<input className="input" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="Provider API endpoint" /></label>
          <label>API Key<input className="input" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasApiKey ? "Stored key available" : "Environment fallback or new key"} autoComplete="new-password" /></label>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn" onClick={saveAISettings} disabled={savingAISettings || testingAIKey}>{savingAISettings ? apiKey.trim() ? "Verifying and saving..." : "Saving..." : "Save AI settings"}</button>
          <button className="btn secondary" onClick={testAIKey} disabled={!hasApiKey || savingAISettings || testingAIKey}>{testingAIKey ? "Verifying..." : "Test saved key"}</button>
          <span className={keyStatus === "verified" ? "badge" : keyStatus === "stored" ? "badge warning" : "badge locked"}>{keyStatus === "verified" ? "Active and verified" : keyStatus === "stored" ? "Stored, not verified" : "No key configured"}</span>
          {keyStatus === "verified" && keyVerifiedAt ? <span className="muted" style={{ fontSize: 12 }}>Verified {new Date(keyVerifiedAt).toLocaleString()}</span> : null}
        </div>
      </section>

      <section className="card">
        <div className="mono">Control Boards</div>
        <h2>Retrieve, Review & Set Base</h2>
        <p className="muted">Only administrators can check official sources, create drafts, restore backups, and set the reviewed base controls used for scoring. A source check never changes the active base.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <select className="select" value={industry} onChange={(event) => changeIndustry(event.target.value)} style={{ maxWidth: 260 }}>
            {industries.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button className="btn" onClick={preflightBoard} disabled={extractionIsRunning}>Check for control updates</button>
          <a className="btn secondary" href="/api/admin/boards/export">Download base control backup</a>
        </div>
        {domainPlan ? <div className="card subcard" style={{ padding: 16, marginBottom: 18 }}>
          <div className="mono">Domain extraction preflight</div>
          <h3 style={{ marginBottom: 6 }}>{domainPlan.industryLabel} control library</h3>
          <p className="muted" style={{ marginTop: 0 }}>One confirmed run creates a separate reviewable draft for every automatically retrievable standard.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, margin: "14px 0" }}>
            <div><b>Standards</b><br/><span className="muted">{domainPlan.aggregate.standardCount}</span></div>
            <div><b>Automatic</b><br/><span className="muted">{domainPlan.aggregate.automaticCount}</span></div>
            <div><b>Reviewed upload</b><br/><span className="muted">{domainPlan.aggregate.manualCount}</span></div>
            <div><b>New or changed</b><br/><span className="muted">{domainPlan.aggregate.updateCount}</span></div>
            <div><b>AI requests</b><br/><span className="muted">{domainPlan.aggregate.requestCount}</span></div>
            <div><b>Estimated input</b><br/><span className="muted">{domainPlan.aggregate.estimatedInputTokens.toLocaleString()} tokens</span></div>
          </div>
          <table className="table" style={{ marginBottom: 14 }}>
            <thead><tr><th>Standard</th><th>Retrieval</th><th>Update check</th><th>Current base</th><th>Readiness</th><th>Action</th></tr></thead>
            <tbody>{domainPlan.standards.map((plan) => (
              <tr key={plan.standardKey}>
                <td><b>{plan.label}</b><br/><span className="muted">{plan.standardKey}{plan.default ? " / default" : ""}</span></td>
                <td>{plan.available ? (plan.method === "deterministic" ? "Deterministic" : "Grounded AI") : "Reviewed upload"}</td>
                <td>{plan.updateStatus === "CHANGED" ? "Update available" : plan.updateStatus === "NEW" ? "New board required" : plan.updateStatus === "DRAFT" ? "Draft pending review" : plan.updateStatus === "CURRENT" ? "Current" : plan.updateStatus === "MANUAL" ? "Check manually" : "Base missing"}</td>
                <td>{plan.activeBase?.hasBaseControl ? `v${plan.activeBase.version}` : "Not set"}</td>
                <td><span className={plan.pendingDraft || plan.ready ? "badge" : "badge locked"}>{plan.pendingDraft ? "Draft ready" : plan.ready ? "Ready" : plan.manualUploadRequired ? "Upload required" : "Blocked"}</span><br/><span className="muted">{plan.readinessMessage}</span></td>
                <td>{plan.needsDraft && plan.ready
                  ? <button className="btn secondary" onClick={() => extractBoard(plan.standardKey)} disabled={extractionIsRunning}>{plan.updateStatus === "CHANGED" ? "Update draft" : "Create draft"}</button>
                  : plan.pendingDraft ? `v${plan.pendingDraft.version}` : "-"}</td>
              </tr>
            ))}</tbody>
          </table>
          {!runCanResume ? <button className="btn" onClick={() => extractBoard()} disabled={!domainPlan.aggregate.ready || extractionIsRunning || extractionAlreadyCompleted}>{extractionIsRunning ? "Creating drafts..." : extractionAlreadyCompleted ? "Drafts already created" : "Create new and updated drafts"}</button> : null}
        </div> : null}
        {extractionRun ? <div className="card subcard" style={{ padding: 14, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div className="mono">Extraction status</div>
                <b>{extractionIsStale ? "Control library update stopped" : extractionRun.status === "RUNNING" ? "Control library update in progress" : extractionRun.status === "COMPLETED" ? "Control library drafts are ready" : "Control library update failed"}</b>
              </div>
              <span className={extractionRun.status === "FAILED" || extractionIsStale ? "badge locked" : "badge"}>{extractionIsStale ? "RESUMABLE" : extractionRun.status}</span>
            </div>
            <p className="muted" style={{ marginBottom: 8 }}>
              {extractionIsStale ? "No progress was recorded for 45 minutes. Resume to reuse completed drafts and validated AI batches." : extractionRun.phase === "CHECKING_SOURCES" ? "Checking and fingerprinting the selected official sources." : extractionRun.phase === "EXTRACTING" ? `${extractionRun.currentStandard ? `Processing ${extractionRun.currentStandard}. ` : ""}${extractionRun.completedStandards} of ${extractionRun.totalStandards} standards complete.` : extractionRun.phase === "CREATING_DRAFTS" ? "Validated controls are being saved as a reviewable draft." : extractionRun.phase === "COMPLETED" ? `${extractionRun.completedStandards} reviewable drafts are ready.` : extractionRun.error || "The run did not complete."}
            </p>
            <div style={{ height: 8, background: "var(--surface-2, #1b1430)", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ height: "100%", width: `${extractionRun.totalStandards ? Math.round((extractionRun.completedStandards / extractionRun.totalStandards) * 100) : 3}%`, background: "var(--accent, #9c6cff)", transition: "width 200ms ease" }} />
            </div>
            {extractionRun.standards.length ? <table className="table" style={{ marginBottom: 10 }}>
              <thead><tr><th>Standard</th><th>Status</th><th>Progress</th></tr></thead>
              <tbody>{extractionRun.standards.map((item) => <tr key={item.standardKey}>
                <td>{item.label}</td>
                <td><span className={item.status === "FAILED" ? "badge locked" : "badge"}>{item.status}</span></td>
                <td>{item.message}{typeof item.controlCount === "number" ? ` (${item.controlCount} controls)` : ""}</td>
              </tr>)}</tbody>
            </table> : null}
            {runCanResume ? <button className="btn" onClick={() => extractBoard(undefined, true)}>Resume unfinished run</button> : null}
            {extractionRun.status === "COMPLETED" ? <button className="btn secondary" onClick={() => window.location.reload()}>Review created drafts</button> : null}
          </div> : null}
        <div className="card subcard" style={{ padding: 14, marginBottom: 18 }}>
          <div className="mono">Control-board backup</div>
          <h3 style={{ marginBottom: 6 }}>Restore saved base controls</h3>
          <p className="muted">A downloaded Silhouette backup restores each saved board as a new draft. It cannot replace a published base without admin review.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="btn secondary" style={{ textAlign: "center", cursor: "pointer" }}>
              Select backup
              <input type="file" accept=".json" onChange={(event) => readBackupFile(event.target.files)} style={{ display: "none" }} />
            </label>
            <button className="btn" onClick={restoreBackup} disabled={!backupJson.trim()}>Restore as drafts</button>
          </div>
        </div>
        <div className="card subcard" style={{ padding: 14, marginBottom: 18 }}>
          <div className="mono">Manual control upload</div>
          <label style={{ display: "block", maxWidth: 360, margin: "12px 0" }}>
            Standard
            <select className="select" value={standardKey} onChange={(event) => setStandardKey(event.target.value)}>
              {selectedStandards.map((standard) => <option key={standard.key} value={standard.key}>{standard.label}</option>)}
            </select>
          </label>
          <div className="control-upload-grid">
            <label>
              Control JSON
              <textarea className="textarea" value={controlsJson} onChange={(event) => setControlsJson(event.target.value)} placeholder='[{"id":"IR-4","standard":"NIST","category":"Incident Response","requirement":"Incident response plan is developed and tested","risk_level":"High"}]' style={{ minHeight: 320 }} />
            </label>
            <div style={{ display: "grid", gap: 10 }}>
              <label>Source title<input className="input" value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="Official publication title" /></label>
              <label>Source version<input className="input" value={sourceVersion} onChange={(event) => setSourceVersion(event.target.value)} placeholder="Revision or effective date" /></label>
              <label>Source URL(s)<textarea className="textarea" value={sourceUrls} onChange={(event) => setSourceUrls(event.target.value)} placeholder="One authoritative URL per line" style={{ minHeight: 80 }} /></label>
              <label>Review notes<textarea className="textarea" value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="What was checked before publishing" style={{ minHeight: 80 }} /></label>
              <label className="btn secondary" style={{ textAlign: "center", cursor: "pointer" }}>
                Load file
                <input type="file" accept=".json,.txt" onChange={(event) => readControlsFile(event.target.files)} style={{ display: "none" }} />
              </label>
              <button className="btn" onClick={uploadBoard} disabled={!controlsJson.trim() || !sourceTitle.trim() || !sourceVersion.trim() || !sourceUrls.trim() || !reviewNotes.trim()}>Upload draft</button>
            </div>
          </div>
        </div>
        {draftReview ? <div className="card subcard" style={{ padding: 14, marginBottom: 18 }}>
          <div className="mono">Draft priority review</div>
          <h3 style={{ marginBottom: 6 }}>{draftReview.label}</h3>
          <p className="muted">The publisher does not assign a universal cross-framework score. Confirm each control category and Silhouette IRP priority before this draft becomes a scoring base. Valid priorities are Critical, High, Medium, and Low.</p>
          <textarea className="textarea" value={draftReview.controlsJson} onChange={(event) => setDraftReview({ ...draftReview, controlsJson: event.target.value, saved: false })} style={{ minHeight: 420 }} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <button className="btn secondary" onClick={saveDraftReview}>Save reviewed priorities</button>
            <button className="btn" onClick={() => publishBoard(draftReview.id)} disabled={!draftReview.saved}>Set reviewed draft as base</button>
            <button className="btn secondary" onClick={() => setDraftReview(null)}>Close</button>
          </div>
        </div> : null}
        <table className="table">
          <thead><tr><th>Industry</th><th>Standard</th><th>Version</th><th>Source</th><th>Status</th><th>Controls</th><th>Reviewer</th><th>Action</th></tr></thead>
          <tbody>
            {boards.map((board) => (
              <tr key={board.id}>
                <td>{board.industry}</td>
                <td>{board.standardKey}</td>
                <td>v{board.version}</td>
                <td>{board.sourceTitle || "Missing"}<br/><span className="muted">{board.sourceVersion || "No version"}</span></td>
                <td><span className={board.status === "PUBLISHED" ? "badge" : "badge locked"}>{board.status === "PUBLISHED" ? "BASE" : board.status}</span></td>
                <td>{board.controlCount}</td>
                <td>{board.reviewedBy || "-"}</td>
                <td>{board.status === "DRAFT" ? <button className="btn secondary" onClick={() => reviewDraft(board)}>Review draft</button> : "-"}</td>
              </tr>
            ))}
            {!boards.length ? <tr><td colSpan={8}>No boards yet.</td></tr> : null}
          </tbody>
        </table>
        {drafts.length ? <p className="muted">{drafts.length} draft board{drafts.length === 1 ? "" : "s"} pending.</p> : null}
      </section>

      <section className="card">
        <div className="mono">Billing</div>
        <h2>Usage Ledger</h2>
        <table className="table">
          <thead><tr><th>Kind</th><th>Status</th><th>Amount</th><th>Stripe</th></tr></thead>
          <tbody>
            {ledgers.map((ledger) => (
              <tr key={ledger.id}>
                <td>{ledger.kind}</td>
                <td>{ledger.status}</td>
                <td>{ledger.amountCents ? `$${(ledger.amountCents / 100).toFixed(2)}` : "-"}</td>
                <td>{ledger.stripeRef || "-"}</td>
              </tr>
            ))}
            {!ledgers.length ? <tr><td colSpan={4}>No ledger entries yet.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
