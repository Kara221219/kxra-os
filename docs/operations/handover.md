# Engineering handover

Updated: 5 October 2026.

## Production project checkpoint

Supabase project `lhbgeucifxxcdoyrnesf`, **KXRA Production**, now exists in `eu-west-2` on Micro compute and reports healthy. The owner explicitly approved the additional approximately $10 monthly compute charge after reviewing the total startup budget. Data API is enabled, automatic exposure of new tables is disabled and automatic RLS is enabled.

The project is an empty production reservation. No KXRA migration, role, seed, owner account, legal record, commercial plan, provider credential or customer data has been installed. Do not point any `KXRA_STAGING_*` operator or Preview runtime at it. Read ADR 0051 and [the production bootstrap playbook](../playbooks/production-bootstrap-and-launch.md) before preparing any production operator.

Vercel team `husainkara-6439s-projects` is now on Pro. Dashboard evidence reports the plan active from 5 October to 5 November 2026, a $20 upcoming invoice, $20 included usage and zero infrastructure usage. The owner reduced the spend alert to $50; pausing and the webhook remain off. Observability Plus was disabled before paid renewal and the upcoming invoice remains $20. Read ADR 0052. No separately scoped Production variables, live Stripe object, production webhook, public domain cutover or customer onboarding has been authorized.

The local Supabase CLI created `supabase/.temp/cli-latest`; the path is now ignored because it is tool cache state, not source. No credential value was read, printed or written to the repository.

`scripts/production-migrations.mjs` is the prepared schema initializer. It is fixed to the production project, rejects Vercel and transaction-pooler execution, requires a clean pushed exact commit plus verified Supabase CA, and will plan only against an empty target. Its apply phrase binds the project and source SHA. It has not received a credential, connected to Production or executed an apply. Do not bypass its guards. The implementation passed the complete clean hermetic contract with 244 service/security tests, 82 migrations, 174 protected tables, 43 applicable private browser journeys with five intentional skips, both 18-journey public runs, restart/restore, all three optimized builds, security/publication scans and Lighthouse budgets. Two final TLS cases expand the suite to 246; implementation commit `35cf94fe1af2435998b40bb2626e4b6c08fd2038` passes full GitHub CI run `37376403077` and SHA-matched CodeQL run `37376403228`.

The first migration-0081 staging plan correctly failed closed on historical migration drift. Migration 0065 had received a one-condition edit after its original hosted application. Hosted ledger evidence proves the immutable source SHA-256 is `7af17804df2f895cbf260d5845641cd1589c0ffc225c74751366da359bd3820e` from commit `600391f4095908d1a31fffd65e0a240ad85237ae`; additive migration 0079 already carries and applies the later behavior. Migration 0065 is restored to the hosted bytes. Do not rewrite the hosted ledger.

## Current release-review checkpoint

The guarded `founding-private-launch-v1` candidate is finalized in authorized Supabase staging. Husain Kara signed the accessibility review at 10:05:50 and security review at 10:07:44 on 3 October 2026 after refreshing AAL2. Migration 0082 and the guarded atomic finalization bind both reviews and the hosted recovery evidence to the exact candidate. Read-only verification returns state `READY`, one immutable finalization, the expected recovery digest and no blockers. Supabase Pro is the current organisation plan at the owner-approved base price of $25 per month.

Supabase completed an isolated restore of the newest physical backup (`03 Oct 2026 06:38:46 (+0000)`) into project `sslsbcilxcbrbglenygg` at 18:42:32 UTC. Read-only SQL verification found 80 migrations through 0080, 172 RLS-protected tables, 12 project records and one blocked `founding-private-launch-v1` manifest. Migration 0081 and its review table are correctly absent because the backup predates their hosted application. The source staging project was not overwritten. Storage objects/settings, Edge Functions, Auth settings/API keys, database extensions/settings and replicas are outside the database restore and retain separate recovery procedures.

