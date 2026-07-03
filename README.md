# Silhouette

**Repo: `silhouette-compliance`** — the Silhouette compliance suite. AI-assisted compliance, risk, and proposal tooling. **Stateless by design** — the service never
persists uploaded source documents or patient/client data.

**Start here: [`AGENTS.md`](AGENTS.md)** — the complete build specification for turning these
prototypes into a hosted SaaS (Next.js + Prisma + PostgreSQL + Stripe + Anthropic). It defines the
data model, API routes, billing/entitlement gates, security rules, build order, acceptance checks,
and the Hostinger deployment target.

## Repo map — what each file is

### Specifications (read, follow)
| File | Role |
|---|---|
| `AGENTS.md` | **Primary handoff spec.** Build from this. |
| `Compliance Hosting Brief.dc.html` | Architecture rationale / requirements brief (context for AGENTS.md). |
| `.env.example` | Environment variable template for local dev and production. |

### Prototypes (port these — do NOT "fix" or run them as production code)
These are high-fidelity, clickable prototypes with **simulated** data, auth, and payments. They are
the visual and behavioral source of truth. Port their screens, flows, copy, and styling into the
production Next.js app; do not treat their inline JS as production logic.

| File | Module |
|---|---|
| `Landing Page.dc.html` | Public marketing page (`/`). |
| `Compliance Suite.dc.html` | Post-login launcher: module cards, purchase/entitlement gates, sign-in. |
| `Compliance Portal.dc.html` | **Incident Response Plan** module (IRP gap analysis): dashboard, queue → pay → generate flow, report detail, exports (report/deck/JSON), admin control boards, theme picker. |
| `SRA Module.dc.html` | **Security Risk Assessment / Pen Test** module: scope → inventory → evidence → findings → roadmap workflow. |
| `uploads/silhouette-proposal-template.html` | **Proposals** module (working tool, largely production-usable client-side). |
| `support.js` | Prototype runtime for the `.dc.html` files. **Prototype-only** — not part of the production build. |

### Working engine (reuse directly)
| File | Role |
|---|---|
| `uploads/compliance-gap-analyzer-claude.html` | The real, working analyzer: LLM prompts, JSON schemas, control-board batches per industry/standard, scoring math, refine flow, export builders. **Extract prompts/schemas/logic from here verbatim** (see AGENTS.md §2). |

### Report-format reference (the exports must match these)
| File | Role |
|---|---|
| `uploads/Kalihi_Palama_Health_Center-gap-analysis*.html` | A REAL production report. Exported reports must mirror this structure, pagination, and print behavior. |
| `uploads/_rpt_engine.js` | Decoded auto-reflow paginator used by the report export (measure + split pages, renumber). Embed in report exports. |
| `uploads/_rpt_controller.js` | Present/Document mode, page nav, Save-PDF, logo upload controller. Embed alongside the engine. |
| `uploads/_rpt_styles.html`, `uploads/_rpt_toolbar.html` | Extracted CSS + toolbar/PDF-dialog markup for the report shell. |

### Everything else (ignore)
`screenshots/`, `uploads/_sra_extracted.txt`, and other `uploads/*` documents are working artifacts
and sample inputs. Reference only.

## The three modules (one billing pattern)

| Module | Unit | Price (prototype) |
|---|---|---|
| Incident Response Plan | per organization assessed | $250 / org |
| Security Risk Assessment / Pen Test | per engagement | $1,500 / engagement |
| Proposals | per proposal generated | $99 / proposal |

All three bill identically: consumable credits via one Stripe checkout flow, granted only by the
Stripe webhook, decremented server-side at the point of use. Payment always precedes any LLM spend.

## Non-negotiables (from AGENTS.md)

1. The Anthropic key lives server-side only; every model call goes through the metering proxy.
2. No run without confirmed funds (webhook-verified); auto-refund on failed runs.
3. Never persist uploaded documents. Exception: SRA evidence (infrastructure data, never patient
   records) — encrypted at rest, account-scoped, purgeable.
4. Exports strip em dashes (replace with `-`) in all report/deck/JSON output.
5. Demo mode is free, static, and never calls the model.
