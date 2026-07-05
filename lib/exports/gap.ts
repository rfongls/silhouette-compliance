import { noEmDash, sanitizeForExport } from "@/lib/sanitize";

function esc(v: unknown) {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

function scoreColor(score: number) {
  if (score >= 85) return "#166534";
  if (score >= 50) return "#92400e";
  return "#b91c1c";
}

export function buildGapJson(result: unknown) {
  return JSON.stringify(sanitizeForExport(result), null, 2);
}

export function buildGapReport(result: any, opts?: { auditor?: string; title?: string }) {
  const r = sanitizeForExport(result) as any;
  const auditor = opts?.auditor || "Silhouette LLC";
  const title = opts?.title || `${r.organization_name || "Organization"} - Incident Response Plan Gap Analysis`;
  const score = Number(r.compliance_score || 0);
  const color = scoreColor(score);
  const findings = Array.isArray(r.findings) ? r.findings : [];
  const phases = r.remediation_roadmap?.phases || [];
  const rows = findings.map((f: any) => `<tr><td>${esc(f.control_id)}</td><td>${esc((f.standards || []).join(", "))}</td><td>${esc(f.status)}</td><td><strong style="color:${scoreColor(f.risk_level === "Critical" ? 0 : f.risk_level === "High" ? 40 : f.risk_level === "Medium" ? 65 : 90)}">${esc(f.risk_level)}</strong></td><td>${esc(f.finding)}</td></tr>`).join("");
  const road = phases.map((p: any) => `<section class="phase"><h3>${esc(p.name)} <span>${esc(p.timeframe)}</span></h3>${(p.items || []).map((i: any) => `<p><b>${esc(i.title)}</b><br/>${esc(i.description)}<br/><small>${esc((i.references || []).join(", "))}</small></p>`).join("")}</section>`).join("");
  return noEmDash(`<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title><style>
  @page{size:letter;margin:.55in}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;background:#fff}.page{min-height:10in;page-break-after:always;padding:.45in}.cover{background:#241829;color:#fff;display:flex;flex-direction:column;justify-content:center}.brand{font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#d9c3e5}.h1{font-family:Georgia,serif;font-size:42px;line-height:1.08;margin:18px 0}.rule{height:3px;width:4.5in;background:#6b2d7c;margin:18px 0}.muted{color:#6b7280}.cover .muted{color:#d9c3e5}.score{width:104px;height:104px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:10px solid ${color};font-size:34px;font-weight:700;color:${color};margin-right:24px}h2{font-family:Georgia,serif;font-size:24px;margin:0 0 16px;color:#4c1d5f}table{width:100%;border-collapse:collapse;font-size:11px}th{text-align:left;color:#666;text-transform:uppercase;letter-spacing:.08em;border-bottom:2px solid #111;padding:7px}td{border-bottom:1px solid #e5e7eb;padding:8px;vertical-align:top}.phase{border-top:4px solid #6b2d7c;padding:14px;border:1px solid #e5e7eb;margin-bottom:10px}.phase h3{font-family:Georgia,serif;margin:0 0 8px}.phase span{font:12px Arial;color:#777}.footer{position:fixed;bottom:.25in;left:.55in;right:.55in;border-top:1px solid #ddd;padding-top:6px;font-size:9px;color:#888;display:flex;justify-content:space-between}@media print{button{display:none}}
  </style></head><body><div class="footer"><span>${esc(auditor)} | Compliance Gap Analysis</span><span>www.silhouettellc.com</span></div><section class="page cover"><div class="brand">${esc(auditor)}</div><div class="h1">${esc(title)}</div><div class="rule"></div><div class="muted">Confidential report | ${new Date().toLocaleDateString("en-US")}</div></section><section class="page"><h2>Executive Summary</h2><div style="display:flex;align-items:center;margin-bottom:22px"><div class="score">${score}</div><div><div class="brand" style="color:#888">Overall Compliance Score</div><h2 style="color:${color};margin-top:8px">${esc(r.overall_posture)}</h2><p class="muted">${esc(r.posture_summary)}</p></div></div><h2>Gap Findings</h2><table><thead><tr><th>Control</th><th>Standard</th><th>Status</th><th>Risk</th><th>Finding</th></tr></thead><tbody>${rows}</tbody></table></section><section class="page"><h2>Priority Remediation Roadmap</h2>${road}<h2>Conclusion & Limitations</h2><p>This assessment covers submitted documentation only. Operational controls and configurations not captured in reviewed artifacts are outside scope. Findings should be reviewed with compliance counsel before regulatory submission.</p></section></body></html>`);
}

export function buildGapDeck(result: any) {
  const r = sanitizeForExport(result) as any;
  const findings = Array.isArray(r.findings) ? r.findings.slice(0, 8) : [];
  return noEmDash(`<!doctype html><html><head><meta charset="utf-8"/><title>${esc(r.organization_name)} Deck</title><style>body{margin:0;font-family:Arial,sans-serif}.slide{min-height:100vh;page-break-after:always;padding:8vh 9vw;display:flex;flex-direction:column;justify-content:center}.dark{background:#241829;color:#fff}.k{letter-spacing:.24em;text-transform:uppercase;color:#6b2d7c;font-size:12px}.dark .k{color:#d9c3e5}.title{font-family:Georgia,serif;font-size:54px;line-height:1.05}.score{font-size:110px;font-weight:700;color:${scoreColor(Number(r.compliance_score || 0))}}li{font-size:22px;margin:14px 0;color:#333}.dark li{color:#d9c3e5}</style></head><body><section class="slide dark"><div class="k">Silhouette LLC</div><div class="title">${esc(r.organization_name)}</div><p>Incident Response Plan Gap Analysis</p></section><section class="slide"><div class="k">Executive Summary</div><div class="score">${esc(r.compliance_score)}</div><h1>${esc(r.overall_posture)}</h1><p>${esc(r.posture_summary)}</p></section><section class="slide"><div class="k">Key Findings</div><ul>${findings.map((f: any) => `<li><b>${esc(f.risk_level)}</b> - ${esc(f.finding)}</li>`).join("")}</ul></section><section class="slide dark"><div class="k">Next Steps</div><div class="title">Remediate, test, reassess.</div></section></body></html>`);
}