Migration `0081_release_review_attestations.sql`, ADR 0049 and owner Admin forms for the two human reviews are pushed, deployed to Preview and applied to authorized Supabase staging. The hosted migration ledger binds 0081 to SHA-256 `e919efce4f033c2f5b36eeee4670056f70d65196f3a78847c7313b90c46a446a` and source commit `d388964ec674364cf671fdffe25ff4f851a2ea2d`. Both immutable attestations are now present and attributable to the authenticated owner. They cannot deploy, publish, enable live billing, grant access or change the release state.

The current complete contract passes 241/241 service tests, 82 migrations, 174 RLS-protected tables, 148 exposed functions, 43 applicable private browser journeys with five intentional skips, both 18-journey public runs in development and optimized-production modes, restart, a 3,037-row/15-object empty-target restore, all three builds, a 476-file publication/secret scan and every security/performance gate. Hosted staging verifies 82 migrations, 174/174 RLS-protected KXRA tables, one finalization, recovery digest `5d093c3bde37b164084de31f30657ec327cfb61347dd722bec3de4e34bcc290c`, `ready=true` and no blockers. Owner Admin independently presents `READY` and 174/174 RLS tables; the stale pre-finalization review-card wording is corrected. Commit `f5db9b66f0f9fdfc01908b421878b3c8210f6679` passes GitHub CI run `37156264236` and CodeQL run `37156264228`. After explicit owner confirmation, temporary recovery project `sslsbcilxcbrbglenygg` was permanently deleted, stopping the estimated $9.68 monthly recovery-project charge. The organisation now contains KXRA Staging and the intentionally separate empty KXRA Production project recorded above. Production deployment, publication, live Stripe and `main` remain unauthorized.

Owner Admin now reads the immutable finalization row when reporting backup readiness. It shows the finalization timestamp, a bounded recovery-evidence digest and an explicit `Production authority: NOT GRANTED` boundary for a ready release; an unfinalized release still reports missing evidence. Preview log inspection exposed concurrent queries on Admin's single transaction client; those reads are now sequential inside the same authenticated RLS transaction, removing the pg@9 deprecation path. The post-change hermetic contract passes 241/241 service tests, 82 migrations, 174 protected tables, 43 applicable private browser journeys, both 18-journey public runs, restart and 3,038-row/15-object restore, all builds, scans and Lighthouse budgets.

## Blocked launch-candidate preparation

The branch now contains a guarded staging operator for `founding-private-launch-v1`. Its reviewed source binds the five owner-approved customer documents, KXRA Founding at £29 monthly, 120 monthly generation and export units, the approved cancellation/refund/grace/tax/retention terms, four current launch subprocessors, the reviewed disabled public-copy hash, the public `info@kxra-group.com` contact and completed Core Preview, Auth/RLS, Stripe Sandbox and email evidence.

The operator is intentionally unable to report release readiness. Its exact expected blockers are hosted provider backup/restore evidence, a named human accessibility review and a named human security review. It rejects existing drift and requires the exact Supabase staging target, verified TLS, a clean pushed `codex/phase-2-completion` head and a separate apply phrase. No production, live Stripe, publication or `main` authority was added.

The preceding guarded-candidate implementation passed 237/237 service tests. The current 239-test result and migration/table counts are recorded in the checkpoint above. The Admin checklist passes at desktop, mobile and 200% text sizing.

That guarded plan/apply/verify sequence is complete and Owner Admin shows the exact three remaining items. Do not fill review identities or dates until the reviews have actually occurred.

## Hosted partner isolation cycle complete

The controlled iCloud partner session is restored to its original PROJECT-002 viewer grant after a bounded revoke/restore acceptance cycle. The owner executed both exact state changes through the approval system with recent AAL2. No production or `main` change occurred.

The partner browser remained signed in throughout revocation. On the next requests it moved from one visible project to zero, PROJECT-002 search returned generic `Not found`, and Ask KXRA exposed no project. After restoration, the same session returned to exactly one project. `/api/projects` contains only PROJECT-002, allowed search returns only PROJECT-002 evidence, direct PROJECT-003 and cross-project search return generic `Not found`, and the Ask KXRA project menu contains only PROJECT-002. This completes the previously outstanding isolated-cookie direct-API and active-session revocation sequence.

