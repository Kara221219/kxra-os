# Engineering handover

Updated: 1 October 2026.

## Billing activation in progress

Migration 0077 and the guarded billing-runner operator are implemented locally. Release readiness now checks the explicit owner approval fields introduced by migration 0075; it does not infer independent legal review and does not restore the parked NDA. Staging configuration supports a test-only `subscription-billing` profile and a combined `transactional-email-and-billing` profile. Thirty-two focused tests pass across release evidence, forged tenant denial, customer bootstrap, hosted sessions, signed webhook replay/order, entitlement grant/removal and restricted role structure. The complete hermetic contract passes 231 core tests, 77 migrations, 172 protected tables, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart/restore, all builds and the security/performance gates.

The connected `kxra-os-staging` Preview currently has the core/email variables only. It has no `KXRA_BILLING_WORKER_DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` or `STRIPE_PORTAL_CONFIGURATION_ID`, and billing remains disabled. Apply and verify migration 0077, create the exact `kxra_billing_runner`, configure the Stripe test portal and signed subscription webhook, add only branch-scoped Preview variables, redeploy the reviewed branch and complete one synthetic Checkout/cancellation cycle before recording `STRIPE_TEST` release evidence. Production and live-mode Stripe remain prohibited.

## Current commercial-foundation checkpoint

Branch `codex/phase-2-completion` is pushed through implementation commit `ebba44953ec2ee813844ce7ecc5aa5f57a409ad4`. Migration `0076_brand_studio_catalogue_seed.sql` is applied to authorized Supabase staging and ledgered at SHA-256 `cfa889bc6b3d3a75e16c277a3b313d99abc6e75bbc2ae432e471187309444cf7` against that source commit. Hosted verification proves 76 exact migrations, 172 RLS-protected tables, 146 exposed `kxra` functions, one active Brand Studio catalogue record and one active version. The migration imports no identity, fixture entitlement or provider authority.

The founding commercial plan is active in staging with one plan, two versions, six exact feature rows and two Stripe TEST price references. The monthly and annual versions provide Brand Studio access plus 120 generated creative variants and 120 reviewed exports per month with no rollover. Stripe Sandbox product `prod_VMHTknMmr7LV1r` has the approved tax-exclusive prices `price_1ULYzlC84VkhhIRziFf99Grl` (£29 monthly, default) and `price_1ULYyIC84VkhhIRza8JkYHz5` (£290 yearly). Superseded tax-inclusive price `price_1ULYv0C84VkhhIRzivfFjr42` is archived and has zero active subscriptions.

The exact implementation commit passes the full local hermetic contract: 222 core tests, 76 migrations, 172 protected tables, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart persistence, a 3,015-row/15-object empty-target restore, all three optimized builds, 72 exact CSP hashes, 129 SRI records, build budgets, a 439-file artifact/secret scan and Lighthouse 1.00 performance/accessibility. GitHub CodeQL run `36803453320` and full CI run `36803453498` pass at the same SHA.

Checkout and customer sales remain disabled. Before release, set owner-approved cancellation, refund and grace-period policy; approve the exact customer documents; configure restricted billing-worker Stripe credentials, webhook and customer portal in staging; pass a complete test Checkout, webhook reconciliation, entitlement and cancellation journey; and record WAF and release evidence. Production, live Stripe and `main` remain untouched.

## Current governed-improvement checkpoint

The working branch adds an owner-only Improvement Loop without adding a new autonomous agent or database authority. `improvementLoop()` reads only current governed records under the verified owner/RLS transaction and returns ranked repair, decide, measure, test and review signals. The owner UI links each signal to the existing typed workflow. The policy reports zero automatic consequential actions. Partner navigation and direct API access fail closed.

The public site now explains KXRA as a business operating platform rather than only an AI/venture concept. `/platform` identifies buyer groups and the measured learning loop. ADR 0045 sets `/pricing` at £29 per organisation per month or £290 per year, keeps custom projects and expensive usage separate, and preserves auditable free partner access. Checkout remains disabled. The reviewed publication snapshot remains disabled and hash-bound.

The exact working tree passes the complete hermetic contract: 219 core tests, 75 migrations, 172 protected tables, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart persistence, a 3,014-row/15-object empty-target restore, all three optimized builds, CSP/SRI, build budgets, artifact/secret scans and Lighthouse budgets. Migration 0075 records explicit owner approval for customer documents and preserves immutable evidence; independent review is optional. No live provider call, customer contact, paid generation, production deployment or `main` merge occurred. Before continuing commercial activation, read [ADR 0045](../decisions/0045-founding-subscription-price.md), the [pricing research](../research/subscription-pricing-2026-10-01.md) and the [platform review](platform-review-2026-09-30.md).

## Current hosted twelve-project checkpoint

Branch `codex/phase-2-completion` is pushed through commit `dd892636d78d7df3c747fdc8c198bd9177487b55`. The guarded Supabase operator applied and verified migration 0074 and the expanded canonical seed. Hosted staging now verifies 74 migrations, 172 RLS-protected tables, 146 exposed `kxra` functions and twelve canonical projects. The two migration-0074 internal functions remain in `kxra_private` and are not counted as exposed application functions.

Seed history is now explicitly versioned. The existing seven-project `KXRA-CANONICAL-SEEDS-V1` row and exact hash remain immutable. `KXRA-CANONICAL-SEEDS-V2` verifies that predecessor, imports the twelve-project source set atomically and records a separate history row. Unknown profiles, altered predecessor/current hashes, unmanaged canonical rows and provenance drift fail closed. The hosted plan, apply and verify sequence completed successfully; no fixture identity, active legal/commercial state, entitlement, billing record or provider authority was imported.

