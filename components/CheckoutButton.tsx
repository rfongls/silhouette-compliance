"use client";

import { useState } from "react";

export function CheckoutButton({ module, quantity = 1, quoteId, children }: { module: "irp" | "sra" | "proposal"; quantity?: number; quoteId?: string; children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ module, quantity, quoteId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout could not be started. Please try again.");
      window.location.assign(data.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout could not be started. Please try again.");
      setLoading(false);
    }
  }
  return <span style={{ display: "inline-flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
    <button className="btn" type="button" onClick={go} disabled={loading}>{loading ? "Starting..." : children}</button>
    {error ? <span role="alert" className="muted" style={{ color: "var(--bad)", fontSize: 13, maxWidth: 360 }}>{error}</span> : null}
  </span>;
}