Hosted staging has no file rows. The empty Files UI and API are verified, but a real cross-project object/download denial remains unexercised in hosted Preview until a safe staged file exists. Automated database, HTTP and browser isolation tests cover that boundary. Do not create customer-like file content solely to remove this evidence limitation.

## Preview enquiry ingress and WAF observation complete

Vercel has one active Preview-only firewall rule for `kxra-marketing-staging`: `KXRA enquiry observation` (`rule_kxra_enquiry_observation_Zlx5Sp`). It matches only Preview requests where the path equals `/api/enquiries` and the method equals `POST`; its action is `Log`. It cannot block traffic and does not target Production.

Ordinary protected-browser traffic produced 12 logged requests attributed to the exact rule, host and `/api/enquiries` path. The accepted synthetic ingress receipt remains the sole matching database record; repeated/rejected browser attempts created no duplicate inbox rows. Keep the rule in log mode. These synthetic repeats are not a customer-traffic baseline and do not justify a rate limit.

## Stripe Sandbox acceptance and resubscription complete

Branch `codex/phase-2-completion` is pushed through implementation commit `c38f0e3b3f9ab3a7b5f11b0a9b5013db169477ad`. Hosted Supabase contains 80 reviewed migrations and 172 RLS-protected tables. The synthetic Stripe test subscription completed its full create, update and delete lifecycle through the protected Preview webhook. End-of-period cancellation retained the three plan entitlements; immediate cancellation removed them. The final database state is `CANCELLED`, `cancel_at_period_end=false`, three signed events, three processed provider events, zero effective entitlements and zero overlapping entitlement periods.

Migration 0079 fixes the overlap found during the hosted lifecycle by closing prior source periods before inserting the current subscription state. It also repairs existing overlaps without granting access. Commit `f6bc87cfb6c8ac8396e65dbf0895ec05ee4fc773` passed the complete 233-test GitHub CI contract, CodeQL and 79-migration/172-protected-table verification.

The post-cancellation visual recheck found that an unexpired `READY` Checkout intent could replay a completed Checkout URL or conflict when the customer selected the other billing interval. Migration 0080 binds reuse to the same plan and refuses to reuse a ready intent after a later subscription proves it was consumed. The focused migration/Stripe contract passes 16/16, type checking and formatting pass, and a disposable database verifies 80 migrations and 172 protected tables. Hosted staging records the exact migration checksum `afdba48c71591cf9354ea59b122ecd4bb8af306a57fe0a384ce218bf7a93fc50`; the function guard was verified read-only.

The exact implementation commit passed GitHub CI run `37063068727`: 233/233 core tests, 80 migrations, 172 protected tables, 43 private browser journeys, 18 public journeys in each runtime mode, restart persistence, a 3,037-row/15-object empty-target restore, all three builds, CSP/SRI, size, publication/secret and Lighthouse gates. CodeQL run `37063068597` and all three Vercel Preview deployments pass at the same SHA.

The Preview automation-bypass secret was rotated after it became visible during provider configuration, and the Stripe test webhook was updated. A manual event resend is recorded by Stripe as `Delivered`, `Recovered`, `200 OK`; PostgreSQL remained cancelled with zero entitlements after replay. Temporary environment exports were deleted. No live Stripe credential, production deployment or `main` merge occurred.

Stripe's account name and customer-facing trading name now read `KXRA Group`, and the customer bank-statement descriptor is `KXRA GROUP`. Stripe Business details visibly confirm the saved values. Portal branding was visually accepted, and a new annual Checkout opened from the cancelled state showing KXRA Group, KXRA Founding and £290 per year. No payment method was entered and no purchase was submitted. Keep live mode disabled until the remaining release evidence and an explicit production decision are complete.

## Earlier billing activation checkpoint