The exact V2 commit passes the complete local hermetic contract: 219 core tests, 74 migrations, 172 protected tables, 43 applicable private browser journeys with five intentional skips, both 14-journey public runs, restart persistence, a 3,014-row/15-object empty-target restore, all three builds, CSP/SRI, build budgets, artifact exclusion, a 426-file publication/secret scan and Lighthouse 1.00 performance/accessibility for both measured routes. GitHub CodeQL run `36768006957` and full CI run `36768007053` pass at the same SHA. Matching OS deployment `dpl_67omxHuJvqeMw7ypHVE9CQiAcuMY`, marketing deployment `dpl_7cijxTKw2YpPAxmNcwPXTdK42igW` and isolated email-worker deployment `dpl_2A6w5AbcFb8aaq9c6MeDd9y4vbBD` are Ready Preview builds at their stable phase-branch aliases. A later OS Preview repaired only its invalid restricted runtime password; the new deployment is Ready and the credential was not retained.

The controlled iCloud partner completed redemption and onboarding with exactly PROJECT-002 viewer access. Live UI checks passed for assigned-project visibility, direct PROJECT-003 and crafted-ID denial, owner Admin denial, one-project Ask scope and empty cross-project files. An exact owner approval revoked PROJECT-002; hosted PostgreSQL under the real `authenticated` role and exact partner context then returned zero projects, records, files and knowledge chunks. A second exact approval restored viewer access; hosted RLS returned exactly PROJECT-002 while PROJECT-003 and the crafted UUID remained invisible. Because all in-app tabs share one cookie jar, a simultaneous two-session HTTP revocation check still needs a genuinely isolated browser context and is not claimed by this checkpoint.

Production and `main` remain untouched. The next evidence slice is the isolated-cookie hosted HTTP/direct-API revocation sequence, followed by exact WAF evidence. Customer release still requires approved legal/commercial content and the remaining provider/release evidence.

## Current venture-intake checkpoint

Work remains on `codex/phase-2-completion`. The canonical local portfolio now contains twelve projects. PROJECT-008–012 cover Wall Printing, Signature Stays Manchester, Clear Aligner Dental, Online Product Commerce and the Auto AI Sales Assistant. Their source claims are classified; unknown commercial facts remain unknown. Each project has its own discovery document, assumption, experiment, blocker, risk, specialist workspace and evidence gate. The new projects grant no partner access and expose no side-effect executor.

Migration 0074 extends the existing transaction-time project initializer. A canonical seed creates all twelve projects, 18 common modules per project, the reviewed specialist module set and exact project gates. The full hermetic contract passes 219 database/domain/HTTP/security tests, 74 migrations, 172 RLS-protected tables, 43 applicable private browser journeys with five intentional skips, both 14-journey public-site runs, restart/restore, all three builds and the CSP/SRI, size, artifact, secret and Lighthouse gates.

The self-contained completion brief at `docs/operations/KXRA-VENTURES-AND-IMMERSIVE-WEBSITE-COMPLETION-BRIEF.md` is the current build instruction for the original KXRA immersive public journey and the five venture validation paths. It supplements earlier approved briefs. It does not authorize invented public proof, autonomous commercial action or production release.

The official Higgsfield TypeScript SDK is installed. `npm run higgsfield:seedance:example` runs the reviewed Seedance 2.5 example only when `.env.local` contains server-only `HF_CREDENTIALS` and the owner explicitly sets the exact one-run billable confirmation. Both missing-secret and missing-confirmation paths were verified fail-closed. No billable request has been made, so video-generation success is not claimed.

Before these records appear in hosted Preview, push the reviewed commit, allow GitHub checks and Preview builds to pass, then use the guarded staging operator to apply migration 0074 and the revised canonical seed. This requires the Supabase administrator password through a local non-echoing prompt; never place it in chat, Git, shell history or Vercel. Hosted verification must then prove twelve projects, exact gates/modules, owner visibility and PROJECT-002-only partner isolation. Production and main remain untouched.

## Current continuation repair

The invited staging identity completed provider password recovery but initially reached `Access unavailable` because its 30-minute browser join intent expired before invitation redemption. Migration 0072 adds a narrow authenticated recovery path tied to the consumed one-use signup challenge and exact verified email, and `/join/finish` uses it only when no valid join intent remains. The hash-bound hosted migration and commit `8140b70` deployment are verified; the invited identity resumed into onboarding with one active PARTNER/ORG_MEMBER organisation membership, one redeemed invitation and exactly PROJECT-002 viewer access.

ADR 0041 parks mandatory NDA acceptance. Migration 0073 retires active NDA requirements, makes the legacy NDA optional and allows Access Review to complete with zero approved agreements. The legal evidence system remains intact: a future explicitly approved required agreement reopens Step 8 and must be accepted by exact version. The clean hermetic contract passes 219 database/domain/HTTP/security tests, 73 migrations, 172 protected-table checks, 43 applicable private browser journeys with five intentional skips, both 14-journey marketing runs, restart/restore, all three builds and the publication, secret, CSP/SRI, size and Lighthouse gates. Commit `3d7d10e` is deployed Ready, GitHub CI and CodeQL pass, and hosted migration 0073 is recorded with the reviewed hash/source commit. The owner workspace loads against the migrated database; the next controlled partner onboarding may continue without an NDA.

## Current checkpoint

Work from /Users/kara/Desktop/P1/The KXRA Group on `codex/phase-2-completion`. Hosted sign-in/database repair, browser-independent password recovery, real owner TOTP enrollment and guarded final owner verification are complete. The owner has one verified KXRA TOTP factor and the database confirms its reference against the exact singleton KXRA owner and bootstrap event. No password, TOTP secret, proof code, token or recovery secret was recorded.

