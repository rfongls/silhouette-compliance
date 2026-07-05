"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Pre-login landing sections: full-page slide pager.
// Wheel / ArrowUp / ArrowDown = vertical slide; ArrowLeft / ArrowRight / horizontal swipe = horizontal slide.
// Ported 1:1 from the approved prototype (Landing Page.dc.html).

const serif = "'EB Garamond', Georgia, serif";
const mono = "'DM Mono', monospace";
const N = 6;
const accent = "var(--accent)";
const accentDark = "var(--accent-dark)";
const accentLight = "var(--accent-light)";
const accentSoft = "var(--accent-soft)";
const accentWash = "var(--accent-wash)";
const accentBorder = "var(--accent-border)";
const accentShadow = "var(--accent-shadow)";
const accentHero = "var(--accent-hero)";
const accentPanel = "var(--accent-panel)";
const accentFooter = "var(--accent-footer)";

const modules = [
  {
    icon: ["M12 3l7 2.6v5.1c0 4.4-2.9 7.4-7 9.3-4.1-1.9-7-4.9-7-9.3V5.6L12 3z", "M9 11.5l2 2 4-4.5"],
    name: "Incident Response Plan",
    price: "$250",
    priceNote: "per organization assessed",
    desc: "IRP gap analysis: score incident-response plans against industry control sets. Get a gap report, deck, and remediation roadmap.",
    demoHref: "/app?demo=1",
  },
  {
    icon: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M15.9 15.9L20.5 20.5", "M11 8v3l2 2"],
    name: "Security Risk Assessment / Pen Test",
    price: "$1,500",
    priceNote: "per engagement",
    desc: "Guided scope, inventory, evidence import, AI-drafted findings with risk ratings, and a 30/60/90 remediation roadmap.",
    demoHref: "/app?demo=1",
  },
  {
    icon: ["M7 3h7l4 4v14H7V3z", "M14 3v4h4", "M10 12h5M10 15.5h5"],
    name: "Proposals",
    price: "$99",
    priceNote: "per proposal",
    desc: "Generate or reformat RFP proposals into your branded template with pricing, project plans, and AI synthesis.",
    demoHref: "/app?demo=1",
  },
];

const neverStored = [
  { title: "Your source documents", body: "Held in memory for one run, then discarded. Never written to disk." },
  { title: "Patient & client records", body: "Never collected. Assessments read policies and configurations, not records." },
  { title: "Your data for AI training", body: "Analysis runs on a zero-retention tier. Prompts and outputs are not kept." },
];

const weKeep = [
  { title: "Your account", body: "SSO identity and role, so your access and history follow you." },
  { title: "Entitlements & billing ledger", body: "What you purchased and what each run cost - your audit trail." },
  { title: "The results you generate", body: "Assessment scores, findings, and exports stay available to you." },
];

const steps = [
  { n: "1", title: "Sign in", body: "Sign in with your Google, Microsoft, or GitHub account." },
  { n: "2", title: "Pick a module", body: "Demo free, or activate to run on your own documents." },
  { n: "3", title: "Upload & run", body: "Import policies and tool output; the engine drafts findings." },
  { n: "4", title: "Export", body: "Download the report, deck, and remediation roadmap." },
];

function Icon({ paths }: { paths: string[] }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={accentDark} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => (<path key={i} d={d} />))}
    </svg>
  );
}

const slideBase: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "auto",
  transition: "transform .65s cubic-bezier(.65,0,.35,1)",
  display: "flex",
};

