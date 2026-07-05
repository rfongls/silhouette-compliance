import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { sanitizeForExport } from "@/lib/sanitize";

function esc(v: unknown) { return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c)); }

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const e = await prisma.sraEngagement.findFirst({ where: { id: params.id, accountId: guard.session.user.accountId }, include: { evidence: true } });
  if (!e) return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  const format = new URL(req.url).searchParams.get("format") || "report";
  const clean = sanitizeForExport(e);
  if (format === "json") return NextResponse.json(clean);
  const findings = Array.isArray(e.findings) ? e.findings as any[] : [];
  const roadmap = Array.isArray(e.roadmap) ? e.roadmap as any[] : [];
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(e.orgName)} SRA</title><style>@page{margin:.7in}body{font-family:Georgia,serif;line-height:1.5;color:#111}h1,h2{color:#4c1d5f}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left;font-family:Arial,sans-serif;font-size:12px}.risk{font-weight:700;color:#b91c1c}</style></head><body><h1>Security Risk Assessment</h1><p><b>${esc(e.orgName)}</b> | ${esc(e.industry)} | Confidential</p><h2>Executive Summary</h2><p>This assessment stores infrastructure evidence for the engagement. It never stores patient data. Findings are human-approved before final delivery.</p><h2>Findings</h2><table><thead><tr><th>ID</th><th>Risk</th><th>Finding</th><th>Recommendation</th></tr></thead><tbody>${findings.map((f) => `<tr><td>${esc(f.id)}</td><td class="risk">${esc(f.rating)}</td><td>${esc(f.title)}<br/><small>${esc(f.desc)}</small></td><td>${esc(f.rec)}</td></tr>`).join("")}</tbody></table><h2>30/60/90 Roadmap</h2>${roadmap.map((r) => `<h3>${esc(r.window)}</h3><ul>${(r.items || []).map((i: string) => `<li>${esc(i)}</li>`).join("")}</ul>`).join("")}</body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
