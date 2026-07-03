import Link from "next/link";
import { EntKind } from "@prisma/client";
import { auth } from "@/auth";
import { CheckoutButton } from "@/components/CheckoutButton";
import { Nav } from "@/components/Nav";
import { getEntitlementBalance } from "@/lib/entitlements";

export default async function ProposalsPage({ searchParams }: { searchParams: { demo?: string } }) {
  const demo = searchParams.demo === "1";
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";
  const balance = session?.user?.accountId ? await getEntitlementBalance(session.user.accountId, EntKind.PROPOSAL_CREDIT).catch(() => 0) : 0;
  const canLoad = demo || isAdmin || balance > 0;
  return <main><Nav/><section className="wrap" style={{maxWidth:1400}}><div className="mono">{demo ? "Demo mode" : isAdmin ? "Admin comped module" : "Credit-gated module"}</div><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:18,marginBottom:18,flexWrap:"wrap"}}><div><h1 style={{fontFamily:"EB Garamond",fontSize:44,margin:"8px 0"}}>Proposals</h1><p className="muted" style={{margin:0}}>The original proposal template is loaded intact. Real print/download exports consume one proposal credit, or record comped admin usage.</p></div><div style={{display:"flex",gap:10}}>{isAdmin ? <span className="badge">Admin comped</span> : balance > 0 ? <span className="badge">{balance} credit{balance===1?"":"s"}</span> : demo ? <span className="badge">Static demo</span> : <CheckoutButton module="proposal">Purchase credit</CheckoutButton>}<Link className="btn secondary" href="/app">Launcher</Link></div></div>{canLoad ? <iframe title="Silhouette Proposal Template" src={`/api/proposals/template${demo ? "?demo=1" : ""}`} style={{width:"100%",height:"78vh",border:"1px solid var(--line)",borderRadius:8,background:"#fff"}}/> : <div className="card"><h2>Proposal credit required</h2><p className="muted">Purchase a credit to load the proposal builder, or open the static demo.</p><div style={{display:"flex",gap:10}}><CheckoutButton module="proposal">Purchase</CheckoutButton><Link className="btn secondary" href="/app/proposals?demo=1">Try demo</Link></div></div>}</section></main>;
}