Migration 0077 and the guarded billing-runner operator are implemented locally. Release readiness now checks the explicit owner approval fields introduced by migration 0075; it does not infer independent legal review and does not restore the parked NDA. Staging configuration supports a test-only `subscription-billing` profile and a combined `transactional-email-and-billing` profile. Thirty-two focused tests pass across release evidence, forged tenant denial, customer bootstrap, hosted sessions, signed webhook replay/order, entitlement grant/removal and restricted role structure. The complete hermetic contract passes 231 core tests, 77 migrations, 172 protected tables, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart/restore, all builds and the security/performance gates.

Hosted Supabase had migration 0077 and the exact restricted `kxra_billing_runner` at this checkpoint. Stripe Sandbox had a restricted test key, customer portal configuration `bpc_1ULqnpC84VkhhIRzEh19PWjz` and active webhook destination `we_1ULqtcC84VkhhIRzUqInZXf1` for the five subscription lifecycle events. The four billing values were stored only on the `codex/phase-2-completion` Preview branch; billing was enabled under the combined `transactional-email-and-billing` profile. Preview deployment `dpl_8iUshgA3Ao6e2Vpgi26tJB3DbFhh` was Ready, `/login` returned 200 through authenticated Vercel access and an invalid webhook signature returned the required bounded 400 response. The 2 October checkpoint above supersedes the pending lifecycle statement. Production and live-mode Stripe remain prohibited.

## Current commercial-foundation checkpoint

Branch `codex/phase-2-completion` is pushed through implementation commit `ebba44953ec2ee813844ce7ecc5aa5f57a409ad4`. Migration `0076_brand_studio_catalogue_seed.sql` is applied to authorized Supabase staging and ledgered at SHA-256 `cfa889bc6b3d3a75e16c277a3b313d99abc6e75bbc2ae432e471187309444cf7` against that source commit. Hosted verification proves 76 exact migrations, 172 RLS-protected tables, 146 exposed `kxra` functions, one active Brand Studio catalogue record and one active version. The migration imports no identity, fixture entitlement or provider authority.

The founding commercial plan is active in staging with one plan, two versions, six exact feature rows and two Stripe TEST price references. The monthly and annual versions provide Brand Studio access plus 120 generated creative variants and 120 reviewed exports per month with no rollover. Stripe Sandbox product `prod_VMHTknMmr7LV1r` has the approved tax-exclusive prices `price_1ULYzlC84VkhhIRziFf99Grl` (£29 monthly, default) and `price_1ULYyIC84VkhhIRza8JkYHz5` (£290 yearly). Superseded tax-inclusive price `price_1ULYv0C84VkhhIRzivfFjr42` is archived and has zero active subscriptions.

The exact implementation commit passes the full local hermetic contract: 222 core tests, 76 migrations, 172 protected tables, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart persistence, a 3,015-row/15-object empty-target restore, all three optimized builds, 72 exact CSP hashes, 129 SRI records, build budgets, a 439-file artifact/secret scan and Lighthouse 1.00 performance/accessibility. GitHub CodeQL run `36803453320` and full CI run `36803453498` pass at the same SHA.

Checkout and customer sales remain disabled. Cancellation, refund and grace-period policy, exact customer documents, restricted billing-worker Stripe configuration, complete test Checkout lifecycle and Preview WAF evidence are complete. Production, live Stripe and `main` remain untouched while the remaining release evidence is completed.

## Current governed-improvement checkpoint

The working branch adds an owner-only Improvement Loop without adding a new autonomous agent or database authority. `improvementLoop()` reads only current governed records under the verified owner/RLS transaction and returns ranked repair, decide, measure, test and review signals. The owner UI links each signal to the existing typed workflow. The policy reports zero automatic consequential actions. Partner navigation and direct API access fail closed.

The public site now explains KXRA as a business operating platform rather than only an AI/venture concept. `/platform` identifies buyer groups and the measured learning loop. ADR 0045 sets `/pricing` at £29 per organisation per month or £290 per year, keeps custom projects and expensive usage separate, and preserves auditable free partner access. Checkout remains disabled. The reviewed publication snapshot remains disabled and hash-bound.

