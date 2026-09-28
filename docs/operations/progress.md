# KXRA OS implementation progress

Updated: 28 September 2026. Status: **Core hosted staging is connected and fail-closed. Browser-independent password recovery is deployed at `ea3372e`, its exact Supabase redirect is saved and the new page is verified live. Post-deployment requests at 23:45 and the owner-authorized retry at 23:52 reached Supabase but were rejected by the fixed two-emails-per-hour provider limit. Retry exactly once after 00:21 BST. Owner TOTP completion, hosted acceptance, WAF evidence and production legal/commercial inputs remain incomplete.**

## Hosted staging connection checkpoint

- Supabase project `KXRA Staging` (`jlebgsxcvhvpueuibekd`) is active and healthy in `eu-west-2` on PostgreSQL 17. All 69 reviewed migrations verify, including 171 protected tables and 146 KXRA functions. The canonical profile verifies exactly seven projects and 126 classified source records with no local fixture identities, legal activation, product, entitlement, billing or provider state.
- Exact `LOGIN`, `NOINHERIT`, `NOBYPASSRLS` roles `kxra_app` and `kxra_public_ingress` verify with only their bounded memberships, no object ownership and no direct grants. Distinct generated passwords were written directly to their matching Vercel Preview projects and discarded; no credential entered source, documentation or chat.
- Vercel projects `kxra-os-staging` (`apps/os`) and `kxra-marketing-staging` (`apps/marketing`) use the exact fail-closed preflight/build command, include required monorepo source and deploy only the phase branch as Preview. Both commit-`93c116e` deployments are Ready behind Vercel deployment protection.
- Hosted smoke evidence: private `/login` returns 200; anonymous `/api/context` returns 401 with `AUTH_REQUIRED`; marketing `/` returns 200 and contains the approved KXRA identity and public email. The official Supabase CA is transported as Base64, decoded and validated at runtime, and every database connection retains full certificate and hostname verification.
- Supabase Auth uses the exact private phase-branch origin, disables public signup, keeps email confirmation on, enables TOTP and limits initial AAL1 sessions to 15 minutes. The owner Auth identity and matching guarded KXRA owner record exist. The exact `/reset-password` redirect is saved; obsolete callback/verify entries remain until deletion is separately confirmed.
- The validated Base64 CA secret is now the only database CA setting in either Vercel Preview project. Temporary local setup files were removed after verification.
- Browser-independent recovery commit `f46d2a3`, documented and deployed through `ea3372e`, replaces browser-bound PKCE recovery with an implicit recovery link whose tokens stay in the fragment until an explicit password submission. The server verifies the token, subject and newest recent `recovery` AMR before changing the password, checks KXRA account state, records the event and globally signs out. The general Auth callback can no longer grant reset authority.
- The deployed page was verified at the stable Preview alias. Requests at 23:45:15 and 23:52:09 reached `/auth/v1/recover`; both received `429: email rate limit exceeded`. Supabase confirms its default service allows two emails per hour; the successful earlier sends were at 23:15 and 23:20. Retry exactly once after 00:21 BST, then inspect the Auth log for `200` before using the newest message. The current newest inbox message remains the obsolete 23:20 callback email and must not be used.
- Owner Auth record bootstrap has occurred, but first successful password establishment and TOTP enrollment have not. Hosted owner/partner/RLS acceptance, the exact WAF rule and release evidence remain pending behind that identity gate.

Current branch: `codex/phase-2-completion`. Recovery implementation and handover commit `ea3372e` is pushed and deployed on the private Preview. Slice 36 baseline commit `0da4349ae464135d1464d47f784cbab17395d37b` passed GitHub CI run 36300068294 and SHA-matched CodeQL run 36300068314. The branch is not merged. No default-branch change, production deployment, provider activation, charge, candidate-code execution or publication occurred; the authorized recovery email attempt was provider-rate-limited before delivery.

The cumulative contract remains [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md), the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md), the [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) and the private Genesis source. Later requirements supplement earlier requirements. Executable status is recorded in [acceptance evidence](acceptance-evidence.md).

## Completed in Slice 37

- Reproduced the hosted reset failure and identified the browser-bound PKCE verifier as the reason links opened from email returned to sign-in.
- Added a browser-independent implicit recovery flow. Recovery credentials remain in the browser fragment, are removed from browser history immediately and are submitted only with the new password over the same-origin private API.
- Added fail-closed server verification of the Supabase user, signed JWT subject and newest recent `recovery` AMR before KXRA account-state validation and provider password change.
- Removed password-reset authority from the general Auth callback and retained the exact join-only callback allowlist.
- Passed 198 database/domain/HTTP/security tests, 69 migrations and 171 protected-table checks, 48 private browser scenarios, both 14-scenario marketing runs, restart/restore, both builds, CSP/SRI, artifact and 390-file secret scans, and optimized Lighthouse budgets in one hermetic run.

