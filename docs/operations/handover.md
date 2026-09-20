# Engineering handover

Updated: 20 September 2026.

## Current checkpoint

Work from `/Users/kara/Desktop/P1/The KXRA Group` on `codex/phase-2-completion`. The reviewed and pushed Slice 1 baseline is `f81e7840c775c9431dbfec91216a1339eb0bf881`; use branch HEAD for the current implementation after the Slice 1 commit.

The branch is not merged and nothing is deployed. Preserve the private `KXRA-GENESIS` package, original source documents and unrelated parent-repository applications. PostgreSQL authorization, tenant/project isolation, Project 004's paper-only boundary and the repository publication boundary remain non-negotiable.

Read, in order:

1. [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md);
2. [acceptance evidence](acceptance-evidence.md) and [progress](progress.md);
3. [architecture](../architecture/system.md), [security](../security/access-control.md) and [ADR 0008](../decisions/0008-multi-tenant-legal-commercial-foundation.md);
4. the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md) and root [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) for preserved requirements.

## Actual delivered state

Final Milestones 1–3 and Phase 2 Slices 0–1 work in the deterministic local environment. Migrations `0001`–`0038` are ordered and applied; never rewrite one. The schema has 79 RLS-protected tables and 75 audited exposed functions.

Slice 1 added:

- global account identities and many-to-many organization memberships;
- explicit, audited organization selection with server/database membership verification;
- transaction-local selected tenant context and selected-tenant RLS policies;
- approved exact legal documents, requirements, presentations, responses, re-acknowledgement and release-manifest checks;
- a typed first-private-access gate across private HTML/API/file/search/Ask paths;
- plans, versions, features, billing state, entitlements, usage reservations/events/aggregates and owner free grants;
- Stripe-style local HMAC verification and deterministic replay/out-of-order reconciliation without a live provider route;
- offers, price/tax references and private custom-project request, proposal, acceptance, payment, change and milestone state;
- customer custom-project intake UI plus bounded plan, entitlement, usage, grant and custom-project APIs;
- SQL/HTTP/browser tests for AT-31–34 and the AT-46 placeholder boundary.

Legacy `members`/`profiles` remain compatibility projections for existing Milestone 1–3 workflows. `account_identities` and `organisation_memberships` are authoritative for tenant context. Do not let new code infer tenant role from legacy rows or JWT organization metadata.

Legal seed records are deliberately `UNAPPROVED_PLACEHOLDER` and have no active requirement. Synthetic approved test documents exist only inside rolled-back/disposable fixtures. No production legal text, Stripe product, subscription, customer, price or credential is seeded.

## Reproduce the evidence

Requirements: Node.js 22, locked npm dependencies, Chromium for Playwright and local PostgreSQL binaries.

```sh
npm ci
npx playwright install chromium --only-shell
npm run test:ci
git diff --check
```

The clean contract creates and destroys a disposable runtime under `.runtime/ci`. It runs lint/typecheck/format, 81 database/domain/HTTP tests, the 38-migration/79-table RLS audit, 32 desktop/mobile scenarios, restart persistence, optimized production build, fixture-artifact exclusion and publication/secret scanning.

Local evidence does not prove hosted Supabase, Storage, MFA, Resend, Stripe, OpenAI, YouTube, Meta, Trigger.dev, telemetry, Vercel, Cloudflare or backup behavior.

## Next implementation slice

Build the secure file and knowledge lifecycle before enabling Ask/model synthesis:

1. define quarantine, scan, clean, rejected, extracted and indexed states with immutable object/checksum provenance;
2. add fake malware/scanner and extraction adapters with adversarial fixtures;
3. authorize bytes, metadata, chunks and search at tenant/project/database boundaries;
4. reauthorize before download, retrieval, model dispatch and provider delivery;
5. add cross-tenant files/chunks/search tests, revocation during an open run and object/database reconciliation;
6. retain `AGREEMENT_REQUIRED` before all private file/knowledge paths;
7. update AT-04, AT-10, AT-11, AT-27 and AT-29 evidence without connecting a provider.

After that, implement the typed AI run/skill/routine substrate and then Brand Studio through fake adapters. Projects 006/007 and public marketing remain later bounded slices.

## Security invariants

- Verify the server identity, active account and selected organization before retrieval. The organization cookie is a selector only.
- Set `request.kxra.org_id` from a server-verified membership inside each transaction. Never read tenant authority from request/JWT/model fields.
- Require one authorized project for project-bound retrieval. Reauthorize before bytes, chunks, model context or provider delivery.
- Apply the exact approved legal requirement before private access. Unapproved placeholders cannot activate or pass release checks.
- Calculate entitlement, usage and money in deterministic database/domain code. Models never calculate permissions, balances or billing state.
- A subscription never authorizes custom implementation. Only the current exact accepted proposal and configured payment gate may create a customer project.
- Every new table needs RLS and an explicit policy. Every function and route must extend negative access tests.
- Keep Project 004 paper only and preserve all P001–P005 hard stops.

## Private business-readiness artifacts

The ignored private business pack dated 2026-09-19 contains the Customer Discovery Pack, Customer Discovery Tracker and Solicitor Brief alongside the existing business plan, decks, financial model and playbooks. The packages passed structural and visual review. The solicitor brief is an instruction pack, not legal advice or approved customer-facing terms.

Do not commit these artifacts. Use the discovery pack for interviews and give the solicitor brief to qualified UK counsel. Import only counsel-approved exact document versions and metadata through the private legal release process.

## Provider and owner boundaries

Continue local code, fake adapters and tests without requesting credentials. When external activation is the next dependency, present the exact endpoint, scopes, environment and prepared action. Never ask for raw secrets in chat. Default-branch changes, production merge/deploy, public publication, live billing, real customer contact and YouTube/WhatsApp sends require owner approval of the concrete action.

## Publication boundary

Commit only platform code, engineering documentation and required classified seeds. Do not commit original Word/text sources, private Genesis research, business-pack artifacts, credentials, `.runtime`, databases, object backups, screenshots, traces or generated test artifacts.
