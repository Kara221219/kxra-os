# KXRA OS implementation progress

Updated: 30 September 2026. Status: **Core hosted staging is connected and fail-closed. Supabase now verifies all 74 reviewed migrations, 172 RLS-protected tables, 146 exposed KXRA functions and the canonical twelve-project portfolio. The immutable seven-project `KXRA-CANONICAL-SEEDS-V1` history is preserved and the expanded `V2` import is separately hash-bound. Projects 008–012 have classified source records, discovery workspaces, assumptions, experiments, blockers, risks and exact evidence gates. Production legal/commercial inputs, remaining provider acceptance, full immersive public-site implementation, WAF evidence and production release remain incomplete.**

## Hosted twelve-project staging checkpoint

- Guarded staging migration plan/apply/verify completed against Supabase project `jlebgsxcvhvpueuibekd`; migration 0074 is present and the hosted schema verifies 74 migrations, 172 protected tables and 146 exposed `kxra` functions. Migration 0074 also adds two internal `kxra_private` functions, which are deliberately excluded from the exposed-function count.
- The seed operator found the exact immutable seven-project `KXRA-CANONICAL-SEEDS-V1` history. Commit `dd892636d78d7df3c747fdc8c198bd9177487b55` introduced `KXRA-CANONICAL-SEEDS-V2`, verifies the exact V1 predecessor hash, rejects altered or unknown history and records V2 separately rather than rewriting V1.
- The guarded seed plan/apply/verify completed and proved the canonical twelve-project portfolio plus exact classified records, modules and gates. Fixture identities, active legal documents, products, entitlements, billing and provider authority remain excluded.
- The exact pushed commit passed local hermetic CI: 219 core tests, 74-migration/172-table verification, 43 applicable private browser journeys with five intentional skips, 14 public journeys in both runs, restart persistence, a 3,014-row/15-object empty-target restore, all three optimized builds, CSP/SRI, budgets, artifact and 426-file secret scans, and Lighthouse 1.00 performance/accessibility for both measured routes.
- GitHub CodeQL run `36768006957` and full CI run `36768007053` passed at the exact V2 commit. The matching OS, marketing and isolated email-worker Vercel Preview deployments are all Ready at their stable phase-branch aliases. Production and `main` remain untouched.

## Five-venture intake and immersive-site completion brief

- Added PROJECT-008 KXRA Wall Printing, PROJECT-009 KXRA Signature Stays Manchester, PROJECT-010 KXRA Clear Aligner Dental Venture, PROJECT-011 KXRA Online Product Commerce and PROJECT-012 KXRA Auto AI Sales Assistant. The wall-printing idea is preserved as the owner described it; no earlier canonical project record or project number was found, so it receives PROJECT-008 without overwriting another venture.
- Every venture has an evidence-labelled source set, assumption, blocker, qualitative risk, demand/feasibility experiment, 18 common modules, eight specialist modules and one project-specific gate. Scores and budgets remain unknown. No partner is assigned and no venture is live or public.
- Migration `0074_add_venture_intake_projects.sql` provisions the specialist workspaces and gates during the canonical seed transaction. It adds no purchasing, property-listing, booking, clinical, commerce, dealer-message, financial or publication executor.
- Added ADR 0042 and the self-contained `KXRA-VENTURES-AND-IMMERSIVE-WEBSITE-COMPLETION-BRIEF.md`. The brief replaces the supplied AI Builders wording with KXRA's own journey through Portfolio, Property, Health, Commerce, Mobility, Media/Technology and the governed operating core. It requires real evidence, progressive enhancement, reduced motion, accessible HTML, strict performance budgets and no invented metrics, testimonials or client claims.
- Added the official `@higgsfield/client` and a server-only Seedance 2.5 text-to-video example using the required prompt, five-second duration, 720p and 16:9. Missing credentials and missing exact billable confirmation both fail before network access. No key was read or stored and no billable generation was made.
- The implementation loop corrected stale seven-project counts and the Portfolio acceptance journey now verifies ten rows on page one, two on page two and the four-venture VALIDATION filter.
- The final disposable run passes 219 database/domain/HTTP/security tests, 74 migrations, 172 protected-table checks, 43 applicable private browser journeys with five intentional skips, both 14-journey marketing runs, restart persistence, a 3,014-row/15-object empty-target restore, all three optimized builds, CSP/SRI, build budgets, artifact exclusion, a 426-file publication/secret scan and optimized Lighthouse budgets.
- Hosted staging remains on migration 0073 and its earlier seven-project seed until migration 0074 and the revised canonical seed are applied through the guarded operator. Production and main remain untouched.

