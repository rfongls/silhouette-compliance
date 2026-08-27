"use client";

import Link from "next/link";
import { useState } from "react";

export function EarlyAccessWaitlist({ interestId }: { interestId?: string }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function joinWaitlist() {
    if (!interestId || status === "saving" || status === "saved") return;
    setStatus("saving");

    const response = await fetch("/api/early-access/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interestId })
    }).catch(() => null);

    setStatus(response?.ok ? "saved" : "error");
  }

  return (
    <div className="card" style={{ display: "grid", gap: 18 }}>
      <div className="mono">Early access</div>
      <h1 style={{ fontFamily: "EB Garamond", fontSize: 42, margin: 0 }}>Silhouette Compliance is in private release</h1>
      <p className="muted" style={{ margin: 0 }}>
        Your sign-in was verified, but this account does not have product access yet. Join the waitlist and we will record your interest for the Compliance release.
      </p>
      {interestId ? (
        <button className="btn" type="button" onClick={joinWaitlist} disabled={status === "saving" || status === "saved"}>
          {status === "saving" ? "Joining..." : status === "saved" ? "Waitlist joined" : "Join waitlist"}
        </button>
      ) : (
        <Link className="btn" href="/signin">Sign in to join</Link>
      )}
      {status === "saved" ? <p className="muted" style={{ margin: 0 }}>Your interest has been recorded.</p> : null}
      {status === "error" ? <p style={{ color: "var(--bad)", margin: 0 }}>We could not update the waitlist. Please try again.</p> : null}
      <Link className="btn secondary" href="/">Return to main</Link>
    </div>
  );
}
