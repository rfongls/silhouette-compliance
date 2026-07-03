import Link from "next/link";
import { EntKind } from "@prisma/client";
import { auth } from "@/auth";
import { CheckoutButton } from "@/components/CheckoutButton";
import { Nav } from "@/components/Nav";
import { getEntitlementBalance } from "@/lib/entitlements";

async function balance(accountId: string, kind: EntKind) { return getEntitlementBalance(accountId, kind).catch(() => 0); }

export default async function AppLauncher() {
  const session = await auth();
  const accountId = session?.user?.accountId;
  const [irp, sra, proposal] = accountId ? await Promise.all([balance(accountId, "ASSESSMENT_CREDIT"), balance(accountId, "SRA_CREDIT"), balance(accountId, "PROPOSAL_CREDIT")]) : [0,0,0];
  const modules = [
    { key: "irp", title: "Incident Response Plan", price: "$250 / org", credits: irp, href: "/app/irp", body: "Upload policy text for a stateless gap analysis. Exports remain downloadable from history." },
    { key: "sra", title: "Security Risk Assessment", price: "$1,500 / engagement", credits: sra, href: "/app/sra", body: "Scope, inventory, encrypted evidence, human-approved findings, and remediation roadmap." },
    { key: "proposal", title: "Proposals", price: "$99 / proposal", credits: proposal, href: "/app/proposals", body: "Proposal builder with pricing, project plan, checklist, references, and print exports." }
  ] as const;
  return <main><Nav/><section className="wrap"><div className="mono">Module launcher</div><h1 style={{fontFamily:"EB Garamond",fontSize:46,margin:"8px 0 24px"}}>Compliance suite</h1><div className="grid">{modules.map((m)=><div className="card" key={m.key}><span className={m.credits>0?"badge":"badge locked"}>{m.credits>0?`${m.credits} active credit${m.credits===1?"":"s"}`:"Locked"}</span><h2 style={{marginTop:18}}>{m.title}</h2><p className="muted">{m.body}</p><div className="mono" style={{margin:"18px 0"}}>{m.price}</div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{m.credits>0?<Link className="btn" href={m.href}>Launch</Link>:<CheckoutButton module={m.key}>Purchase</CheckoutButton>}<Link className="btn secondary" href={`${m.href}?demo=1`}>Try demo</Link></div></div>)}</div></section></main>;
}