The current PROJECT-002 invitation now opens the correct account form on mobile. Registration failed because Supabase had public signup disabled. Migration 0070 and ADR 0040 add a private, five-minute, one-use invitation challenge plus a narrowly granted Before User Created hook. Direct signup, wrong-email use, replay and invitation-token rotation fail closed in the local contract. Hosted migration and Auth-hook activation are the immediate checkpoint; do not enable email signup until the hook is configured.

The last frozen complete hermetic contract passed 215 database/domain/HTTP/security tests, 70 migrations, 172 protected tables, 43 applicable private browser journeys with five intentional skips, all 14 marketing journeys in both runtime modes, restart/restore, all three builds and the publication, secret, CSP/SRI, size and Lighthouse gates. Migration 0071 and its invited-identity recovery repair require a fresh clean run.

Commit `7e137d8` passes GitHub CI run 36505929242 and CodeQL run 36505929235. Commit `340ffc7` applies the same certificate-verified Supabase TLS configuration to every guarded staging database operator and passes its focused 11-test suite, type checking, full CI run 36507607574 and CodeQL run 36507607508. A fresh hosted account-password sign-in opened the owner-only overview and all seven canonical project gates.

Supabase project `KXRA Staging` (`jlebgsxcvhvpueuibekd`) in `eu-west-2` now verifies all 69 migrations, 171 RLS-protected tables, 146 functions, seven canonical projects and 126 classified source records. The seed contains no local fixtures or activated legal/commercial/provider state. Runtime logins `kxra_app` and `kxra_public_ingress` have exact bounded memberships, no bypass, no ownership and no direct grants. Their distinct generated passwords exist only in matching Vercel Preview secrets.

Vercel projects `kxra-os-staging` and `kxra-marketing-staging` are connected to `Kara221219/kxra-os`, rooted at `apps/os` and `apps/marketing`, include monorepo source and use `npm run preflight:staging && npm run build`. Both Preview deployments for commit `93c116e` are Ready behind deployment protection. The stable phase-branch aliases are `https://kxra-os-staging-git-codex-phas-62bd6c-husainkara-6439s-projects.vercel.app` and `https://kxra-marketing-staging-git-cod-1ab442-husainkara-6439s-projects.vercel.app`. Live probes verify OS login 200, anonymous OS context 401 and marketing home 200.

Supabase Auth uses the exact private phase-branch origin. New email signup remains disabled pending migration 0070 and the Before User Created hook; after both are verified, the provider switch can be enabled while the hook keeps registration invitation-only. Email confirmation remains enabled, TOTP is enabled and AAL1 sessions are limited to 15 minutes. The single staging Auth identity is `husainkara@hotmail.co.uk`, UUID `0d7ff2e1-3d1d-4063-a278-7213a672385c`; the guarded owner bootstrap prepared its matching KXRA owner record. The exact `/reset-password` redirect is saved. Existing obsolete reset callback and `/reset-password/verify` entries can be removed only after the new flow is proven. The default email service is fixed at two emails per hour; correct-flow attempts at 23:45 and 23:52 were rejected with 429 before the successful 00:22:57 request.

The immediate checkpoint is the exact hosted acceptance sequence using the verified AAL2 owner, followed by one bounded staging partner for owner/partner/revoked/crafted-project isolation evidence. No hosted partner exists, and the hosted acceptance operator and exact WAF evidence have not run.

The first 18-probe anonymous run against `b37d30f` retained a redacted FAIL artifact because Vercel Authentication intercepted all probes with protection-layer 302/401 responses. This is a deployment-protection checkpoint, not KXRA route evidence. Each Vercel project already has a distinct automation-bypass secret. The corrected harness accepts one per project, stores neither and rejects a shared cross-project bypass. Do not disable Vercel Authentication.

That rerun is complete: both Vercel projects reported Ready for `0472b61`, and all 18 protected anonymous probes passed. The PASS artifact records only origins, exact commit, timing, status, body/header hashes and empty findings. Continue with hosted owner/partner/revoked/crafted-project isolation; Vercel Authentication remains enabled.

The branch is not merged and nothing is deployed to Production. Preserve the private `KXRA-GENESIS` package, original source documents and unrelated parent-repository applications. PostgreSQL authorization, tenant/project isolation, Project 004's paper-only boundary, Project 005's demand gate, the Projects 006/007 no-side-effect boundaries and the repository publication boundary remain non-negotiable.

Read, in order:

1. [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md);
2. [acceptance evidence](acceptance-evidence.md) and [progress](progress.md);
3. [architecture](../architecture/system.md), [security](../security/access-control.md), [ADR 0015](../decisions/0015-independent-public-marketing-boundary.md) and the [public marketing threat model](../security/public-marketing-threat-model.md);
4. ADRs 0008–0011 and their threat models;
5. the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md) and root [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) for preserved requirements.

## Actual delivered state

Final Milestones 1–4 and Phase 2 Slices 0–36 are committed remotely. Slice 37 recovery code and provider-failure handling are pushed through `a94b1bc` and the private Preview deployment succeeded. The branch schema has 172 RLS-protected tables and 146 audited public functions; hosted staging remains at 171 tables until migration 0070 is applied.

The staging recovery redirect allowlist includes the exact-origin `/reset-password**` pattern for the signed intent query. The request route checks provider errors and returns a single non-enumerating temporary-unavailability response while logging only a bounded class and numeric status. After the built-in provider's rolling two-emails-per-hour quota cleared, Supabase accepted one new request at 01:45, sent the recovery email, verified the link, accepted the owner-performed password change, globally signed out the recovery session and accepted a fresh password sign-in at 01:46. The authenticated KXRA owner workspace loaded successfully.

