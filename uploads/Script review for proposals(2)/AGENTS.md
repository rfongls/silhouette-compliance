# AGENTS.md — Silhouette Compliance Module

Build instructions for an AI coding agent. This adds a **compliance gap-analysis module** to an
existing Next.js + Prisma + PostgreSQL application. The goal: let users sign in (Google/Microsoft),
pay per organization assessed, run a compliance gap analysis on uploaded policy documents, and
re-download their results. Operators (admins) manage the control boards used for scoring.

> **Prime directive — statelessness:** never persist uploaded source documents or any patient/client
> data. The document exists in memory only for the duration of one analysis request. You DO persist
> generated *results* (findings/score/roadmap), accounts, billing, and control boards.

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