## Mandatory NDA parked

- The owner decided that signup, onboarding and current private access do not require an NDA. The legal-document and immutable evidence capability remains available for a later approved agreement.
- Migration `0073_park_mandatory_nda.sql` retires active NDA requirements, makes the legacy NDA optional, ignores unapproved placeholders and permits onboarding when there are zero active approved agreements.
- The Access Review UI states that no agreement is required. It continues to require exact acceptance if KXRA later activates an approved required agreement.
- The release manifest now requires approved Terms, Privacy, Cookie, Data Processing and Custom Project documents. NDA is parked rather than deleted.
- Project membership, PostgreSQL RLS, tenant isolation, MFA and retrieval authorization are unchanged.
- The clean hermetic contract passes 219 database/domain/HTTP/security tests, 73 migrations, 172 protected-table checks, 43 applicable private browser journeys with five intentional skips, all 14 marketing journeys in development and production, restart/restore, all three optimized builds, CSP/SRI, build budgets, artifact exclusion, a 417-file publication/secret scan and optimized Lighthouse budgets.
- Commit `3d7d10e0889809ac3c371cd5f272297320971b5a` is pushed and deployed Ready on the private Preview. GitHub CI run `36640690948` and CodeQL run `36640690992` pass at that exact SHA. Supabase records migration 0073 with hash prefix `f9b5798e4f4e` and source-commit prefix `3d7d10e08898`; the owner workspace loads successfully against the migrated database.

## Invited identity continuation recovery

- Added migration `0072_resume_invited_identity.sql` and a `/join/finish` fallback for a verified invited identity whose short browser join intent expires during email verification or password recovery.
- The fallback requires no existing KXRA profile, exactly one active unredeemed invitation for the verified provider email and a consumed one-use Auth signup challenge for that invitation. It reuses the existing audited profile registration and invitation redemption functions; it cannot select roles or projects and is unavailable to anonymous users.
- Focused tests prove denial for anonymous, unverified and wrong-email identities, denial on replay, successful recovery after invitation delivery-token rotation, and exact single-project scope. Type checking, migration manifest checks, formatting and the optimized OS build pass. Hosted migration 0072 is hash-bound to commit `8140b70`; its authenticated-only grant and anonymous/public denial verify. The invited staging identity resumed successfully into onboarding with one active PARTNER/ORG_MEMBER organisation membership and exactly PROJECT-002 viewer access.
- The real onboarding journey reached Step 8 and confirmed that hosted staging contains zero approved required agreements. ADR 0041 supersedes the earlier hard stop: after migration 0073, the user may complete Access Review without an NDA.

## Invitation-only hosted registration repair

- Confirmed from the hosted Auth event and application path that the invitation was current and the account form worked, but Supabase rejected `/signup` because provider signup was disabled.
- Added a five-minute one-use challenge bound to the active invitation email and current token digest. The browser receives no database or privileged Auth credential; only the challenge digest is stored.
- Added a `security invoker` Before User Created hook with narrow `supabase_auth_admin` grants. Missing, wrong-email, replayed, expired, revoked and token-rotated challenges fail with the same generic response.
- Kept profile, organisation, role and project authority in the existing PostgreSQL invitation redemption path. Signup metadata cannot grant KXRA access.
- Added complete RLS-matrix coverage for the signup challenge table and clean-schema verification for 71 migrations, 172 protected tables and 146 public-schema functions.
- The final hermetic contract passes 215 database/domain/HTTP/security tests, 43 applicable private browser journeys with five intentional skips, all 14 marketing journeys in development and optimized production, restart/restore, all three builds, CSP/SRI, build budgets, artifact exclusion, a 412-file publication/secret scan and optimized Lighthouse budgets.
- Hosted activation must occur in this order: apply migration 0070, configure `kxra_private.before_user_created`, enable email signup, prove direct signup denial, then retry the existing controlled invitation.

