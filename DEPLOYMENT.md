# DEPLOYMENT.md — Silhouette

The path from this repo to a live app at `app.silhouettellc.com`. **Order matters: the app must be
built (Phase 1) before anything can be deployed.** Phases 2–3 can run in parallel with the build.

---

## Phase 1 — Build the app (gating step)

This repo ships prototypes + the build spec, not a runnable app. Hand it to a coding agent
(Claude Code, Cursor, etc.) with:

> "Read `README.md`, then build from `AGENTS.md`."

Deliverable: a Next.js app in this repo (App Router, Prisma, Auth.js, Stripe) passing the
acceptance checks in AGENTS.md §9 and §13.

## Phase 2 — Provision external accounts (do these today, in parallel)

- [ ] **Postgres** — create a managed instance (Neon or Supabase; Hostinger Cloud DBs are
      MySQL-family — do not use them). Copy the connection string → `DATABASE_URL`.
- [ ] **Stripe** — create the account; in **test mode**, create three products/prices and record IDs:
  - IRP Assessment — $250 → `STRIPE_PRICE_IRP_ASSESSMENT`
  - SRA Engagement — $1,500 → `STRIPE_PRICE_SRA_ENGAGEMENT`
  - Proposal — $99 → `STRIPE_PRICE_PROPOSAL`
- [ ] **Google OAuth app** (Google Cloud Console → OAuth client, type Web) — add callback
      `http://localhost:3000/api/auth/callback/google` now; production URL later.
- [ ] **Microsoft Entra ID app registration** — callback
      `http://localhost:3000/api/auth/callback/azure-ad` now; production URL later.
- [ ] **Anthropic API key** (console.anthropic.com). Optional: request zero-data-retention so the
      "we store nothing" claim is contractually backed end-to-end.
- [ ] **S3-compatible storage** for SRA evidence (e.g. Cloudflare R2, Backblaze B2).

## Phase 3 — Test locally (do NOT skip)

- [ ] Copy `.env.example` → `.env`; fill every value (Stripe **test** keys).
- [ ] `npx prisma migrate dev` against the managed Postgres (or a local Docker Postgres).
- [ ] `npm run dev` → app at `http://localhost:3000`.
- [ ] Webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`; put the printed
      signing secret in `STRIPE_WEBHOOK_SECRET`.
- [ ] Verify the core loop with test card `4242 4242 4242 4242`:
      sign in (Google + Microsoft) → locked module → purchase → credit granted by webhook →
      run an assessment → exports download → refine (once) → history/ledger row exists.
- [ ] Verify the gate: with zero balance, a run attempt returns 402 and spends no tokens.
- [ ] Verify demo mode works signed-out/unpaid and never calls the model.

## Phase 4 — Stand up the subdomain on Hostinger (Cloud Startup)

- [ ] hPanel → **Websites → + Add website → Node.js Web App**.
- [ ] **Deploy from GitHub** → select `silhouette-compliance`, branch `main`. Framework
      auto-detects as Next.js; confirm build settings.
- [ ] Domain: use `complianceapp.silhouettellc.com`. If hPanel currently shows this site as a
      legacy/manual hosting entry, migrate or recreate it as a Git-connected Node.js app so the
      app-level **Environment variables** screen appears like Orchestrator and HPCA.
- [ ] Confirm build settings:
  - Framework preset: `Next.js`
  - Branch: `main`
  - Root directory: `./`
  - Node version: `22.x`
  - Build command: `npm run build`
  - Output directory: `.next`
- [ ] Import every value from `.env.hostinger.production` into the app-level hPanel environment
      variables screen. Never commit `.env` files or paste secrets into public docs.
- [ ] Stripe dashboard → add webhook endpoint `https://app.silhouettellc.com/api/webhooks/stripe`;
      put its signing secret in the hPanel env.
- [ ] Add production OAuth callbacks:
      `https://complianceapp.silhouettellc.com/api/auth/callback/google`,
      `https://complianceapp.silhouettellc.com/api/auth/callback/github`, and
      `https://complianceapp.silhouettellc.com/api/auth/callback/microsoft-entra-id`.
- [ ] Set `NEXTAUTH_URL` / `APP_BASE_URL` to `https://complianceapp.silhouettellc.com`.
- [ ] Re-run the Phase 3 verification list against the live subdomain (test cards).

## Phase 5 — Go live

- [ ] Swap Stripe test keys → live keys; create the live webhook endpoint + secret; recreate the
      three prices in live mode and update the price-ID env vars.
- [ ] Make one real purchase end-to-end; refund it.
- [ ] Confirm the scheduled control-board snapshot trigger is set up (external scheduler hitting
      `admin/boards/export` — see AGENTS.md §14.5).
- [ ] Confirm Postgres backups are enabled on the managed provider.

## Ongoing

- Target state: work in feature branches; merging to `main` auto-deploys production through
  `.github/workflows/deploy-hostinger.yml`.
- GitHub Actions is the deployment authority for this repo. Hostinger hPanel remains the runtime
  host/configuration surface, but hPanel Git auto-deploy should not be used as the primary deploy
  path for this app.
- The workflow builds in GitHub, uploads one compressed deploy archive over SSH/SCP, extracts it in
  `public_html`, installs production dependencies, generates the Prisma client, and writes
  `tmp/restart.txt` to restart Passenger.
- Required GitHub Actions secrets:
  - `COMPLIANCE_HOSTINGER_DEPLOY_PATH`
  - `COMPLIANCE_HOSTINGER_SSH_HOST`
  - `COMPLIANCE_HOSTINGER_SSH_PORT`
  - `COMPLIANCE_HOSTINGER_SSH_USER`
  - `COMPLIANCE_HOSTINGER_SSH_PRIVATE_KEY`
  - `COMPLIANCE_HOSTINGER_ENV_FILE` (full production `.env` content)
- Optional GitHub Actions vars:
  - `COMPLIANCE_HOSTINGER_HEALTHCHECK_URL`
  - `COMPLIANCE_HOSTINGER_RUN_MIGRATIONS` (`true` only when the deploy shell has `DATABASE_URL`)
- Keep Silhouette Orchestrator deployments pointed at the orchestrator domain/path only. Do not
  deploy orchestrator artifacts, build output, or release archives into this compliance app's
  Hostinger `public_html` directory.
- Dependency vulnerabilities: review hPanel → Security → Vulnerabilities; auto-fix PRs land on the
  GitHub repo.
