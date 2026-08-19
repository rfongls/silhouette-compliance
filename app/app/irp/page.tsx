import { Nav } from "@/components/Nav";
import { IrpClient } from "@/components/IrpClient";
import { auth } from "@/auth";
import { isEffectiveAdmin } from "@/lib/view-role";
import { getEntitlementBalance } from "@/lib/entitlements";
import { EntKind } from "@prisma/client";
import { ModulePaywall } from "@/components/ModulePaywall";
import { irpCharacterLimitPerOrg } from "@/lib/run-quotes";

export default async function IrpPage({ searchParams }: { searchParams: { demo?: string } }) {
  const demo = searchParams.demo === "1";
  const session = await auth();
  const isAdmin = isEffectiveAdmin(session);
  const balance = session?.user?.accountId ? await getEntitlementBalance(session.user.accountId, EntKind.ASSESSMENT_CREDIT).catch(() => 0) : 0;
  const canLoad = demo || isAdmin || balance > 0;
  return <main><Nav/><section className="wrap"><div className="mono">{demo ? "Demo mode" : isAdmin ? "Admin comped module" : "Credit-gated module"}</div><h1 style={{fontFamily:"EB Garamond",fontSize:44,margin:"8px 0 22px"}}>IRP Gap Analysis</h1>{canLoad ? <IrpClient demo={demo} characterLimitPerOrg={irpCharacterLimitPerOrg()}/> : <ModulePaywall module="irp" demoHref="/app/irp?demo=1" />}</section></main>;
}
