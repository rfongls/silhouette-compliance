"use client";
import { useState } from "react";
import { demoOrgName } from "@/lib/demo";

export function IrpClient({ demo }: { demo: boolean }) {
  const [orgName, setOrgName] = useState(demo ? demoOrgName("health-center") : "");
  const [industry, setIndustry] = useState("health-center");
  const [text, setText] = useState(demo ? "Demo incident response policy text." : "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  async function run() {
    setLoading(true);
    const res = await fetch("/api/assess", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ demo, orgName, industry, documents: [{ name: `${orgName || "organization"}-irp.txt`, text }] }) });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return alert(data.error || "Assessment failed");
    setResult(data.result);
    setAssessmentId(data.assessmentId || null);
  }
  function changeIndustry(nextIndustry: string) {
    setIndustry(nextIndustry);
    if (demo) setOrgName(demoOrgName(nextIndustry));
  }
  return <div className="grid" style={{gridTemplateColumns:"minmax(280px,.9fr) minmax(320px,1.1fr)"}}><div className="card"><div className="mono">Queue</div><h2>Incident Response Plan</h2><div className="form"><label>Organization<input className="input" value={orgName} onChange={(e)=>setOrgName(e.target.value)} /></label><label>Industry<select className="select" value={industry} onChange={(e)=>changeIndustry(e.target.value)}><option value="health-center">Health Center / Healthcare</option><option value="financial">Financial</option><option value="education">Education</option><option value="public-sector">Public Sector</option><option value="manufacturing">Manufacturing / OT</option><option value="retail">Retail</option></select></label><label>Document text<textarea className="textarea" value={text} onChange={(e)=>setText(e.target.value)} placeholder="Paste extracted policy text. The source document is never persisted." /></label><button className="btn" onClick={run} disabled={loading}>{loading ? "Generating..." : demo ? "Run demo" : "Run paid assessment"}</button><p className="muted" style={{fontSize:13}}>Payment is verified server-side before any model call. Uploaded source text is used in memory for this request only.</p></div></div><div className="card"><div className="mono">Result</div>{result ? <><h2>{result.organization_name}</h2><div style={{display:"flex",gap:18,alignItems:"center"}}><div className="stat">{result.compliance_score}</div><div><b>{result.overall_posture}</b><p className="muted" style={{margin:0}}>{result.posture_summary}</p></div></div><h3>Findings</h3><table className="table"><tbody>{(result.findings||[]).map((f:any)=><tr key={f.control_id+f.finding}><td>{f.control_id}</td><td>{f.status}</td><td>{f.risk_level}</td><td>{f.finding}</td></tr>)}</tbody></table><div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>{assessmentId ? <><a className="btn secondary" href={`/api/assessments/${assessmentId}/export?format=report`} target="_blank">Report</a><a className="btn secondary" href={`/api/assessments/${assessmentId}/export?format=deck`} target="_blank">Deck</a><a className="btn secondary" href={`/api/assessments/${assessmentId}/export?format=json`} target="_blank">JSON</a></> : <span className="badge">Demo exports disabled</span>}</div></> : <p className="muted">Generated reports appear here. Demo mode returns static sample data and never calls the model.</p>}</div></div>;
}
