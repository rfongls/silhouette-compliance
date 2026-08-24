"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ReportImport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [importing, setImporting] = useState(false);

  async function importFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setStatus("Validating and importing report...");
    try {
      const response = await fetch("/api/reports/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: await file.text()
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.quoteId) {
        setStatus(body.error || "The report could not be imported.");
        return;
      }
      setStatus(body.duplicate ? "This report is already in your history. Opening it now..." : "Report imported. Opening it now...");
      router.push(`/app/irp/reports/${encodeURIComponent(body.quoteId)}`);
      router.refresh();
    } catch {
      setStatus("The report could not be imported. Check your connection and try again.");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return <section className="card report-import-card" aria-labelledby="report-import-heading">
    <div>
      <div className="mono">Report portability</div>
      <h2 id="report-import-heading">Import previous report</h2>
      <p className="muted">Open a Silhouette IRP JSON export in the current web report. Imported reports are stored only in your account and do not create a charge.</p>
    </div>
    <div className="report-import-action">
      <input ref={inputRef} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => importFile(event.target.files?.[0])}/>
      <button className="btn secondary" type="button" disabled={importing} onClick={() => inputRef.current?.click()}>{importing ? "Importing..." : "Choose report JSON"}</button>
      {status ? <p className="muted" role="status" aria-live="polite">{status}</p> : null}
    </div>
  </section>;
}
