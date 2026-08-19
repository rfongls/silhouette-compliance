import { AdminConsole } from "@/components/AdminConsole";
import { Nav } from "@/components/Nav";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { EXTRA_CB_BATCHES } from "@/lib/analysis/prompts";
import { getAIConfigForAdmin } from "@/lib/settings";
import { isComplianceEmailAllowed } from "@/lib/access-gate";

export default async function AdminPage() {
  const session = await auth();
  if (!isComplianceEmailAllowed(session?.user.email)) return <main><Nav/><section className="wrap"><div className="card"><h1>Access restricted</h1><p className="muted">Compliance suite access is temporarily limited to approved owner accounts.</p></div></section></main>;
  if (session?.user.role !== "admin") return <main><Nav/><section className="wrap"><div className="card"><h1>Forbidden</h1><p className="muted">Admin role required.</p></div></section></main>;
  const [boards, ledgers, users, aiConfig] = await Promise.all([
    prisma.controlBoard.findMany({ orderBy:[{industry:"asc"},{standardKey:"asc"},{version:"desc"}], select:{ id:true, industry:true, standardKey:true, version:true, status:true, controlCount:true } }).catch(()=>[]),
    prisma.usageLedger.findMany({ orderBy:{createdAt:"desc"}, take:10, select:{ id:true, kind:true, status:true, amountCents:true, stripeRef:true } }).catch(()=>[]),
    prisma.user.findMany({ orderBy:[{role:"asc"},{email:"asc"}], select:{ id:true, name:true, email:true, role:true, accountId:true, createdAt:true } }).catch(()=>[]),
    getAIConfigForAdmin()
  ]);
  return <main><Nav/><section className="wrap" style={{maxWidth:1320}}><div className="mono">Admin</div><h1 style={{fontFamily:"EB Garamond",fontSize:44}}>Admin Console</h1><AdminConsole users={users.map((u: { id: string; name: string | null; email: string | null; role: string; accountId: string; createdAt: Date })=>({...u,createdAt:u.createdAt.toISOString()}))} boards={boards} ledgers={ledgers} standards={Object.keys(EXTRA_CB_BATCHES)} aiConfig={aiConfig}/></section></main>;
}
