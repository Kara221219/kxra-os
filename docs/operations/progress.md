# KXRA OS implementation progress

Updated: 26 September 2026. Status: **Phase 2 Slice 16 optimized marketing performance and automated accessibility budgets pass locally. The system is not deployed or production ready.**

Current branch: `codex/phase-2-completion`. Pushed commit `07203603919613e155111d2fcfce05bf3974048f` descends from the reviewed Genesis implementation and passed full GitHub CI run 36255785726 plus CodeQL run 36255785732. Slice 16 is the current working change. The branch is not merged. No default-branch change, production deployment, provider activation, external send, candidate-code execution or publication occurred.

The cumulative contract remains [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md), the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md), the [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) and the private Genesis source. Later requirements supplement earlier requirements. Executable status is recorded in [acceptance evidence](acceptance-evidence.md).

## Completed in Slice 8

- Added independent `apps/marketing` and separate production build with every current and preserved public route.
- Added an exact SHA-256-bound `REVIEW_REQUIRED` public snapshot. Publication, indexing and legal activation remain disabled.
- Added original semantic layered storytelling with desktop depth, mobile recomposition, reduced-motion, 320 px, 200% text and no-JavaScript fallbacks.
- Added contact, enquiry and custom-project forms with exact-origin/schema/body checks, honeypot discard, HMAC request digests, idempotency, daily duplicate suppression and transactional hourly rate limiting.
- Added owner-only `UNVERIFIED` public enquiry records, audit events and a private Idea Inbox view. Anonymous and partner reads remain empty under RLS.
- Added public/private source and artifact scanners, ADR 0015, a public-site threat model and staging/release playbook.

## Cumulative verified implementation

- Next.js 15 / React 19 / TypeScript with PostgreSQL as authorization and state authority.
- 57 ordered additive migrations, 153 RLS-protected tables with explicit policies and 122 audited public functions.
- 131 database/domain/HTTP/security tests, 42 private-OS browser scenarios (38 passes/four intentional skips) and 12 public-site browser scenarios under both development and optimized production.
- Database/private-object restart and empty-target recovery, both optimized production builds, exact-hash/SRI CSP, compressed page-asset and Lighthouse budgets, exact snapshot/source-boundary checks, 21-marker artifact exclusion and a 300-file publication/secret scan pass.
- Invitation/account lifecycle, selected-tenant legal gate, owner control plane, seven venture workspaces, file/knowledge lifecycle, permission-safe local Ask/AI execution, deterministic commercial/custom-project foundations and Brand Studio remain green in one hermetic run.

Definitions, schemas, disabled controls and local provider doubles are not counted as connected capabilities.

## Acceptance status for this slice

- **AT-17 PASS locally:** applications build independently; required routes use one exact snapshot; private-source/marker scans pass; publication remains disabled.
- **AT-26 PASS locally:** all three forms validate, bot-check, deduplicate, rate-limit and store one owner-only unverified audited row; `/login` targets the private app.
- **AT-44 PASS locally:** desktop/mobile, reduced motion, 320 px, 200% text, keyboard, no-JavaScript, representative browser accessibility-tree and optimized local Lighthouse scenarios pass. Real-user field vitals and human assistive-technology review remain release checks.
- **AT-45 PARTIAL / local boundary PASS:** source and both build artifacts exclude planted private markers. Hosted RSC/prefetch/cache/error isolation remains unverified.

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

- Connected staging providers, hosted telemetry/backup evidence, production performance/accessibility evidence, approved public/legal content, release evidence and first-customer rehearsal.

## Active owner and external inputs

- Qualified UK solicitor approval for exact NDA/confidentiality, Terms, Privacy, cookie, AI/data-processing and custom-project documents.
- Customer discovery decisions for initial segment, launch plan, plan limits, the approximately £30 pricing hypothesis, free-partner policy and custom-project terms.
- Entity/public contact details, retention/recovery targets, support/privacy mailboxes and approved public copy/brand assets.
- Later staging credentials and budgets through provider secret stores, never chat or Git.
- When the YouTube slice is connected: a Google Cloud project, YouTube Data API, OAuth consent configuration and the exact Finance Unfolded channel-authorized account.
- When repository analysis is connected: approved archive source, production scanner/SBOM/SAST services and an isolated no-network sandbox design.

These inputs do not block continued local work with synthetic fixtures and disabled adapters.

## Next safe action

Commit and push Slice 16, confirm both remote workflows, then prepare the exact Vercel WAF staging rule and broader provider-failure/load coverage. Keep deployment and publication disabled.

## Slice 9 local evidence

- A closed, bounded telemetry envelope rejects non-allowlisted, identity, content, secret, nested and unbounded data before a sink can receive it. Provider capture remains disabled.
- npm run test:restore dumps the synthetic database and private objects, restores into an empty isolated target, verifies all table counts, migration/RLS/policy and critical state plus object hashes, records RPO/RTO/discrepancies, and destroys the target.
- The clean hermetic proof restored 153 tables, 2,461 synthetic rows and 15 private objects with zero discrepancies in 2 seconds.
- CI readiness is bound to a fresh opaque run ID; a decoy stale service must fail before either application starts.

## Slice 10 local security hardening