## Completed in Slice 36

- Replaced the permissive release-manifest check with an exact six-document legal set and immutable approved-version/hash verification.
- Added typed commercial checks for plan/price/usage, separate custom projects, cancellation/refund/grace/tax policies, retention, subprocessors and public-copy integrity.
- Required five named staging evidence classes plus named human accessibility and security reviews before readiness can pass.
- Added validated support, privacy and security contacts and exact owner/review requirements.
- Exposed the latest release state and blocker codes in the owner-only redacted Admin view without adding deployment, publication or provider authority.

## Completed in Slice 35

- Added plan/run staging acceptance commands that require a clean, pushed phase branch, exact deployed SHA, two distinct staging/Preview HTTPS origins and an exact confirmation phrase.
- Added 18 no-redirect anonymous probes covering the private login/API boundary, required public pages, public-to-private login redirect and absence of private APIs on marketing.
- Added fail-closed status/type, CSP, HSTS, frame/referrer/permissions, private no-store, staging no-index, CORS and known fixture/private-marker checks.
- Added redacted durable JSON evidence containing only origins, commit, timestamps, bounded status/byte/hash outcomes and generic findings. Bodies, cookies, tokens and the optional Vercel bypass value are never retained.
- Added focused positive and adversarial tests plus ADR 0038 and exact staging operator instructions.

## Completed in Slice 34

- Added append-only, exact-version score assessments for all ten weighted Genesis factors, with accepted project evidence, rationale and optional four-part confidence evidence per factor.
- Added deterministic database calculation of coverage and lower/upper bounds. Venture Score remains null below full coverage; Confidence Score also requires complete confidence evidence and is explicitly not a probability.
- Added complete hash-bound owner approval, recent-AAL2 decision/execution, stale project/evidence rejection, replay denial and superseded assessment history.
- Added owner assessment controls and project score history. Assigned partners can read applied project results without access to requested assessments or owner approval envelopes.
- Added SQL, HTTP and browser tests for partial/full calculation, isolation, crafted evidence, malformed confidence, stale state, direct DML denial and honest unknown-score presentation.

## Completed in Slice 33

- Added a server-derived Supabase assurance gate after hosted password sign-in and an independent application-actor AAL2 gate for enrolled hosted identities.
- Added a dedicated hosted TOTP challenge page and server action. The browser supplies only the six-digit code; exact factor selection, user identity and authorization remain server/provider derived.
- Added exact callback destinations and a signed HttpOnly ten-minute recovery intent bound to the verified Supabase subject.
- Completed hosted password change, KXRA account-state check, intent consumption, auditable partial-failure handling and provider global sign-out.
- Added direct policy/tamper/expiry/identity/factor tests, ADR 0036, threat-model controls and a staging sign-in/recovery acceptance sequence.

## Completed in Slice 8

- Added independent `apps/marketing` and separate production build with every current and preserved public route.
- Added an exact SHA-256-bound `REVIEW_REQUIRED` public snapshot. Publication, indexing and legal activation remain disabled.
- Added original semantic layered storytelling with desktop depth, mobile recomposition, reduced-motion, 320 px, 200% text and no-JavaScript fallbacks.
- Added contact, enquiry and custom-project forms with exact-origin/schema/body checks, honeypot discard, HMAC request digests, idempotency, daily duplicate suppression and transactional hourly rate limiting.
- Added owner-only `UNVERIFIED` public enquiry records, audit events and a private Idea Inbox view. Anonymous and partner reads remain empty under RLS.
- Added public/private source and artifact scanners, ADR 0015, a public-site threat model and staging/release playbook.

## Cumulative verified implementation

- Next.js 15 / React 19 / TypeScript with PostgreSQL as authorization and state authority.
- 69 ordered additive migrations, 171 RLS-protected tables with explicit policies and 146 audited public functions.
- 198 database/domain/HTTP/security tests, 48 private-OS browser scenarios (43 passes/five intentional skips) and 14 public-site browser scenarios under both development and optimized production.
- Database/private-object restart and 2,710-row/15-object empty-target recovery, both optimized production builds, exact-hash/SRI CSP, compressed page-asset and Lighthouse budgets, exact snapshot/source-boundary checks, 21-marker artifact exclusion and a 390-file publication/secret scan pass.
- Invitation/account lifecycle, selected-tenant legal gate, owner control plane, seven venture workspaces, file/knowledge lifecycle, permission-safe local Ask/AI execution, deterministic commercial/custom-project foundations and Brand Studio remain green in one hermetic run.

