import { Nav } from "@/components/Nav";
import { SraClient } from "@/components/SraClient";
import { auth } from "@/auth";

export default async function SraPage({ searchParams }: { searchParams: { demo?: string } }) {
  const demo = searchParams.demo === "1";
  const session = await auth();
  return <main><Nav/><section className="wrap"><div className="mono">{demo ? "Demo mode" : session?.user?.role === "admin" ? "Admin comped module" : "Paid module"}</div><h1 style={{fontFamily:"EB Garamond",fontSize:44,margin:"8px 0 22px"}}>Security Risk Assessment</h1><SraClient demo={demo}/></section></main>;
}