## Transactional email staging checkpoint

- `mail.kxra-group.com` is verified in Resend. DNS was added without changing the existing root mail service or optional DMARC policy. A sending-only Resend key is restricted to that domain and stored only in the email-worker Vercel Preview environment.
- Vercel project `kxra-email-worker-staging` is connected to `apps/email-worker`. Its database URL, email encryption key, trigger secret, Supabase CA and Resend key are stored as secrets only for `codex/phase-2-completion`; its staging profile, origin, sender and enablement settings use the same branch-only scope. The OS Preview holds only the shared email encryption key and email capability settings. Marketing has none of these values.
- Supabase role `kxra_email_runner` verifies with `LOGIN`, `NOINHERIT`, `NOBYPASSRLS`, connection limit three, only the no-login `kxra_email_worker` membership, no admin option, no ownership and no direct grants. The operator event table has RLS enabled and all seven hosted verification checks passed.
- Commit `49ddc9e31ec3671823deffdbb6b87a9093460118` deployed Ready Preview builds for both `kxra-email-worker-staging` and `kxra-os-staging`. The Resend webhook now terminates in the isolated email worker; the OS retains invitation encryption authority but has no Resend sending or webhook credential.
- Resend webhook `455effca-0df1-444f-aff7-84c164237fb0` is registered for delivered, delayed, bounced, complained, failed and suppressed events. Its signing secret exists only in the worker's branch-scoped Preview environment. The worker-specific Vercel automation bypass permits this third-party callback while Preview protection remains enabled; KXRA's raw-body provider signature verification is still mandatory.
- Sanitized live probes reached the deployed KXRA worker and failed closed as designed: `GET /api/webhooks/resend` returned `405`, an unsigned webhook `POST` returned `400`, and an unauthenticated bodyless `POST /api/process` returned `401`.
- One explicitly authorized controlled PROJECT-002 viewer invitation to `h***@icloud.com` completed through the restricted worker. The first diagnostic calls failed before claim while exposing only bounded codes; the root cause was `pg` allowing URL `sslmode` to override the verified CA object. Commit `7a1ec10` strips connection-string SSL options and retains full CA/hostname verification. The final invocation returned `200` with one `SENT` result; the signed Resend webhook then moved the row to `DELIVERED`. PostgreSQL records exactly one attempt, one provider message identifier, one provider event and no delivery error.
- Earlier unencrypted pending delivery was cancelled when the owner created delivery version 2. The active version had an encrypted secret, an unexpired invitation, matching delivery versions and a token digest matching the encrypted-secret digest before dispatch. Replay denial, invitation revocation and post-acceptance trigger/key rotation evidence remain pending.

## Hosted staging connection checkpoint

