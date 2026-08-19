import Link from "next/link";
import { CheckoutButton } from "@/components/CheckoutButton";

const copy = {
  irp: {
    title: "Incident Response Plan credit required",
    body: "Purchase an IRP assessment credit before uploading policy text for analysis."
  },
  sra: {
    title: "Security Risk Assessment credit required",
    body: "Purchase an SRA engagement credit before creating a scoped assessment workspace."
  },
  proposal: {
    title: "Proposal credit required",
    body: "Purchase a proposal credit before loading the proposal builder."
  }
};

export function ModulePaywall({ module, demoHref }: { module: "irp" | "sra" | "proposal"; demoHref: string }) {
  const item = copy[module];
  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <div className="mono">Locked module</div>
      <h2>{item.title}</h2>
      <p className="muted">{item.body}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <CheckoutButton module={module}>Purchase</CheckoutButton>
        <Link className="btn secondary" href={demoHref}>Try demo</Link>
        <Link className="btn ghost" href="/app">Back to launcher</Link>
      </div>
    </div>
  );
}
