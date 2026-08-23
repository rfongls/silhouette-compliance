"use client";

import { useState } from "react";

export function ReportDeliveryStatus({ quoteId, initialStatus, recipient, error }: { quoteId: string; initialStatus: string; recipient: string | null; error: string | null }) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState(error || "");
  const retryable = recipient && ["FAILED", "NOT_CONFIGURED", "PENDING"].includes(status);

  async function retry() {
    setStatus("SENDING");
    setMessage("Sending completion notification...");
    const response = await fetch(`/api/run-quotes/${encodeURIComponent(quoteId)}/email`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    const nextStatus = String(data.delivery?.status || "FAILED");
    setStatus(nextStatus);
    setMessage(nextStatus === "SENT" ? "Completion notification sent." : data.delivery?.error || "Completion notification could not be sent.");
  }

  return <section className="card subcard" style={{ padding: 14, marginBottom: 18 }}>
    <div className="mono">Report delivery</div>
    <p style={{ marginBottom: retryable ? 10 : 0 }}><span className={status === "SENT" ? "badge" : status === "DISABLED" ? "badge" : "badge warning"}>{status}</span>{recipient ? ` ${recipient}` : " Browser only"}</p>
    {message ? <p className="muted" style={{ fontSize: 13 }}>{message}</p> : null}
    {retryable ? <button className="btn secondary" type="button" onClick={retry} disabled={status === "SENDING"}>Retry notification</button> : null}
  </section>;
}