- Dynamic OS responses now receive a unique nonce CSP with strict-dynamic and no script unsafe-inline. Development-only unsafe-eval remains for framework tooling.
- A disconnected public-source acquisition contract validates public HTTPS, every DNS answer and redirect, requires address-pinned transport, and bounds timeout, content type and bytes.
- Five focused security tests and the complete hermetic contract pass. The nonce policy preserves hydration and all tested mutations on desktop/mobile.
- The cumulative suite now passes 129 database/domain/HTTP/security tests, 38 applicable private browser scenarios, 10 public scenarios, both optimized builds, empty-target recovery and the 294-file publication scan.

## Slice 11 local supply-chain gates

- The lockfile gate requires exact versions, npm-registry HTTPS sources, integrity hashes and one of nine reviewed license expressions for all 118 external packages.
- Only exact reviewed esbuild and optional fsevents versions may run install scripts; any new script or version fails closed.
- A separate CodeQL v4.38.2 workflow is pinned to its immutable commit and uses the security-extended JavaScript/TypeScript suite.
- Full GitHub CI run 36251106024 and CodeQL run 36251106098 passed for commit `1b256e0`.

## Slice 12 local accessibility and performance gates

- A representative Chromium accessibility-tree test validates the public banner, named navigation, main/content-info landmarks, page heading and labelled contact controls on desktop and mobile.
- The first run exposed a mobile breakpoint that removed the primary navigation. The header now keeps the full navigation available in a horizontally scrollable row; focused and full retests pass.
- A deterministic post-build gate measures the unique JavaScript/CSS required by every page. Marketing pages are limited to 140 KiB gzip and private OS pages to 200 KiB; the clean run measured 107.3 KiB and 157.8 KiB respectively at the largest routes.
- The complete hermetic contract passes 12 public scenarios and the 295-file publication scan. Production-like Lighthouse/Core Web Vitals and human assistive-technology review still require staging.
- Full GitHub CI run 36252532435 and CodeQL run 36252532467 passed for Slice 12 commit `ae52e0d`.

## Slice 13 local public-ingress concurrency evidence

- Twenty simultaneous HTTP submissions from one HMAC-digested source exercise separate application database connections against one transactional rate window.
- Exactly five requests receive `202`, fifteen receive `429`, no unexpected status occurs and exactly five submissions persist.
- The complete hermetic contract passes 130 tests, 54 browser scenarios, restart and a 2,477-row empty-target restore, both production builds, page-asset budgets and the 295-file publication scan.
- This proves the PostgreSQL application boundary under the tested local race. Cloudflare/Vercel edge limits, abuse telemetry and a production-like distributed load exercise remain staging work.
- Full GitHub CI run 36253210907 and CodeQL run 36253210903 passed for Slice 13 commit `a10a4bd`.

## Slice 14 local static marketing CSP and SRI

- The two-pass marketing build binds both passes to one opaque build ID, collects every inline script hash, rebuilds with the closed hash policy and fails if the final scripts drift.
- The final static pages contain 62 exact SHA-256 inline hashes and 122 SRI-protected script references. The 3,609-character CSP removes production script `unsafe-inline`/`unsafe-eval` and disables script attributes.
- The complete 12-scenario public browser suite runs against development and again against the optimized production server. All 24 executions pass, including hydration-dependent form submission on desktop/mobile.
- The complete hermetic contract passes 130 tests, 42 private browser runs, 24 public browser runs, recovery, builds, CSP/SRI, page budgets, artifact checks and the 296-file scan before this documentation update. The final publication scan covers 297 files.
- Full GitHub CI run 36254260566 and CodeQL run 36254260569 passed for Slice 14 commit `54af5dc`.

## Slice 15 local trusted-edge identity

- Hosted public ingress now accepts client identity only from one syntactically valid `x-vercel-forwarded-for` address when `VERCEL=1`; conflicting caller forwarding headers are ignored and missing/list/malformed values fail closed.
- Loopback fixtures have an explicit separate path and use valid synthetic network addresses. There is no generic hosted proxy-header fallback.
- The complete hermetic contract passes 131 tests, including strict edge selection and the 20-request race, 42 private runs, 24 public runs, recovery, builds, CSP/SRI, budgets and the 297-file scan before this ADR. The final publication scan covers 298 files.
- Vercel WAF rule activation and observed hosted header behavior remain staging gates. Cloudflare stays DNS-only unless Vercel Trusted Proxy is purchased and verified.
- Full GitHub CI run 36255785726 and CodeQL run 36255785732 passed for Slice 15 commit `0720360`.

## Slice 16 local optimized performance and accessibility evidence

- Exact Lighthouse 13.5.0 is locked as a development-only audit tool. The gate can target only an optimized loopback server and audits mobile home plus desktop contact profiles.
- Release budgets require performance at least 0.90, accessibility exactly 1.00, LCP no more than 2.5 seconds, CLS no more than 0.1 and TBT no more than 200 ms as the documented laboratory proxy for INP.
- The first audit identified low-contrast text in the dark layered section and a brand-link accessible-name mismatch. Both were corrected before acceptance.
- The final clean run measured mobile home at performance 1.00, accessibility 1.00, LCP 1,899 ms, CLS 0.000 and TBT 41 ms; desktop contact measured 1.00, 1.00, 427 ms, 0.000 and 0 ms. Laboratory results do not replace field data or human assistive-technology review.
- The cumulative contract covers 228 locked packages and a 299-file scan before this ADR. The final publication scan covers 300 files.

## Publication boundary

Only application code, engineering documentation and minimum classified seed records required by the platform may enter the repository. Original Word/text sources, private Genesis research, the private business pack, archives, `.runtime`, credentials, screenshots, traces, databases/object backups and generated test artifacts remain excluded.
