"use client";
import { useState } from "react";

export function ProposalClient({ demo }: { demo: boolean }) {
  const [brand, setBrand] = useState("Silhouette LLC");
  const [rfp, setRfp] = useState("RFP-2026-001");
  const [client, setClient] = useState("Client Organization");
  const [section, setSection] = useState("Silhouette LLC brings a disciplined, implementation-focused approach to this engagement. Our proposal emphasizes adoption, integration, governance, and measurable delivery outcomes.");
  async function consume() {
    if (demo) return window.print();
    const res = await fetch("/api/proposals/use-credit", { method:"POST" });
    if (!res.ok) { const data = await res.json(); alert(data.error || "Proposal credit required"); return; }
    window.print();
  }
  return <div className="grid" style={{gridTemplateColumns:"340px 1fr"}}><div className="card form"><h2>Proposal Builder</h2><input className="input" value={brand} onChange={(e)=>setBrand(e.target.value)}/><input className="input" value={rfp} onChange={(e)=>setRfp(e.target.value)}/><input className="input" value={client} onChange={(e)=>setClient(e.target.value)}/><textarea className="textarea" value={section} onChange={(e)=>setSection(e.target.value)}/><button className="btn" onClick={consume}>{demo ? "Print demo" : "Generate/export proposal"}</button><p className="muted" style={{fontSize:13}}>Credit is decremented when a real proposal is generated/exported.</p></div><article className="card" style={{background:"#fff",minHeight:720}}><div className="mono">{brand}</div><h1 style={{fontFamily:"EB Garamond",fontSize:44}}>{client}</h1><h2>{rfp}</h2><hr/><h3>Executive Summary</h3><p style={{lineHeight:1.7}}>{section}</p><h3>Pricing Form</h3><table className="table"><tbody><tr><td>Professional services</td><td>$25,000.00</td></tr><tr><td>Managed services</td><td>$4,500.00 / month</td></tr></tbody></table><h3>Checklist</h3><p>References, project plan, pricing, and acceptance forms are included.</p></article></div>;
}
