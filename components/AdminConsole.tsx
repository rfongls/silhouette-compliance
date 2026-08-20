"use client";

import { useMemo, useState } from "react";

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

type BoardPlan = {
  standardKey: string;
  sourceTitle: string;
  sourceVersion: string;
  sourceUrls: string[];
  sourceHash: string;
  sourceScope: string;
  refreshCadenceDays: number;
  method: "deterministic" | "grounded-ai";
  batchLabels: string[];
  requestCount: number;
  estimatedInputTokens: number;
  deterministicControlCount: number;
  provider: string | null;
  model: string | null;
  ready: boolean;
  readinessMessage: string;
  activeBase: {
    version: number | null;
    publishedAt: string | null;
    hasBaseControl: boolean;
    sourceChanged: boolean;
    refreshDue: boolean;
    refreshDueAt: string | null;
  };
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
  const [industry, setIndustry] = useState(industries[0].value);
  const [standardKey, setStandardKey] = useState(standardsByIndustry[industries[0].value]?.[0]?.key || standards[0] || "HIPAA");
  const [controlsJson, setControlsJson] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceVersion, setSourceVersion] = useState("");
  const [sourceUrls, setSourceUrls] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [status, setStatus] = useState("");
  const [boardPlan, setBoardPlan] = useState<BoardPlan | null>(null);
  const drafts = useMemo(() => boards.filter((board) => board.status === "DRAFT"), [boards]);
  const providerModels = optionsFor(provider);
  const selectedStandards = standardsByIndustry[industry] || standards.map((standard) => ({ key: standard, label: standard, default: false }));

  function changeProvider(nextProvider: string) {
    setProvider(nextProvider);
    const nextModel = defaultModelFor(nextProvider);
    setModel(nextModel);
    setModelChoice(nextModel);
    setCustomModel("");
    setBaseUrl(providerBaseUrls[nextProvider] || "");
    setBoardPlan(null);
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
    setBoardPlan(null);
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
    setStatus("Saving AI settings...");
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, model, baseUrl, apiKey })
    });
    if (!res.ok) return setStatus(await readError(res));
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
    setApiKey("");
    setStatus("AI settings saved.");
  }

  async function preflightBoard() {
    setStatus("Checking the official source and extraction plan...");
    const res = await fetch("/api/admin/boards/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "preflight", industry, standardKey })
    });
    if (!res.ok) return setStatus(await readError(res));
    const data = await res.json();
    setBoardPlan(data.plan);
    setStatus("Source preflight complete. No AI request was made.");
  }

  async function extractBoard() {
    if (!boardPlan) return;
    const action = boardPlan.method === "deterministic"
      ? `Create a draft from ${boardPlan.deterministicControlCount} deterministically parsed controls?`
      : `Run ${boardPlan.requestCount} paid ${boardPlan.provider || "AI"} extraction request${boardPlan.requestCount === 1 ? "" : "s"} using ${boardPlan.model || "the configured model"}?`;
    if (!window.confirm(action)) return;
    setStatus(boardPlan.method === "deterministic" ? "Creating control board draft..." : "Running grounded extraction and validation...");
    const res = await fetch("/api/admin/boards/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "extract", industry, standardKey, sourceHash: boardPlan.sourceHash, confirmExtraction: true })
    });
    if (!res.ok) return setStatus(await readError(res));
    setStatus("Validated draft board created.");
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
          <label>API Key<input className="input" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasApiKey ? "Stored key active" : "Environment fallback or new key"} /></label>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn" onClick={saveAISettings}>Save AI settings</button>
          <span className={hasApiKey ? "badge" : "badge locked"}>{hasApiKey ? "Key configured" : "No key configured"}</span>
        </div>
      </section>

      <section className="card">
        <div className="mono">Control Boards</div>
        <h2>Retrieve, Review & Set Base</h2>
        <p className="muted">Only administrators can retrieve official sources, create drafts, and set the reviewed base control used for scoring. Each configured source is checked annually and fingerprinted so source changes are visible before extraction.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <select className="select" value={industry} onChange={(event) => changeIndustry(event.target.value)} style={{ maxWidth: 260 }}>
            {industries.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select className="select" value={standardKey} onChange={(event) => { setStandardKey(event.target.value); setBoardPlan(null); }} style={{ maxWidth: 220 }}>
            {selectedStandards.map((standard) => <option key={standard.key} value={standard.key}>{standard.label}</option>)}
          </select>
          <button className="btn" onClick={preflightBoard}>Check official source</button>
          <a className="btn secondary" href="/api/admin/boards/export" target="_blank">Export base controls</a>
        </div>
        {boardPlan ? <div className="card subcard" style={{ padding: 16, marginBottom: 18 }}>
          <div className="mono">Extraction preflight</div>
          <h3 style={{ marginBottom: 6 }}>{boardPlan.sourceTitle}</h3>
          <p className="muted" style={{ marginTop: 0 }}>{boardPlan.sourceVersion}</p>
          <p>{boardPlan.sourceScope}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, margin: "14px 0" }}>
            <div><b>Method</b><br/><span className="muted">{boardPlan.method === "deterministic" ? "Deterministic parser" : "Grounded AI extraction"}</span></div>
            <div><b>Provider</b><br/><span className="muted">{boardPlan.provider ? `${boardPlan.provider} / ${boardPlan.model}` : "No AI call"}</span></div>
            <div><b>Requests</b><br/><span className="muted">{boardPlan.requestCount}</span></div>
            <div><b>Estimated input</b><br/><span className="muted">{boardPlan.estimatedInputTokens.toLocaleString()} tokens</span></div>
            <div><b>Review cycle</b><br/><span className="muted">Every {boardPlan.refreshCadenceDays} days</span></div>
            <div><b>Next review</b><br/><span className="muted">{boardPlan.activeBase.refreshDueAt ? new Date(boardPlan.activeBase.refreshDueAt).toLocaleDateString() : "Set after first base"}</span></div>
            <div><b>Current base</b><br/><span className="muted">{boardPlan.activeBase.hasBaseControl ? `v${boardPlan.activeBase.version}` : "Not set"}</span></div>
            <div><b>Source status</b><br/><span className="muted">{boardPlan.activeBase.sourceChanged ? "Source changed" : boardPlan.activeBase.refreshDue ? "Annual review due" : "Current"}</span></div>
          </div>
          <div><b>Authoritative sources</b><ul>{boardPlan.sourceUrls.map((url) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>)}</ul></div>
          {boardPlan.batchLabels.length ? <div><b>Required batches</b><ul>{boardPlan.batchLabels.map((label) => <li key={label}>{label}</li>)}</ul></div> : null}
          <p className="muted" style={{ overflowWrap: "anywhere" }}><b>Source fingerprint:</b> {boardPlan.sourceHash}</p>
          <p>{boardPlan.readinessMessage}</p>
          <button className="btn" onClick={extractBoard} disabled={!boardPlan.ready}>{boardPlan.method === "deterministic" ? "Create parsed draft" : "Run confirmed extraction"}</button>
        </div> : null}
        <div className="card subcard" style={{ padding: 14, marginBottom: 18 }}>
          <div className="mono">Manual control upload</div>
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
                <td>{board.status === "DRAFT" ? <button className="btn secondary" onClick={() => publishBoard(board.id)}>Set as base</button> : "-"}</td>
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
