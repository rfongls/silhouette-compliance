import { EntKind } from "@prisma/client";
import Link from "next/link";
import { auth } from "@/auth";
import { Nav } from "@/components/Nav";
import { prisma } from "@/lib/prisma";
import { getEntitlementBalance } from "@/lib/entitlements";

function money(cents: number | null) {
  return cents ? `$${(cents / 100).toFixed(2)}` : "-";
}

function tokens(input?: number | null, output?: number | null) {
  const total = (input || 0) + (output || 0);
  return total ? `${total.toLocaleString()} (${(input || 0).toLocaleString()} in / ${(output || 0).toLocaleString()} out)` : "-";
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.accountId) return <main><Nav/><section className="wrap"><div className="card"><h1>Sign in required</h1><p className="muted">Use your account to view usage and billing.</p></div></section></main>;

  const accountId = session.user.accountId;
  const [assessmentCredits, sraCredits, proposalCredits, ledgers, reportQuoteRows] = await Promise.all([
    getEntitlementBalance(accountId, EntKind.ASSESSMENT_CREDIT).catch(() => 0),
    getEntitlementBalance(accountId, EntKind.SRA_CREDIT).catch(() => 0),
    getEntitlementBalance(accountId, EntKind.PROPOSAL_CREDIT).catch(() => 0),
    prisma.usageLedger.findMany({ where: { accountId }, orderBy: { createdAt: "desc" }, take: 50 }).catch(() => []),
    prisma.runQuote.findMany({
      where: { accountId, module: "irp", status: "CONSUMED", reportDeletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, assessmentScope: true, parentOrgName: true, orgNames: true, orgCount: true, reportAssessmentIds: true, reportEmailStatus: true, reportEmailSentAt: true, createdAt: true }
    }).catch(() => [])
  ]);

  const trackedTotal = ledgers.reduce((sum, row) => sum + (row.amountCents || 0), 0);
  const compedTotal = ledgers.filter((row) => row.status === "admin_comped").reduce((sum, row) => sum + (row.amountCents || 0), 0);
  const reportQuotes = reportQuoteRows.filter((quote) => Array.isArray(quote.reportAssessmentIds) && quote.reportAssessmentIds.length > 0);

  return <main><Nav/><section className="wrap" style={{maxWidth:1180}}><div className="mono">Profile</div><h1 style={{fontFamily:"EB Garamond",fontSize:44,margin:"8px 0 24px"}}>Usage & Billing</h1><div className="grid" style={{marginBottom:18}}><div className="card"><div className="mono">Account</div><h2>{session.user.name || session.user.email || "Signed-in user"}</h2><p className="muted" style={{marginBottom:0}}>{session.user.email}</p><p className="muted" style={{marginTop:8}}>Role: <b>{session.user.role}</b></p></div><div className="card"><div className="mono">Credits</div><h2>Active Balances</h2><p>Assessments: <b>{assessmentCredits}</b></p><p>SRA: <b>{sraCredits}</b></p><p>Proposals: <b>{proposalCredits}</b></p></div><div className="card"><div className="mono">Tracked Usage</div><h2>{money(trackedTotal)}</h2><p className="muted">Admin comped usage: {money(compedTotal)}</p></div></div>{reportQuotes.length ? <div className="card" style={{marginBottom:18}}><div className="mono">Report history</div><h2>Completed IRP reports</h2><table className="table"><thead><tr><th>Date</th><th>Assessment</th><th>Organizations</th><th>Email</th><th>Report</th></tr></thead><tbody>{reportQuotes.map((quote) => { const names = Array.isArray(quote.orgNames) ? quote.orgNames.map(String) : []; return <tr key={quote.id}><td>{quote.createdAt.toLocaleDateString()}</td><td>{quote.parentOrgName || names[0] || "IRP assessment"}</td><td>{quote.orgCount}</td><td><span className={quote.reportEmailStatus === "SENT" ? "badge" : "badge warning"}>{quote.reportEmailStatus}</span></td><td><Link className="btn secondary" href={`/app/irp/reports/${quote.id}`}>Open</Link></td></tr>; })}</tbody></table></div> : null}<div className="card"><h2>Usage Ledger</h2><table className="table"><thead><tr><th>Date</th><th>Kind</th><th>Status</th><th>Tracked Amount</th><th>Tokens</th><th>Reference</th></tr></thead><tbody>{ledgers.map((row)=><tr key={row.id}><td>{row.createdAt.toLocaleDateString()}</td><td>{row.kind}</td><td><span className={row.status === "succeeded" ? "badge" : "badge locked"}>{row.status}</span></td><td>{money(row.amountCents)}</td><td>{tokens(row.inputTokens, row.outputTokens)}</td><td>{row.stripeRef || row.assessmentId || "-"}</td></tr>)}{!ledgers.length ? <tr><td colSpan={6}>No usage yet.</td></tr> : null}</tbody></table></div></section></main>;
}
