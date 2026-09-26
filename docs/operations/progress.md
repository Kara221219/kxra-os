# KXRA OS implementation progress

Updated: 27 September 2026. Status: **Phase 2 Slice 26 adds restricted Stripe test-mode subscription reconciliation and passes the complete local contract. Commit and remote evidence are pending; hosted staging remains unconnected and the system is not production ready.**

Current branch: `codex/phase-2-completion`. Slice 26 passes the complete local contract and awaits commit/remote checks. Slice 25 implementation commit `3f226b9dfacbb7c05cb8496278e75f96c3db72f2` passed full GitHub CI run 36277965380 and CodeQL run 36277965401. The branch is not merged. No default-branch change, production deployment, provider activation, charge, external send, candidate-code execution or publication occurred.

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
- 65 ordered additive migrations, 166 RLS-protected tables with explicit policies and 141 audited public functions.
- 159 database/domain/HTTP/security tests, 46 private-OS browser scenarios (41 passes/five intentional skips) and 14 public-site browser scenarios under both development and optimized production.
- Database/private-object restart and 2,697-row/15-object empty-target recovery, both optimized production builds, exact-hash/SRI CSP, compressed page-asset and Lighthouse budgets, exact snapshot/source-boundary checks, 21-marker artifact exclusion and a 342-file publication/secret scan pass.
- Invitation/account lifecycle, selected-tenant legal gate, owner control plane, seven venture workspaces, file/knowledge lifecycle, permission-safe local Ask/AI execution, deterministic commercial/custom-project foundations and Brand Studio remain green in one hermetic run.

Definitions, schemas, disabled controls and local provider doubles are not counted as connected capabilities.

## Acceptance status for this slice

- **AT-17 PASS locally:** applications build independently; required routes use one exact snapshot; private-source/marker scans pass; publication remains disabled.
- **AT-26 PASS locally:** all three forms validate, bot-check, deduplicate, rate-limit and store one owner-only unverified audited row; `/login` targets the private app.
- **AT-44 PASS locally:** desktop/mobile, reduced motion, 320 px, 200% text, keyboard, no-JavaScript, representative browser accessibility-tree and optimized local Lighthouse scenarios pass. Real-user field vitals and human assistive-technology review remain release checks.
- **AT-45 PARTIAL / local boundary PASS:** source and both build artifacts exclude planted private markers. Hosted RSC/prefetch/cache/error isolation remains unverified.

## Remaining work

### Partial

- Brand Studio: local address-pinned source refresh, append-only correction and stale-lineage gates are implemented; hosted worker/egress evidence, media generation, sector claim policies and publication remain absent.
- Identity/legal: hosted Supabase Auth/MFA/pooler, real owner bootstrap and solicitor-approved legal content remain unverified.
- Commercial: test-mode subscription webhook normalization and reconciliation are staging-ready but disabled; Stripe products/prices, checkout, portal, live mode and approved billing policies remain disconnected.
- Customer operations: private support, cancellation/withdrawal and data-request intake/handling works locally; approved response periods, provider cancellation, identity verification, disclosure/erasure and notification delivery remain disconnected.
- Custom projects: the local request-to-delivery evidence path includes bilateral exact change approval, versioned delivery evidence, customer milestone acceptance, invoices, immutable voids and component-bounded credit notes. Approved legal text and connected accounting/payment reconciliation remain incomplete.
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

Connect a separate Supabase/Vercel staging environment, then configure and evidence the exact Vercel WAF rule, hosted RLS/Auth/Storage and broader provider-failure/load coverage. Keep production deployment and publication disabled.

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
- A deterministic post-build gate measures the unique JavaScript/CSS required by every page. Marketing pages are limited to 140 KiB gzip and private OS pages to 200 KiB; the current clean run measured 107.3 KiB and 163.6 KiB respectively at the largest routes.
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
- Full GitHub CI run 36257634481 and CodeQL run 36257634461 passed for Slice 16 commit `b222b57`.