Definitions, schemas, disabled controls and local provider doubles are not counted as connected capabilities.

## Acceptance status for this slice

- **AT-47 PASS locally:** exact current accepted evidence, deterministic partial bounds, complete-score calculation, owner recent-AAL2 approval/execution, supersession and owner/partner/viewer/revoked/anonymous isolation pass at SQL, HTTP and browser layers.
- **AT-17 PASS locally:** applications build independently; required routes use one exact snapshot; private-source/marker scans pass; publication remains disabled.
- **AT-26 PASS locally:** all three forms validate, bot-check, deduplicate, rate-limit and store one owner-only unverified audited row; `/login` targets the private app.
- **AT-44 PASS locally:** desktop/mobile, reduced motion, 320 px, 200% text, keyboard, no-JavaScript, representative browser accessibility-tree and optimized local Lighthouse scenarios pass. Real-user field vitals and human assistive-technology review remain release checks.
- **AT-45 PARTIAL / local boundary PASS:** source and both build artifacts exclude planted private markers. Hosted RSC/prefetch/cache/error isolation remains unverified.

## Remaining work

### Partial

- Brand Studio: local address-pinned source refresh, append-only correction and stale-lineage gates are implemented; hosted worker/egress evidence, media generation, sector claim policies and publication remain absent.
- Identity/legal: guarded owner preparation, hosted TOTP sign-in enforcement and subject-bound recovery/session adapters are implemented locally; executing the real Supabase owner/MFA/recovery/pooler path and solicitor-approved legal content remain unverified.
- Commercial: test-mode customer bootstrap, Checkout, Portal and subscription reconciliation are staging-ready but disabled; Stripe products/prices, live mode and approved billing policies remain disconnected.
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

Create and confirm the single Supabase owner Auth identity, enroll and verify its KXRA TOTP factor, then run the guarded owner plan/apply/verify and hosted acceptance sequences. After that, configure and evidence the exact Vercel WAF rule and hosted owner/partner/RLS behavior. Keep production deployment, customer access and publication disabled.

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

## Slice 27 local hosted billing evidence

- Customer administrators can request Stripe-hosted test Checkout and Portal sessions from Business Tools only after current identity, selected-tenant, onboarding, legal and organization-admin checks pass.
- PostgreSQL derives the existing Stripe customer and active TEST price. Browser/model input cannot choose customer, tenant, amount, currency, redirect URL or entitlement.
- An organization advisory lock and durable intent reuse one open provider operation and idempotency key. Unresolved requests older than 23 hours require reconciliation.
- The adapter uses fixed Stripe endpoints, rejects redirects/live keys/live responses, pins API version, streams at most 100 KB and validates exact Checkout/Portal response types and hosts.
- The restricted billing worker records the session before its short-lived URL is delivered. A Checkout return grants no access; signed subscription reconciliation remains the only paid-entitlement authority.
- The clean hermetic run passed 162 tests, 66 migrations, the 167-table RLS audit, 41 applicable private browser journeys, all public journeys in both runtime modes, 2,697-row/15-object recovery, both builds, CSP/SRI, size and Lighthouse budgets.
- Implementation commit `dbbe921e87e157cd637edba40089abbdf3fd7e3c` passed GitHub full CI run 36282404005 and SHA-matched CodeQL run 36282404016.
- Billing remains disabled. No real Stripe credential, provider request, session, charge, refund, cancellation, deployment or publication was used.

## Slice 28 local Stripe customer-bootstrap evidence

