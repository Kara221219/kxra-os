# Engineering handover

Updated: 24 September 2026.

## Current checkpoint

Work from `/Users/kara/Desktop/P1/The KXRA Group` on `codex/phase-2-completion`. The pushed Slice 3 baseline is `bd28538fcb3a5ca9e82c4fa01f5eb419b2eda98b`; use branch HEAD for the Slice 4 Brand Studio implementation.

The branch is not merged and nothing is deployed. Preserve the private `KXRA-GENESIS` package, original source documents and unrelated parent-repository applications. PostgreSQL authorization, tenant/project isolation, Project 004's paper-only boundary and the repository publication boundary remain non-negotiable.

Read, in order:

1. [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md);
2. [acceptance evidence](acceptance-evidence.md) and [progress](progress.md);
3. [architecture](../architecture/system.md), [security](../security/access-control.md), [ADR 0011](../decisions/0011-kxra-brand-studio-local-product.md) and the [Brand Studio threat model](../security/brand-studio-threat-model.md), plus ADRs 0008–0010 and their threat models;
4. the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md) and root [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) for preserved requirements.

## Actual delivered state

Final Milestones 1–4 and Phase 2 Slices 0–4 work in the deterministic local environment. Migrations `0001`–`0048` are ordered and applied; do not rewrite one after this slice is committed. The schema has 123 RLS-protected tables and 102 audited exposed functions.

Slice 4 added:

- 14 Brand Studio tables for source/provenance, profile/campaign versions, creative lineage/review and private export/delivery evidence;
- 15 bounded authenticated functions with repeated project-write, entitlement, exact-version/hash and state checks;
- a provenance-backed active `brand-studio` catalogue record plus local-only `brand-studio.access`, `brand.generate` and `brand.export` fixture grants;
- consented customer-supplied source snapshots, public-HTTPS locator validation and truthful `PROVIDER_DISABLED` fetch state;
- source-linked, correctable profile versions and exact profile/campaign decisions;
- deterministic metered local text generation with no network, model, scheduling or publication action;
- immutable variant lineage and a strict five-part review before exact-hash text/Markdown/JSON export;
- delivery-time current membership, project, entitlement and review/content reauthorization with delivered/withheld evidence;
- owner/partner Business Tools and a complete responsive Brand Studio UI;
- SQL/domain, HTTP and desktop/mobile tests plus ADR/threat-model evidence.

During the implementation loop, HTTP tests exposed a PostgreSQL composite-expansion bug in profile/campaign decisions: `(mutating_function()).*` could invoke a function more than once. The routes now use `FROM mutating_function(...) result`, ensuring one evaluation. The same correction was applied to usage reservation/completion calls.

Preserved earlier slices include:

- normalized global identity, explicit selected tenant, exact legal acceptance gate, deterministic commercial/usage state and custom-project separation;
- private file versions, quarantine/scan/extract/index lifecycle, worker-only processing, RLS chunks, hash-verified private download and reconciliation;
- one-project Ask, immutable evidence envelopes, typed/versioned agents/skills/models/budgets, restricted AI worker, strict citations, redacted runs and revocation-safe delivery;
- owner Dashboard/Portfolio/Ideas/Work Log/Admin, invitation/onboarding/account lifecycle and all five original venture workspaces/hard stops.

Local Auth, email, billing, scanner/extractor, model and Brand Studio generation adapters are test/product scaffolding. They make no external action and fail closed outside their intended environment. Supabase, Stripe, Resend, OpenAI, Trigger.dev, Meta, YouTube, GitHub analysis and telemetry remain disconnected.

Legal seed records are deliberately `UNAPPROVED_PLACEHOLDER` and have no active requirement. Synthetic approved test documents exist only inside rolled-back/disposable fixtures. No production legal text, product, price, subscription, customer or credential is seeded.

## Reproduce the evidence

Requirements: Node.js 22, locked npm dependencies, Chromium for Playwright and local PostgreSQL binaries.

```sh
npm ci
npx playwright install chromium --only-shell
npm run test:ci
git diff --check
```

The clean contract creates and destroys a disposable runtime under `.runtime/ci`. It runs lint/typecheck/format, 104 database/domain/HTTP tests, the 48-migration/123-table RLS audit, 38 desktop/mobile scenarios (34 passes and four intentional device-specific skips), database/private-object restart persistence, an optimized clean production build, 16-marker fixture-artifact exclusion and a final 213-file publication/secret scan.

Local evidence does not prove hosted Supabase, Storage, MFA, Resend, Stripe, OpenAI, YouTube, Meta, Trigger.dev, telemetry, Vercel, Cloudflare or backup behavior.

## Next implementation slice

Implement Projects 006 and 007 locally before connecting their providers:

1. add both records to the canonical idempotent seven-project seed without changing Projects 001–005;
2. add exact common/specialist modules, project docs, gates and truthful empty/disabled states;
3. model Project 006 as research → brief → script/storyboard/assets → rights/claims review → owner-approved immutable YouTube upload intent;
4. expose no upload/schedule/publish executor until YouTube OAuth staging is separately authorized;
5. model Project 007 as discovery → immutable candidate snapshot → licence/provenance/security analysis → quarantine → adoption proposal → approval;
6. never execute candidate repository code on the host and expose no merge/deploy path;
7. add AT-37–43 SQL, HTTP and browser evidence and extend the 123-table/102-function matrix for every new object.

Routine scheduling, external adapters and the independent marketing application remain subsequent bounded slices.

## Security invariants

- Verify the server identity, active account and selected organization before retrieval. The organization cookie is a selector only.
- Set `request.kxra.org_id` from a server-verified membership inside each transaction. Never read tenant authority from request/JWT/model fields.
- Require one authorized project for project-bound retrieval. Reauthorize before bytes, chunks, model context, exports or provider delivery.
- Treat file, website snapshot, repository and model text as untrusted evidence. It cannot become a system instruction or grant a tool.
- Apply the exact approved legal requirement before private access. Unapproved placeholders cannot activate or pass release checks.
- Calculate entitlement, usage and money in deterministic database/domain code. Models never calculate permissions, balances or billing state.
- A subscription never authorizes custom implementation. Only the current exact accepted proposal and configured payment gate may create a customer project.
- Brand Studio export does not authorize publication. The latest review must bind the exact content hash and all five checks.
- Every new table needs RLS and an explicit policy. Every function and route must extend negative access tests.
- Keep Project 004 paper only and preserve all P001–P005 hard stops.

## Private business-readiness artifacts

The ignored private business pack dated 2026-09-19 contains the Customer Discovery Pack, Customer Discovery Tracker and Solicitor Brief alongside the existing business plan, decks, financial model and playbooks. The packages passed structural and visual review. The solicitor brief is an instruction pack, not legal advice or approved customer-facing terms.

Do not commit these artifacts. Use the discovery pack for interviews and give the solicitor brief to qualified UK counsel. Import only counsel-approved exact document versions and metadata through the private legal release process.

## Provider and owner boundaries

Continue local code, disabled adapters and tests without requesting credentials. Ask for a provider connection only after its staging adapter, scopes, test plan and fail-closed capability flag are concrete. Use provider secret stores, never chat or Git. Default-branch changes, production merge/deploy, public publication, live billing, real customer contact and YouTube/WhatsApp sends require owner approval of the concrete action.

## Publication boundary

Commit only platform code, engineering documentation and required classified seeds. Do not commit original Word/text sources, private Genesis research, business-pack artifacts, credentials, `.runtime`, databases, object backups, screenshots, traces or generated test artifacts.