The exact working tree passes the complete hermetic contract: 219 core tests, 75 migrations, 172 protected tables, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart persistence, a 3,014-row/15-object empty-target restore, all three optimized builds, CSP/SRI, build budgets, artifact/secret scans and Lighthouse budgets. Migration 0075 records explicit owner approval for customer documents and preserves immutable evidence; independent review is optional. No live provider call, customer contact, paid generation, production deployment or `main` merge occurred. Before continuing commercial activation, read [ADR 0045](../decisions/0045-founding-subscription-price.md), the [pricing research](../research/subscription-pricing-2026-10-01.md) and the [platform review](platform-review-2026-09-30.md).

## Current hosted twelve-project checkpoint

Branch `codex/phase-2-completion` is pushed through commit `dd892636d78d7df3c747fdc8c198bd9177487b55`. The guarded Supabase operator applied and verified migration 0074 and the expanded canonical seed. Hosted staging now verifies 74 migrations, 172 RLS-protected tables, 146 exposed `kxra` functions and twelve canonical projects. The two migration-0074 internal functions remain in `kxra_private` and are not counted as exposed application functions.

Seed history is now explicitly versioned. The existing seven-project `KXRA-CANONICAL-SEEDS-V1` row and exact hash remain immutable. `KXRA-CANONICAL-SEEDS-V2` verifies that predecessor, imports the twelve-project source set atomically and records a separate history row. Unknown profiles, altered predecessor/current hashes, unmanaged canonical rows and provenance drift fail closed. The hosted plan, apply and verify sequence completed successfully; no fixture identity, active legal/commercial state, entitlement, billing record or provider authority was imported.

The exact V2 commit passes the complete local hermetic contract: 219 core tests, 74 migrations, 172 protected tables, 43 applicable private browser journeys with five intentional skips, both 14-journey public runs, restart persistence, a 3,014-row/15-object empty-target restore, all three builds, CSP/SRI, build budgets, artifact exclusion, a 426-file publication/secret scan and Lighthouse 1.00 performance/accessibility for both measured routes. GitHub CodeQL run `36768006957` and full CI run `36768007053` pass at the same SHA. Matching OS deployment `dpl_67omxHuJvqeMw7ypHVE9CQiAcuMY`, marketing deployment `dpl_7cijxTKw2YpPAxmNcwPXTdK42igW` and isolated email-worker deployment `dpl_2A6w5AbcFb8aaq9c6MeDd9y4vbBD` are Ready Preview builds at their stable phase-branch aliases. A later OS Preview repaired only its invalid restricted runtime password; the new deployment is Ready and the credential was not retained.

The controlled iCloud partner completed redemption and onboarding with exactly PROJECT-002 viewer access. Live UI checks passed for assigned-project visibility, direct PROJECT-003 and crafted-ID denial, owner Admin denial and one-project Ask scope. An exact owner approval revoked PROJECT-002; hosted PostgreSQL and the isolated signed-in partner session both immediately returned zero project authority. A second exact approval restored viewer access; the same session regained exactly PROJECT-002 while PROJECT-003 and the crafted UUID remained invisible.

Production and `main` remain untouched. Preview WAF and isolated-cookie hosted HTTP/direct-API revocation evidence are complete; customer release still requires the remaining provider/release evidence and a hosted cross-project file-object test once a safe staged file exists.

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

The historical hosted-acceptance checkpoint is superseded: the verified AAL2 owner, isolated signed-in partner revoke/restore cycle, direct-API/search checks and exact Preview WAF evidence all pass. Hosted file-object isolation remains limited by the absence of any staged file row.

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

