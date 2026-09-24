# KXRA OS implementation progress

Updated: 24 September 2026. Status: **Phase 2 Slice 6 is implemented with deterministic local evidence. The system is not deployed or production ready.**

Current branch: `codex/phase-2-completion`. Slice 6 started from pushed Slice 5 commit `b39f9006183f2c49b27c15408f8ea23edea9cf72`, which descends from the reviewed Genesis implementation. The branch is not merged. No default-branch change, production deployment, provider activation, external send, candidate-code execution or publication occurred.

The cumulative contract remains [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md), the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md), the [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) and the private Genesis source. Later requirements supplement earlier requirements. Executable status is recorded in [acceptance evidence](acceptance-evidence.md).

## Completed in Slice 6

- Imported all nine Genesis routine definitions into typed, immutable manifests with stable identities, exact hashes, action graphs, trigger/timezone/calendar configuration, service identity, project scope, budgets, concurrency, leases, retry and notification policy.
- Kept every imported version `DRAFT`, every manifest disabled and every notification adapter disabled. Exact-hash owner approval is required before enablement.
- Added authoritative schedule/event slots, explicit business/exchange-calendar facts, bounded worker claims, leases, append-only checkpoints, completion/failure, expired-lease recovery and reauthorization before retry.
- Enforced one run per logical slot/event, Europe/London DST conversion, explicit XNYS open-day evidence, checkpoint-preserving recovery and cancellation when the routine/service/version is revoked.
- Added owner-only Routine Registry and strict HTTP routes for approval, state, calendar, local slot and event controls. Partner, anonymous, crafted-scope and direct-DML paths fail closed.
- Added disabled append-only notification intents. Unchanged success is quiet; a changed review outcome or terminal actionable failure can create one idempotent `DISABLED` / `NOT_SENT` intent.
- Added ADR 0013, a routine threat model and approval/recovery playbook.

## Cumulative verified implementation

- Next.js 15 / React 19 / TypeScript with PostgreSQL as authorization and state authority.
- 53 ordered additive migrations, 143 RLS-protected tables with explicit policies and 118 audited public functions.
- 114 database/domain/HTTP tests and 40 desktop/mobile browser scenarios in the clean disposable contract: 36 applicable passes and four intentional device-specific skips.
- Database/private-object restart persistence, optimized production build, 16-marker fixture-artifact exclusion and a 230-file publication/secret scan pass.
- Invitation/account lifecycle, selected-tenant legal gate, owner control plane, seven venture workspaces, file/knowledge lifecycle, permission-safe local Ask/AI execution, deterministic commercial/custom-project foundations and Brand Studio remain green in one hermetic run.

Definitions, schemas, disabled controls and local provider doubles are not counted as connected capabilities.

## Acceptance status for this slice

- **AT-14 PASS locally:** fake-clock schedule/event idempotency, Europe/London DST, XNYS calendar facts, lease/checkpoint recovery, revocation before retry, quiet unchanged completion and disabled actionable-failure intent all pass. Trigger.dev and external delivery remain disconnected.
- **AT-24 regression PASS locally:** routine approval, state and run outcomes project typed audit/Work Log events.

## Remaining work

### Partial

- Brand Studio: remote source refresh, media generation, provider queues, sector claim policies and publication remain absent.
- Identity/legal: hosted Supabase Auth/MFA/pooler, real owner bootstrap and solicitor-approved legal content remain unverified.
- Commercial: Stripe products/prices, checkout, webhook, portal and approved billing policies remain disconnected.
- Custom projects: owner triage/proposal/change-control and customer milestone/payment UX remain incomplete.
- AI/files: external OpenAI dispatch, production Storage/scanning/extraction, paid budgets and distributed recovery remain incomplete.
- Projects 006/007: provider/scanner adapters remain intentionally disabled.
- Routines: no always-on scheduler, Trigger.dev task, hosted worker or notification delivery adapter is connected.

### Missing

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

Implement the WhatsApp identity-pairing and durable ingress/outbound-intent foundation with provider transport disabled. Verify signature/deduplication, explicit project selection, authorization before retrieval and again before delivery, media quarantine/transcription consent, revocation and complete audit evidence. Then continue provider-neutral staging slices, hosted Auth/Storage and legal activation prerequisites. Preserve the public/private boundary and extend every RLS, HTTP and browser matrix before connecting a provider.

## Publication boundary

Only application code, engineering documentation and minimum classified seed records required by the platform may enter the repository. Original Word/text sources, private Genesis research, the private business pack, archives, `.runtime`, credentials, screenshots, traces, databases/object backups and generated test artifacts remain excluded.