Slice 37 makes recovery independent of the browser that requested the email. The link returns tokens in a client-only fragment; KXRA removes that fragment from history, sends the credentials only with the chosen password, verifies the provider user and signed JWT, requires the newest AMR entry to be a recent `recovery`, validates active KXRA account state, changes the password, records the security event and globally signs out. Ordinary sessions and the general Auth callback cannot grant reset authority.

Slice 36 replaces a permissive release-manifest check with an exact fail-closed legal/commercial/provider/review contract. The owner Admin surface now reports the latest manifest and exact blocker codes. It cannot approve evidence, deploy, publish, charge or contact a customer. Production inputs remain absent.

Slice 35 adds a staging acceptance operator that binds both exact HTTPS previews to the clean pushed SHA and an explicit confirmation, then runs 18 no-redirect anonymous boundary probes. It verifies secure headers, private no-store, staging no-index, absent permissive CORS, fixture/private marker exclusion and public/private route separation. Evidence stores hashes/status only; bodies, cookies and credentials are excluded. Basic hosted smoke evidence now exists; the exact 18-probe acceptance run remains pending owner/TOTP bootstrap and the protected-preview acceptance path.

Slice 34 adds:

- exact accepted-evidence versions and rationales for the ten Genesis scoring factors;
- deterministic coverage and score bounds, with unknown headline scores until evidence is complete;
- optional complete four-dimensional confidence evidence, explicitly separated from success probability;
- hash-bound owner approval, recent-AAL2 execution, stale-state/evidence rejection and immutable superseded history;
- owner assessment/history UI and applied-result visibility limited by active project RLS;
- SQL, HTTP and browser attack/acceptance coverage documented by ADR 0037.

Slice 33 originally added:

- server-derived assurance and factor selection after hosted password sign-in;
- an independent application-actor AAL2 gate for direct private access by enrolled hosted identities;
- a dedicated TOTP challenge surface that accepts only a six-digit proof from the browser;
- the initial exact callback allowlist and browser-bound PKCE recovery design, now superseded for password recovery by Slice 37;
- provider password update, current KXRA account-state verification, explicit partial-failure handling and global sign-out;
- ADR 0036, account-threat-model additions and a complete hosted sign-in/recovery staging acceptance sequence.

Slice 8 adds:

- separate `apps/marketing` source, runtime and optimized build;
- a hash-bound disabled publication snapshot and all required current/preserved routes;
- original layered industry storytelling with reduced-motion/mobile/no-JavaScript treatment;
- three accessible public forms using one origin-bound, HMAC-digested, idempotent, rate-limited write RPC;
- two new RLS tables, one owner-only unverified private inbox and an audit event per accepted submission;
- exact snapshot, source-boundary, artifact/private-marker, SQL/HTTP and 10-scenario public browser evidence;
- ADR 0015, a threat model and a staging/release playbook.

No Trigger.dev task, always-on scheduler or verified notification delivery exists. The isolated email-worker Vercel project and its branch-only staging credentials now have a Ready Preview runtime and a reachable, fail-closed Resend webhook boundary; controlled delivery evidence remains pending. No YouTube token, upload/schedule executor, repository archive fetcher, candidate process runner, Git writer, merge/release route or production scanner exists.

Preserved earlier slices include normalized global identity, selected tenant, exact legal gate, private file/knowledge lifecycle, permission-safe Ask/AI runs, owner control plane, seven project workspaces and Brand Studio. Slices 19–21 provide the local custom-project path through triage, exact proposal, acceptance, payment gate, activation, bilateral changes, milestone delivery/acceptance, invoices and immutable adjustments. Slice 22 adds exact private support, subscription cancellation/withdrawal and personal-data request workflows with isolated internal handling notes. Slice 23 adds a disabled-by-default, address-pinned website-source worker and immutable refresh evidence. Slice 24 adds append-only human source correction and database-enforced stale-lineage blocking through final export delivery. Slice 25 adds encrypted invitation-link custody, a restricted email worker, idempotent Resend transport and signed provider-state reconciliation. Slice 26 adds a restricted billing worker, raw-body Stripe verification and metadata-independent test subscription reconciliation. Slice 27 adds test-only hosted Checkout/Portal session intents, fixed/bounded provider calls, worker-recorded redirect custody and customer billing controls. Slice 28 adds database-derived, idempotent Stripe test-customer bootstrap and worker-recorded mapping. Slice 29 adds a hash-bound, resumable and environment-guarded staging migration operator. Slice 30 adds a canonical-only staging seed profile and operator that excludes all local executable/fixture authority. Slice 31 adds separate exact non-inheriting runtime logins for the OS and public ingress. Slice 32 adds guarded singleton-owner preparation, hosted TOTP controls, AMR-based recent step-up and provider-confirmed global sign-out. Hosted execution of these paths and all other provider acceptance remains pending.

Legal seed records remain `UNAPPROVED_PLACEHOLDER` and inactive. No production legal text, product, price, subscription, customer or credential is seeded.

## Current hosted partner handoff

- The `h***@icloud.com` Supabase identity is email-confirmed. The invitation remains `SENT`, unexpired and unredeemed, with one approved PROJECT-002 grant. No KXRA profile, organization membership or project membership exists yet.
- The mobile callback exposed a hosted-only continuation defect: a verified identity could land at sign-in after a PKCE handoff failure, while hosted password and MFA completion always redirected to `/os` instead of the active invitation.
- The pending repair resumes the encrypted join intent after hosted password or MFA authentication and from `/join/account` when the verified identity has no profile. After its Preview is Ready, the user should sign in with the newly created iCloud account password in the same browser. Expected result: `/join/finish` atomically creates the bounded account and PROJECT-002 viewer membership, then redirects to onboarding.
- After onboarding, complete hosted negative-access acceptance before any revocation: only PROJECT-002 visible; crafted IDs, direct APIs, cross-project files, search and Ask KXRA denied; first-private-access legal gate enforced. Production remains untouched.
- A successful Supabase recovery link currently reaches the KXRA reset form but the deployed route rejects the password change because the invited identity has no profile before redemption. Migration 0071 and the matching route repair are pending deployment. The new database predicate requires a provider-verified identity, matching active invitation and consumed signup challenge, and refuses identities with an existing profile. Apply and verify 0071 before asking the user to request another recovery email.

