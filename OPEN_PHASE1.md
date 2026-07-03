# Silhouette Phase 1 App

This repo now contains a Next.js App Router implementation for Phase 1.

## Local run

1. Copy `.env.example` to `.env` and fill Postgres, OAuth, Stripe, Anthropic, and S3-compatible storage values.
2. Run `npm install`.
3. Run `npx prisma migrate dev`.
4. Run `npm run dev` and open `http://localhost:3000`.
5. Use Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

## Important behavior

- `/api/assess` consumes a verified assessment credit before calling Anthropic.
- Demo mode is static and never calls Anthropic.
- Uploaded IRP source text is never written to disk or Postgres.
- SRA evidence is encrypted before S3-compatible object storage and can be purged.
- Exports sanitize em dashes in report/deck/JSON output.
- Set `RUN_MIGRATIONS_ON_STARTUP=true` on Hostinger if you want the programmatic `prisma migrate deploy` startup hook enabled.
