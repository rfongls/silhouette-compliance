"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StoredReportActions({ quoteId }: { quoteId: string }) {
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
    <div>
      <div className="mono">Report storage</div>
      <h2 id="stored-report-heading">Your completed report</h2>
      <p className="muted">Stateless by design. Silhouette does not retain uploaded source files. Completed reports are stored securely for account access and can be downloaded or deleted by the user.</p>
    </div>
    <div className="stored-report-delete">
      <a className="btn secondary" href={`/api/run-quotes/${encodeURIComponent(quoteId)}/export?format=package`} download>Export report package</a>
      {!confirming ? <button className="btn secondary" type="button" onClick={() => setConfirming(true)}>Delete report</button> : <>
        <p>This permanently deletes this report package. Billing and usage receipts remain in your account.</p>
        <div>
          <button className="btn ghost" type="button" disabled={deleting} onClick={() => setConfirming(false)}>Cancel</button>
          <button className="btn report-delete-button" type="button" disabled={deleting} onClick={deleteReport}>{deleting ? "Deleting" : "Delete permanently"}</button>
        </div>
      </>}
      {error ? <p className="report-delete-error" role="alert">{error}</p> : null}
    </div>
  </section>;
}