## Reproduce the evidence

Requirements: Node.js 22, locked npm dependencies, Chromium for Playwright and local PostgreSQL binaries.

```sh
npm ci
npx playwright install chromium --only-shell
npm run test:ci
git diff --check
```

The Slice 27 contract passes the 228-package dependency policy, 162 database/domain/HTTP/security tests, the 66-migration/167-table RLS audit, 46 private-OS runs (41 applicable plus five intentional device-specific skips), 14 public-site scenarios under development and optimized production, database/private-object restart, a 2,697-row/15-object empty-target restore, both builds, exact CSP/SRI, compressed page-asset and optimized Lighthouse budgets and artifact exclusion locally and in GitHub CI run 36282404005. CodeQL run 36282404016 independently passes the exact implementation SHA.

The Slice 28 contract passes the 228-package dependency policy, 164 database/domain/HTTP/security tests, the 67-migration/168-table RLS audit, 46 private-OS runs (41 applicable plus five intentional device-specific skips), 14 public-site scenarios under development and optimized production, database/private-object restart, a 2,697-row/15-object empty-target restore, both builds, exact CSP/SRI, compressed page-asset and optimized Lighthouse budgets and artifact exclusion locally and in GitHub CI run 36284168922. CodeQL run 36284168938 independently passes the exact implementation SHA.

The Slice 29 contract passes the 228-package dependency policy, 168 database/domain/HTTP/security tests, the 67-migration/168-table RLS audit, 46 private-OS runs (41 applicable plus five intentional device-specific skips), 14 public-site scenarios under development and optimized production, database/private-object restart, a 2,697-row/15-object empty-target restore, both builds, exact CSP/SRI, compressed page-asset and optimized Lighthouse budgets, artifact exclusion and a 354-file publication/secret scan locally and in GitHub CI run 36286028336. CodeQL run 36286028353 independently passes the exact implementation SHA.

The Slice 30 contract passes the 228-package dependency policy, 172 database/domain/HTTP/security tests, the 67-migration/168-table RLS audit, 46 private-OS runs (41 applicable plus five intentional device-specific skips), 14 public-site scenarios under development and optimized production, database/private-object restart, a 2,697-row/15-object empty-target restore, both builds, exact CSP/SRI, compressed page-asset and optimized Lighthouse budgets, artifact exclusion and a 359-file publication/secret scan locally and in GitHub CI run 36287286378. CodeQL run 36287286351 independently passes the exact implementation SHA.

The Slice 31 contract passes the 228-package dependency policy, 175 database/domain/HTTP/security tests, the 67-migration/168-table RLS audit, 46 private-OS runs (41 applicable plus five intentional device-specific skips), 14 public-site scenarios under development and optimized production, database/private-object restart, a 2,697-row/15-object empty-target restore, both builds, exact CSP/SRI, compressed page-asset and optimized Lighthouse budgets, artifact exclusion and a 364-file publication/secret scan locally and in GitHub CI run 36289096748. CodeQL run 36289096738 independently passes the exact implementation SHA.

The Slice 32 contract passes the 228-package dependency policy, 184 database/domain/HTTP/security tests, the 67-migration/168-table RLS audit, 46 private-OS runs (41 applicable plus five intentional device-specific skips), 14 public-site scenarios under development and optimized production, database/private-object restart, a 2,697-row/15-object empty-target restore, both builds, exact CSP/SRI, compressed page-asset and optimized Lighthouse budgets, artifact exclusion and a 371-file publication/secret scan locally and in GitHub CI run 36291392558. CodeQL run 36291392562 independently passes the exact implementation SHA.

The Slice 33 contract passes the 228-package dependency policy, 190 database/domain/HTTP/security tests, the 67-migration/168-table RLS audit, 46 private-OS runs (41 applicable plus five intentional device-specific skips), 14 public-site scenarios under development and optimized production, database/private-object restart, a 2,697-row/15-object empty-target restore, both builds, exact CSP/SRI, compressed page-asset and optimized Lighthouse budgets, artifact exclusion and a 375-file publication/secret scan locally and in GitHub CI run 36292883782. CodeQL run 36292883777 independently passes the exact implementation SHA.

The Slice 34 contract passes the 228-package dependency policy, 193 database/domain/HTTP/security tests, the 68-migration/171-table RLS audit, 48 private-OS runs (43 applicable plus five intentional device-specific skips), 14 public-site scenarios under development and optimized production, database/private-object restart, a 2,710-row/15-object empty-target restore, both builds, exact CSP/SRI, compressed page-asset and optimized Lighthouse budgets, artifact exclusion and a 380-file publication/secret scan locally and in GitHub CI run 36295329624. CodeQL run 36295329649 independently passes the exact implementation SHA.

The Slice 35 contract passes the 228-package dependency policy, 196 database/domain/HTTP/security tests, the 68-migration/171-table RLS audit, 48 private-OS runs (43 applicable plus five intentional device-specific skips), 14 public-site scenarios under development and optimized production, database/private-object restart, a 2,710-row/15-object empty-target restore, both builds, exact CSP/SRI, compressed page-asset and optimized Lighthouse budgets, artifact exclusion and a 385-file publication/secret scan. Implementation commit `8dd54b33f930ace148c914f797c9fe1ed77e40fc` also passes GitHub CI run 36297681105 and SHA-matched CodeQL run 36297681123.

