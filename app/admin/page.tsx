import { BoardStatus } from "@prisma/client";
import { Nav } from "@/components/Nav";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user.role !== "admin") return <main><Nav/><section className="wrap"><div className="card"><h1>Forbidden</h1><p className="muted">Admin role required.</p></div></section></main>;
  const boards = await prisma.controlBoard.findMany({ orderBy:[{industry:"asc"},{standardKey:"asc"},{version:"desc"}] }).catch(()=>[]);
  const ledgers = await prisma.usageLedger.findMany({ orderBy:{createdAt:"desc"}, take:10 }).catch(()=>[]);
  const statusClass = (s: BoardStatus) => s === "PUBLISHED" ? "badge" : "badge locked";
  return <main><Nav/><section className="wrap"><div className="mono">Admin</div><h1 style={{fontFamily:"EB Garamond",fontSize:44}}>Control Boards</h1><p className="muted">Fetch creates draft board versions through the server-side Anthropic proxy; publish promotes one draft and archives the prior published board.</p><table className="table"><thead><tr><th>Industry</th><th>Standard</th><th>Version</th><th>Status</th><th>Controls</th></tr></thead><tbody>{boards.map(b=><tr key={b.id}><td>{b.industry}</td><td>{b.standardKey}</td><td>v{b.version}</td><td><span className={statusClass(b.status)}>{b.status}</span></td><td>{b.controlCount}</td></tr>)}</tbody></table><h2 style={{fontFamily:"EB Garamond",marginTop:28}}>Usage Ledger</h2><table className="table"><thead><tr><th>Kind</th><th>Status</th><th>Amount</th><th>Stripe</th></tr></thead><tbody>{ledgers.map(l=><tr key={l.id}><td>{l.kind}</td><td>{l.status}</td><td>{l.amountCents ? `$${(l.amountCents/100).toFixed(2)}` : "-"}</td><td>{l.stripeRef || "-"}</td></tr>)}</tbody></table></section></main>;
}