- A current customer-organization administrator can create the organization's one test billing customer from Business Tools after identity, selected-tenant, onboarding and legal checks pass.
- The request body carries only a UUID. PostgreSQL derives organization, requester and organization name, serializes attempts and persists one provider idempotency key before network activity.
- The adapter calls only Stripe's fixed Customer endpoint with the test key and pinned API version. It sends no email, address, payment method, plan, price or browser-selected authority and strictly validates the returned test customer and correlation metadata.
- The no-login/no-bypass billing worker records the provider ID and unique organization mapping before Checkout is enabled. Ordinary members, anonymous users, another tenant and direct table writes remain denied.
- Final inspection found and fixed a lost-response replay defect: after the worker records the customer, an exact or new client retry now returns the completed intent instead of reporting a conflicting existing customer.
- The clean hermetic run passed 164 tests, 67 migrations, the 168-table RLS audit, 41 applicable private browser journeys, all 14 public journeys in both runtime modes, 2,697-row/15-object recovery, both builds, CSP/SRI, size and Lighthouse budgets; the publication scan covers 349 files.
- Implementation commit `4be3b23f9b816f11c52bcd84f83746e1795b7bce` passed GitHub full CI run 36284168922 and SHA-matched CodeQL run 36284168938.
- Billing remains disabled. No real Stripe credential, provider request, customer, charge, subscription, deployment or publication was used.

## Slice 29 local staging-migration evidence

- Added `plan`, `apply` and `verify` operator commands for the first separately authorized Supabase staging database. The tool accepts only the declared 20-character project, direct or session-pooler port 5432, the `postgres` operator identity and certificate-verified TLS.
- Every one of the 69 ordered migrations is SHA-256 bound. Unknown history, a changed historical file, an unmanaged existing `kxra` schema, source-count drift, a dirty/unpushed branch, Vercel execution or the wrong confirmation phrase fails before mutation.
- Apply uses a session advisory lock, recalculates pending work after acquiring it, commits each migration with its tracking row and resumes from the exact recorded prefix. Anonymous and authenticated application roles receive no access to migration history.
- Verification requires all hashes plus exactly 171 RLS-protected tables with policies and 146 `kxra` functions. Operator-only values are rejected from hosted application profiles.
- The clean hermetic run passed 168 tests, 67 migrations, the 168-table RLS audit, 41 applicable private browser journeys, all 14 public journeys in both runtime modes, 2,697-row/15-object recovery, both builds, CSP/SRI, size and Lighthouse budgets; the publication scan covers 354 files.
- Implementation commit `eeb446ad352891a75f32b0cf42511f287fdedcc5` passed GitHub full CI run 36286028336 and SHA-matched CodeQL run 36286028353.
- ADR 0032, a staging-migration threat model and the exact operator playbook record the boundary. No credential was stored and no hosted database, provider, deployment or publication was touched.

## Slice 30 local canonical-seed evidence

- Added a separate `KXRA-CANONICAL-SEEDS-V1` staging profile bound to every included register file and the clean, pushed phase branch. It runs only after all 67 migration hashes pass.
- The profile imports the fixed KXRA organization, seven source-backed project records, generated project gates/modules and classified operating records. It returns before local fixture identities, legal placeholders, AI/model/budget approvals, routine services, entitlements, active products, billing or provider state.
- Plan/apply/verify use a separate exact confirmation, reject unmanaged data, changed or unknown profiles and content/provenance drift, recalculate state under an advisory lock and commit the import with its tracking row atomically.
- A fresh-database integration test applies the profile twice and proves seven projects plus records exist while 13 sensitive fixture/executable tables remain empty.
- The clean hermetic run passed 172 tests, 67 migrations, the 168-table RLS audit, 41 applicable private browser journeys, all 14 public journeys in both runtime modes, 2,697-row/15-object recovery, both builds, CSP/SRI, size and Lighthouse budgets; the publication scan covers 359 files.
- Implementation commit `12e7704d08cdedd2990efa0112f560e270933b98` passed GitHub full CI run 36287286378 and SHA-matched CodeQL run 36287286351.
- ADR 0033 and the staging seed threat model preserve owner bootstrap, runtime roles, legal approval, product activation and providers as separate steps. No hosted database or credential was used.

## Slice 31 local restricted-runtime-role evidence

- Added a guarded `KXRA-RUNTIME-ROLES-V1` operator after exact canonical-seed verification. It requires the clean pushed phase branch, exact Supabase target, distinct 48–128-character apply-only secrets and a separate confirmation phrase.
- `kxra_app` is an exact `LOGIN`, `NOINHERIT`, `NOBYPASSRLS` role with only `anon` and `authenticated` membership and a 20-connection limit. `kxra_public_ingress` has only `anon` membership and a five-connection limit.
- Apply forces SCRAM-SHA-256 passwords, removes stale bounded memberships before granting them without admin option, clears role settings and refuses takeover if either role owns objects, has direct grants or carries an unknown membership.
- Hosted application preflight now requires the exact login for each application and rejects every operator-only value. Public ingress explicitly selects `anon` inside every transaction in local and hosted execution.
- The clean hermetic run passed 175 tests, 67 migrations, the 168-table RLS audit, 41 applicable private browser journeys, all 14 public journeys in both runtime modes, 2,697-row/15-object recovery, both builds, CSP/SRI, size and Lighthouse budgets; the publication scan covers 364 files.
- Implementation commit `3204078d4dd1d9114e464900c1d4b835866d0c58` passed GitHub full CI run 36289096748 and SHA-matched CodeQL run 36289096738.
- ADR 0034 and the staging runtime-role threat model record the boundary. No runtime credential was generated, stored or used against a hosted database.