The Slice 36 contract passes the 228-package dependency policy, 196 database/domain/HTTP/security tests, the 69-migration/171-table RLS audit, 48 private-OS runs (43 applicable plus five intentional device-specific skips), 14 public-site scenarios under development and optimized production, database/private-object restart, a 2,710-row/15-object empty-target restore, both builds, exact CSP/SRI, compressed page-asset and optimized Lighthouse budgets, artifact exclusion and a 387-file publication/secret scan. Implementation commit `0da4349ae464135d1464d47f784cbab17395d37b` also passes GitHub CI run 36300068294 and SHA-matched CodeQL run 36300068314.

The hosted-staging implementation at `93c116e4e2b4c791b80873d46e6a39fb64547319` passes the complete hermetic contract with 197 database/domain/HTTP/security tests, 69 migrations, 171 protected tables, 48 private-OS runs, 14 marketing runs in development and optimized production, a 2,711-row/15-object empty-target restore, both builds, exact CSP/SRI, artifact exclusion and a 389-file publication/secret scan. Optimized Lighthouse scores are 1.00 performance/accessibility for the tested mobile home and desktop contact scenarios. Guarded hosted checks verify the schema, canonical seed, restricted runtime roles, Ready Vercel previews and the anonymous public/private smoke boundary.

This evidence now proves real owner recovery, password sign-in, TOTP enrollment, guarded database reconciliation and one controlled Resend delivery with signed-webhook reconciliation. It also proves the verified sender domain, restricted sender-credential custody, Ready isolated worker runtime, webhook reachability and rejection of unsigned provider events. It does not yet prove hosted Storage, owner/partner RLS sessions, Stripe, OpenAI, YouTube, Meta, Trigger.dev, PostHog/Sentry, Cloudflare, production repository scanners/sandboxing or hosted backup behavior.

On 29 September 2026 the owner created one controlled 24-hour staging invitation for `h***@icloud.com`, scoped to PROJECT-002 as viewer. A fresh password-plus-TOTP sign-in satisfied the recent-MFA boundary. The owner then used **Resend with new link** to replace the unrecoverable initial token with delivery version 2. Before dispatch, PostgreSQL proved the active invitation was pending and unexpired, the new outbox secret was encrypted, its digest matched the invitation token digest and both delivery versions matched. The restricted worker processed the message once; Resend accepted it and the signed webhook reconciled it to `DELIVERED`. PostgreSQL records one attempt, a provider message identifier, one provider event and no delivery error. No partner account or membership exists until the recipient redeems the link and completes the legal gate.

The isolated `apps/email-worker` deployment target and guarded `kxra_email_runner` role operator are implemented. The worker accepts only a bodyless authenticated trigger, processes at most ten queued messages per invocation and has its own `transactional-email` preflight. Its build rejects OS/public credentials and unrelated provider authority; OS and marketing reject its database, trigger and Resend credentials. The clean hermetic contract passes 209 database/domain/HTTP/security tests, the 69-migration/171-table RLS audit, 43 applicable private browser journeys, all public journeys in both runtime modes, restart/empty-target recovery, all three builds and security/performance scans.

Vercel project `kxra-email-worker-staging` is connected to `apps/email-worker`. Resend domain `mail.kxra-group.com` is verified, and a domain-restricted sending key is stored only in the worker's `codex/phase-2-completion` Preview scope. The restricted database login, worker trigger secret, shared encryption key, Resend webhook signing secret and official Supabase CA are also branch-only secrets. `kxra-os-staging` has only the shared encryption key and email capability settings; `kxra-marketing-staging` has no email-worker authority. The Supabase role and audit table pass exact safety, membership, ownership, direct-grant and RLS checks. The deployed worker accepts zero-length authenticated triggers and rejects body-bearing requests. Commits `624e0f0`, `a7b9405`, `83aef49` and `7a1ec10` corrected empty-body handling, added credential-safe failure stages, classified safe connection failures and removed URL SSL overrides that conflicted with the verified CA. The final `7a1ec10` Preview is Ready. Resend webhook `455effca-0df1-444f-aff7-84c164237fb0` points to the stable worker branch alias through a worker-only Vercel automation bypass while Preview protection remains enabled. Live probes returned `405` for `GET`, `400` for an unsigned webhook and `401` for an unauthenticated process trigger, and the controlled send plus signed delivery webhook completed successfully.

This checkpoint does not prove partner isolation. Complete redemption with the controlled identity, verify the legal gate fails closed, then prove PROJECT-002-only HTML/API/file/search/Ask access, crafted PROJECT-003 denial and database-backed revocation. Do not activate a placeholder NDA to finish that test.

## Next implementation slice

Continue Final Milestone 10 production quality without deploying:

0. **Completed 29 September 2026:** the OS branch Preview alone now uses the Supabase transaction-pooler endpoint for the same `kxra_app` role on port 6543 with `sslmode=verify-full`. Reviewed commit `4ef52ea447d0ef094cc8942a29cc9efe743549ea` passed GitHub CI `36633056144` and SHA-matched CodeQL `36633056141`, redeployed as `Ba8ijYpKGA2EW3roAGUYYvUstMLk` and reached Ready. Three stable-alias onboarding reloads produced no application or connection-session error; the deployment log showed zero warning, error or fatal events. The controlled identity is no longer eligible to repeat onboarding, so legal Step 8 remains proven by the earlier fail-closed checkpoint rather than bypassed or reaccepted;

