# KXRA OS implementation progress

Updated: 20 September 2026. Status: **Phase 2 Slice 1 is implemented and verified in a disposable local environment. It is not deployed or production ready.**

Current branch: `codex/phase-2-completion`. Slice 1 started from pushed baseline `f81e7840c775c9431dbfec91216a1339eb0bf881`, which descends from the reviewed Genesis implementation. The branch is not merged and no default-branch change, production deployment, provider activation or external send occurred.

The cumulative contract remains [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md), the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md), the [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) and the private Genesis source. Later requirements supplement earlier requirements. Executable status is recorded in [acceptance evidence](acceptance-evidence.md).

## Completed in this slice

- Added normalized global account identities and many-to-many organization memberships with the four security roles `KXRA_OWNER`, `KXRA_STAFF`, `ORG_ADMIN` and `ORG_MEMBER`.
- Added explicit organization selection for multi-membership accounts. The HttpOnly organization cookie is only a selector; every request revalidates the account and active membership in PostgreSQL. JWT metadata, headers, paths, request bodies and model output cannot assign organization or role authority.
- Every scoped database transaction now sets one server-derived `request.kxra.org_id`. Selected-tenant policies prevent an account from combining roles or records across its memberships. Membership revocation takes effect on the next request while other memberships remain usable.
- Added approved-version legal documents, requirements, immutable presentations, exact acceptance/decline evidence and re-acknowledgement/release-manifest foundations. An active requirement can reference only an approved exact hash. Unapproved placeholders cannot activate or satisfy a release manifest.
- Added a first-private-access gate and agreement UI/API. Before acceptance, private OS, project, file, search and Ask routes return typed `AGREEMENT_REQUIRED`; context selection and agreement presentation remain reachable.
- Added deterministic plan/version/feature, billing customer/subscription/event, entitlement, usage reservation/aggregate/adjustment, offer/price/tax and owner free-grant records. Signed fake Stripe-style events reject tampering and expiry; database reconciliation handles replay and out-of-order events.
- Added concurrency-safe usage reservation/completion and deterministic entitlement decisions. Owner grants are auditable, scoped, expiring/revocable and do not fabricate a provider subscription.
- Added private custom-project requests, triage/proposal/acceptance/payment/change/milestone records. A subscription cannot create delivery work. Only a capability-authorized KXRA manager can author a proposal, and project activation requires the exact current accepted proposal plus its configured payment gate.
- Added customer-facing custom-project intake UI and APIs for plans, entitlements, usage, grants and custom-project workflow foundations. Live Stripe checkout/webhooks/customer portal remain absent.
- Added eight additive migrations, `0031`–`0038`; no applied migration was rewritten. Fresh migration-before-seed order now classifies the KXRA organization correctly and seeds legal placeholders only as inactive, unapproved records.
- Added AT-31–34 and AT-46 SQL/domain/HTTP/browser evidence, including dual-tenant isolation, exact legal acceptance, billing replay/concurrency, free-grant revocation and commercial separation.
- Fixed repeat-run legal fixture collisions, stale RLS-table dashboard assertions and a desktop/mobile navigation race found by the expanded browser suite.

## Verified implementation

- Next.js 15 / React 19 / TypeScript with PostgreSQL as authorization and state authority.
- 38 ordered migrations, 79 RLS-protected tables with explicit policies and 75 audited exposed functions.
- 81 database/domain/HTTP tests and 32 desktop/mobile browser scenarios in the clean disposable contract. The browser matrix has 28 applicable passes and four intentional device-specific skips.
- Owner control plane, invitation/account lifecycle, five original venture workspaces, one-project Ask KXRA, exact finance, approvals and work-log foundations remain passing.
- Explicit tenant selection, legal gate, deterministic commercial records, usage reservations, free grants and custom-project commercial separation pass with synthetic local evidence.

Definitions, schemas, disabled controls and local provider doubles are not counted as connected capabilities.

## Remaining work

### Partial

- The multi-tenant and first-private-access boundaries work locally. Hosted Supabase Auth, real owner bootstrap, pooler behavior and solicitor-approved legal content remain unverified.
- Commercial state and bounded APIs work with fake signed events. Stripe products/prices, checkout, webhook endpoint, portal, tax/refund/cancellation policy and customer billing UI are not connected.
- Custom-project intake and exact proposal/payment activation foundations work. Owner triage/proposal/change-control UI, invoices, customer milestone UX and approved legal/SOW text remain incomplete.
- Ask KXRA has the correct tenant/project boundary but lacks clean document extraction/chunking, model synthesis, citation validation, budget/tool controls and durable AI run evidence.

### Missing

- Secure file scanning, extraction/indexing, authorized byte delivery and object reconciliation/restore.
- Executable AI run substrate, skill versions, capability broker, routine scheduler/recovery and complete approval integration.
- KXRA Brand Studio, Projects 006/007, YouTube and repository-analysis workflows.
- WhatsApp identity pairing, durable ingress/outbound delivery and authorized escalation.
- Independent public/private/customer builds, layered industry marketing site and public forms.
- Connected staging providers, telemetry, backup/restore evidence, production release evidence and first-customer rehearsal.

## Project status

- Projects 001–005 remain implemented as deterministic local records/workspaces with their hard stops. Scores remain truthfully null/Not Assessed.
- Project 004 remains research/paper only and has no live trading path.
- Project 005 remains demand gated and has no product publication path.
- Projects 006 and 007 are specified in documentation only; they are not seeded or executable.

## Active owner and external inputs

- Qualified UK solicitor approval for the exact NDA/confidentiality, Terms, Privacy, cookie, AI/data-processing and custom-project documents. The software cannot activate placeholders.
- Customer discovery interviews and decisions for initial segment, launch plan, plan limits, approximately £30 pricing hypothesis, free-partner policy and custom-project commercial policy.
- Entity/public contact details, retention/recovery targets, support/privacy mailboxes and approved public copy/brand assets.
- Later staging credentials and budgets through provider secret stores, never chat or Git.

These inputs do not block continued local work with synthetic fixtures and disabled adapters.

## Next safe action

Implement the secure file and knowledge lifecycle: quarantine-to-clean scanning, immutable extraction/chunks, object-level authorization, project-bound retrieval and delivery-time revocation. Preserve the new tenant/legal gate and extend the matrix before any model or provider receives content. In parallel, turn the private discovery and solicitor packs into owner-led interviews and counsel review; do not encode draft legal text as approved.

## Publication boundary

Only application code, engineering documentation and minimum classified seed records required by the platform may enter the public repository. Original Word/text sources, private Genesis research, the private business pack, archives, `.runtime`, credentials, screenshots, traces, databases/object backups and generated test artifacts remain excluded.
