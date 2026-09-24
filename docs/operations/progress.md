# KXRA OS implementation progress

Updated: 24 September 2026. Status: **Phase 2 Slice 5 is implemented and verified with deterministic local evidence. The system is not deployed or production ready.**

Current branch: `codex/phase-2-completion`. Slice 5 started from pushed Slice 4 commit `747408c3118c34626737cd963617685596168bc6`, which descends from the reviewed Genesis implementation. The branch is not merged. No default-branch change, production deployment, provider activation, external send, candidate-code execution or publication occurred.

The cumulative contract remains [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md), the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md), the [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) and the private Genesis source. Later requirements supplement earlier requirements. Executable status is recorded in [acceptance evidence](acceptance-evidence.md).

## Completed in Slice 5

- Extended the canonical atomic seed from five to exactly seven projects while preserving Projects 001–005.
- Added PROJECT-006 Finance Unfolded and PROJECT-007 Repository Intelligence lifecycle/disposition/gate defaults, 18 specialist modules each and dedicated evidence-gate policies.
- Added 12 project-scoped RLS tables for YouTube channel/content/version/review/upload-intent evidence and repository candidate/quarantine/assessment/proposal/version/review/implementation-intent evidence.
- Added ten bounded authenticated workflow functions plus private channel-binding controls. New direct writes are denied; immutable versions, append-only evidence, exact hashes, current authority and idempotency are enforced in PostgreSQL.
- PROJECT-006 now creates complete immutable content packages, requires an independent exact-version review of every source/claim/originality/rights/disclosure/compliance/render/caption/metadata check, and ends at `adapter=DISABLED`, `delivery_state=NOT_SENT`. Revision or disconnect withdraws stale intents.
- PROJECT-007 now records exact pinned candidates, controlled no-execution quarantine and bounded assessment evidence, rejects safety overclaims, requires independent exact-proposal approval, and ends at `git_execution_state=NOT_STARTED` with merge/release/deploy false.
- Seeded the two requested repositories only as untrusted reference metadata at exact reviewed commits; no tree hash, scan, licence or adoption claim is invented.
- Added responsive owner/partner project UI and strict HTTP schemas/routes. Nested project-resource checks and PostgreSQL RLS reject anonymous, unassigned, revoked and crafted-project access before context can leak.
- Added ADR 0012, the combined threat model and an operating review playbook.
- Fixed private-function grant hardening so existing RLS helpers retain their explicit grants, corrected PostgreSQL URL validation, encoded JSON arrays explicitly, prevented repeated composite-function execution and removed test-order assumptions.

## Cumulative verified implementation

- Next.js 15 / React 19 / TypeScript with PostgreSQL as authorization and state authority.
- 51 ordered additive migrations, 135 RLS-protected tables with explicit policies and 112 audited public functions.
- 109 database/domain/HTTP tests and 38 desktop/mobile browser scenarios in the clean disposable contract: 34 applicable passes and four intentional device-specific skips.
- Database/private-object restart persistence, optimized production build, 16-marker fixture-artifact exclusion and a 222-file publication/secret scan pass.
- Invitation/account lifecycle, selected-tenant legal gate, owner control plane, seven venture workspaces, file/knowledge lifecycle, permission-safe local Ask/AI execution, deterministic commercial/custom-project foundations and Brand Studio remain green in one hermetic run.

Definitions, schemas, disabled controls and local provider doubles are not counted as connected capabilities.

## Acceptance status for this slice

- **AT-37 PARTIAL:** the channel binding model and revocation behavior exist; real YouTube OAuth/callback/token custody is absent.
- **AT-38 PASS locally:** a synthetic package completes immutable evidence, independent review and stale-version checks.
- **AT-39 PARTIAL:** a disabled idempotent upload intent and withdrawal/reconciliation state exist; no provider upload/schedule/analytics adapter exists.
- **AT-40 PARTIAL:** exact candidate and quarantine contracts exist with synthetic records; no archive acquisition or production scanner is connected.
- **AT-41 PARTIAL:** bounded security/licence assessment records and hard stops exist; no real isolated scanner/sandbox evidence exists.
- **AT-42 PASS locally:** an exact independently approved adoption proposal can create only a no-execution implementation intent.
- **AT-43 PASS locally:** direct SQL, HTTP and browser tests cover project isolation and hard stops across Projects 006/007.

## Remaining work

### Partial

- Brand Studio: remote source refresh, media generation, provider queues, sector claim policies and publication remain absent.
- Identity/legal: hosted Supabase Auth/MFA/pooler, real owner bootstrap and solicitor-approved legal content remain unverified.
- Commercial: Stripe products/prices, checkout, webhook, portal and approved billing policies remain disconnected.
- Custom projects: owner triage/proposal/change-control and customer milestone/payment UX remain incomplete.
- AI/files: external OpenAI dispatch, production Storage/scanning/extraction, paid budgets and distributed recovery remain incomplete.
- Projects 006/007: provider/scanner adapters remain intentionally disabled as detailed above.

### Missing

- Versioned routine scheduling/recovery, event triggers and notification intents.
- WhatsApp identity pairing, durable ingress/outbound delivery and authorized escalation.
- Independent public/private/customer builds, layered industry marketing site and public forms.
- Connected staging providers, telemetry, backup/restore evidence, production release evidence and first-customer rehearsal.

## Active owner and external inputs

- Qualified UK solicitor approval for exact NDA/confidentiality, Terms, Privacy, cookie, AI/data-processing and custom-project documents.
- Customer discovery decisions for initial segment, launch plan, plan limits, the approximately £30 pricing hypothesis, free-partner policy and custom-project terms.
- Entity/public contact details, retention/recovery targets, support/privacy mailboxes and approved public copy/brand assets.
- Later staging credentials and budgets through provider secret stores, never chat or Git.
- When the YouTube slice is connected: a Google Cloud project, YouTube Data API, OAuth consent configuration and the exact Finance Unfolded channel-authorized account.
- When repository analysis is connected: approved archive source, production scanner/SBOM/SAST services and an isolated no-network sandbox design.

These inputs do not block continued local work with synthetic fixtures and disabled adapters.

## Next safe action

Implement the versioned Routine Registry, scheduler/lease/retry/recovery contract and notification intents with no external delivery. Then add provider-neutral adapters in staging-sized slices, beginning with hosted Auth/Storage and legal activation prerequisites. Preserve the public/private boundary and extend every RLS, HTTP and browser matrix before connecting a provider.

## Publication boundary

Only application code, engineering documentation and minimum classified seed records required by the platform may enter the repository. Original Word/text sources, private Genesis research, the private business pack, archives, `.runtime`, credentials, screenshots, traces, databases/object backups and generated test artifacts remain excluded.