## Slice 17 local public failure-state evidence

- A new desktop/mobile journey holds the enquiry response to prove the visible loading message and disabled submit control.
- A synthetic `503` proves the safe public error, preserved typed input and enabled retry path without creating a misleading success state.
- Removing the synthetic outage and retrying reaches the real local PostgreSQL ingress, records the enquiry and clears the form only after success.
- The final complete contract passes all 131 tests, 42 private browser runs and 14 public scenarios in both development and optimized production, plus recovery, builds, CSP/SRI, asset/Lighthouse budgets and the 300-file publication scan.
- Full GitHub CI run 36258437614 and CodeQL run 36258437518 passed for Slice 17 commit `5fcba23`.

## Slice 18 local staging-safety evidence

- Added separate private-OS and public-marketing staging profiles plus a build-time preflight that emits no values and rejects production targets, fixture state, legacy Supabase keys, privileged database identities, absent TLS, weak or reused secrets, public secret names, copied private credentials and prematurely enabled providers.
- Added one bounded owner playbook for a non-production Supabase project and two Vercel projects, including exact root directories, environment allowlists, disabled capability sequence and hosted acceptance/rollback gates. ADR 0021 records the boundary.
- The first complete run exposed concurrent Next.js cache corruption when a normal development server and CI used the same `.next-dev` directory. CI now uses a random per-run directory, excludes it from publication/format scans, restores Next-generated tracked configuration and removes the directory after every ordinary pass/failure.
- The corrected complete run remained green with the normal development server active: 136 tests, 153-table RLS audit, 42 private browser runs, 14 public scenarios in development and optimized production, 2,483-row/15-object recovery, both builds, CSP/SRI, budgets and a 305-file scan. Lighthouse measured mobile 1.00/1.00 with 1,856 ms LCP and desktop 1.00/1.00 with 416 ms LCP.
- Hosted Supabase/Vercel behavior and provider permissions remain unverified until the owner completes the bounded connection checkpoint. Full GitHub CI run 36260468489 and CodeQL run 36260468520 passed for Slice 18 commit `a69bfa2`.

## Slice 19 local custom-project commercial control

- Same-organization ordinary users now see only requests they submitted and their linked proposal, acceptance and payment totals. Organization administrators retain oversight; internal KXRA triage requires `custom_project.manage` and is absent from customer result sets.
- The private OS now supports bounded manager triage, approved-terms proposal issue, exact customer acceptance, integer payment/refund evidence and payment-gated delivery-workspace activation. Subscription access cannot create custom delivery work.
- Project activation now subtracts refunds from received funds and requires current management authority. Payment evidence is idempotent and does not duplicate its audit event.
- SQL and HTTP tests cover same-tenant privacy, hidden triage, forged customer payment calls, wrong currency, refund-reduced gates, exact acceptance and controlled project creation. A desktop/mobile browser journey proves customer intake remains separate from subscription tools.
- The first complete browser run exposed a client event-lifetime error after successful request creation; the form no longer dereferences the submitted event after its asynchronous boundary. A separate HTTP fixture cleanup now revokes temporary management membership even when an earlier assertion fails.
- Versioned change requests, milestone delivery/acceptance, invoices, approved legal text and connected payment-provider evidence remain outside this slice. ADR 0022 records the commercial authority boundary.
- The final hermetic run passed 136 tests, 58 migrations, 153-table RLS verification, 40 applicable private browser journeys with four intentional skips, all 14 public journeys in development and optimized production, 2,526-row/15-object empty-target recovery, both builds, CSP/SRI, budgets and the 307-file publication scan. Lighthouse measured mobile 1.00/1.00 with 1,854 ms LCP and desktop 1.00/1.00 with 417 ms LCP.
- Full GitHub CI run 36263000293 and CodeQL run 36263000298 independently passed Slice 19 implementation commit `3d1bfe2`.