- Supabase project `KXRA Staging` (`jlebgsxcvhvpueuibekd`) is active and healthy in `eu-west-2` on PostgreSQL 17. All 69 reviewed migrations verify, including 171 protected tables and 146 KXRA functions. The canonical profile verifies exactly seven projects and 126 classified source records with no local fixture identities, legal activation, product, entitlement, billing or provider state.
- Exact `LOGIN`, `NOINHERIT`, `NOBYPASSRLS` roles `kxra_app` and `kxra_public_ingress` verify with only their bounded memberships, no object ownership and no direct grants. Distinct generated passwords were written directly to their matching Vercel Preview projects and discarded; no credential entered source, documentation or chat.
- Vercel projects `kxra-os-staging` (`apps/os`) and `kxra-marketing-staging` (`apps/marketing`) use the exact fail-closed preflight/build command, include required monorepo source and deploy only the phase branch as Preview. Both commit-`93c116e` deployments are Ready behind Vercel deployment protection.
- Hosted smoke evidence: private `/login` returns 200; anonymous `/api/context` returns 401 with `AUTH_REQUIRED`; marketing `/` returns 200 and contains the approved KXRA identity and public email. The official Supabase CA is transported as Base64, decoded and validated at runtime, and every database connection retains full certificate and hostname verification.
- Supabase Auth uses the exact private phase-branch origin, disables public signup, keeps email confirmation on, enables TOTP and limits initial AAL1 sessions to 15 minutes. The owner Auth identity and matching guarded KXRA owner record exist. The exact `/reset-password` redirect is saved; obsolete callback/verify entries remain until deletion is separately confirmed.
- The validated Base64 CA secret is now the only database CA setting in either Vercel Preview project. Temporary local setup files were removed after verification.
- Browser-independent recovery commit `f46d2a3`, documented and deployed through `ea3372e`, replaces browser-bound PKCE recovery with an implicit recovery link whose tokens stay in the fragment until an explicit password submission. The server verifies the token, subject and newest recent `recovery` AMR before changing the password, checks KXRA account state, records the event and globally signs out. The general Auth callback can no longer grant reset authority.
- The deployed page was verified at the stable Preview alias. Requests at 23:45:15 and 23:52:09 reached `/auth/v1/recover`; both received `429: email rate limit exceeded`. Supabase confirms its default service allows two emails per hour; the successful earlier sends were at 23:15 and 23:20. That rate-limit checkpoint was cleared by the later accepted request; the older callback emails remain invalid and must not be used.
- The authorized retry at 00:22:57 returned `200` and `Mail.send`, and its email used the exact `/reset-password` redirect. The first password submission returned `Invalid reset request` before any provider password change because KXRA required a refresh token of at least 20 characters while Supabase Auth supports 12-character legacy refresh tokens. The route now accepts only Supabase-compatible shapes, still delegates cryptographic verification to Supabase, and the form reports password mismatch locally. The regression test, type check and optimized OS build pass; Preview verification is pending deployment.
- After the token-shape correction deployed, the retained recovery session returned `Reset unavailable` without a corresponding Supabase password-update call. Its authentication was then more than ten minutes old, exposing an extra KXRA cutoff shorter than the provider's valid recovery session. That time-only correction was superseded once the provider's actual implicit-recovery AMR behavior was confirmed.
- A further hosted retry confirmed that Supabase implicit recovery uses AMR `otp`, matching its Auth source, rather than a JWT-bound `recovery` method. Accepting any OTP session would weaken the reset boundary. KXRA now seals a server-only HMAC recovery intent containing a digest of the requested email and an exact one-hour lifetime, includes it only in the provider's emailed redirect, removes it and the provider fragment from browser history, and requires its email and time window to match the verified provider user and latest `otp`/`recovery` AMR. Tampered, expired, wrong-email, early, late, malformed and password-session cases fail closed.
- At 01:45 the deployed signed-intent flow completed end to end: `/recover` returned 200 and sent the email, `/verify` completed the provider login, `PUT /user` returned 200 for the owner-performed password change, global `/logout` returned 204 and a fresh password grant at 01:46 returned 200. The authenticated KXRA owner workspace loaded successfully. No password, provider token or recovery secret was inspected or retained.
- Owner password establishment, hosted sign-in, TOTP enrollment and guarded final owner verification are complete. The database password was rotated by the owner and the documented Supavisor credential-cache delay cleared on a fresh connection. Hosted owner/partner/RLS acceptance, the exact WAF rule and release evidence remain pending.

