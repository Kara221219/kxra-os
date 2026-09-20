# KXRA OS implementation progress

Updated: 21 September 2026. Status: **Phase 2 Slice 3 permission-safe AI execution is implemented and verified with a deterministic local model adapter. It is not deployed or production ready.**

Current branch: `codex/phase-2-completion`. Slice 3 started from pushed Slice 2 commit `1866b11af9770a023b5452d2d1f3092f91df0fed`, which descends from the reviewed Genesis implementation. The branch is not merged and no default-branch change, production deployment, provider activation or external send occurred.

The cumulative contract remains [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md), the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md), the [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) and the private Genesis source. Later requirements supplement earlier requirements. Executable status is recorded in [acceptance evidence](acceptance-evidence.md).

## Completed in Slice 3

- Added typed, versioned model policies, agent manifests, skill manifests/tool bindings and deterministic budget policies. The 13 Genesis agents and 12 Genesis skills import as `DRAFT`; descriptive registry records cannot execute.
- Added the narrowly approved `AGT-ASK`/`SKL-ASK-001` local contract with one-project/run memory, no consequential side effects and only current evidence retrieval plus one structured fake-model call.
- Added immutable evidence envelopes and append-only run, attempt, step, tool, evidence-link, handoff, provider-usage, evaluation, failure and reconciliation records behind RLS.
- Added a private `kxra_ai_worker` role. Browser/application roles cannot claim or finish work; the worker receives only bounded claim, tool-evidence, finish and failure functions.
- Added row-locked cost/run/input/output budget reservation and exact reconciliation. Retries are capped, require current authority and a new reservation, link attempts and apply tool-call limits per attempt.
- Added strict response, claim and citation schemas. Unknown/stale/duplicate citations, unsupported claims, unknown model substitution, prompt/tool expansion, provider errors, timeouts and usage overage fail closed.
- Added atomic Ask delivery that rechecks account/membership version, legal gate, project assignment and every cited record/chunk version/hash and marks the linked knowledge query and agent run delivered or withheld together.
- Added explicit evidence-only and local test synthesis modes. Empty evidence never dispatches a model. Production model mode remains unavailable until an external adapter is configured and approved.
- Replaced generic AI Team, Skills and Run History pages with typed owner views showing manifest boundaries and redacted execution/usage evidence.
- Added migrations `0045`–`0046`, ADR 0010 and the AI execution threat model without rewriting prior migrations.
- Added nine focused AI execution tests plus HTTP and desktop/mobile browser coverage for real local synthesis, registries and run history.

## Preserved Slice 2 implementation

- Added a private object adapter with create-only local storage and a Supabase private-bucket target. Object keys are opaque, generated in PostgreSQL and partitioned by tenant/project/file/version; callers cannot submit a key.
- Added idempotent upload intents and the complete `UPLOADING → QUARANTINED → SCANNING → CLEAN → EXTRACTING → EXTRACTED → INDEXING → INDEXED` lifecycle, plus `REJECTED`, `FAILED` and `NEEDS_REVIEW` states. Processing starts only after the object write is finalized.
- Added a private `kxra_worker` role, leased jobs, scan/extraction evidence, immutable file versions, versioned chunks, delivery/query events and object reconciliation. Browser roles cannot claim jobs or promote lifecycle state.
- Added deterministic local adversarial scanning for size, executable/active extensions, executable signatures, EICAR, archive policy, MIME/magic mismatch, macro/active PDF content and invalid encoding/JSON. The adapter is fixture-only and fails closed in production/Vercel.
- Added bounded text/JSON/image-metadata extraction and chunks carrying exact file/record versions, offsets, hashes, extraction version, classification and audience. Unsupported PDFs fail visibly and never enter retrieval.
- Search and evidence-only Ask now include only current RLS-authorized `INDEXED` chunks. Every Ask records a redacted query run, validates versioned citations and rechecks authority before delivery; changed access withholds the answer and clears references.
- Added server-mediated private downloads with current authorization, object hash/size verification, delivery-time reauthorization and `private, no-store` responses. No permanent raw object URL is exposed.
- Added reconciliation for verified, missing, mismatched and orphan objects. Restart verification rehashes every registered private object and compares chunk/job manifests.
- Added SQL, HTTP and desktop/mobile acceptance coverage for clean, malicious, mismatched, macro, archive, extraction-failure, retry, revocation, cross-project, chunk citation, download and reconciliation paths.
- Added migrations `0039`–`0044`, ADR 0009 and the file/knowledge threat model without rewriting prior migrations.

## Preserved Slice 1 implementation

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
- 46 ordered migrations, 109 RLS-protected tables with explicit policies and 87 audited exposed functions.
- 99 database/domain/HTTP tests and 36 desktop/mobile browser scenarios in the clean disposable contract. The browser matrix has 32 applicable passes and four intentional device-specific skips.
- Owner control plane, invitation/account lifecycle, five original venture workspaces, one-project Ask KXRA, exact finance, approvals and work-log foundations remain passing.
- Explicit tenant selection, legal gate, deterministic commercial records, usage reservations, free grants and custom-project commercial separation pass with synthetic local evidence.

Definitions, schemas, disabled controls and local provider doubles are not counted as connected capabilities.

## Remaining work

### Partial

- The multi-tenant and first-private-access boundaries work locally. Hosted Supabase Auth, real owner bootstrap, pooler behavior and solicitor-approved legal content remain unverified.
- Commercial state and bounded APIs work with fake signed events. Stripe products/prices, checkout, webhook endpoint, portal, tax/refund/cancellation policy and customer billing UI are not connected.
- Custom-project intake and exact proposal/payment activation foundations work. Owner triage/proposal/change-control UI, invoices, customer milestone UX and approved legal/SOW text remain incomplete.
- Ask KXRA has the correct tenant/project/chunk boundary, deterministic local fake-model synthesis, strict claim/citation validation, budgets, tool controls, redacted run evidence and atomic delivery-time reauthorization. External OpenAI dispatch, provider data controls, distributed crash recovery and approved paid budgets remain incomplete.
- File lifecycle, download and reconciliation pass locally with deterministic adapters. Hosted Supabase Storage, a production malware engine, a disposable no-network extractor and an empty-target restore drill remain unverified.

### Missing

- Routine scheduling/recovery, autonomous handoff execution and consequential-action approval integration. Definitions and evidence tables exist, but no scheduler or handoff mutation path is enabled.
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

Implement KXRA Brand Studio with deterministic local generation adapters, typed brand inputs/outputs, entitlement/usage boundaries, project isolation and approval-safe export. Keep external generation, publication and paid providers disabled until staging controls and budgets are approved. In parallel, turn the private discovery and solicitor packs into owner-led interviews and counsel review; do not encode draft legal text as approved.

## Publication boundary

Only application code, engineering documentation and minimum classified seed records required by the platform may enter the public repository. Original Word/text sources, private Genesis research, the private business pack, archives, `.runtime`, credentials, screenshots, traces, databases/object backups and generated test artifacts remain excluded.