1. complete the remaining hosted HTTP acceptance in a genuinely isolated partner cookie jar: direct API, cross-project files/search/Ask and active-session denial during a bounded revoke/restore cycle; the database-backed revoke/restore and UI crafted-project checks already pass. Keep the exact Preview WAF rule in log mode and collect representative traffic before considering a rate limit;
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
- Stripe Sandbox product `prod_VMHTknMmr7LV1r` exists. Use only `price_1ULYzlC84VkhhIRziFf99Grl` (£29 monthly, default) and `price_1ULYyIC84VkhhIRza8JkYHz5` (£290 yearly). Both are tax-exclusive prices; no VAT is currently added because the owner confirmed that KXRA is not VAT registered. The superseded automatically tax-inclusive monthly price is archived with zero active subscriptions.
- Migration `0076_brand_studio_catalogue_seed.sql` is applied and ledgered in authorized Supabase staging. Hosted verification proves 76 exact migrations, 172 RLS-protected tables, one active Brand Studio tool/version, one active founding plan, two plan versions, six feature rows and the two approved TEST price mappings. Implementation commit `ebba44953ec2ee813844ce7ecc5aa5f57a409ad4` passes GitHub full CI `36803453498` and CodeQL `36803453320`.
- Cancellation/refund/grace policy, customer-document approval, restricted billing-worker Stripe configuration, staging billing acceptance and Preview WAF observation are complete. Remaining release evidence is still a separate gate. Live mode stays disabled.

## Customer-document approval checkpoint

- `apps/marketing/content/legal-draft-v1.json` is the canonical source for Terms, Privacy, Cookie, Data Processing and Custom Project terms. The public `/legal` index and five document routes render only this reviewed content.
- The exact version 1 pack is owner-approved and imported in hosted staging. Terms and Privacy are active customer requirements; Cookie remains a notice, and Data Processing and Custom Project terms apply only when relevant. Acceptance remains version-bound and auditable.
- The registered entity details are KXRA GROUP LTD, company number 17435511, registered office 66 Paul Street, London, England, United Kingdom, EC2A 4NA. The launch scope is business customers only.
- ADR 0047 is accepted. The owner approved customer-document pack version 1 at SHA-256 `8277d2cbad017feaf4fea238d9eecedd1e7cfff0aaab6fa80fca5a239a8783a9` and confirmed that KXRA is not VAT registered. The current £29 monthly/£290 annual price therefore has no VAT added. The guarded import was applied to authorized Supabase staging after a clean preflight proved 76 migrations, zero target documents, zero active requirements and zero incomplete approvals. Independent database verification returned five exact approved documents, two exact active customer-only requirements and two active requirements in total. Cookie remains a notice; Data Processing and Custom Project terms apply only when relevant; NDA remains parked. Release-manifest binding and Stripe end-to-end acceptance remain pending.
- The owner confirmed that KXRA is not VAT registered. The current £29 monthly/£290 annual plan does not add VAT; revisit pricing and Stripe Tax before charging VAT or after any registration-status change.
- The long documents are script-free server HTML with one static stylesheet. This preserves readable content under the strict CSP and reduces the exact CSP from the rejected 9,549-character header to 3,717 characters with 64 hashes.
- The complete fresh GitHub contract passes implementation commit `b0ca8fa1d1e0a0cd14f2a78d10b8ba40d6bfcb46`: full CI run `36861911207` and SHA-matched CodeQL run `36861911192`. It covers 223 core tests, 76 migrations, 172 protected-table checks, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart/restore, all three builds, CSP/SRI, budgets, artifact exclusion, publication/secret scanning and dependency audits.

## Current public-ingress handover — 3 October 2026