Current branch: `codex/phase-2-completion`. Recovery implementation is deployed on the private Preview and verified with the real owner recovery/sign-in sequence. MFA compatibility commit `7e137d8` accepts the provider's bounded inline SVG QR representation and passed GitHub CI run 36505929242 and CodeQL run 36505929235. Operator TLS commit `340ffc7` removes URL SSL overrides and applies the validated Supabase CA plus Node trust roots to all staging database operators; focused tests, type checking, full CI run 36507607574 and CodeQL run 36507607508 pass. The branch is not merged. No default-branch change, production deployment, provider activation, charge, candidate-code execution or publication occurred.

The cumulative contract remains [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md), the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md), the [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) and the private Genesis source. Later requirements supplement earlier requirements. Executable status is recorded in [acceptance evidence](acceptance-evidence.md).

## Completed in Slice 37

- Reproduced the hosted reset failure and identified the browser-bound PKCE verifier as the reason links opened from email returned to sign-in.
- Added a browser-independent implicit recovery flow. Recovery credentials remain in the browser fragment, are removed from browser history immediately and are submitted only with the new password over the same-origin private API.
- Added fail-closed server verification of the Supabase user, signed JWT subject and newest recent `recovery` AMR before KXRA account-state validation and provider password change.
- Removed password-reset authority from the general Auth callback and retained the exact join-only callback allowlist.
- Passed 198 database/domain/HTTP/security tests, 69 migrations and 171 protected-table checks, 48 private browser scenarios, both 14-scenario marketing runs, restart/restore, both builds, CSP/SRI, artifact and 390-file secret scans, and optimized Lighthouse budgets in one hermetic run.

## Completed in Slice 36

- Replaced the permissive release-manifest check with an exact six-document legal set and immutable approved-version/hash verification. ADR 0041 later reduced the current required set to five by parking NDA.
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
- 71 ordered additive migrations, 172 RLS-protected tables with explicit policies and 146 audited public functions.
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
- Identity/legal: the real Supabase owner recovery, sign-in, TOTP enrollment and guarded database verification pass. Hosted owner/partner isolation acceptance and approved release legal content remain unverified. NDA is not currently mandatory.
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

- Qualified UK legal approval for Terms, Privacy, cookie, AI/data-processing and custom-project documents. NDA/confidentiality is parked for later reconsideration.
- Customer discovery decisions for initial segment, launch plan, plan limits, the approximately £30 pricing hypothesis, free-partner policy and custom-project terms.
- Entity/public contact details, retention/recovery targets, support/privacy mailboxes and approved public copy/brand assets.
- Later staging credentials and budgets through provider secret stores, never chat or Git.
- When the YouTube slice is connected: a Google Cloud project, YouTube Data API, OAuth consent configuration and the exact Finance Unfolded channel-authorized account.
- When repository analysis is connected: approved archive source, production scanner/SBOM/SAST services and an isolated no-network sandbox design.

These inputs do not block continued local work with synthetic fixtures and disabled adapters.

## Next safe action

Run the exact hosted acceptance sequences with the verified AAL2 owner, then create one bounded staging partner to prove owner/partner/revoked/crafted-project RLS behavior. After that, configure and evidence the exact Vercel WAF rule. Keep production deployment, customer access and publication disabled.

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
- Verification requires all hashes plus exactly 172 RLS-protected tables with policies and 146 `kxra` functions. Operator-only values are rejected from hosted application profiles.
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

- Hosted recovery now checks the Supabase `resetPasswordForEmail` result instead of treating every provider response as queued. Provider failures return one non-enumerating temporary-unavailability response; server diagnostics retain only a bounded failure class and numeric provider status, never the submitted email or provider message.
- The staging Supabase allowlist now includes the exact-origin `/reset-password**` pattern required for the signed recovery intent query. A fresh request at 00:49 reached `/recover` and returned the documented project-wide `429: email rate limit exceeded`; the locked built-in provider quota is two authentication emails per hour. No second request was sent after this diagnosis.
- After the rolling provider quota cleared, the owner completed one fresh hosted recovery. Supabase Auth logs show the bounded success sequence at 01:45–01:46: recovery request and mail send, link verification, password update, global sign-out and a successful fresh password login. The authenticated owner workspace then loaded at the stable Preview alias.

