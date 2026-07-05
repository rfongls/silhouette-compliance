import fs from "node:fs/promises";
import path from "node:path";
import { EntKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getEntitlementBalance } from "@/lib/entitlements";
import { isEffectiveAdmin } from "@/lib/view-role";

function injectCreditGate(html: string, demo: boolean) {
  const script = `<script>
(function(){
  var demo=${JSON.stringify(demo)};
  async function consume(){
    if(demo) return true;
    var res=await fetch('/api/proposals/use-credit',{method:'POST'});
    if(!res.ok){ var d={}; try{d=await res.json();}catch(_e){} alert(d.error||'Confirmed proposal credit required'); return false; }
    return true;
  }
  function wrap(name){
    var original=window[name];
    if(typeof original!=='function') return;
    window[name]=async function(){ if(await consume()) return original.apply(this, arguments); };
  }
  window.addEventListener('load',function(){ wrap('printToPDF'); wrap('downloadForPrint'); });
})();
</script>`;
  return html.replace("</body>", script + "</body>");
}

export async function GET(req: Request) {
  const demo = new URL(req.url).searchParams.get("demo") === "1";
  if (!demo) {
    const session = await auth();
    if (!session?.user?.accountId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!isEffectiveAdmin(session)) {
      const balance = await getEntitlementBalance(session.user.accountId, EntKind.PROPOSAL_CREDIT);
      if (balance <= 0) return NextResponse.json({ error: "Confirmed proposal credit required" }, { status: 402 });
    }
  }
  const file = path.join(process.cwd(), "uploads", "silhouette-proposal-template.html");
  const html = await fs.readFile(file, "utf8");
  return new NextResponse(injectCreditGate(html, demo), { headers: { "content-type": "text/html; charset=utf-8" } });
}
