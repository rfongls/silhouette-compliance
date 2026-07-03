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
};

type LedgerRow = {
  id: string;
  kind: string;
  status: string;
  amountCents: number | null;
  stripeRef: string | null;
};

type Props = {
  users: UserRow[];
  boards: BoardRow[];
  ledgers: LedgerRow[];
  standards: string[];
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

export function AdminConsole({ users: initialUsers, boards, ledgers, standards, aiConfig }: Props) {
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
  const [standardKey, setStandardKey] = useState(standards[0] || "HIPAA");
  const [status, setStatus] = useState("");
  const drafts = useMemo(() => boards.filter((board) => board.status === "DRAFT"), [boards]);
  const providerModels = optionsFor(provider);

  function changeProvider(nextProvider: string) {
    setProvider(nextProvider);
    const nextModel = defaultModelFor(nextProvider);
    setModel(nextModel);
    setModelChoice(nextModel);
    setCustomModel("");
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

  async function fetchBoard() {
    setStatus("Fetching control board draft...");
    const res = await fetch("/api/admin/boards/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ industry, standardKey })
    });
    if (!res.ok) return setStatus(await readError(res));
    setStatus("Draft board created.");
    window.location.reload();
  }

  async function publishBoard(id: string) {
    setStatus("Publishing board...");
    const res = await fetch("/api/admin/boards/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (!res.ok) return setStatus(await readError(res));
    setStatus("Board published.");
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
          <label>Base URL<input className="input" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://.../chat/completions" /></label>
          <label>API Key<input className="input" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasApiKey ? "Stored key active" : "Environment fallback or new key"} /></label>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn" onClick={saveAISettings}>Save AI settings</button>
          <span className={hasApiKey ? "badge" : "badge locked"}>{hasApiKey ? "Key configured" : "No key configured"}</span>
        </div>
      </section>

      <section className="card">
        <div className="mono">Control Boards</div>
        <h2>Fetch & Publish</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <select className="select" value={industry} onChange={(event) => setIndustry(event.target.value)} style={{ maxWidth: 260 }}>
            {industries.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select className="select" value={standardKey} onChange={(event) => setStandardKey(event.target.value)} style={{ maxWidth: 220 }}>
            {standards.map((standard) => <option key={standard} value={standard}>{standard}</option>)}
          </select>
          <button className="btn" onClick={fetchBoard}>Fetch draft</button>
          <a className="btn secondary" href="/api/admin/boards/export" target="_blank">Export published</a>
        </div>
        <table className="table">
          <thead><tr><th>Industry</th><th>Standard</th><th>Version</th><th>Status</th><th>Controls</th><th>Action</th></tr></thead>
          <tbody>
            {boards.map((board) => (
              <tr key={board.id}>
                <td>{board.industry}</td>
                <td>{board.standardKey}</td>
                <td>v{board.version}</td>
                <td><span className={board.status === "PUBLISHED" ? "badge" : "badge locked"}>{board.status}</span></td>
                <td>{board.controlCount}</td>
                <td>{board.status === "DRAFT" ? <button className="btn secondary" onClick={() => publishBoard(board.id)}>Publish</button> : "-"}</td>
              </tr>
            ))}
            {!boards.length ? <tr><td colSpan={6}>No boards yet.</td></tr> : null}
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
