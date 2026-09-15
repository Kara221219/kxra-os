# Engineering handover

Updated: 15 September 2026.

## Current checkpoint

Work from `/Users/kara/Desktop/P1/The KXRA Group` on branch `codex/phase-2-completion`. The requirements-freeze baseline is `4e597ea2039f8758a254cf42637baff26e7067a2`; the reviewed Genesis implementation ancestor is `0c20de47fe1f6cb38646db51c4a90650679aacd7`; Final Milestone 1 code is `7cbc227bb8e03ff0b5f41d930ae8cbe1d9ece7d9`.

The branch has not been merged to `main` and nothing has been deployed. GitHub destination is the public `Kara221219/kxra-os` repository. Preserve the private `KXRA-GENESIS` package, original source documents and unrelated parent-repository applications.

Read [acceptance evidence](acceptance-evidence.md), [progress](progress.md), [architecture](../architecture/system.md), [security](../security/access-control.md), the [account threat model](../security/account-identity-threat-model.md), the [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md) and the root [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md). Direct user instructions remain controlling.

## Delivered milestone

Final Milestone 1 is complete with deterministic local Auth and email doubles. AT-19, AT-20 and AT-21 pass locally; AT-01, AT-02 and AT-04 through AT-09 remain passing. AT-03 remains blocked overall because its hosted subset has not run. No local result should be presented as hosted or production proof.

Migrations `0014_account_foundation.sql` through `0021_invitation_delivery_versions.sql` are additive and applied. They expand the private RLS schema from 20 to 30 tables and the audited exposed-function set to 42. Never rewrite an applied migration.

## Reproduce

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3210`. Use only clearly labelled synthetic identities. In another terminal:

```sh
npm run check
npm run format:check
npm run test:restart
npx playwright test tests/e2e/accounts.spec.ts
npx playwright test tests/e2e/workspace.spec.ts
git diff --check
```

Latest results: `npm run check` passed with 53/53 tests, production build and 16-marker artifact scan; restart persistence matched 22 completed tasks and 30 accepted supersessions; account E2E passed 3/3; existing workspace E2E passed 6/6; format and diff checks passed.

HTTP/browser tests require the local preview. PostgreSQL adversarial tests roll back. HTTP/browser tests retain labelled synthetic rows for inspection. Never point fixture tests at a hosted database.

## Implementation map

- `supabase/migrations/0014_account_foundation.sql`–`0021_invitation_delivery_versions.sql`: lifecycle, grants, onboarding, agreements, preferences, session/outbox/security state, rate limits and RLS.
- `packages/authz/provider.ts`: provider-neutral Auth contract.
- `packages/authz/fake-provider.ts`: deterministic ignored local Auth state; passwords use scrypt and provider tokens are digest-only.
- `packages/authz/join-intent.ts`: bounded AES-256-GCM invitation return state.
- `packages/authz/local-guard.ts` and `.production.ts`: local environment and production fail-closed boundaries.
- `packages/integrations/email.ts`: nine versioned fake transactional templates and delivery outcomes.
- `apps/os/app/api/join`, `auth`, `password-reset`, `onboarding` and the catch-all API: account flows and owner/partner controls.
- `apps/os/app/join`, `onboarding`, `reset-password`, account components and `PartnerAdministration.tsx`: rendered workflows.
- `apps/os/package.json` and root `package.json`: conditional development-only local module resolution.
- `scripts/verify-production-artifact.mjs`: optimized-build fixture exclusion check.
- `tests/account-contracts.test.ts`, `account-http.test.ts`, `e2e/accounts.spec.ts`: AT-19 through AT-21 evidence.
- Existing access/security/HTTP/workspace tests: expanded 30-table/42-function regression boundary.

## Security invariants

PostgreSQL is authoritative. Never accept subject, verified email, role, organisation, project list, invitation/account state, onboarding completion or approval from a browser body or model. Every retrieval must use the verified principal under RLS. Recheck lifecycle, membership and delivery authority at the point of use.

Keep the invitation token out of query strings, cookies, browser storage, logs, analytics and API responses. Preserve fragment stripping, digest-only lookup, encrypted short-lived join intent, locked verified email, exact grant version and one-use atomic redemption. Resend may rotate delivery/token state only; material grants require replacement.

Keep local Auth/UI imports behind `development` conditions and retain the production artifact scan. Never weaken fixture guards, current-state approvals, session/access versions, immutable history, source hashes, project composite foreign keys, private upload defaults, quarantine or P004/P005 hard stops.

## Blocked boundaries

Real Supabase MFA/email/session and pooler behavior, real owner bootstrap, Resend delivery, Storage/scanning, Trigger.dev, AI providers, WhatsApp, telemetry and deployment remain unverified. Legal documents are unapproved placeholders. Production, public publication, real credentials, real partner messages, paid calls, spending and trading remain unauthorized.

## Next engineering action

Implement Final Milestone 2 from the frozen order: Dashboard, Portfolio and Idea Inbox (FR-07, FR-08, FR-10; AT-22). Build typed data/query contracts, stable pagination/sorting, truthful unknown scores/finance, owner attention sections and exact partner idea visibility. Extend every new table/function/route through SQL, HTTP and browser isolation tests before calling the milestone complete.
