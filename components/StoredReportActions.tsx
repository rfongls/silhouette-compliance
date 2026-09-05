"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StoredReportActions({ quoteId, pdfHref, deckHref }: { quoteId: string; pdfHref: string; deckHref: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function deleteReport() {
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/run-quotes/${encodeURIComponent(quoteId)}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || "The report could not be deleted.");
        return;
      }
      router.push("/app/profile");
      router.refresh();
    } catch {
      setError("The report could not be deleted. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  }

  return <section className="card stored-report-actions" aria-labelledby="stored-report-heading">
    <div className="stored-report-copy">
      <div className="mono">Account report</div>
      <h2 id="stored-report-heading">Your completed report</h2>
      <p className="stored-report-availability"><span className="badge">Available</span> Stored securely in your report history</p>
      <p className="muted">Silhouette does not retain uploaded source files. Completed reports are stored securely in this account and can be viewed, exported as rendered deliverables, or deleted by the user.</p>
    </div>
    <div className="stored-report-controls">
      <div className="stored-report-exports">
        <a className="btn secondary" href={pdfHref}>Export PDF</a>
        <a className="btn secondary" href={deckHref}>Export Deck</a>
      </div>
      {!confirming ? <button className="btn report-delete-button stored-report-delete-button" type="button" onClick={() => setConfirming(true)}>DELETE</button> : <div className="stored-report-confirmation">
        <p>This permanently deletes the completed report. Billing and usage receipts remain in your account.</p>
        <div className="stored-report-confirmation-actions">
          <button className="btn ghost" type="button" disabled={deleting} onClick={() => setConfirming(false)}>Cancel</button>
          <button className="btn report-delete-button" type="button" disabled={deleting} onClick={deleteReport}>{deleting ? "Deleting" : "Delete permanently"}</button>
        </div>
      </div>}
      {error ? <p className="report-delete-error" role="alert">{error}</p> : null}
    </div>
  </section>;
}