- The single staging Supabase Auth identity for `husainkara@hotmail.co.uk` is confirmed as UUID `0d7ff2e1-3d1d-4063-a278-7213a672385c`. The guarded owner bootstrap prepared the matching active KXRA owner record; real password sign-in succeeds. The owner completed KXRA TOTP enrollment, Supabase reports one verified factor and the KXRA Profile reports `ENROLLED`.
- Staging sign-in initially failed before Supabase Auth because the PostgreSQL client parsed `sslmode=require` from `DATABASE_URL` after the explicit TLS options and silently replaced the verified CA configuration.
- Hosted TLS now removes URL-level SSL controls before constructing the pool and supplies the current Supabase project CA plus Node trust roots with `rejectUnauthorized: true`. Credentials and non-SSL connection options remain unchanged.
- A regression test proves a connection URL cannot override the verified certificate object. Safe failure diagnostics expose only host, port, certificate size, hash, subject and fingerprint on the exact TLS-chain error; they never expose connection credentials, certificate content or sign-in input.
- The same verified TLS configuration now protects migration, seed, runtime-role and owner operator commands. The focused database/TLS/configuration suite passes 11 tests and TypeScript checking passes.
- After the owner rotated the database password, Supavisor briefly returned its documented cached-credential failure. A fresh session-pooler connection after the refresh interval passed. Guarded owner verification then confirmed Auth identity, verified MFA, the exact singleton KXRA owner state and the matching non-secret bootstrap event. The password was used once locally and was not retained.
- A fresh hosted account-password sign-in subsequently opened the owner-only operating overview under the server-side MFA gate and rendered all seven canonical project gates. The database password remains separate from the KXRA account password and is not a Vercel runtime credential.
- The first exact 18-probe anonymous acceptance run against commit `b37d30f` failed closed before reaching either application: Vercel Authentication returned only protection-layer 302/401 responses. The redacted FAIL artifact is retained. Both projects already have distinct automation-bypass credentials. The harness now accepts one credential per project without storing either value; a shared cross-project bypass is rejected.
- After both Vercel projects reported Ready for `0472b61`, the corrected protected run passed all 18 probes. It verified OS login and anonymous API boundaries, all required marketing and legal routes, marketing-to-private login separation, absent private APIs on marketing, secure headers, private `no-store`, staging `noindex`, absent permissive CORS and no known fixture/private markers. The PASS artifact contains status, byte count and hashes only; neither bypass appears in it.
- Vercel Preview commit `54168e3` is Ready at the stable phase-branch alias. A disposable invalid identity passed the database rate-limit boundary and reached Supabase Auth, which returned `invalid_credentials`; this proves the previous secure-service failure is repaired without using the owner's password. Commit `4c71384` also makes every invalid-password, suspended and revoked sign-in return the same non-disclosing credentials result.
- The final clean hermetic run passes all 199 database/domain/HTTP/security tests, the 69-migration/171-table RLS audit, 43 applicable private browser journeys with five intentional skips, all 14 public journeys in development and optimized production, database/private-object restart, a 2,710-row/15-object empty-target restore, both builds, CSP/SRI, build budgets, artifact exclusion, a 389-file publication/secret scan and optimized Lighthouse budgets. Real owner recovery, password login, TOTP enrollment and guarded final verification now pass; hosted owner/partner isolation acceptance is the next checkpoint.

## Hosted legal-gate and connection-pool checkpoint