1. complete the remaining hosted HTTP acceptance in a genuinely isolated partner cookie jar: direct API, cross-project files/search/Ask and active-session denial during a bounded revoke/restore cycle; the database-backed revoke/restore and UI crafted-project checks already pass. Then configure and evidence the exact Vercel WAF rate rule;
2. activate Brand-source acquisition only as a separately credentialed worker using the [staging playbook](../playbooks/brand-source-acquisition-staging.md) and prove real egress/TLS/failure behavior;
3. complete replay-denial, invitation-revocation and post-acceptance trigger/key-rotation evidence for the delivered controlled invitation using the [transactional email playbook](../playbooks/transactional-email-staging.md);
4. add human assistive-technology, field Web Vitals and broader provider-failure/load evidence;
5. repeat recovery against authorized staging with encrypted provider backups;
6. keep deployment/publication disabled until legal, public-copy, provider and owner approval.

## Security invariants

- Verify server identity, active account and selected organization before retrieval. The organization cookie is a selector only.
- Set `request.kxra.org_id` from verified membership inside each transaction. Never accept tenant/project authority from request, JWT or model fields.
- Require one authorized project for project-bound retrieval and reauthorize before bytes, model context, export, intent or provider delivery.
- Treat files, website snapshots, repository content and model output as untrusted evidence without instruction or tool authority.
- Require an exact approved legal version only when an approved requirement is active; placeholders cannot activate.
- Calculate entitlement, usage and money in deterministic database/domain code.
- Subscription access never authorizes custom implementation.
- Brand Studio export never authorizes publication.
- PROJECT-006 approval never authorizes upload while the adapter is disabled; creator and final reviewer must differ.
- PROJECT-007 assessment never proves safety; proposal approval never authorizes execution, merge, release or deploy.
- Every new table needs RLS/policy and every function/route needs negative access tests.

## Owner/provider connection order

The hosted owner identity gate is complete. Before staging can become customer-ready, complete these bounded steps in order:

1. run hosted owner/partner/revoked/crafted-project isolation acceptance using the verified owner and one bounded staging partner;
2. complete and owner-approve exact Terms, Privacy, Cookie, Data Processing and Custom Project documents before customer release; independent legal review is optional and risk-based, and an NDA remains parked unless demonstrated need changes that decision;
3. create the private Storage bucket and production scanning/extraction service identities;
4. configure Stripe test products/prices at £29 monthly and £290 yearly, then verify checkout, webhook and reconciliation evidence before any live-mode work;
5. configure Resend and DNS only after approved sender copy and domains;
6. configure OpenAI project/data controls and explicit budgets;
7. configure YouTube OAuth for the exact Finance Unfolded account only when the disabled local intent contract is accepted;
8. configure Meta WhatsApp, Trigger.dev, PostHog, Sentry, Vercel and Cloudflare in separate staging acceptance slices.

Never paste secret values into chat or Git. Use the provider dashboards and Vercel/Supabase secret stores referenced by the relevant future playbook.

## Current invitation repair handover

- The fragment repair and the later query repair were both delivered successfully but did not reach token exchange on the recipient's private iPhone browser. Provider inspection proved delivery version 3 contained the complete `/join?token=...` link, and Resend click tracking is disabled. Mobile link-tracking protection removing the query is the evidence-backed working diagnosis, not a confirmed Apple internal decision.
- The branch now generates `/join/<one-time-token>` links, accepts legacy query and fragment links, removes path/query bearers from browser history immediately before exchange, and applies private no-store/no-referrer headers to every join route.
- The path bearer can appear in the initial Vercel access path. Its exposure is bounded by short expiry, one-time database exchange and immediate browser-history removal; application logs must never retain it. A future selector/challenge design can remove this hosting-log tradeoff after staged onboarding is proven.
- Provider inspection exposed the delivery-version-3 bearer to an operator tool, so that version is compromised and must not be reused. The owner must use **Resend with new link** once after matching OS and email-worker Preview deployments are Ready.
- The complete local acceptance contract passes: 214 code/database/API tests, 171-table RLS verification, 43 applicable private browser journeys with five intentional skips, 14 public journeys in both modes, restart/restore, all three builds, artifact/publication/secret scans and Lighthouse budgets.
- Process exactly the replacement queued delivery, then verify exchange, account onboarding, PROJECT-002-only visibility, crafted/cross-project denial and immediate revocation. Do not reuse any earlier email link.
- Production remains untouched. Exact owner-approved customer documents remain a release input; solicitor approval is not a release blocker under ADR 0044.

## Private business-readiness artifacts

The ignored private business pack contains the Customer Discovery Pack, tracker and Solicitor Brief alongside the business plan, decks, financial model and playbooks. They are not public-repository content. The solicitor brief is an instruction pack, not legal advice or approved customer-facing terms.

## Public landing-page handover

- The marketing home page now uses a CSS perspective/depth journey implemented by `apps/marketing/components/ImmersiveJourney.tsx` and the public snapshot content in `apps/marketing/app/page.tsx`. Keep the four `.layer` chapters because no-JavaScript, reduced-motion and reflow acceptance depends on all content remaining available.
- Do not replace the progressive enhancement with a WebGL-only experience. Any future 3D or generated-video layer must keep the current HTML narrative, motion preference, keyboard access, 320px reflow and 140 KiB gzip route budget.
- The supplied generated references are aesthetic inputs only. Do not publish their Dola AI watermarks, malformed text, staged team portrait or any unverified performance/customer claims.
- No Higgsfield top-up is needed for the current build. A later Seedance request is billable and must use the guarded server-side example, a locally entered credential and an explicit one-run confirmation.
- The next provider-independent checkpoint is the automatically generated Vercel Preview for this branch. Production promotion still requires the release blockers and explicit approval already recorded in this handover.

