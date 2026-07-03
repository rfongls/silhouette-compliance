# AGENTS.md — Silhouette

Build instructions for an AI coding agent. This builds **Silhouette** (repo: `silhouette-compliance`) — a
multi-module compliance SaaS offering integrated into an existing Next.js + Prisma + PostgreSQL application.
Users land on a marketing page, sign in (Google/Microsoft), and access modules they have purchased.

**Modules:**
1. **Incident Response Plan (IRP) Gap Analysis** (§2–§10) — per-organization IRP gap analysis on uploaded policy docs. **Stateless.**
2. **Security Risk Assessment / Pen Test (SRA)** (§11) — a guided multi-step risk-assessment engagement. **Stores evidence** (deliberate departure — see §11).
3. **Proposals** (§12) — RFP/proposal generation, billed per proposal. Mostly client-side; light backend.

A **Suite shell** (§13) fronts all three: landing page, auth, module launcher, and per-module
purchase/entitlement gates.

> **Prime directive — data minimization:** the Gap Analysis module never persists uploaded source
> documents or any patient/client data (document in memory for one request only). You DO persist
> generated *results*, accounts, billing, control boards, and entitlements. The SRA module is the one
> exception: it stores **evidence artifacts** (infrastructure/config data — never patient records) for
> a multi-week engagement; see §11 for its stricter handling rules.

---

## 0. Context & existing assets

There are two working browser prototypes to port (provided alongside this file):

- **`compliance-gap-analyzer-claude.html`** — the analysis engine. Today it calls the Anthropic API
  **directly from the browser**. You will move that call server-side. Read it to extract: the system
  prompt builder, the per-industry standard sets, the control-board batch prompts
  (`EXTRA_CB_BATCHES`), the result JSON schema, and the report/deck/JSON export generators.
- **`Compliance Portal.dc.html`** — the customer + admin UI (dashboard, queue, pay gate, report
  detail, admin control-board versioning). It uses simulated data. Reuse its layout/brand; replace
  simulated data with real API calls. (It is authored as a "Design Component"; you are re-implementing
  its screens as normal Next.js/React pages — match the visual design, not the file format.)

**Brand:** fonts DM Sans / EB Garamond / DM Mono; primary green `#2d6a4f`, dark green `#1f4e3b`,
paper `#eef1ef`. Accent must remain themeable.

---

## 1. Tech stack (do not substitute without asking)

- Next.js (App Router) + React, TypeScript
- Prisma ORM → PostgreSQL
- Auth.js (NextAuth) with Prisma adapter — Google + Microsoft Entra ID (OIDC)
- Stripe (Checkout + webhooks) in test mode for local dev
- Anthropic API (server-side only), zero-data-retention tier in production

---

## 2. Data model

Add these Prisma models to the existing schema. If a `User` model already exists in the primary app,
**extend it** (add `role`, `accountId`) rather than creating a second one. Run as ONE additive migration.

```prisma
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum BoardStatus  { DRAFT PUBLISHED ARCHIVED }
enum AssessStatus { PENDING RUNNING DELIVERED FAILED REFUNDED }

model ControlBoard {
  id           String      @id @default(cuid())
  industry     String      // "health-center" | "financial" | "education" | "public-sector" | "manufacturing" | "retail"
  standardKey  String      // "NIST" | "PCIDSS" | ...
  version      Int
  status       BoardStatus
  controls     Json        // enumerated control set
  controlCount Int
  publishedAt  DateTime?
  createdAt    DateTime    @default(now())
  @@index([industry, standardKey, status])
}

model Assessment {
  id         String       @id @default(cuid())
  orgId      String       // the assessed organization (the customer's client)
  accountId  String       // billing account / team
  industry   String
  status     AssessStatus
  score      Int?
  posture    String?
  result     Json?        // findings, breakdown, roadmap — NOT the source document
  boardCite  String?      // "PCI DSS 4.0.1 · rev 2026-05"
  refineUsed Boolean      @default(false)
  ledgerId   String?      // hard link to the charge
  createdAt  DateTime     @default(now())
}

model UsageLedger {
  id           String   @id @default(cuid())
  accountId    String
  kind         String   // "assessment" | "refine" | "purchase" | "refund"
  status       String   // "succeeded" | "failed" | "refunded"
  assessmentId String?  // hard link to the delivered result
  orgsBilled   Int?
  amountCents  Int?
  inputTokens  Int?
  outputTokens Int?
  stripeRef    String?
  createdAt    DateTime @default(now())
}

// Auth.js models — add User.role + User.accountId; Account/Session per the Prisma adapter.
```