## Slice 20 local delivery-control evidence

- The accepted proposal now records its generated delivery project, removing inference from project names or caller input.
- Change requests are versioned and hash-bound. KXRA and the customer must separately accept the exact hash; relationship and capability are derived from current database authority.
- KXRA can submit versioned evidence only for a milestone key in the accepted proposal. The authorized customer can accept only the exact latest delivery hash.
- Customer-visible invoice records use deterministic integer arithmetic and remain explicitly separate from payment evidence. Customers cannot issue them.
- Five bounded APIs and a responsive delivery-lifecycle workspace expose change, decision, delivery, acceptance and invoice actions without broad table mutation rights.
- SQL and HTTP tests cover idempotency, dual-party state, wrong hashes, customer invoice forgery, milestone authority and cross-project RLS.
- The complete local run passed 136 tests, 59 migrations, 156-table RLS verification, 40 applicable private browser journeys with four intentional skips, all 14 public journeys in development and optimized production, 2,544-row/15-object empty-target recovery, both builds, CSP/SRI, budgets and the 309-file publication scan. Lighthouse measured mobile 1.00/1.00 with 1,857 ms LCP and desktop 1.00/1.00 with 417 ms LCP.
- Full GitHub CI run 36265534409 and CodeQL run 36265534451 independently passed Slice 20 implementation commit `1f37e51`.
- ADR 0023 records the exact bilateral evidence boundary. Accounting-provider reconciliation, invoice void/credit-note operations and approved customer terms remain release work.

## Slice 21 local invoice-adjustment evidence

- Issued invoices now carry an immutable hash over their exact commercial evidence.
- Owner-only void records preserve the original invoice and require its exact hash, an idempotency key, a reason and a controlled accounting reference. Credited invoices cannot be voided.
- Immutable credit notes serialize on the invoice and independently bound cumulative subtotal, tax and total. State becomes `PARTIALLY_CREDITED` or `CREDITED` without asserting a provider refund.
- Customer project members can read the adjustments through current project RLS; customers and unassigned users cannot create or discover them.
- Two bounded APIs and responsive owner controls expose void and credit actions while customers receive read-only evidence.
- SQL and HTTP tests cover wrong hashes, customer forgery, idempotent replay, tax/total over-credit, full credit, void-after-credit, credit-after-void and cross-project visibility.
- The complete local run passed 136 tests, 60 migrations, 158-table RLS verification, 40 applicable private browser journeys with four intentional skips, all 14 public journeys in development and optimized production, 2,553-row/15-object empty-target recovery, both builds, CSP/SRI, budgets and the 311-file publication scan. Lighthouse measured mobile 1.00/1.00 with 1,856 ms LCP and desktop 1.00/1.00 with 416 ms LCP.
- Full GitHub CI run 36267637479 and CodeQL run 36267637472 independently passed Slice 21 implementation commit `79c0de6`.
- ADR 0024 records the immutable adjustment boundary. Connected accounting/payment reconciliation, approved tax policy and approved customer terms remain release work.

## Slice 22 local customer-operations evidence

