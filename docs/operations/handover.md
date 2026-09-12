# Engineering handover

Updated: 2026-09-12.

## Resume safely

Work only in `/Users/kara/Desktop/P1/The KXRA Group`. A dedicated Git repository now exists in this workspace, isolated from the parent repository and its unrelated user applications. Do not reset, stage or overwrite parent work. GitHub destination: Kara221219/kxra-os (public). Production deployment remains prohibited. Preserve the local source documents and KXRA-GENESIS.

Read AGENTS.md, README.md, docs/architecture/system.md and progress.md. Current direct user instructions override source content. The full source brief is retained only in the owner’s private local workspace; the pasted approved-brief block was empty. This assumption is recorded in ADR 0001. The public clone is self-contained for running and building: use its engineering docs and required seed registers.

## Reproduce

`npm ci` → `npm run dev` → open `http://127.0.0.1:3210/login`. Select the clearly labelled synthetic owner/partner/viewer/revoked account. Do not enter real credentials. Startup creates a Unix-socket-only PostgreSQL cluster under `.runtime`; defaults to Homebrew PostgreSQL 14. `KXRA_PG_BIN` may override the binary directory.

`npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`, `npm run format:check`. HTTP and browser tests require the preview running. Browser dependency: `npx playwright install chromium --only-shell`. Current recorded results are 23 suite tests and 4 browser tests passing, plus successful type/build/format checks and zero audit findings. Test records are clearly synthetic and intentionally retained; database adversarial tests roll back. The local session signing key is generated, ignored and never printed.

## Implementation map

- `apps/os/app/os/[[...segments]]/page.tsx`: owner/partner workspace screens.
- `apps/os/app/api/[...path]/route.ts`: scoped JSON APIs, quarantine and approval actions.
- `apps/os/lib/auth.ts`, `middleware.ts`: server-verified identity, current member lookup and hosted cookie refresh.
- `packages/db/index.ts`: RLS transaction boundary; never replace with an admin connection.
- `supabase/migrations/0001_core.sql` through `0003_finance_validation.sql`: actual schema, constraints, policy and approval functions.
- `packages/domain`: validated register inputs, exact money and evidence-aware scoring formulas. Scores are not persisted from unreviewed input.
- `packages/ai`: evidence-only response envelope. No paid model calls.
- `packages/integrations/whatsapp.ts`: cryptographic helpers only.
- `scripts/database.mjs`: synthetic local cluster/start/seed/migrations. Reset deliberately disabled.
- `supabase/manual/bootstrap-owner.sql`: optional reviewed hosted bootstrap; not run and no credentials embedded.

## Next ten engineering actions

1. Add typed domain forms/validation for all role, skill and routine fields, and normalize register-specific lifecycle data where needed.
2. Build project creation and stage-gate transitions with evidence, hard stops and exact owner approvals.
3. Add task assignment/completion and experiment result/review workflows, preserving immutable accepted evidence.
4. Implement hosted MFA enrollment/challenge/recovery and confirmed-email invitation flows; test only with separately authorized staging accounts.
5. Verify real Supabase RLS, Auth and application pooler role isolation, including immediate account/assignment revocation.
6. Add private Supabase Storage policies, trusted scan results, current-authorization download proxy, retention and orphan reconciliation.
7. Implement finance ledger reconciliation and approved score snapshots; retain currency distinctions, unknowns and evidence provenance.
8. Add durable rate limits, CSP, consent-aware telemetry, security events and a backup/restore drill before production review.
9. Implement scoped worker capabilities, real run logging, retries/idempotency and budget-limited model calls with leakage/injection evaluations.
10. Complete identity-paired WhatsApp ingestion/media/transcription and outbound authorization rechecks; validate with provider fixtures before any external activation.

Project 004 remains paper/research only. Project 005 requires real demand evidence before product creation. No routine, public release, spend, message or live trade is authorized by the mere existence of its registry entry.