Also add Auth.js's standard `User` / `Account` / `Session` models (Prisma adapter shape). `User.role`
is `"customer"` (default) or `"admin"`.

---

## 3. API routes (Next.js route handlers)

| Route | Method | Role | Behavior |
|---|---|---|---|
| `/api/assess` | POST | customer | **Gate first.** Verify session+role → verify funded/paid (Prisma tx) → load PUBLISHED control board for industry+standards → call Anthropic with server key → persist `Assessment.result` (status DELIVERED) → return result. On model/parse failure: status FAILED + auto-refund (see §5). **Never persist the uploaded file.** |
| `/api/assess/refine` | POST | customer | One refinement per assessment. Reject if `refineUsed`. Reuses the cached *result* + a user note; one LLM call; updates result, sets `refineUsed=true`. |
| `/api/assessments` | GET | customer | Account's history (for dashboard) — id, org, date, score, posture, status, boardCite. |
| `/api/assessments/[id]/export` | GET | customer | Re-generate report/deck/json from stored `result` (ports the prototype's generators). |
| `/api/checkout` | POST | customer | Create Stripe Checkout session for `rate × orgCount` (or a prepaid pack). |
| `/api/webhooks/stripe` | POST | Stripe | **Source of truth for payment.** On `checkout.session.completed` / `payment_intent.succeeded`: write `UsageLedger` (succeeded) and unlock the run / credit balance. Verify signature. |
| `/api/admin/boards` | GET | admin | List boards grouped by industry with status/version. |
| `/api/admin/boards/fetch` | POST | admin | Fetch latest controls for a standard via Anthropic (use `EXTRA_CB_BATCHES` prompts from the analyzer) → write a DRAFT version. |
| `/api/admin/boards/publish` | POST | admin | Promote a DRAFT to PUBLISHED (increment version, set publishedAt, archive prior). |
| `/api/admin/boards/export` | GET | admin | Snapshot export of all PUBLISHED boards (the weekly/monthly archive). |

Every `admin/*` route must re-check `session.user.role === "admin"` server-side.

---

## 4. The proxy (core security rule)

- Anthropic API key lives ONLY in server env (`ANTHROPIC_API_KEY`). Never in client bundle.
- `/api/assess` is the only path to the model for customers. It enforces payment BEFORE calling the
  LLM — if not funded, return `402` and spend nothing.
- Port the analyzer's `buildSystemPrompt`, industry/standard config, and result schema verbatim into
  a server module (`lib/analysis/`). Keep the health-center path byte-identical to the prototype.

---

## 5. Payment gating & dispute protection

- **Unit = one organization assessed** (any number of its docs), one report, all exports, one refine.
- Charge is captured via Stripe; the run unlocks on the **webhook**, never on a client claim.
- **Status lifecycle:** `PENDING → RUNNING → DELIVERED`, or `FAILED → REFUNDED`. A failed run
  auto-refunds (Stripe refund + `UsageLedger` kind="refund") so a charge never sits next to a missing
  report.
- Each `UsageLedger` charge and its `Assessment` reference each other (hard link).
- **Persist results** so they are always re-downloadable from History; also auto-trigger download on
  completion as convenience. Document is still never stored.
- **Cost guard:** cap document size and standard count per run so worst-case token spend is bounded.

---

## 6. Auth (Google + Microsoft, OIDC)

- Auth.js with `GoogleProvider` and `MicrosoftEntraIDProvider`, Prisma adapter.
- Localhost redirect URIs are allowed by both — full sign-in testable locally.
- Map first-time sign-in → create `User` (role `customer`) and attach to an account/team (JIT).
- SAML/SCIM are explicitly OUT of scope for now (Phase 4, demand-triggered).

---

## 7. Local testing (target environment — no hosting)

1. `docker run -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16` (or Postgres.app).
2. `npx prisma migrate dev` → tables; `npx prisma studio` to watch rows.
3. `npm run dev` → app on `http://localhost:3000`.
4. Register OAuth apps (Google Cloud Console + Azure/Entra), redirect `http://localhost:3000/api/auth/callback/...`.
5. Stripe test mode + `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
6. Real `ANTHROPIC_API_KEY`; use a low-cost model while testing.

### `.env.local` keys
```
DATABASE_URL=postgresql://postgres:dev@localhost:5432/compliance
NEXTAUTH_SECRET=...           NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...          GOOGLE_CLIENT_SECRET=...
MICROSOFT_ENTRA_ID_CLIENT_ID=...  MICROSOFT_ENTRA_ID_CLIENT_SECRET=...  MICROSOFT_ENTRA_ID_ISSUER=...
STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_...
ANTHROPIC_API_KEY=...
ASSESSMENT_RATE_CENTS=25000   # $250/org default; admin-configurable
```

---

## 8. Build order (do in this sequence; verify each before moving on)

1. **Schema + migration** — add models/enums; one additive migration against the primary DB.
2. **Auth** — Auth.js Google+Microsoft; protected layout; role on session.
3. **Proxy + assess** — `/api/assess` with server-side Anthropic call + result persistence (skip
   payment gate first, behind an admin/dev flag, to validate analysis).
4. **Stripe** — checkout + webhook; wire the gate into `/api/assess`; status lifecycle + auto-refund.
5. **Control boards** — model + admin fetch/publish/version + snapshot export; assess loads PUBLISHED.
6. **Portal pages** — port the prototype screens to real data: dashboard/history, queue, pay,
   report detail (with the one refine), admin boards + accounts/usage.
7. **Exports** — port report/deck/json generators to `/api/assessments/[id]/export`.

## 9. Acceptance checks

- Cannot reach the model without a confirmed payment (returns 402).
- No code path writes the uploaded document to disk or DB.
- A failed run leaves status FAILED→REFUNDED with a matching ledger entry; no orphan charge.
- Every charge in `UsageLedger` links to an `Assessment` and vice versa.
- Results are re-downloadable from History after closing/reopening the session.
- Health-center analysis output matches the prototype (regression guard); other industries score
  against their own PUBLISHED boards.
- All `admin/*` routes reject non-admin sessions.

## 10. Out of scope (do not build yet)

SAML/SCIM, team-member invitations, sales/invoicing, multi-region, mobile apps. Keep the operator-run
manual workflow usable in parallel — this module is an additional self-serve channel, not a replacement.

---

## 11. Security Risk Assessment (SRA) module

A guided, multi-step risk-assessment engagement (not a single one-shot run like Gap Analysis). Port
the prototype **`SRA Module.dc.html`** for screens and flow. It is industry-adaptable (same six
industries as Gap Analysis) with an industry-specific safeguard/control profile.

**Workflow (each step is a saved stage, resumable over weeks):** Scope & Methodology → Asset &
Sensitive-Data Inventory → Evidence collection/import → AI-drafted Findings (human-approved) →
Risk ratings → 30/60/90 Remediation Roadmap → Report.

> **Departure from statelessness:** an SRA accumulates evidence (asset inventories, scanner exports,
> AD/identity exports, walkthrough notes) across an engagement, so it **must store evidence**. This is
> infrastructure/configuration data, **never patient/client records**. Store it with: encryption at
> rest, per-account (team) RBAC scoping, a retention policy with explicit deletion, and an export +
> purge action at engagement close. Make the distinction explicit in the UI ("we store assessment
> evidence; we never store patient data").

**AI roles (draft, human approves — never auto-final):** draft findings from imported scanner/evidence
output; suggest risk ratings (likelihood × impact); generate the 30/60/90 roadmap. The executive
summary/methodology is **static** boilerplate (purpose/approach are constant). Policy→safeguard
crosswalk only applies when the engagement is healthcare (HIPAA).

**External tools = import, not integration.** The app is the system of record and orchestrator; it
ingests scanner/AD/phishing exports (CSV/XML/JSON) and normalizes them into findings. Do **not** build
or run scanners. v1 = file-import parsers; live API connectors are later.

### SRA data model (add to schema)

```prisma
enum SraStage  { SCOPE INVENTORY EVIDENCE FINDINGS ROADMAP REPORT }
enum SraStatus { ACTIVE DELIVERED ARCHIVED }

model SraEngagement {
  id         String     @id @default(cuid())
  accountId  String     // billing/team scope
  orgName    String     // assessed organization
  industry   String
  stage      SraStage   @default(SCOPE)
  status     SraStatus  @default(ACTIVE)
  scope      Json?      // scope, methodology selections
  inventory  Json?      // assets + sensitive-data inventory
  findings   Json?      // approved findings (draft+approved flags)
  roadmap    Json?      // 30/60/90 plan
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
}

model SraEvidence {
  id           String   @id @default(cuid())
  engagementId String
  kind         String   // "scan" | "ad-export" | "phishing" | "note" | "file"
  filename     String?
  parsed       Json?    // normalized rows the finding engine reads
  storageKey   String?  // encrypted blob ref (S3/compatible); NOT in Postgres
  createdAt    DateTime @default(now())
  @@index([engagementId])
}
```

### SRA routes

| Route | Method | Role | Behavior |
|---|---|---|---|
| `/api/sra` | POST/GET | customer | Create / list engagements for the account. |
| `/api/sra/[id]` | GET/PATCH | customer | Load / save a stage (scope, inventory, findings, roadmap). |
| `/api/sra/[id]/evidence` | POST | customer | Upload + parse an evidence file → `SraEvidence.parsed`. Encrypt blob at rest. |
| `/api/sra/[id]/draft-findings` | POST | customer | LLM drafts findings from parsed evidence (server proxy, same key rule as §4). Human approves in UI. |
| `/api/sra/[id]/roadmap` | POST | customer | LLM generates 30/60/90 roadmap from approved findings. |
| `/api/sra/[id]/export` | GET | customer | Report/deck/JSON from stored engagement data (match Gap Analysis export styling). |
| `/api/sra/[id]/purge` | POST | customer/admin | Delete all evidence blobs + rows for the engagement (retention/close action). |

**Billing:** SRA is sold per engagement (higher price than a gap assessment — prototype shows
`$1,500`). Same gate-before-LLM rule; entitlement check via §13.

---

## 12. Proposals module

Port **`uploads/silhouette-proposal-template.html`**. It is a largely self-contained RFP/proposal
builder (pricing calculator, sections, references, exports). **Sold per proposal** (prototype shows `$99/proposal`) using the **same consumable-credit pattern as the other two modules** — one Stripe checkout flow, one entitlement gate, one ledger. The only backend it needs is the §13 entitlement check to load the tool and decrement a credit when a proposal is generated/exported. No document storage; no LLM proxy required unless
you later add AI drafting. Keep its existing client-side export (PDF/print) intact.

---

## 13. Suite shell — landing, auth, launcher, entitlements

Port **`Landing Page.dc.html`** (marketing) and **`Compliance Suite.dc.html`** (post-login launcher).

- **Landing page** (`/`) — public marketing; "Stateless by Design" hero; CTAs route to `/signup` and `/signin`.
- **Launcher** (`/app`) — after auth, shows the three module cards. Each card reflects entitlement:
  **Active → Launch**, or **Locked → Purchase / Try demo**.
- **Demo mode** — each module opens with static sample data when launched as a demo (no entitlement,
  no LLM spend). Gate real runs behind entitlement; demos are free and never hit the model.

### Entitlement model

```prisma
enum EntKind   { ASSESSMENT_CREDIT SRA_CREDIT PROPOSAL_CREDIT }
enum EntStatus { ACTIVE EXPIRED CANCELED }

model Entitlement {
  id         String    @id @default(cuid())
  accountId  String
  kind       EntKind
  status     EntStatus @default(ACTIVE)
  balance    Int?      // remaining credits (all three kinds are consumable credits)
  renewsAt   DateTime? // reserved for future subscription plans
  stripeRef  String?
  createdAt  DateTime  @default(now())
  @@index([accountId, kind])
}
```

- **All three modules bill identically**: consumable credits purchased through the same Stripe checkout, granted by the same webhook, decremented at the point of use via the §5 gate (IRP = per org assessed, SRA = per engagement, Proposals = per proposal generated). Most orgs buy one module; all three are offered as the same service pattern.
- Every module entry re-checks entitlement server-side; the Stripe **webhook** (§3) is the only writer
  that grants/refills/cancels entitlements.

### Suite acceptance checks (in addition to §9)

- A locked module cannot run a real job (entitlement check returns 402/forbidden); its demo still works.
- SRA evidence is encrypted at rest, scoped to the owning account, and fully removed by `purge`.
- No SRA route exposes another account's engagement or evidence.
- Proposals loads only with credit balance > 0; exhaustion locks it back to Purchase.

---

## 14. Deployment target — Hostinger (Cloud hosting tier)

The owner has a **Hostinger Cloud plan**, which supports managed Node.js web apps (deploy from a
GitHub repo or file upload via hPanel; framework auto-detected, builds run automatically; Next.js is
supported). Deploy the suite as a Node.js web app on this plan. **Constraints to design around:**

1. **Managed build, no SSH npm** — npm build commands run automatically on deploy and are configured
   in hPanel's Build settings; you cannot run arbitrary npm/CLI over SSH. Keep the build a standard
   `next build`; run `prisma generate` in the build script and `prisma migrate deploy` via a
   programmatic startup hook (e.g. in the server entry before listen), not a shell step.
2. **Database — use external managed Postgres.** Hostinger web/cloud databases are MySQL-family.
   Do NOT convert the schema to MySQL; point `DATABASE_URL` at a managed Postgres (Neon, Supabase,
   or similar). This also keeps backups/PITR managed.
3. **Stripe webhook + OAuth** — the Cloud plan serves HTTPS on the mapped domain, so
   `https://<domain>/api/webhooks/stripe` and the OAuth callback URLs work as-is. Register them in
   the Stripe dashboard and Google/Entra app registrations.
4. **SRA evidence blobs** — S3-compatible external storage per `.env.example` (no local disk
   assumptions; treat the app filesystem as ephemeral across redeploys).
5. **Scheduled board snapshot (weekly/monthly)** — don't rely on OS cron. Expose it as the
   `admin/boards/export` route and trigger it via hPanel cron (if available for the app) or an
   external scheduler (e.g. cron-job.org / GitHub Actions schedule) hitting the route with an
   admin token.
6. **Deploy flow** — connect the GitHub repo in hPanel → auto-redeploy on push to main. Keep
   `.env` values in the hPanel environment settings; never commit them.
7. **Fallback** — if the app outgrows the managed environment (long-running jobs, Docker needs),
   move to a Hostinger KVM VPS (Ubuntu + Docker + Nginx/Certbot). The app code should not need to
   change — only infrastructure.

**Local dev before deploy:** Postgres via Docker or a free Neon branch + `npm run dev`, Stripe CLI
(`stripe listen --forward-to localhost:3000/api/webhooks/stripe`), OAuth apps configured with
`http://localhost:3000` callbacks, per §8.