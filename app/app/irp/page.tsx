import { Nav } from "@/components/Nav";
import { IrpClient } from "@/components/IrpClient";

export default function IrpPage({ searchParams }: { searchParams: { demo?: string } }) {
  const demo = searchParams.demo === "1";
  return <main><Nav/><section className="wrap"><div className="mono">{demo ? "Demo mode" : "Paid module"}</div><h1 style={{fontFamily:"EB Garamond",fontSize:44,margin:"8px 0 22px"}}>IRP Gap Analysis</h1><IrpClient demo={demo}/></section></main>;
}
