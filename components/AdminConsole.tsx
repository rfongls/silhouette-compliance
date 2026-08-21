"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  reviewedAt: string | null;
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
  checkedAt: string;
  updateStatus: "NEW" | "CHANGED" | "DRAFT" | "CURRENT" | "MANUAL" | "MISSING";
  readinessMessage: string;
  activeBase?: {
    version: number | null;
    retrievedAt: string | null;
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

export function AdminConsole({ users: initialUsers, boards, ledgers, aiConfig }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [boardRows, setBoardRows] = useState(boards);
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
  const controlImportInputRef = useRef<HTMLInputElement>(null);
  const [draftReview, setDraftReview] = useState<{ id: string; label: string; controlsJson: string; saved: boolean } | null>(null);
  const [status, setStatus] = useState("");
  const [domainPlan, setDomainPlan] = useState<DomainPlan | null>(null);
  const [extractionRun, setExtractionRun] = useState<ExtractionRun | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const drafts = useMemo(() => boardRows.filter((board) => board.status === "DRAFT"), [boardRows]);
  const providerModels = optionsFor(provider);
  const extractionIsStale = Boolean(extractionRun?.status === "RUNNING"
    && Date.now() - new Date(extractionRun.updatedAt).getTime() >= 45 * 60 * 1000);
  const extractionIsRunning = extractionRun?.status === "RUNNING" && !extractionIsStale;
  const extractionMatchesPlan = Boolean(domainPlan && extractionRun
    && Object.keys(extractionRun.sourceHashes || {}).length
    && Object.entries(extractionRun.sourceHashes || {}).every(([key, hash]) =>
      domainPlan.standards.some((plan) => plan.standardKey === key && plan.sourceHash === hash)));
  const runCanResume = Boolean(extractionRun && extractionMatchesPlan
    && (extractionRun.status === "FAILED" || extractionIsStale));
  const runNeedsRecovery = Boolean(extractionRun
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

  async function loadDomainPlan() {
    const res = await fetch("/api/admin/boards/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "preflight", industry })
    });
    if (!res.ok) {
      setStatus(await readError(res));
      return null;
    }
    const data = await res.json();
    setDomainPlan(data.plan);
    return data.plan as DomainPlan;
  }

  async function preflightBoard() {
    setStatus("Checking every official source configured for this domain...");
    const plan = await loadDomainPlan();
    if (!plan) return;
    setStatus("Domain source preflight complete. No AI request was made.");
  }

  function formatControlTimestamp(value?: string | null) {
    if (!value) return "Never";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
  }

  async function extractBoard(onlyStandardKey?: string, resume = false, restart = false, planOverride?: DomainPlan) {
    const activePlan = planOverride || domainPlan;
    if (!activePlan || extractionIsRunning) return;
    const targetPlans = resume && extractionRun
      ? activePlan.standards.filter((plan) => extractionRun.sourceHashes[plan.standardKey] === plan.sourceHash)
      : activePlan.standards.filter((plan) => plan.needsDraft && (!onlyStandardKey || plan.standardKey === onlyStandardKey));
    if (!targetPlans.length) return setStatus("No new, changed, or resumable standards were found for this action.");
    const paidRequests = targetPlans.filter((plan) => plan.needsDraft).reduce((total, plan) => total + plan.requestCount, 0);
    const action = resume
      ? `Resume this control-board run from its saved checkpoints? Completed drafts and validated AI batches will be reused. Up to ${paidRequests} remaining paid AI request${paidRequests === 1 ? "" : "s"} may run.`
      : restart
        ? `Start a new control-board run? Incomplete AI-batch checkpoints will be cleared. Completed review drafts will be kept, and up to ${paidRequests} paid AI request${paidRequests === 1 ? "" : "s"} may run.`
      : `Create ${targetPlans.length} reviewable control-board draft${targetPlans.length === 1 ? "" : "s"}? This may run up to ${paidRequests} paid AI request${paidRequests === 1 ? "" : "s"}, including one validation retry per batch. Current bases remain active until an admin reviews and publishes each draft.`;
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
    setStatus(resume ? "Resuming from saved standard and AI-batch checkpoints." : restart ? "Starting a new run. Incomplete checkpoints are being cleared." : "Control extraction started. This page will update as each standard completes.");
    const res = await fetch("/api/admin/boards/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: onlyStandardKey ? "extract-standard" : "extract",
        industry,
        standardKey: onlyStandardKey,
        sourceHashes,
        confirmExtraction: true,
        restart
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

  async function continueFailedRun() {
    if (!extractionRun || extractionIsRunning || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryMessage("Checking the current official-source fingerprints...");
    setStatus("Rechecking official sources before continuing the failed run...");
    const plan = domainPlan || await loadDomainPlan();
    if (!plan) {
      setRecoveryMessage("The official sources could not be checked. Review the status message and try again.");
      setRecoveryBusy(false);
      return;
    }
    const sourcesStillMatch = Object.keys(extractionRun.sourceHashes || {}).length > 0
      && Object.entries(extractionRun.sourceHashes || {}).every(([key, hash]) =>
        plan.standards.some((item) => item.standardKey === key && item.sourceHash === hash));
    if (!sourcesStillMatch) {
      const message = "The official source snapshot changed after this run failed. Its checkpoints cannot be reused safely. Choose Start new run; completed review drafts will remain available.";
      setRecoveryMessage(message);
      setStatus(message);
      setRecoveryBusy(false);
      return;
    }
    setRecoveryMessage("Saved checkpoints match the current sources. Confirm continuation in the dialog.");
    setRecoveryBusy(false);
    await extractBoard(undefined, true, false, plan);
  }

  async function startNewExtractionRun() {
    if (extractionIsRunning || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryMessage("Checking current sources before creating a fresh run...");
    setStatus("Checking current official sources before starting a new run...");
    const plan = domainPlan || await loadDomainPlan();
    if (!plan) {
      setRecoveryMessage("The official sources could not be checked. Review the status message and try again.");
      setRecoveryBusy(false);
      return;
    }
    setRecoveryMessage("Current sources are ready. Confirm the new run in the dialog.");
    setRecoveryBusy(false);
    await extractBoard(undefined, false, true, plan);
  }

  async function importBackupFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setStatus("Reading control-board backup...");
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      if (parsed?.kind !== "silhouette-control-board-backup" || parsed?.schemaVersion !== 1 || !Array.isArray(parsed?.boards)) {
        throw new Error("Select a Silhouette control-board backup with schema version 1.");
      }
      if (!parsed.boards.length) {
        throw new Error("This backup contains no control boards to import.");
      }
      if (!window.confirm(`Import ${parsed.boards.length} control board${parsed.boards.length === 1 ? "" : "s"} from ${file.name} as reviewable drafts? Existing base boards will remain active.`)) {
        setStatus("Control-board import canceled.");
        return;
      }
      setStatus(`Importing ${file.name} as reviewable drafts...`);
      const res = await fetch("/api/admin/boards/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "restore", backupJson: text })
      });
      if (!res.ok) return setStatus(await readError(res));
      const data = await res.json();
      setStatus(`${data.boards.length} control-board draft${data.boards.length === 1 ? "" : "s"} imported.`);
      window.location.reload();
    } catch (error) {
      setStatus((error as Error).message || "The selected control-board file is invalid.");
    } finally {
      if (controlImportInputRef.current) controlImportInputRef.current.value = "";
    }
  }

  async function approveDraft(id: string) {
    if (!window.confirm("Approve this reviewed draft and set it as the base control set used for scoring? The current base for this industry and standard will be archived.")) return;
    const reviewNotes = window.prompt("Record what you reviewed before approving this draft:");
    if (!reviewNotes?.trim()) return setStatus("Draft approval canceled. Review notes are required.");
    setStatus("Approving draft and setting base control...");
    const res = await fetch("/api/admin/boards/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, reviewConfirmed: true, reviewNotes })
    });
    if (!res.ok) return setStatus(await readError(res));
    setStatus("Draft approved and base control updated.");
    window.location.reload();
  }

  async function reviewDraft(board: Pick<BoardRow, "id" | "industry" | "standardKey" | "version">) {
    setStatus(`Loading ${board.standardKey} v${board.version} for priority review...`);
    const res = await fetch(`/api/admin/boards?id=${encodeURIComponent(board.id)}`);
    if (!res.ok) return setStatus(await readError(res));
    const data = await res.json();
    setDraftReview({
      id: board.id,
      label: `${board.industry} / ${board.standardKey} v${board.version}`,
      controlsJson: JSON.stringify(data.board.controls, null, 2),
      saved: true
    });
    setStatus("Review the fetched controls or approve the validated draft as the scoring base.");
    window.setTimeout(() => document.getElementById("draft-priority-review")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function saveDraftReview() {
    if (!draftReview) return false;
    setStatus("Validating and saving reviewed control priorities...");
    const res = await fetch("/api/admin/boards", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: draftReview.id, controlsJson: draftReview.controlsJson })
    });
    if (!res.ok) {
      setStatus(await readError(res));
      return false;
    }
    const data = await res.json();
    setDraftReview({ ...draftReview, saved: true });
    setBoardRows((current) => current.map((board) => board.id === draftReview.id
      ? {
          ...board,
          reviewedBy: data.board.reviewedBy || board.reviewedBy,
          reviewedAt: data.board.reviewedAt || new Date().toISOString()
        }
      : board));
    setStatus("Draft categories and priorities saved. It is ready for final publication review.");
    return true;
  }

  async function approveFromReview() {
    if (!draftReview) return;
    if (!draftReview.saved && !(await saveDraftReview())) return;
    await approveDraft(draftReview.id);
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
        <p className="muted">Only administrators can check official sources, create drafts, import control-board backups, and set the reviewed base controls used for scoring. A source check never changes the active base.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <select className="select" value={industry} onChange={(event) => changeIndustry(event.target.value)} style={{ maxWidth: 260 }}>
            {industries.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button className="btn" onClick={preflightBoard} disabled={extractionIsRunning}>{domainPlan ? "Check again for control updates" : "Check for control updates"}</button>
          <a className="btn secondary" href="/api/admin/boards/export">Download control-board backup</a>
          <button className="btn secondary" onClick={() => controlImportInputRef.current?.click()}>Import control board file</button>
          <input ref={controlImportInputRef} type="file" accept="application/json,.json" onChange={(event) => importBackupFile(event.target.files)} style={{ display: "none" }} />
        </div>
        {domainPlan ? <div className="card subcard" style={{ padding: 16, marginBottom: 18 }}>
          <div className="mono">Control update check results</div>
          <h3 style={{ marginBottom: 6 }}>{domainPlan.industryLabel} control library</h3>
          <p className="muted" style={{ marginTop: 0 }}>Official sources were checked without changing the active base. Create reviewable drafts only for standards marked new or changed.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, margin: "14px 0" }}>
            <div><b>Standards</b><br/><span className="muted">{domainPlan.aggregate.standardCount}</span></div>
            <div><b>Automatic</b><br/><span className="muted">{domainPlan.aggregate.automaticCount}</span></div>
            <div><b>Reviewed upload</b><br/><span className="muted">{domainPlan.aggregate.manualCount}</span></div>
            <div><b>New or changed</b><br/><span className="muted">{domainPlan.aggregate.updateCount}</span></div>
            <div><b>Maximum AI requests</b><br/><span className="muted">{domainPlan.aggregate.requestCount}</span></div>
            <div><b>Maximum estimated input</b><br/><span className="muted">{domainPlan.aggregate.estimatedInputTokens.toLocaleString()} tokens</span></div>
          </div>
          <table className="table" style={{ marginBottom: 14 }}>
            <thead><tr><th>Standard</th><th>Update status</th><th>Last checked</th><th>Last pulled</th><th>Last published</th><th>Action</th></tr></thead>
            <tbody>{domainPlan.standards.map((plan) => (
              <tr key={plan.standardKey}>
                <td><b>{plan.label}</b><br/><span className="muted">{plan.standardKey}{plan.default ? " / default" : ""}</span><br/><span className="muted">{plan.available ? (plan.method === "deterministic" ? "Deterministic" : "Grounded AI") : "Reviewed upload"}</span></td>
                <td><span className={plan.updateStatus === "CHANGED" || plan.updateStatus === "NEW" ? "badge warning" : plan.updateStatus === "MISSING" || plan.updateStatus === "MANUAL" ? "badge locked" : "badge"}>{plan.updateStatus === "CHANGED" ? "Update available" : plan.updateStatus === "NEW" ? "New board required" : plan.updateStatus === "DRAFT" ? "Draft pending review" : plan.updateStatus === "CURRENT" ? "No change detected" : plan.updateStatus === "MANUAL" ? "Manual check required" : "Base missing"}</span><br/><span className="muted">{plan.readinessMessage}</span></td>
                <td>{formatControlTimestamp(plan.checkedAt)}</td>
                <td>{formatControlTimestamp(plan.activeBase?.retrievedAt)}{plan.activeBase?.hasBaseControl ? <><br/><span className="muted">Base v{plan.activeBase.version}</span></> : null}</td>
                <td>{formatControlTimestamp(plan.activeBase?.publishedAt)}</td>
                <td>{plan.needsDraft && plan.ready
                  ? <button className="btn secondary" onClick={() => extractBoard(plan.standardKey)} disabled={extractionIsRunning}>{plan.updateStatus === "CHANGED" ? "Update draft" : "Create draft"}</button>
                  : plan.pendingDraft
                    ? <button className="btn secondary" onClick={() => reviewDraft({ id: plan.pendingDraft!.id, industry: domainPlan.industry, standardKey: plan.standardKey, version: plan.pendingDraft!.version })}>Review draft v{plan.pendingDraft.version}</button>
                    : plan.updateStatus === "CURRENT" ? "No action needed" : "-"}</td>
              </tr>
            ))}</tbody>
          </table>
          {!runNeedsRecovery ? <button className="btn" onClick={() => extractBoard()} disabled={!domainPlan.aggregate.ready || extractionIsRunning || extractionAlreadyCompleted}>{extractionIsRunning ? "Creating drafts..." : extractionAlreadyCompleted ? "Drafts already created" : "Create new and updated drafts"}</button> : null}
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
            {runNeedsRecovery ? <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn" onClick={continueFailedRun} disabled={recoveryBusy}>{recoveryBusy ? "Checking sources..." : runCanResume ? "Continue from last failed item" : "Check and continue failed run"}</button>
              <button className="btn secondary" onClick={startNewExtractionRun} disabled={recoveryBusy}>{recoveryBusy ? "Please wait..." : "Start new run"}</button>
            </div> : null}
            {runNeedsRecovery && recoveryMessage ? <p className="muted" role="status" style={{ marginTop: 10, marginBottom: 0 }}>{recoveryMessage}</p> : null}
            {extractionRun.status === "COMPLETED" ? <button className="btn secondary" onClick={() => window.location.reload()}>Review created drafts</button> : null}
          </div> : null}
        {draftReview ? <div id="draft-priority-review" className="card subcard" style={{ padding: 14, marginBottom: 18, scrollMarginTop: 20 }}>
          <div className="mono">Draft priority review</div>
          <h3 style={{ marginBottom: 6 }}>{draftReview.label}</h3>
          <p className="muted">The publisher does not assign a universal cross-framework score. Confirm each control category and Silhouette IRP priority before this draft becomes a scoring base. Valid priorities are Critical, High, Medium, and Low.</p>
          <textarea className="textarea" value={draftReview.controlsJson} onChange={(event) => setDraftReview({ ...draftReview, controlsJson: event.target.value, saved: false })} style={{ minHeight: 420 }} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <button className="btn secondary" onClick={saveDraftReview}>Save reviewed priorities</button>
            <button className="btn" onClick={approveFromReview}>Approve</button>
            <button className="btn secondary" onClick={() => setDraftReview(null)}>Close</button>
          </div>
        </div> : null}
        <table className="table">
          <thead><tr><th>Industry</th><th>Standard</th><th>Version</th><th>Source</th><th>Status</th><th>Controls</th><th>Reviewer</th><th>Action</th></tr></thead>
          <tbody>
            {boardRows.map((board) => (
              <tr key={board.id}>
                <td>{board.industry}</td>
                <td>{board.standardKey}</td>
                <td>v{board.version}</td>
                <td>{board.sourceTitle || "Missing"}<br/><span className="muted">{board.sourceVersion || "No version"}</span></td>
                <td><span className={board.status === "PUBLISHED" ? "badge" : "badge locked"}>{board.status === "PUBLISHED" ? "BASE" : board.status}</span></td>
                <td>{board.controlCount}</td>
                <td>{board.reviewedBy || "-"}</td>
                <td>{board.status === "DRAFT" ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn secondary" onClick={() => reviewDraft(board)} style={{ minWidth: 132 }}>Review draft</button>
                  <button
                    className="btn"
                    onClick={() => approveDraft(board.id)}
                    title="Approve this validated draft and set it as the scoring base"
                    style={{ minWidth: 132 }}
                  >Approve</button>
                </div> : "-"}</td>
              </tr>
            ))}
            {!boardRows.length ? <tr><td colSpan={8}>No boards yet.</td></tr> : null}
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
