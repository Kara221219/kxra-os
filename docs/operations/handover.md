# Engineering handover

Updated: 21 September 2026.

## Current checkpoint

Work from `/Users/kara/Desktop/P1/The KXRA Group` on `codex/phase-2-completion`. The pushed Slice 2 baseline is `1866b11af9770a023b5452d2d1f3092f91df0fed`; use branch HEAD for the current Slice 3 implementation.

The branch is not merged and nothing is deployed. Preserve the private `KXRA-GENESIS` package, original source documents and unrelated parent-repository applications. PostgreSQL authorization, tenant/project isolation, Project 004's paper-only boundary and the repository publication boundary remain non-negotiable.

Read, in order:

1. [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md);
2. [acceptance evidence](acceptance-evidence.md) and [progress](progress.md);
3. [architecture](../architecture/system.md), [security](../security/access-control.md), [ADR 0010](../decisions/0010-permission-safe-ai-execution.md) and the [AI execution threat model](../security/ai-execution-threat-model.md), plus ADRs 0008/0009 and their threat models;
4. the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md) and root [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) for preserved requirements.

## Actual delivered state

Final Milestones 1–4 and Phase 2 Slices 0–3 work in the deterministic local environment. Migrations `0001`–`0046` are ordered and applied; never rewrite one after this slice is committed. The schema has 109 RLS-protected tables and 87 audited exposed functions.

Slice 3 added:

- typed, versioned model, agent, skill/tool and deterministic budget policy;
- 13 Genesis agents and 12 skills as non-executable drafts plus one narrowly approved local Ask capability;
- immutable one-project evidence envelopes and append-only run/attempt/step/tool/usage/QA/failure/reconciliation evidence;
- a restricted `kxra_ai_worker` claim/finalization boundary and a matching in-process capability broker;
- strict structured output, claim and exact citation validation without raw prompt/answer retention in run logs;
- row-locked cost/run/token reservations, bounded retry with linked attempts and reconciliation-required overage state;
- atomic knowledge-query and agent-output delivery after current membership, legal, project and citation reauthorization;
- evidence-only and deterministic local fake-model Ask modes plus typed owner Agent, Skill and Run History views;
- SQL, HTTP and desktop/mobile evidence for success, invalid output, timeout, provider failure, retry, tool injection, unknown-model substitution, budget concurrency, RLS and pre/post-execution revocation.

The fake model makes no network request. External OpenAI/Astra adapters, Trigger.dev recovery, scheduled routines and autonomous handoffs remain disabled.

Slice 2 added:

- idempotent server-generated upload intents and immutable private object versions;
- the full upload, quarantine, scan, extraction and indexing state machine;
- a private worker role, leased processing jobs and fixture-only adversarial scanner/extractor adapters;
- versioned RLS-inheriting chunks with hashes, offsets, source/extraction metadata, classification and audience;
- server-proxied hash-verified downloads with authorization rechecked immediately before bytes are returned;
- redacted knowledge-query runs with exact record/chunk version validation and revocation-safe delivery;
- manifest reconciliation for verified, missing, mismatched and orphan objects;
- object/chunk/job restart integrity evidence plus SQL, HTTP and desktop/mobile AT-04/10/11 coverage.

The deterministic scanner/extractor is test evidence only. It refuses production/Vercel use. Supabase Storage, production malware scanning, a disposable no-network extractor and empty-target restore remain blocked until staging.

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

The clean contract creates and destroys a disposable runtime under `.runtime/ci`. It runs lint/typecheck/format, 99 database/domain/HTTP tests, the 46-migration/109-table RLS audit, 36 desktop/mobile scenarios, database/object restart persistence, an optimized clean production build, fixture-artifact exclusion and publication/secret scanning.

Local evidence does not prove hosted Supabase, Storage, MFA, Resend, Stripe, OpenAI, YouTube, Meta, Trigger.dev, telemetry, Vercel, Cloudflare or backup behavior.

## Next implementation slice

Implement Brand Studio through deterministic local generation adapters before any provider activation:

1. add typed brand profiles, source assets, jobs, output versions and export records under tenant/project RLS;
2. define the first bounded customer tools and entitlement/usage keys without inventing product claims;
3. keep generation local/fake while testing schema, provenance, cross-tenant isolation, quota concurrency and stale/revoked delivery;
4. require explicit approval for public/export side effects and provide no publication executor;
5. surface truthful empty, unavailable, draft, failed and ready states in the customer workspace;
6. preserve the separate custom-project commercial gate;
7. keep external generation and paid calls disabled until provider retention, region, data controls and budgets are approved.

Projects 006/007, routine scheduling, external provider adapters and the independent public marketing application remain later bounded slices.

## Security invariants

- Verify the server identity, active account and selected organization before retrieval. The organization cookie is a selector only.
- Set `request.kxra.org_id` from a server-verified membership inside each transaction. Never read tenant authority from request/JWT/model fields.
- Require one authorized project for project-bound retrieval. Reauthorize before bytes, chunks, model context or provider delivery.
- Treat file/document text as untrusted evidence. It cannot become a system instruction or grant a tool.
- Apply the exact approved legal requirement before private access. Unapproved placeholders cannot activate or pass release checks.
- Calculate entitlement, usage and money in deterministic database/domain code. Models never calculate permissions, balances or billing state.
- A subscription never authorizes custom implementation. Only the current exact accepted proposal and configured payment gate may create a customer project.
- Every new table needs RLS and an explicit policy. Every function and route must extend negative access tests.
- Keep Project 004 paper only and preserve all P001–P005 hard stops.

## Private business-readiness artifacts

The ignored private business pack dated 2026-09-19 contains the Customer Discovery Pack, Customer Discovery Tracker and Solicitor Brief alongside the existing business plan, decks, financial model and playbooks. The packages passed structural and visual review. The solicitor brief is an instruction pack, not legal advice or approved customer-facing terms.

Do not commit these artifacts. Use the discovery pack for interviews and give the solicitor brief to qualified UK counsel. Import only counsel-approved exact document versions and metadata through the private legal release process.

## Provider and owner boundaries

Continue local code, fake adapters and tests without requesting credentials. The next hosted file gate will require a private Supabase Storage bucket, server-only Storage secret, restricted worker database login, scanner service and extraction worker; request them only when the staging adapter and tests are ready. When external activation is the next dependency, present the exact endpoint, scopes, environment and prepared action. Never ask for raw secrets in chat. Default-branch changes, production merge/deploy, public publication, live billing, real customer contact and YouTube/WhatsApp sends require owner approval of the concrete action.

## Publication boundary

Commit only platform code, engineering documentation and required classified seeds. Do not commit original Word/text sources, private Genesis research, business-pack artifacts, credentials, `.runtime`, databases, object backups, screenshots, traces or generated test artifacts.