- Added one private Support & Privacy workspace for support, subscription cancellation/withdrawal and personal-data access, erasure or correction requests.
- Intake derives account and selected tenant from the verified database session and binds an immutable request hash plus client idempotency key. Subscription requests must reference a current subscription in the same tenant.
- Personal-data requests are visible only to their submitter and an authorized KXRA handler. Shared support/subscription cases may also be seen by a current organization administrator. Internal handling notes have a separate manager-only RLS policy.
- Owner transitions, customer replies and customer cancellation bind exact hash/version evidence. Exact retries return the first result; stale, conflicting, forged and crafted-ID actions fail closed.
- Request state never mutates Stripe, exports/deletes data or asserts a legal outcome. Those actions remain provider, identity-verification and counsel-controlled release work.
- Direct SQL, HTTP and browser tests cover anonymous denial, personal-request isolation, private notes, wrong hashes, stale versions, crafted IDs, exact replays, customer/manager boundaries and unchanged billing state.
- The complete local run passed 140 tests, 61 migrations, 161-table RLS verification, 41 applicable private browser journeys with five intentional skips, all 14 public journeys in development and optimized production, 2,573-row/15-object empty-target recovery, both builds, CSP/SRI and budgets; the final documentation-inclusive publication scan covers 317 files. Lighthouse measured mobile 1.00/1.00 with 1,856 ms LCP and desktop 1.00/1.00 with 416 ms LCP.
- The same run found and fixed an existing Brand Studio native-submit race by holding its first action until client hydration.
- Full GitHub CI run 36270668918 and CodeQL run 36270668932 independently passed Slice 22 implementation commit `154cc33`.
- ADR 0025 records the customer-service and privacy authority boundary. Approved legal/service policies, connected provider actions and external notifications remain release work.

## Slice 23 local Brand-source acquisition evidence

- Added one project-scoped RLS queue and a dedicated `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS` Brand-source worker role with claim/complete-only grants.
- Scheduling derives tenant, project, account, entitlement, website locator and exact current version from PostgreSQL. Exact retries reuse one request; forged, viewer, revoked, cross-project and stale targets fail closed.
- The worker validates every DNS answer and redirect, pins transport to a validated global address while preserving hostname TLS verification, requests identity encoding and bounds time, redirects, content type and streamed bytes.
- HTML active elements and markup are removed before bounded text enters a new immutable `EXTERNAL RESEARCH` source version. Existing approved profile evidence is never overwritten.
- Source changes cancel stale jobs. Leases, capped attempts, bounded failure codes and exact completion replay prevent silent duplicate evidence.
- SQL, HTTP, contract and desktop/mobile browser evidence covers the schedule, isolation, private-DNS denial, streaming limit, extraction and visible queue state. Hosted egress, worker secret custody and real-site behavior remain staging gates.
- The complete local run passed 144 tests, 62 migrations, 162-table RLS verification, 41 applicable private browser journeys with five intentional skips, all 14 public journeys in development and optimized production, 2,600-row/15-object recovery, both builds, CSP/SRI and size/Lighthouse budgets; the publication scan covers 324 files. Lighthouse measured mobile 1.00/1.00 with 1,856 ms LCP and desktop 1.00/1.00 with 417 ms LCP.
- GitHub full CI run 36272984825 and SHA-pinned CodeQL run 36272984827 passed Slice 23 implementation commit `650f69b83ffc38ba9102edea4f29b6fd6a66d36b`.
- ADR 0026, a threat model and a staging activation playbook record the boundary. The worker remains disabled and no external website was contacted.

## Slice 24 local Brand evidence-correction evidence

- Added one project-scoped RLS table that binds every human correction to the new immutable source version, exact predecessor, reason and idempotency key.
- An exact correction replay returns the same version; a different source, predecessor, reason or content hash conflicts. Viewer, revoked, anonymous and crafted cross-project writes fail.
- PostgreSQL computes source-lineage freshness. It rejects stale profile approval, campaign creation/approval, generation start/output and export creation without trusting browser or model state.
- Final download authorization repeats the lineage check. A prepared export is withheld with `SOURCE_EVIDENCE_CHANGED` and no content after its source changes.
- Desktop and mobile show current evidence text, provenance and correction reason, save corrections as new versions, mark affected profiles and remove stale profiles/campaigns from new consequential controls.
- The complete local run passed 146 tests, 63 migrations, 163-table RLS verification, 41 applicable private browser journeys with five intentional skips, all 14 public journeys in development and optimized production, 2,610-row/15-object recovery, both builds, CSP/SRI and size/Lighthouse budgets; the publication scan covers 327 files. Lighthouse measured mobile 1.00/1.00 with 1,856 ms LCP and desktop 1.00/1.00 with 416 ms LCP.
- GitHub full CI run 36275125302 and SHA-pinned CodeQL run 36275125295 passed Slice 24 implementation commit `acad98d6f5015ea1411a83e62196332d8a1ee2e3`.
- ADR 0027 and the updated Brand Studio threat model record the correction and stale-evidence boundary. No external website, credential, model, message, deployment or publication was used.