## Customer-document approval decision

- ADR 0044 records the owner's decision that solicitor approval is not a technical or commercial release prerequisite for customer documents.
- Public sales still require exact Terms, Privacy, Cookie, applicable data-processing and Custom Project documents that match the implemented product, are versioned and hashed, and receive explicit owner approval in the release evidence.
- Independent legal review is optional and risk-based. Existing clinical, financial and other regulated project-specific hard stops remain unchanged.
- The mandatory NDA remains parked. No placeholder is approved or active, and this decision does not authorize production publication or customer sales.
- A desktop/mobile browser regression verifies that Pricing, Privacy and Terms require owner approval without reinstating a universal solicitor gate. The complete disposable verification contract passes.

## Hosted owner-approval migration checkpoint

- Supabase staging migration 0075 is applied. The hosted schema now has `owner_approval_reference`, `owner_approved_at` and `independent_review_reference` on `kxra.legal_documents`, the validated `legal_documents_approved_by_owner` constraint, the `legal_document_owner_approval_normalize` trigger and its restricted normalization function.
- The same transaction backfilled existing approved documents. A subsequent guarded verification found no approved document missing owner approval evidence.
- `public.kxra_schema_migrations` records `0075_owner_approved_legal_documents.sql` with SHA-256 `85e103d36858161c632db520547f836abb9aa31a081eac806719f9cba5ab5ef7` and source commit `bc6120ca6fa5c2d2aa57f64fcb8f3e6cae95f33c`.
- Both SQL Editor transactions reported success. Production was not touched. The database password was reset after it was accidentally entered into an ordinary local terminal; the replacement password was never provided to Codex or used by the application.
- Exact owner-approved customer-document content, commercial limits, tax treatment and Stripe test-mode evidence remain release blockers. Migration 0075 removes the obsolete universal solicitor-approval dependency; it does not approve placeholder documents or authorize public sales.

## Founding-plan activation checkpoint

- ADR 0046 fixes the launch-candidate contract at £29 monthly or £290 yearly for one customer organisation. Both intervals include Brand Studio, 120 generated creative variants and 120 reviewed exports each month; unused units do not roll over.
- Ask KXRA, generated media, high-cost research, integrations and custom-project delivery are excluded until separately approved and priced. The public snapshot says this explicitly and remains review-only with checkout disabled.
- `staging:founding-plan:plan|apply|verify` now binds the exact Supabase staging project, two distinct Stripe TEST price IDs, the clean pushed phase branch and an apply-only confirmation. It creates one plan, two active versions, six deterministic feature rows and two TEST price mappings in one transaction and rejects existing mismatches rather than taking them over.
- Stripe Sandbox product `prod_VMHTknMmr7LV1r` exists. Use only `price_1ULYzlC84VkhhIRziFf99Grl` (£29 monthly, default) and `price_1ULYyIC84VkhhIRza8JkYHz5` (£290 yearly); both add applicable tax to the listed amount. The superseded automatically tax-inclusive monthly price is archived with zero active subscriptions.
- Migration `0076_brand_studio_catalogue_seed.sql` is applied and ledgered in authorized Supabase staging. Hosted verification proves 76 exact migrations, 172 RLS-protected tables, one active Brand Studio tool/version, one active founding plan, two plan versions, six feature rows and the two approved TEST price mappings. Implementation commit `ebba44953ec2ee813844ce7ecc5aa5f57a409ad4` passes GitHub full CI `36803453498` and CodeQL `36803453320`.
- Cancellation/refund/grace policy, exact customer-document approval, restricted billing-worker Stripe configuration, staging billing acceptance, WAF and release evidence remain separate gates. Checkout and live mode stay disabled.

## Customer-document draft checkpoint

- `apps/marketing/content/legal-draft-v1.json` is the canonical owner-review draft for Terms, Privacy, Cookie, Data Processing and Custom Project terms. The public `/legal` index and five document routes render only this source.
- Every route states that the draft is not in force. No database legal-document row has been imported, approved or activated, and no acceptance can be recorded from this draft.
- The registered entity details are KXRA GROUP LTD, company number 17435511, registered office 66 Paul Street, London, England, United Kingdom, EC2A 4NA. The launch scope is business customers only.
- ADR 0047 is accepted. The owner approved customer-document pack version 1 at SHA-256 `8277d2cbad017feaf4fea238d9eecedd1e7cfff0aaab6fa80fca5a239a8783a9` and confirmed that KXRA is not VAT registered. The current £29 monthly/£290 annual price therefore has no VAT added. The guarded import was applied to authorized Supabase staging after a clean preflight proved 76 migrations, zero target documents, zero active requirements and zero incomplete approvals. Independent database verification returned five exact approved documents, two exact active customer-only requirements and two active requirements in total. Cookie remains a notice; Data Processing and Custom Project terms apply only when relevant; NDA remains parked. Release-manifest binding and Stripe end-to-end acceptance remain pending.
- VAT registration status remains unresolved. Public draft wording says listed prices exclude applicable VAT or tax and that the total is shown before payment. Do not enable Checkout until the tax status and Stripe Tax configuration match the approved position.
- The long documents are script-free server HTML with one static stylesheet. This preserves readable content under the strict CSP and reduces the exact CSP from the rejected 9,549-character header to 3,717 characters with 64 hashes.
- The complete fresh GitHub contract passes implementation commit `b0ca8fa1d1e0a0cd14f2a78d10b8ba40d6bfcb46`: full CI run `36861911207` and SHA-matched CodeQL run `36861911192`. It covers 223 core tests, 76 migrations, 172 protected-table checks, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart/restore, all three builds, CSP/SRI, budgets, artifact exclusion, publication/secret scanning and dependency audits.