- The invited PROJECT-002 partner completed onboarding steps 1–7. Step 8 found zero active approved agreements and recorded no acceptance. ADR 0041 supersedes the earlier requirement to block in this state.
- Migration 0073 and the Access Review UI now permit continuation with zero active approved agreements. A future explicitly approved required agreement still closes access until exact-version acceptance.
- Live verification exposed one transient `EMAXCONNSESSION` failure because the Vercel application was using Supavisor session mode with a 15-client pool while each serverless instance could retain ten clients. The Vercel runtime pool is now bounded to one client with five-second connection and idle limits.
- Supabase's transaction pooler on port 6543 is the selected serverless runtime endpoint. Operator and migration connections remain on direct/session mode.
- The branch-scoped OS Preview `DATABASE_URL` now uses the same restricted `kxra_app` role through Supabase's transaction pooler on port 6543 with `sslmode=verify-full`. No Production environment variable was changed.
- Reviewed commit `4ef52ea447d0ef094cc8942a29cc9efe743549ea` passed GitHub CI run `36633056144` and SHA-matched CodeQL run `36633056141`, then redeployed as Preview deployment `Ba8ijYpKGA2EW3roAGUYYvUstMLk` and reached `Ready`. Three consecutive stable-alias onboarding reloads completed without an application error or `EMAXCONNSESSION`; access remained fail closed because the controlled identity was no longer eligible to repeat onboarding. The deployment log reported zero warning, error or fatal events during the check.
- Approved release documents and policies remain release blockers, but NDA is not currently required. No placeholder may be activated to complete onboarding or release.

## Publication boundary

Only application code, engineering documentation and minimum classified seed records required by the platform may enter the repository. Original Word/text sources, private Genesis research, the private business pack, archives, `.runtime`, credentials, screenshots, traces, databases/object backups and generated test artifacts remain excluded.

## Hosted staging partner-invitation checkpoint

- On 29 September 2026 the verified owner used a fresh password-plus-TOTP session to create one 24-hour staging invitation for the owner-controlled `h***@icloud.com` acceptance identity.
- The invitation grants viewer access to PROJECT-002 only. No other project grant or partner account exists.
- PostgreSQL recorded the invitation as `PENDING`. `KXRA_EMAIL_ENABLED=false`, so no external email was sent and the partner cannot redeem this delivery version. After the reviewed Resend worker is connected, the owner must use **Resend with new link** to rotate the delivery token and send the controlled invitation.

## Isolated transactional-email worker checkpoint

- Added a third independently built Next.js application at `apps/email-worker`. Its operational routes are a bodyless `POST /api/process`, protected by a 64–128 character base64url bearer secret and timing-safe digest comparison, and a raw-body `POST /api/webhooks/resend`, protected by the Resend signature. The public root remains unavailable.
- Added a `transactional-email` staging capability profile. It requires certificate-verified TLS, the exact private worker/OS origins, restricted login `kxra_email_runner`, email encryption, trigger and Resend webhook secrets, a Resend sending key and a sender under `mail.kxra-group.com`. It rejects OS, public-ingress, billing, AI, telemetry and unrelated provider authority. The OS profile rejects the Resend sending and webhook secrets.
- Added guarded `staging:email-role:*` operators for the exact no-inherit/no-bypass/no-ownership worker login and capability membership, plus HTTP, configuration and role-state attack tests. OS and marketing preflights explicitly reject worker authority and the Resend credential.
- The clean hermetic contract passes 209 database/domain/HTTP/security tests, the 69-migration/171-table RLS audit, 43 applicable private browser journeys with five intentional device-specific skips, all 14 public journeys in development and optimized production, restart persistence, a 2,710-row/15-object empty-target restore, all three builds, CSP/SRI and size/Lighthouse budgets, artifact exclusion and the 407-file publication/secret scan. Remote CI remains to be recorded for the implementation commit.
- Vercel project `kxra-email-worker-staging` is connected to `apps/email-worker`. Its commit `49ddc9e31ec3671823deffdbb6b87a9093460118` Preview is Ready with branch-only restricted database, encryption, trigger, Resend sending and Resend webhook credentials. The corresponding OS Preview is also Ready and has no worker database, trigger, sending or webhook authority.
- The first attempt after an older owner session failed closed with `RECENT_MFA_REQUIRED` and created no invitation. A fresh password-plus-TOTP sign-in satisfied the 15-minute owner step-up boundary.
- The hosted Partners screen incorrectly described all environments as using the local fake outbox. The UI now derives and displays the actual delivery mode: local fake capture, configured provider queue or disabled hosted delivery.
- Partner redemption, first-private-access legal denial, PROJECT-002 visibility, crafted/cross-project denial and revocation remain unproved. Real legal text remains blocked on qualified UK counsel; placeholders cannot be activated.

