import Link from "next/link";
import { Nav } from "@/components/Nav";
import { IrpClient } from "@/components/IrpClient";
import { isEffectiveAdmin } from "@/lib/view-role";
import { irpCharacterLimitPerOrg } from "@/lib/run-quotes";
import { prisma } from "@/lib/prisma";

export default async function IrpPage({ searchParams }: { searchParams: { demo?: string } }) {
  const demo = searchParams.demo === "1";
  if (demo) {
    return <main><Nav publicOnly/><section className="wrap"><div className="mono">Curated demo</div><h1 style={{fontFamily:"EB Garamond",fontSize:44,margin:"8px 0 22px"}}>IRP Gap Analysis</h1><IrpClient demo isAdmin={false} characterLimitPerOrg={irpCharacterLimitPerOrg()} availableStandardsByIndustry={{}}/></section></main>;
  }
  const { auth } = await import("@/auth");
  const session = await auth();
  const isAdmin = isEffectiveAdmin(session);
  const publishedBoards = await prisma.controlBoard.findMany({
    where: { status: "PUBLISHED" },
    select: { industry: true, standardKey: true },
    orderBy: [{ industry: "asc" }, { standardKey: "asc" }]
  }).catch(() => []);
  const availableStandardsByIndustry = Object.fromEntries([...new Set(publishedBoards.map((board) => board.industry))].map((industry) => [
    industry,
    publishedBoards.filter((board) => board.industry === industry).map((board) => board.standardKey)
  ]));
  return <main><Nav/><section className="wrap"><div className="module-title-row"><div><div className="mono">{isAdmin ? "Admin comped module" : "Client assessment"}</div><h1 style={{fontFamily:"EB Garamond",fontSize:44,margin:"8px 0 22px"}}>IRP Gap Analysis</h1></div><Link className="btn secondary" href="/app/profile#reports">Access my reports</Link></div><IrpClient demo={false} isAdmin={isAdmin} characterLimitPerOrg={irpCharacterLimitPerOrg()} availableStandardsByIndustry={availableStandardsByIndustry}/></section></main>;
}
