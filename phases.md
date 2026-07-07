# Silhouette Compliance -- Phase Roadmap

A living roadmap for the Compliance app. Released items describe behavior that
is already present in the app; Next Tasks are queued product or deployment work.

## Released / Phase 1 Foundation

- [x] Ship the Phase 1 Next.js App Router implementation.
- [x] Support local development with Postgres, OAuth, Stripe, Anthropic, and
  S3-compatible storage configured from `.env`.
- [x] Consume a verified assessment credit before `/api/assess` calls the model
  provider.
- [x] Keep demo mode static so demos never call Anthropic or another model
  provider.
- [x] Keep uploaded IRP source text out of disk and Postgres persistence.
- [x] Encrypt SRA evidence before S3-compatible object storage and support
  purge workflows.
- [x] Sanitize em dashes in report, deck, and JSON exports.
- [x] Support the optional `RUN_MIGRATIONS_ON_STARTUP=true` Hostinger startup
  hook for `prisma migrate deploy`.
- [x] Add role-based admin access inside the main app experience rather than a
  separate admin login path.
- [x] Track customer and admin-comped usage in the profile/billing ledger so
  admin support usage remains visible even when it is not charged.

## Next Tasks

- [ ] Add a hosted app access gate around email-based license entitlements:
  after Google, GitHub, or Microsoft SSO, normalize the signed-in email and
  require an active entitlement for `appKey = silhouette-compliance` before
  allowing `/app` or protected Compliance APIs.
- [ ] Send signed-in users without an active Compliance license to a public
  landing, purchase, or license activation page instead of the authenticated app
  shell.
- [ ] Enforce the license gate server-side on protected pages and APIs, including
  assessment, SRA, proposal, export, and profile/billing workflows. The gate must
  not rely only on navigation or hidden UI.
- [ ] Allow Silhouette admin accounts to view the app as either an admin or a
  customer user experience. Admins can bypass paid access for support/testing,
  but model usage, credits, and estimated cost must still be recorded.
- [ ] Start with manually/admin-managed license records keyed to email, then
  connect the purchase flow so checkout or license activation creates/updates
  the appropriate entitlement record.
- [ ] Keep hosted environment variables app-scoped with the `COMPLIANCE_` prefix
  so this app does not collide with Orchestrator or other Silhouette services.

## Phase 1 Local Run

1. Copy `.env.example` to `.env` and fill Postgres, OAuth, Stripe, Anthropic,
   and S3-compatible storage values.
2. Run `npm install`.
3. Run `npx prisma migrate dev`.
4. Run `npm run dev` and open `http://localhost:3000`.
5. Use Stripe CLI with
   `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