## Hosted invitation link compatibility repair

- The first controlled PROJECT-002 invitation reached the provider `DELIVERED` state, but the recipient's email handoff removed the URL fragment before KXRA loaded. Hosted request evidence showed `GET /join` followed by `/join/account` with no exchange request. PostgreSQL confirmed the invitation remained sent, current, unexpired and unused.
- Delivery version 3 used `/join?token=...`. Provider inspection confirmed that exact query link was present in the delivered message, and the Resend domain has click tracking disabled. The recipient opened it in iPhone private browsing, but hosted evidence again showed no exchange request. The working diagnosis is mobile link-tracking protection removing the query parameter; this is an inference from the complete provider and request evidence.
- New invitation emails use `/join/<one-time-token>`. The dynamic route removes the bearer from browser history immediately before exchange, retains legacy query and fragment compatibility, and keeps all join responses private, uncached and `no-referrer`. The bearer can appear in the initial hosting access path, so it remains single-use, short-lived and must never be logged by KXRA application code.
- Inspection of delivery version 3 necessarily exposed its bearer to an operator tool. That delivery is treated as compromised and must be replaced with **Resend with new link** before any further redemption attempt.
- The clean hermetic contract passes 214 database/domain/HTTP/security tests, 69 migrations, 171-table RLS verification, 43 applicable private browser journeys with five intentional skips, all 14 public journeys in development and optimized production, restart/empty-target restore, all three builds, CSP/SRI, artifact/publication/secret scans and optimized Lighthouse budgets.
- Regression coverage proves the initial navigation is the only browser request containing the query token and that it does not appear in later requests, history, console, local storage or session storage.
- The clean hermetic contract passes 213 database/domain/HTTP/security tests, the 69-migration/171-table RLS audit, 43 applicable private browser journeys with five intentional skips, all 14 public journeys in development and optimized production, database/private-object restart, a 2,710-row/15-object empty-target restore, all three builds, CSP/SRI and size/Lighthouse budgets, artifact exclusion and the 409-file publication/secret scan.
- A replacement delivery and hosted redemption/isolation acceptance remain required after the repaired Preview is Ready. No production deployment was made.

## Hosted verified-email continuation repair

- The controlled PROJECT-002 identity completed Supabase email confirmation, but a mobile confirmation handoff could not restore the PKCE browser session and returned to the generic sign-in failure page. Supabase remained authoritative: the identity was confirmed while the invitation was still current, sent and unredeemed, with no profile or project membership created.
- Hosted password sign-in and hosted MFA completion now resume an existing encrypted join intent through `/join/finish`. A confirmed invited identity returning to `/join/account` without a profile also resumes the same database-authorized redemption path. Callback failure copy states that verification succeeded and asks for password sign-in; it does not create access or weaken invitation checks.
- TypeScript, focused authentication contracts and an optimized OS production build pass. A standalone full test command was stopped after the existing non-hermetic local database showed accumulated fixture rows; the clean disposable CI contract remains required on the implementation commit.
- Hosted recovery then exposed a second pre-redemption edge: Supabase accepted and verified the recovery link, but KXRA correctly had no profile yet and the confirmation route rejected the password change. Migration 0071 adds a private, authenticated-only eligibility check requiring the exact verified email, an unredeemed active invitation and a consumed one-use signup challenge, while also requiring that no profile exists. It grants no membership or project context.
- The hosted reset route uses that check only for the temporary invited/no-profile state. Existing profiles retain suspension/revocation and security-event checks. Provider global sign-out remains mandatory after the password change.