## Slice 25 local transactional-email evidence

- Production invitation and resend paths seal one-time links with AES-256-GCM under a worker-only key; the database stores ciphertext, nonce, authentication tag and the exact token digest, never the plaintext link.
- `kxra_email_worker` is no-login, no-inherit and no-bypass. Browser, authenticated and anonymous roles cannot claim, authorize, complete or reconcile email delivery.
- Claim and final authorization recheck invitation state, expiry, delivery version and digest. Revocation after claim cancels before provider delivery.
- Resend requests use the immutable outbox operation key for provider idempotency. Retries are bounded; permanent outcomes stop; uncertain transport enters `RECONCILIATION_REQUIRED` without blind resend.
- Raw-body webhook verification binds event ID, timestamp, signature and bytes before parsing. Provider event IDs replay exactly and provider message IDs are unique; delivery, delay, bounce, complaint, failure and suppression remain durable.
- The acceptance loop found and fixed a provider-message uniqueness gap, blocked token replacement while delivery is uncertain and removed fixture-detection code from the production webhook artifact. The final clean run passed 153 tests, the 64-migration/165-table audit, 41 applicable private browser journeys with five intentional skips, all 14 public journeys in development and optimized production, 2,633-row/15-object recovery, both builds, CSP/SRI and size/Lighthouse budgets; the publication scan covers 335 files.
- Implementation commit `3f226b9dfacbb7c05cb8496278e75f96c3db72f2` passed GitHub full CI run 36277965380 and SHA-pinned CodeQL run 36277965401.
- ADR 0028, the threat model and staging playbook retain `KXRA_EMAIL_ENABLED=false`. No provider credential, real recipient, external send, deployment or publication was used.

## Slice 26 local Stripe reconciliation evidence

- Raw-body Stripe HMAC verification runs before parsing. Only the five subscription lifecycle event types are normalized; unsupported signed events are acknowledged without mutation.
- A dedicated `kxra_billing_worker` is no-login, no-inherit and no-bypass and may execute one private reconciliation function. Browser, authenticated, anonymous and model roles cannot apply provider state.
- Tenant and plan authority come only from existing provider-customer and active TEST price-reference mappings. Stripe metadata, client bodies and model output cannot choose an organization, plan or entitlement.
- All eight documented subscription states are normalized. Only `ACTIVE` and `TRIALING` create effective entitlement periods; past-due, incomplete, expired, paused, cancelled and unpaid states close access because no grace policy is approved.
- Exact replay is stable, changed replay fails, older events are ignored and missing customer/price references fail durably without access. An exact failed event can recover after its missing mapping is reviewed and installed.
- The acceptance loop found and fixed the administrative protected-table count after migration `0065`. The final clean run passed 159 tests, the 65-migration/166-table audit, 41 applicable private browser journeys with five intentional skips, all 14 public journeys in development and optimized production, 2,697-row/15-object recovery, both builds, CSP/SRI and size/Lighthouse budgets; the publication scan covers 342 files.
- ADR 0029, the Stripe threat model and staging playbook retain `KXRA_BILLING_ENABLED=false`. No Stripe credential, provider call, checkout, portal, charge, refund, cancellation, deployment or publication was used.

## Publication boundary

Only application code, engineering documentation and minimum classified seed records required by the platform may enter the repository. Original Word/text sources, private Genesis research, the private business pack, archives, `.runtime`, credentials, screenshots, traces, databases/object backups and generated test artifacts remain excluded.
