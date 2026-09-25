# KXRA OS implementation progress

Updated: 25 September 2026. Status: **Phase 2 Slice 7 is implemented and verified with deterministic local evidence. The system is not deployed or production ready.**

Current branch: `codex/phase-2-completion`. Slice 7 started from pushed Slice 6 commit `7fc2a34d01d42fa078a15d8ef526d428a4dde717`, which passed GitHub Actions run `36058846131` and descends from the reviewed Genesis implementation. The branch is not merged. No default-branch change, production deployment, provider activation, external send, candidate-code execution or publication occurred.

The cumulative contract remains [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md), the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md), the [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) and the private Genesis source. Later requirements supplement earlier requirements. Executable status is recorded in [acceptance evidence](acceptance-evidence.md).

## Completed in Slice 7

- Added one-use WhatsApp pairing challenges bound to the authenticated account, exact membership version, phone digest, WABA id and phone-number id with expiry, replay and attempt limits.
- Added explicit active project selection and private worker-only ingress. Provider event/message ids deduplicate; account, legal, pairing and project authority are rechecked before project context is recorded.
- Added the closed supported-intent set, media quarantine states, voice-transcription consent, human takeover and revocation-aware disabled outbound intents.
- Stored no raw phone number or pairing code. Browser roles cannot write messages, media, ingress or outbound state or call worker functions.
- Added authenticated redacted status/challenge/project/revoke APIs and owner/partner UI that labels Meta transport disabled.
- Added ADR 0014, the WhatsApp threat model and staging activation playbook.

## Cumulative verified implementation

- Next.js 15 / React 19 / TypeScript with PostgreSQL as authorization and state authority.
- 55 ordered additive migrations, 151 RLS-protected tables with explicit policies and 121 audited public functions.
- 119 database/domain/HTTP tests and 42 desktop/mobile browser scenarios in the clean disposable contract: 38 applicable passes and four intentional device-specific skips.
- Database/private-object restart persistence, optimized production build, 16-marker fixture-artifact exclusion and a 237-file publication/secret scan pass.
- Invitation/account lifecycle, selected-tenant legal gate, owner control plane, seven venture workspaces, file/knowledge lifecycle, permission-safe local Ask/AI execution, deterministic commercial/custom-project foundations and Brand Studio remain green in one hermetic run.

Definitions, schemas, disabled controls and local provider doubles are not counted as connected capabilities.

## Acceptance status for this slice

- **AT-15 PASS locally:** exact one-use challenge, wrong binding, attempt, replay, account/membership and RLS cases pass.
- **AT-16 PARTIAL / local authority PASS:** three ingress copies create one message; cross-project scope, media consent, revocation and disabled outbound reconciliation pass. Real Meta webhook/media/send behavior remains absent.

## Remaining work

### Partial

- Brand Studio: remote source refresh, media generation, provider queues, sector claim policies and publication remain absent.
- Identity/legal: hosted Supabase Auth/MFA/pooler, real owner bootstrap and solicitor-approved legal content remain unverified.
- Commercial: Stripe products/prices, checkout, webhook, portal and approved billing policies remain disconnected.
- Custom projects: owner triage/proposal/change-control and customer milestone/payment UX remain incomplete.
- AI/files: external OpenAI dispatch, production Storage/scanning/extraction, paid budgets and distributed recovery remain incomplete.
- Projects 006/007: provider/scanner adapters remain intentionally disabled.
- Routines: no always-on scheduler, Trigger.dev task, hosted worker or notification delivery adapter is connected.
- WhatsApp: no registered Meta webhook, credential/token custody, provider media fetch, production scan/transcription, model call or outbound send is connected.

### Missing

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

After the final Slice 7 rerun/commit, build the independent public marketing application and approved-publication snapshot boundary: original layered industry storytelling, required public routes/forms, reduced-motion/mobile behavior and strict exclusion of private fixtures/content. Keep publication disabled, then continue hosted Auth/Storage and legal activation prerequisites.

## Publication boundary

Only application code, engineering documentation and minimum classified seed records required by the platform may enter the repository. Original Word/text sources, private Genesis research, the private business pack, archives, `.runtime`, credentials, screenshots, traces, databases/object backups and generated test artifacts remain excluded.