export function LandingSections() {
  const [cur, setCur] = useState(0);
  const [axis, setAxis] = useState<"x" | "y">("y");
  const lockUntil = useRef(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const curRef = useRef(0);
  curRef.current = cur;
  const axisRef = useRef(axis);

  const go = (dir: number, ax: "x" | "y") => {
    const now = Date.now();
    if (now < lockUntil.current) return;
    const next = Math.max(0, Math.min(N - 1, curRef.current + dir));
    if (next === curRef.current) return;
    lockUntil.current = now + 720;
    setAxis(ax);
    setCur(next);
  };

  const innerScrollHandles = (delta: number) => {
    const el = document.querySelector<HTMLElement>(`[data-slide="${curRef.current}"]`);
    if (!el || el.scrollHeight <= el.clientHeight + 4) return false;
    const atTop = el.scrollTop <= 2;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    return (delta > 0 && !atBottom) || (delta < 0 && !atTop);
  };

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (innerScrollHandles(e.deltaY)) return;
      e.preventDefault();
      if (Math.abs(e.deltaY) < 12) return;
      go(e.deltaY > 0 ? 1 : -1, "y");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); go(1, "y"); }
      else if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); go(-1, "y"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1, "x"); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1, "x"); }
    };
    const onTouchStart = (e: TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touch.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y;
      touch.current = null;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1, "x");
      } else if (Math.abs(dy) > 50) {
        if (innerScrollHandles(-dy)) return;
        go(dy < 0 ? 1 : -1, "y");
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const tf = (i: number): string => {
    if (i === cur) return "translate(0,0)";
    const off = i < cur ? "-102%" : "102%";
    return axis === "x" ? `translateX(${off})` : `translateY(${off})`;
  };

  const check = (label: string) => (
    <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
      <span style={{ color: accentLight, fontSize: 15 }}>✓</span>{label}
    </div>
  );

  const sectionEyebrow = (text: string, color = accent) => (
    <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color, marginBottom: 12 }}>{text}</div>
  );

  return (
    <div style={{ position: "fixed", top: 68, left: 0, right: 0, bottom: 0, overflow: "hidden", background: "#fff" }}>
      <style>{`
        html,body{overflow:hidden;height:100%;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}
        .fu{animation:fadeUp .6s ease both;}
        @media(max-width:820px){
          .stack-m{grid-template-columns:1fr !important;}
          .sec-grid>div:first-child{border-right:none !important;border-bottom:1px solid rgba(255,255,255,.14) !important;}
          .hero-h1{font-size:38px !important;}
        }
      `}</style>

      {/* SLIDE 0 - HERO */}
      <div data-slide="0" style={{ ...slideBase, transform: tf(0), background: accentHero }}>
        <div style={{ maxWidth: 1080, margin: "auto", padding: "60px 28px", textAlign: "center" }}>
          <h1 className="fu hero-h1" style={{ fontFamily: serif, fontSize: 60, fontWeight: 600, lineHeight: 1.06, color: "#fff", maxWidth: 840, margin: "0 auto 22px", letterSpacing: "-.01em" }}>
            Stateless by Design
          </h1>
          <p className="fu" style={{ fontSize: 17.5, lineHeight: 1.65, color: "#eadff0", maxWidth: 620, margin: "0 auto 34px" }}>
            AI-assisted compliance, risk, and proposal tools that turn your security documentation into audit-ready assessments without storing your private data.
          </p>
          <div className="fu" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/app?demo=1" style={{ fontSize: 15, color: accentDark, fontWeight: 700, padding: "14px 30px", background: "#fff", borderRadius: 10, whiteSpace: "nowrap" }}>View Demo</Link>
          </div>
          <div className="fu" style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap", marginTop: 36, fontSize: 12.5, color: accentLight }}>
            {["We store nothing", "No PHI / client data collected", "Google, Microsoft & GitHub SSO"].map(check)}
          </div>
        </div>
      </div>

      {/* SLIDE 1 - MODULES / DEMO */}
      <div data-slide="1" style={{ ...slideBase, transform: tf(1), background: "#fff" }}>
        <div style={{ maxWidth: 1080, margin: "auto", padding: "60px 28px", width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <h2 style={{ fontFamily: serif, fontSize: 36, fontWeight: 600, color: "#111", margin: 0 }}>Try Our Demo!</h2>
            <p style={{ fontSize: 14.5, color: "#665b6b", marginTop: 10 }}>Every module includes a demo. Click below to demo.</p>
          </div>
          <div className="stack-m" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
            {modules.map((m) => (
              <Link key={m.name} href={m.demoHref} style={{ background: "#fff", border: "1px solid #e4dce9", borderRadius: 16, padding: 26, display: "flex", flexDirection: "column", cursor: "pointer", transition: "border-color .18s, box-shadow .18s, transform .18s", color: "inherit" }}
                onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = accent; el.style.boxShadow = `0 10px 28px ${accentShadow}`; el.style.transform = "translateY(-3px)"; }}
                onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = "#e4dce9"; el.style.boxShadow = "none"; el.style.transform = "none"; }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: accentWash, border: `1px solid ${accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  <Icon paths={m.icon} />
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#111", marginBottom: 7 }}>{m.name}</div>
                <div style={{ fontSize: 13.5, color: "#665b6b", lineHeight: 1.6, flex: 1 }}>{m.desc}</div>
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #f0e9f4" }}>
                  <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, color: accentDark }}>{m.price}</div>
                  <div style={{ fontSize: 11.5, color: "#999", marginTop: 2 }}>{m.priceNote}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* SLIDE 2 - SECURITY */}
      <div data-slide="2" style={{ ...slideBase, transform: tf(2), background: accentPanel }}>
        <div style={{ maxWidth: 1080, margin: "auto", padding: "44px 28px", color: "#f3ecf6", width: "100%" }}>
          <div style={{ textAlign: "center", maxWidth: 680, margin: "0 auto 40px" }}>
            {sectionEyebrow("Stateless by design", accentLight)}
            <h2 style={{ fontFamily: serif, fontSize: 38, fontWeight: 600, lineHeight: 1.12, margin: "0 0 16px", color: "#fff" }}>Your documents are never stored</h2>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: accentLight, margin: 0 }}>Your policies and evidence are held in memory for a single analysis, then discarded. Here is exactly where the line sits:</p>
          </div>
          <div className="stack-m sec-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", maxWidth: 880, margin: "0 auto", border: "1px solid rgba(255,255,255,.14)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "28px 30px", borderRight: "1px solid rgba(255,255,255,.14)" }}>
              <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "#d9a3a3", marginBottom: 18 }}>Never stored</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {neverStored.map((t) => (
                  <div key={t.title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ color: "#d9a3a3", fontSize: 14, marginTop: 1 }}>✕</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{t.title}</div>
                      <div style={{ fontSize: 12.5, color: accentLight, lineHeight: 1.55, marginTop: 2 }}>{t.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: "28px 30px", background: "rgba(217,195,229,.08)" }}>
              <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: accentLight, marginBottom: 18 }}>What we keep</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {weKeep.map((t) => (
                  <div key={t.title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ color: accentLight, fontSize: 14, marginTop: 1 }}>✓</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{t.title}</div>
                      <div style={{ fontSize: 12.5, color: accentLight, lineHeight: 1.55, marginTop: 2 }}>{t.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SLIDE 3 - HOW IT WORKS */}
      <div data-slide="3" style={{ ...slideBase, transform: tf(3), background: "#fff" }}>
        <div style={{ maxWidth: 1080, margin: "auto", padding: "60px 28px", width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            {sectionEyebrow("How it works")}
            <h2 style={{ fontFamily: serif, fontSize: 36, fontWeight: 600, color: "#111", margin: 0 }}>From documents to roadmap</h2>
          </div>
          <div className="stack-m" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
            {steps.map((st) => (
              <div key={st.n} style={{ textAlign: "center", padding: "0 8px" }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: serif, fontSize: 18, fontWeight: 600, margin: "0 auto 14px" }}>{st.n}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 5 }}>{st.title}</div>
                <div style={{ fontSize: 12.5, color: "#665b6b", lineHeight: 1.55 }}>{st.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SLIDE 4 - PRICING */}
      <div data-slide="4" style={{ ...slideBase, transform: tf(4), background: accentSoft }}>
        <div style={{ maxWidth: 1080, margin: "auto", padding: "60px 28px", width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            {sectionEyebrow("Pricing")}
            <h2 style={{ fontFamily: serif, fontSize: 36, fontWeight: 600, color: "#111", margin: 0 }}>Pay for what you use</h2>
            <p style={{ fontSize: 15, color: "#665b6b", marginTop: 10, maxWidth: 540, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
              Demo every module free with sample data. Activate a module to run it on your own documents.
            </p>
          </div>
          <div className="stack-m" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
            {modules.map((m) => (
              <div key={m.name} style={{ background: "#fff", border: "1px solid #e4dce9", borderRadius: 16, padding: 28, textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 12 }}>{m.name}</div>
                <div style={{ fontFamily: serif, fontSize: 34, fontWeight: 600, color: accentDark }}>{m.price}</div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 4, marginBottom: 20 }}>{m.priceNote}</div>
                <Link href="/signin" style={{ display: "block", fontSize: 13.5, color: "#fff", fontWeight: 600, padding: 11, background: accent, borderRadius: 9 }}>Get started</Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SLIDE 5 - CTA + FOOTER */}
      <div data-slide="5" style={{ ...slideBase, transform: tf(5), flexDirection: "column", background: "#fff" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "80px 28px", textAlign: "center", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h2 style={{ fontFamily: serif, fontSize: 40, fontWeight: 600, color: "#111", lineHeight: 1.15, maxWidth: 680, margin: "0 auto 18px" }}>Run your first assessment today</h2>
          <p style={{ fontSize: 16, color: "#665b6b", maxWidth: 540, margin: "0 auto 30px", lineHeight: 1.6 }}>
            Sign in with your Google, Microsoft, or GitHub account. Try any module in demo mode before you pay.
          </p>
          <div>
            <Link href="/signin" style={{ display: "inline-block", fontSize: 16, color: "#fff", fontWeight: 600, padding: "15px 30px", background: accent, borderRadius: 11 }}>Sign in to get started</Link>
          </div>
        </div>
        <footer style={{ background: accentFooter, color: accentLight }}>
          <div style={{ padding: "16px 22px", textAlign: "right" }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: accentLight }}>© 2026 Silhouette LLC. All rights reserved.</div>
          </div>
        </footer>
      </div>
    </div>
  );
}