- Branch `codex/phase-2-completion` contains the verified public-form fallback and database TLS repair through commit `29d7600`. Do not merge or deploy Production yet.
- Marketing Preview deployment `dpl_3YtRnnXwEZokXchG6n3LX2foYySX` is Ready at the stable phase-branch alias. Its branch-only CA secret is the official Supabase Root 2021 certificate; no credential value or certificate body is stored in Git or these records.
- The live Preview enquiry endpoint returned `202 Accepted`. Supabase contains receipt `46d33e37-7a02-4b2b-bc13-29a130cbf069` as an owner-only `CONTACT`, status `UNVERIFIED`, source `/contact`. The record is synthetic and requires no response.
- Root cause of the prior 503 was application-level SSL option precedence: URL `sslmode` replaced the explicit verified CA object in the marketing route. The route now uses `databaseConnectionString(...)` to strip URL SSL controls before applying `databaseSsl()`.
- Safe diagnostics may log only bounded error class, public certificate metadata and endpoint/username mode. They do not log credentials, URLs, form content or source addresses.
- Local acceptance is green: 234 core tests; 80 migrations and 172 RLS tables; 43 private browser journeys with five intentional skips; both 18-test public runs; restart/restore; all three optimized builds; CSP/SRI, size, artifact and secret gates; Lighthouse 1.00 performance/accessibility.
- Ordinary protected-browser attempts incremented Vercel Firewall `Logged` to 12 for the exact rule, host and `/api/enquiries` path. The rule stayed non-blocking. Supabase still contains exactly one matching accepted synthetic record, so the repeated/rejected observation attempts created no duplicates. Keep the rule in log mode; the synthetic sample is not sufficient evidence for a rate limit.
- GitHub full CI run `37080911556` passed in 14m48s at documentation commit `31d8ee0`; the associated CodeQL run `37080911548` also passed.

# Production foundation operator prepared

The production database initializer is now followed by `scripts/production-bootstrap.mjs`. This second guarded operator imports the twelve canonical projects and registers, installs the owner-approved customer-document pack and provisions the restricted `kxra_app`, `kxra_public_ingress`, `kxra_email_runner` and `kxra_billing_runner` logins. It refuses Vercel execution, a dirty or unpushed tree, a non-production project, incomplete migrations, unmanaged canonical state, unsafe role takeover, reused/weak passwords or a mismatched source commit. Production remains unmodified until the exact release commit passes CI/CodeQL and the operator receives credentials locally.

Local verification is complete: 248 database/domain/HTTP/security tests, 82 migrations, 174 protected tables, 43 applicable private browser journeys, two 18-journey public-site runs, restart/restore, all three builds, CSP/SRI, artifact and secret scans, build budgets and tested Lighthouse performance/accessibility all pass.

# Production infrastructure checkpoint — 6 October 2026

- The production Supabase project is `lhbgeucifxxcdoyrnesf`. SSL enforcement is enabled. Guarded migration/bootstrap verification completed with the production schema, RLS, twelve canonical project/register records, the approved customer-document pack and separate `kxra_app`, `kxra_public_ingress`, `kxra_email_runner` and `kxra_billing_runner` login roles.
- Supabase Auth uses `https://app.kxra-group.com` as the site URL and permits only the expected callback and password-reset routes on that origin. The public publishable browser key and private connection credentials are configured in their appropriate Vercel environments; no secret value belongs in source, documentation or terminal output.
- Isolated Vercel production projects exist as `kxra-os`, `kxra-marketing` and `kxra-email-worker`. Their roots are `apps/os`, `apps/marketing` and `apps/email-worker`; all use Node 22 and the repository build wrappers.
- Billing, email delivery, AI, WhatsApp, storage and telemetry are still off. Do not label those workflows live until provider credentials, webhooks, negative-path tests and hosted acceptance are complete. The current billing worker intentionally rejects Stripe live-mode events and sessions.
- The first domain-free production deployment uploaded no code. The local Vercel packager encountered `.runtime/socket/.s.PGSQL.55439` before upload. `.vercelignore` now excludes runtime sockets, credentials, source documents, tests, database sources and other non-runtime material, while retaining only required application/build source. `scripts/verify-production-artifact.mjs` enforces this boundary.
- Next sequence: pass the full local contract; commit and push the boundary repair; obtain exact-SHA CI and CodeQL success; deploy all three projects without domains; run hosted health, authentication, access-isolation, legal/pricing and public-form acceptance; then connect domains. Live Stripe, email and external messaging require separate controlled activation after their own evidence passes.
