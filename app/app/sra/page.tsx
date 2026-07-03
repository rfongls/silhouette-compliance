import { Nav } from "@/components/Nav";
import { SraClient } from "@/components/SraClient";

export default function SraPage({ searchParams }: { searchParams: { demo?: string } }) {
  const demo = searchParams.demo === "1";
  return <main><Nav/><section className="wrap"><div className="mono">{demo ? "Demo mode" : "Paid module"}</div><h1 style={{fontFamily:"EB Garamond",fontSize:44,margin:"8px 0 22px"}}>Security Risk Assessment</h1><SraClient demo={demo}/></section></main>;
}
