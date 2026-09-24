# KXRA OS implementation progress

Updated: 24 September 2026. Status: **Phase 2 Slice 4 KXRA Brand Studio is implemented and verified with deterministic local adapters. It is not deployed or production ready.**

Current branch: `codex/phase-2-completion`. Slice 4 started from pushed Slice 3 commit `bd28538fcb3a5ca9e82c4fa01f5eb419b2eda98b`, which descends from the reviewed Genesis implementation. The branch is not merged and no default-branch change, production deployment, provider activation, external send or publication occurred.

The cumulative contract remains [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md), the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md), the [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) and the private Genesis source. Later requirements supplement earlier requirements. Executable status is recorded in [acceptance evidence](acceptance-evidence.md).

## Completed in Slice 4

- Added 14 project-scoped RLS tables for Brand Studio sources/versions, profiles/versions/evidence, assets, campaign briefs/versions, creative requests/variants/reviews, exports/deliveries and product events.
- Added 15 bounded authenticated functions for source, profile, brief, generation, revision, review, export and delivery transitions. Browser roles have no direct mutation authority.
- Added consented customer-supplied source snapshots with rights basis, exact hashes and provenance. Public HTTPS locators are syntactically constrained; remote fetch is truthfully disabled and no source text is obtained from the network.
- Added append-only, correctable profile and campaign versions. Exact decisions preserve the prior approved profile until a replacement version is approved.
- Added `brand-studio.access`, `brand.generate` and `brand.export` entitlement checks. Generation and export reserve usage transactionally before work; fixture grants are clearly local and do not fabricate a subscription.
- Added a strict deterministic local text generator with bounded channels/content, input hash, adapter version, review warnings and no model/network/publication action.
- Added creative parent/child lineage, immutable reviewed content and a five-part brand, claims, rights, accessibility and compliance review. Export binds the latest exact review and content hash.
- Added text, Markdown and JSON export. Every download rechecks current membership, project access, entitlement and review/content relationship and records delivered or withheld outcomes.
- Added Business Tools and Brand Studio owner/partner navigation plus a responsive source-to-export customer workflow. It states that website fetching, external generation, scheduling and publication are disabled.
- Added ADR 0011 and a Brand Studio threat model. Fixed a real route defect where PostgreSQL composite-function expansion could invoke a mutating decision more than once; all mutating composite calls now use a single `FROM function(...)` evaluation.
- Added database/domain, HTTP and desktop/mobile browser evidence for hostile locators, anonymous/crafted/viewer denial, project isolation, versioning, metering, review, export and revocation.

## Cumulative verified implementation

- Next.js 15 / React 19 / TypeScript with PostgreSQL as authorization and state authority.
- 48 ordered additive migrations, 123 RLS-protected tables with explicit policies and 102 audited exposed functions.
- 104 database/domain/HTTP tests and 38 desktop/mobile browser scenarios in the clean disposable contract. The browser matrix has 34 applicable passes and four intentional device-specific skips.
- Database/private-object restart persistence, optimized production build, 16-marker fixture-artifact exclusion and a 213-file publication/secret scan pass.
- Invitation/account lifecycle, selected-tenant legal gate, owner control plane, five original venture workspaces, file/knowledge lifecycle, permission-safe local Ask/AI execution, deterministic commercial/custom-project foundations and Brand Studio remain green in one hermetic run.

Definitions, schemas, disabled controls and local provider doubles are not counted as connected capabilities.

## Remaining work

### Partial

- **Brand Studio:** the local first-value path works. Remote website fetch/refresh, image/video assets, external model generation, provider queues, sector-specific claim policies, complete retention/deletion UX and any publication integration remain unimplemented.
- **Identity/legal:** local multi-tenant and first-access boundaries work. Hosted Supabase Auth/MFA/session/pooler behavior, real owner bootstrap and solicitor-approved legal content remain unverified.
- **Commercial:** normalized state, entitlements and local signed fixtures work. Stripe products/prices, checkout, webhook route, customer portal, tax/refund/cancellation policy and billing UI are disconnected.
- **Custom projects:** private intake and exact proposal/payment activation foundations work. Owner triage/proposal/change-control UI, invoices, customer milestone UX and approved SOW/legal text remain incomplete.
- **AI:** permission-safe local synthesis, strict citations, budgets and redacted run evidence work. External OpenAI dispatch, provider data controls, paid budgets and distributed crash recovery remain incomplete.
- **Files:** local lifecycle/download/reconciliation works. Hosted Supabase Storage, production malware scanning, disposable no-network extraction and empty-target restore remain unverified.

### Missing

- PROJECT-006 Finance Unfolded YouTube Content Engine records, modules, approval-safe upload intent and tests.
- PROJECT-007 GitHub Repository Intelligence & Secure Reuse records, quarantine/analysis/adoption pipeline and tests.
- Versioned routine scheduling/recovery, event triggers and notification intents.
- WhatsApp identity pairing, durable ingress/outbound delivery and authorized escalation.
- Independent public/private/customer builds, layered industry marketing site and public forms.
- Connected staging providers, telemetry, backup/restore evidence, production release evidence and first-customer rehearsal.

## Project status

- Projects 001–005 remain implemented as deterministic local records/workspaces with their hard stops. Scores remain truthfully null/Not Assessed.
- Project 004 remains research/paper only and has no live trading path.
- Project 005 remains demand gated and has no product publication path.
- Projects 006 and 007 are specified in documentation only; they are not seeded or executable.
- Brand Studio is a platform tool scoped through existing customer/partner projects; it is not a fabricated sixth venture record.

## Active owner and external inputs

- Qualified UK solicitor approval for the exact NDA/confidentiality, Terms, Privacy, cookie, AI/data-processing and custom-project documents. The software cannot activate placeholders.
- Customer discovery interviews and decisions for initial segment, launch plan, plan limits, approximately £30 pricing hypothesis, free-partner policy and custom-project commercial policy.
- Entity/public contact details, retention/recovery targets, support/privacy mailboxes and approved public copy/brand assets.
- Later staging credentials and budgets through provider secret stores, never chat or Git.

These inputs do not block continued local work with synthetic fixtures and disabled adapters.

## Next safe action

Implement Projects 006 and 007 as idempotent project records, exact common/specialist module registries and evidence gates. Build only local content/repository-analysis workflows: no YouTube upload, candidate-code execution, merge, deployment or external provider access. Extend every RLS, HTTP and browser matrix before enabling a provider adapter.

## Publication boundary

Only application code, engineering documentation and minimum classified seed records required by the platform may enter the public repository. Original Word/text sources, private Genesis research, the private business pack, archives, `.runtime`, credentials, screenshots, traces, databases/object backups and generated test artifacts remain excluded.
