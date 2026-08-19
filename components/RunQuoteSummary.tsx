"use client";

export type RunQuote = {
  id: string;
  orgNames: string[];
  orgCount: number;
  documentCount: number;
  charCount: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedModelCostCents: number;
  customerAmountCents: number;
  marginCents: number;
  marginPercent: number;
  charCountByOrg: Record<string, number>;
  maxCharsPerOrg: number;
  characterLimitPerOrg: number;
  costLimitCents: number;
  withinGuard: boolean;
  warning?: string;
};

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function RunQuoteSummary({ quote }: { quote: RunQuote }) {
  return (
    <div className="card" style={{ padding: 14, background: "rgba(255,255,255,.65)" }}>
      <div className="mono">Run estimate</div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 10 }}>
        <div><b>{quote.orgCount}</b><p className="muted" style={{ margin: 0 }}>org{quote.orgCount === 1 ? "" : "s"} assessed</p></div>
        <div><b>{money(quote.customerAmountCents)}</b><p className="muted" style={{ margin: 0 }}>customer price</p></div>
        <div><b>{money(quote.estimatedModelCostCents)}</b><p className="muted" style={{ margin: 0 }}>estimated model cost</p></div>
        <div><b>{quote.marginPercent}%</b><p className="muted" style={{ margin: 0 }}>estimated margin</p></div>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: "12px 0 0" }}>
        {quote.documentCount} document{quote.documentCount === 1 ? "" : "s"} | {quote.charCount.toLocaleString()} characters total | {(quote.estimatedInputTokens + quote.estimatedOutputTokens).toLocaleString()} estimated tokens.
      </p>
      <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
        Largest organization: {quote.maxCharsPerOrg.toLocaleString()} of {quote.characterLimitPerOrg.toLocaleString()} characters. Accepted text is analyzed in full and is never silently truncated.
      </p>
      {quote.orgNames?.length ? <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>Invoice line items: {quote.orgNames.join(", ")}</p> : null}
      {quote.warning ? <p className="badge locked" style={{ display: "inline-flex", margin: "12px 0 0" }}>{quote.warning}</p> : null}
    </div>
  );
}
