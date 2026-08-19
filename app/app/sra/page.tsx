import { Nav } from "@/components/Nav";
import { SraClient } from "@/components/SraClient";
import { auth } from "@/auth";
import { isEffectiveAdmin } from "@/lib/view-role";
import { getEntitlementBalance } from "@/lib/entitlements";
import { EntKind } from "@prisma/client";
import { ModulePaywall } from "@/components/ModulePaywall";

export default async function SraPage({ searchParams }: { searchParams: { demo?: string } }) {
  const demo = searchParams.demo === "1";
  const session = await auth();
  const isAdmin = isEffectiveAdmin(session);
  const balance = session?.user?.accountId ? await getEntitlementBalance(session.user.accountId, EntKind.SRA_CREDIT).catch(() => 0) : 0;
  const canLoad = demo || isAdmin || balance > 0;
  return <main><Nav/><section className="wrap"><div className="mono">{demo ? "Demo mode" : isAdmin ? "Admin comped module" : "Credit-gated module"}</div><h1 style={{fontFamily:"EB Garamond",fontSize:44,margin:"8px 0 22px"}}>Security Risk Assessment</h1>{canLoad ? <SraClient demo={demo}/> : <ModulePaywall module="sra" demoHref="/app/sra?demo=1" />}</section></main>;
}
