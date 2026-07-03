"use client";
import { useState } from "react";

const steps = ["scope", "inventory", "evidence", "findings", "roadmap", "report"];

export function SraClient({ demo }: { demo: boolean }) {
  const [step, setStep] = useState("scope");
  const [orgName, setOrgName] = useState(demo ? "Demo Health Center" : "");
  const [industry, setIndustry] = useState("health-center");
  const [engagementId, setEngagementId] = useState<string | null>(demo ? "demo" : null);
  const [findings, setFindings] = useState<any[]>(demo ? [{id:"SRA-001",title:"MFA not enforced",rating:"High",area:"Identity",evidence:"Entra export",desc:"Privileged users lack MFA.",rec:"Enforce MFA for privileged access."}] : []);
  const [roadmap, setRoadmap] = useState<any[]>([]);
  async function create() {
    const res = await fetch("/api/sra", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ demo, orgName, industry, scope:{ period:"Current" } }) });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Could not create engagement");
    setEngagementId(data.engagement.id); setStep("inventory");
  }
  async function draft() {
    if (demo) { setFindings(findings); setStep("findings"); return; }
    if (!engagementId) return;
    const res = await fetch(`/api/sra/${engagementId}/draft-findings`, { method:"POST" });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Draft failed");
    setFindings(data.findings || []); setStep("findings");
  }
  async function buildRoadmap() {
    if (demo) { setRoadmap([{window:"0-30 days",owner:"IT",items:["Enforce MFA","Document exceptions"]},{window:"31-60 days",owner:"Security",items:["Patch critical systems"]},{window:"61-90 days",owner:"Compliance",items:["Update risk register"]}]); setStep("roadmap"); return; }
    if (!engagementId) return;
    const res = await fetch(`/api/sra/${engagementId}/roadmap`, { method:"POST" });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Roadmap failed");
    setRoadmap(data.roadmap || []); setStep("roadmap");
  }
  return <div className="card"><div className="steps">{steps.map(s=><button key={s} className={`step ${s===step?"active":""}`} onClick={()=>setStep(s)}>{s}</button>)}</div>{step==="scope"&&<div className="form"><h2>Scope & Methodology</h2><input className="input" placeholder="Organization" value={orgName} onChange={(e)=>setOrgName(e.target.value)}/><select className="select" value={industry} onChange={(e)=>setIndustry(e.target.value)}><option value="health-center">Health Center</option><option value="financial">Financial</option><option value="education">Education</option><option value="public-sector">Public Sector</option><option value="manufacturing">Manufacturing</option><option value="retail">Retail</option></select><p className="muted">Methodology is standardized: Assess, Analyze, Deliver. SRA stores encrypted infrastructure evidence; never patient data.</p><button className="btn" onClick={create}>{demo ? "Start demo" : "Create paid engagement"}</button></div>}{step==="inventory"&&<div><h2>Asset & Sensitive Data Inventory</h2><table className="table"><tbody><tr><td>EHR / Core system</td><td>Sensitive data</td><td>High criticality</td></tr><tr><td>Identity provider</td><td>Accounts and roles</td><td>High criticality</td></tr></tbody></table><button className="btn" style={{marginTop:16}} onClick={()=>setStep("evidence")}>Continue to evidence</button></div>}{step==="evidence"&&<div><h2>Evidence Collection</h2><p className="muted">Import scanner/identity/phishing exports. The app normalizes evidence; it does not run scanners. Configure S3-compatible storage before real uploads.</p><button className="btn" onClick={draft}>{demo ? "Draft demo findings" : "Draft findings from stored evidence"}</button></div>}{step==="findings"&&<div><h2>Risk Matrix & Findings</h2><table className="table"><tbody>{findings.map(f=><tr key={f.id}><td>{f.id}</td><td>{f.rating}</td><td><b>{f.title}</b><br/>{f.desc}</td><td>{f.rec}</td></tr>)}</tbody></table><button className="btn" style={{marginTop:16}} onClick={buildRoadmap}>Build roadmap</button></div>}{step==="roadmap"&&<div><h2>30 / 60 / 90 Roadmap</h2><div className="grid">{roadmap.map((r,i)=><div className="card" key={i}><h3>{r.window}</h3><p className="mono">{r.owner}</p>{(r.items||[]).map((it:string)=><p key={it}>{it}</p>)}</div>)}</div><button className="btn" onClick={()=>setStep("report")}>Complete report</button></div>}{step==="report"&&<div><h2>Assessment Complete</h2><p className="muted">Export is generated from stored engagement data. Evidence can be purged at close.</p>{engagementId && engagementId!=="demo" ? <a className="btn secondary" href={`/api/sra/${engagementId}/export`} target="_blank">Open report</a> : <span className="badge">Demo report</span>}</div>}</div>;
}