## Slice 32 local guarded-owner and hosted-MFA evidence

- Replaced the legacy manual owner SQL with a fail-closed pointer to a guarded `plan`/`apply`/`verify` operator. It requires the exact Supabase project/operator, clean pushed phase branch, canonical seed hash, restricted runtime roles, confirmed Auth UUID/email and an apply-only confirmation.
- Preparation creates one exact active KXRA owner and a non-secret tracking event, rejects any other owner plus partial/conflicting state, and records MFA truthfully as absent or verified. Final verification requires the exact verified provider factor and matching normalized/legacy owner state.
- Hosted Profile controls now use Supabase TOTP enrollment, factor listing, challenge-and-verify and unenrollment. Interrupted KXRA factors can be restarted without accumulating stale factors; QR/manual secrets remain transient and owner factor removal is blocked pending a reviewed recovery process.
- Recent owner authority derives from the signed `aal2` TOTP authentication-method timestamp. Initial password time, absent AMR and malformed provider responses fail closed. Global sign-out must succeed at Supabase before KXRA records provider-confirmed revocation.
- The clean hermetic run passed 184 tests, 67 migrations, the 168-table RLS audit, 41 applicable private browser journeys, all 14 public journeys in both runtime modes, 2,697-row/15-object recovery, both builds, CSP/SRI, size and Lighthouse budgets; the publication scan covers 371 files.
- Implementation commit `f55edff5f2f3151f55ebe75d28e9935a5979f5d7` passed GitHub full CI run 36291392558 and SHA-matched CodeQL run 36291392562.
- ADR 0035, the owner/Auth threat model and exact staging playbook record the bounded pre-MFA preparation window and final verification requirement. No real identity, credential, factor, hosted database, deployment or publication was used.

## Hosted owner preparation and sign-in TLS repair

- The single staging Supabase Auth identity for `husainkara@hotmail.co.uk` is confirmed as UUID `0d7ff2e1-3d1d-4063-a278-7213a672385c`. The guarded owner bootstrap prepared the matching active KXRA owner record. TOTP enrollment and final owner verification remain pending.
- Staging sign-in initially failed before Supabase Auth because the PostgreSQL client parsed `sslmode=require` from `DATABASE_URL` after the explicit TLS options and silently replaced the verified CA configuration.
- Hosted TLS now removes URL-level SSL controls before constructing the pool and supplies the current Supabase project CA plus Node trust roots with `rejectUnauthorized: true`. Credentials and non-SSL connection options remain unchanged.
- A regression test proves a connection URL cannot override the verified certificate object. Safe failure diagnostics expose only host, port, certificate size, hash, subject and fingerprint on the exact TLS-chain error; they never expose connection credentials, certificate content or sign-in input.
- Vercel Preview commit `54168e3` is Ready at the stable phase-branch alias. A disposable invalid identity passed the database rate-limit boundary and reached Supabase Auth, which returned `invalid_credentials`; this proves the previous secure-service failure is repaired without using the owner's password. Commit `4c71384` also makes every invalid-password, suspended and revoked sign-in return the same non-disclosing credentials result.
- The final clean hermetic run passes all 199 database/domain/HTTP/security tests, the 69-migration/171-table RLS audit, 43 applicable private browser journeys with five intentional skips, all 14 public journeys in development and optimized production, database/private-object restart, a 2,710-row/15-object empty-target restore, both builds, CSP/SRI, build budgets, artifact exclusion, a 389-file publication/secret scan and optimized Lighthouse budgets. A real owner login, TOTP enrollment, guarded final verification and hosted owner/partner isolation acceptance remain the next checkpoint.

## Publication boundary

Only application code, engineering documentation and minimum classified seed records required by the platform may enter the repository. Original Word/text sources, private Genesis research, the private business pack, archives, `.runtime`, credentials, screenshots, traces, databases/object backups and generated test artifacts remain excluded.
