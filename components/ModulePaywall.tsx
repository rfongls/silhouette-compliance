import Link from "next/link";
import { CheckoutButton } from "@/components/CheckoutButton";

const copy = {
  irp: {
    eyebrow: "IRP assessment",
    title: "Start an Incident Response Plan assessment",
    body: "Begin a guided assessment for your organization or client network.",
    action: "Start"
  },
  sra: {
    eyebrow: "Locked module",
    title: "Security Risk Assessment credit required",
    body: "Purchase an SRA engagement credit before creating a scoped assessment workspace.",
    action: "Purchase"
  },
  proposal: {
    eyebrow: "Locked module",
    title: "Proposal credit required",
    body: "Purchase a proposal credit before loading the proposal builder.",
    action: "Purchase"
  }
};

export function ModulePaywall({ module, demoHref }: { module: "irp" | "sra" | "proposal"; demoHref: string }) {
  const item = copy[module];
  return (
    <div className="module-entry">
      <Link className="btn ghost module-entry-back" href="/app">Return to main</Link>
      <div className="card">
        <div className="mono">{item.eyebrow}</div>
        <h2>{item.title}</h2>
        <p className="muted">{item.body}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <CheckoutButton module={module}>{item.action}</CheckoutButton>
          <Link className="btn secondary" href={demoHref}>Try demo</Link>
        </div>
      </div>
    </div>
  );
}
