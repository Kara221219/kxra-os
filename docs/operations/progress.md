# KXRA OS implementation progress

> Latest local update: 16 October 2026 — team-and-agent workspace rebuild. See the final checkpoint, [ADR 0056](../decisions/0056-team-and-agent-workspace.md) and [completion matrix](../workspace/completion-matrix.md). Earlier dated entries are historical, not current launch claims.

Updated: 6 October 2026. Status: **The production database foundation and three same-commit Vercel services are deployed behind Vercel Authentication. Production owner enrollment, custom-domain cutover, public acceptance, live commerce and customer onboarding remain closed. The phase branch has not been merged to `main`.**

## Production deployment and owner-gate checkpoint — 6 October 2026

- Supabase Production `lhbgeucifxxcdoyrnesf` now has the verified 82-migration KXRA schema, 174 RLS-protected tables, canonical twelve-project/register state, approved customer documents and four separate least-privilege runtime logins. SSL enforcement and production Auth redirect restrictions are enabled.
- Exact commit `bd7268fe2d60c6d76cbee7708a3fe97ea74c52e8` passed GitHub CI `37392427505` and CodeQL `37392427696`. Same-commit production deployments for OS, marketing and email worker are `READY` behind Vercel Authentication. No KXRA custom domain is attached and no customer traffic is enabled.
- A hosted marketing build initially failed because query-decorated asset URLs did not resolve to the immutable SRI manifest. The build now normalizes static asset paths. Vercel's production toolbar was also disabled because its post-build injection changed the Webpack runtime after SRI generation. The final marketing deployment has seven of seven exact script-integrity hashes, correct CSP/security headers and the expected production-origin guard.
- Anonymous OS, crafted-project, direct-context, disabled Stripe-webhook and unsigned email-worker probes fail closed. Marketing home, pricing, legal documents and origin/schema rejection paths behave as designed. A valid public enquiry remains intentionally untested because Vercel Authentication blocks all public traffic until cutover.
- Added a production-only owner operator with plan/apply/verify modes, exact production-project and source-commit binding, clean/pushed-branch guard, confirmed Supabase Auth identity requirement, singleton-owner takeover rejection, separate production audit labels and mandatory verified MFA for final success. Shared owner persistence remains database-tested for both staging and production labels.
- Production Auth currently has no users. The next account action is the intended owner invitation, followed by guarded identity preparation, owner sign-in, MFA enrollment and final operator verification. This must precede customer invitations and public application access.
- Billing, email delivery, AI, WhatsApp, Storage and telemetry remain disabled. Existing Stripe objects are test-mode only; the billing implementation still rejects live mode. KXRA is therefore not yet charging customers and must not be represented as customer-live.

## Production infrastructure reservation

- After reviewing the expected costs, the owner explicitly approved Supabase's approximately $10 monthly charge for a second active Micro project. Supabase created **KXRA Production** as project `lhbgeucifxxcdoyrnesf` in `eu-west-2` and reports it healthy.
- Data API is enabled. Automatic exposure of new tables is disabled, and automatic RLS is enabled for new public tables.
- Project creation did not copy staging. Production currently has no KXRA migration ledger, schema, runtime roles, owner membership, canonical seeds, legal/customer records, plans, provider credentials or application traffic.
- ADR 0051 and the production bootstrap playbook fix the environment boundary and launch order. Existing staging operators remain prohibited from targeting Production.
- The owner completed Vercel billing setup and activated Pro. Dashboard evidence reports an active 5 October–5 November billing period, $20 monthly included usage credit, zero infrastructure usage and a $20 upcoming invoice. ADR 0052 records the production boundary and cost controls; activation did not deploy Production or authorize customer traffic.
- The owner-approved Vercel spend-management budget is now $50 with alerts at 50%, 75% and 100%; pausing and the webhook remain off. Observability Plus was disabled before paid renewal. Other paid add-ons, AI Gateway auto-reload and Vercel Agent usage billing remain off. The upcoming invoice remains $20.
- Current expected fixed platform cost is approximately $55 monthly before tax and overages: $35 Supabase for Pro plus two active Micro projects after the included compute credit, and $20 Vercel Pro. This estimate excludes optional and usage-based services.
- Supabase's 5 October changelog was reviewed. KXRA does not use the deprecated `@supabase/server` framework adapters. The new project's disabled automatic table exposure matches the announced Data API default change. The PostgreSQL 15.19/17.11 extension/index warning must be checked against the production extension inventory before initialization.
- Added a production-only database migration operator and negative guard tests. It is fixed to project `lhbgeucifxxcdoyrnesf`, requires a clean pushed exact source commit and verified TLS, inspects the empty target and extension inventory during `plan`, and refuses `apply` without an exact project-and-commit confirmation. No credential was supplied and the operator has not connected to or modified Production. The complete clean hermetic contract passed 244/244 service and security tests, 82 migrations, 174 protected tables, 43 applicable private browser journeys with five intentional skips, both 18-journey public runs, restart persistence, a 3,037-row/15-object empty-target restore, all three optimized builds, CSP/SRI and build budgets, a 483-file publication/secret scan, and Lighthouse 1.00 performance/accessibility budgets. Two final TLS cases expand the suite to 246 tests; implementation commit `35cf94fe1af2435998b40bb2626e4b6c08fd2038` passes full GitHub CI run `37376403077` and SHA-matched CodeQL run `37376403228`.

## Hosted release candidate and governed human reviews

- Applied migration `0082_release_finalization_evidence.sql` to authorized Supabase staging and ledgered it at SHA-256 `057a0c58c736cf76acd04bf4ca464cb26cd4926b970fe9113a2dfdcb45b93b0d` against commit `8f23b12da10ea5b74507ce5882a162fed6d76c23`. The atomic finalization bound the two owner attestations and hosted recovery evidence to the exact `founding-private-launch-v1` candidate and changed only that manifest from `BLOCKED` to evidence-only `READY`.
- Supabase Pro is active for the staging organisation at the owner-approved base price of $25 per month. The provider Backups surface identifies the organisation as Pro and exposes six completed physical daily backups from 28 September through 3 October 2026; the newest is `03 Oct 2026 06:38:46 (+0000)`. This establishes hosted backup availability, but not restoration success.
- Supabase completed the isolated `Restore to new project` rehearsal against the 3 October backup at 18:42:32 UTC. The separate `eu-west-2` recovery project contains 80 migrations through 0080, 172 RLS-protected KXRA tables, 12 project records and the blocked `founding-private-launch-v1` manifest. The expected absence of migration 0081 proves the selected backup's point-in-time boundary. The source staging database was not overwritten. Storage objects/settings, Edge Functions, Auth settings/API keys, database extensions/settings and replicas remain separate recovery concerns.
- Added hash-bound hosted recovery evidence, ADR 0050, migration 0082's immutable finalization record and a clean/pushed-branch staging finalization operator. Hosted verification returns 82 migrations, latest migration 0082, 174 KXRA tables, 174 RLS-protected tables, one finalization, recovery digest `5d093c3bde37b164084de31f30657ec327cfb61347dd722bec3de4e34bcc290c`, `ready=true` and an empty blocker array. Owner Admin independently presents `READY` and 174/174 RLS tables. Its signed-review cards now describe the completed evidence binding instead of retaining the pre-finalization waiting message. The operator cannot deploy, publish, enable live billing, grant access or merge `main`.
- Added immutable owner accessibility and security attestations in migration `0081_release_review_attestations.sql`. Both the application and database require recent owner MFA; the database derives identity from the authenticated session and rejects partners, direct inserts, AAL1, incomplete checklists, changed candidates and replay.
- Each review binds the exact base-candidate SHA-256 and versioned review-packet SHA-256. Recording a review cannot change release state, deploy, publish, enable live billing, grant access or merge `main`.
- The current complete hermetic contract passes 241/241 database/domain/HTTP/security tests, 82 migrations, 174 protected tables, 148 exposed `kxra` functions, 43 applicable private browser journeys with five intentional skips, both 18-journey public runs in development and optimized-production modes, restart persistence, a 3,037-row/15-object empty-target restore, all three optimized builds, 64 exact CSP hashes, 101 SRI references, a 476-file publication/secret scan, and Lighthouse 1.00 performance/accessibility on both measured routes.
- Migration 0081 is applied to authorized Supabase staging and independently ledger-verified at SHA-256 `e919efce4f033c2f5b36eeee4670056f70d65196f3a78847c7313b90c46a446a` against commit `d388964ec674364cf671fdffe25ff4f851a2ea2d`. Husain Kara recorded the accessibility review at 10:05:50 and security review at 10:07:44 on 3 October 2026 after a fresh AAL2 challenge. Commit `8f23b12da10ea5b74507ce5882a162fed6d76c23` passed GitHub full CI run `37148158100` and CodeQL run `37148158092`; migration 0082 and the guarded hosted finalization are now applied and independently verified.
- Commit `f5db9b66f0f9fdfc01908b421878b3c8210f6679` records the hosted finalization and corrects the stale Admin review wording. GitHub full CI run `37156264236` and CodeQL run `37156264228` both pass. After explicit owner confirmation, temporary recovery project `sslsbcilxcbrbglenygg` was permanently deleted; the Supabase organisation project list now contains only KXRA Staging.
- Owner Admin now derives its backup control from the immutable finalization row instead of presenting a hard-coded missing-evidence warning. A finalized ready candidate displays the finalization time, a bounded recovery-evidence digest and `Production authority: NOT GRANTED`; an unfinalized candidate continues to fail closed. A Preview runtime-log check then found and removed concurrent `query()` calls on the single transaction client used by Admin, avoiding the PostgreSQL driver's pg@9 deprecation path while preserving one authenticated RLS transaction. The complete hermetic contract passes unchanged at 241/241 tests, 82 migrations, 174 protected tables, 43 private browser journeys, both 18-journey public runs, restart and 3,038-row/15-object restore, all builds, security scans and Lighthouse budgets.

## Guarded customer release candidate

- Added one immutable private-launch candidate source that binds the owner-approved customer-document pack, £29 KXRA Founding monthly plan, approved usage/policy terms, public-copy hash, `info@kxra-group.com` support route and four completed staging evidence classes.
- Added a clean-branch, exact-target, TLS-verified staging operator with plan/apply/verify modes. Existing drift causes takeover rejection; apply has its own exact confirmation phrase and creates no deployment, publication, charge or access grant.
- The candidate is intentionally `BLOCKED`. It omits provider-backed hosted backup/restore evidence and records no accessibility or security reviewer. The database must return exactly those three remaining checks; any broader or narrower result fails verification.
- Replaced opaque release codes in Owner Admin with an actionable checklist that separates engineering work from named owner sign-off. The approved retention policy is now represented accurately in Admin controls.
- The preceding guarded-candidate implementation passed 237/237 database/domain/HTTP/security tests. The current 239-test result and migration/table counts are recorded in the hosted release-candidate section above.

## Preview enquiry WAF observation checkpoint

- Published Vercel rule `KXRA enquiry observation` (`rule_kxra_enquiry_observation_Zlx5Sp`) on the `kxra-marketing-staging` project.
- The match is exact: request path equals `/api/enquiries`, method equals `POST`, and environment equals `Preview`. The action is `Log` only.
- Ordinary protected-browser traffic produced 12 logged requests for `/api/enquiries`; Vercel attributed all 12 to this exact rule, host and request path. The rule remained non-blocking. The 12 repeated synthetic attempts are observation evidence, not a representative customer traffic baseline, so no rate limit was inferred from them.
- The canonical accepted synthetic request remains receipt `46d33e37-7a02-4b2b-bc13-29a130cbf069`. A database query found no duplicate `KXRA WAF Observation Test%` records, confirming the rejected/repeated browser attempts did not create extra inbox items.
- No production firewall rule, blocking action, production deployment or `main` merge was created.

## Complete Stripe Sandbox lifecycle and security checkpoint

- Completed one owner-authorized synthetic monthly Checkout in Stripe test mode. The signed `customer.subscription.created` event produced the hosted subscription and three effective feature entitlements; KXRA showed Brand Studio as included.
- Exercised the customer portal end-to-end. End-of-period cancellation produced a signed update, set `cancel_at_period_end=true` and correctly retained access through the paid test period. Immediate test cancellation then produced a signed delete, set the hosted subscription to `CANCELLED` and removed all effective entitlements; KXRA showed Brand Studio as not included.
- Replayed the original create event after cancellation. The endpoint returned `200` with the existing processed state, while PostgreSQL remained `CANCELLED` with three signed lifecycle events, three processed provider-event records, zero effective entitlements and zero overlapping periods. This proves exact-event replay and out-of-order lifecycle handling are idempotent for the tested path.
- The lifecycle exposed an entitlement-ledger defect: subscription updates inserted another future-ended effective period without closing the prior period. Migration `0079_fix_subscription_entitlement_periods.sql` closes existing periods before inserting the current provider state and repairs hosted overlaps without granting access. Hosted migration count is now 79 and the overlap count is zero.
- Updated Stripe's Basil reconciliation to read item-level billing periods. The focused worker suite passes 7/7 for create, update, replay, stale events, delete and overlap regression. Commit `f6bc87cfb6c8ac8396e65dbf0895ec05ee4fc773` subsequently passed the complete 233-test GitHub CI contract and SHA-matched CodeQL; it also passed 79-migration/172-protected-table verification.
- Rotated the previously exposed Preview automation-bypass secret, replaced it on the Stripe test webhook and resent a signed event. Stripe recorded a recovered `200` delivery with `{"received":true,"state":"PROCESSED"}`. Temporary local environment exports were removed after verification.
- Changed Stripe's account name and customer-facing trading name from `FP&A` to `KXRA Group`, and changed the customer bank-statement descriptor from `FP&AA` to `KXRA GROUP`. Stripe Business details visibly show both saved values. Existing Portal and fresh Checkout sessions visibly use KXRA Group; the annual Checkout shows KXRA Founding at £290 per year and no purchase was submitted.
- The visual recheck found that an unexpired `READY` Checkout intent could be reused after its subscription was cancelled, replaying a completed Checkout URL or conflicting with another plan. Migration `0080_allow_checkout_after_cancelled_subscription.sql` now reuses an intent only for the same plan and only until no later subscription proves it was consumed. The focused migration/Stripe suite passes 16/16, type checking and formatting pass, and a disposable database verifies 80 migrations and 172 protected tables.
- Hosted migration 0080 is ledgered at SHA-256 `afdba48c71591cf9354ea59b122ecd4bb8af306a57fe0a384ce218bf7a93fc50` against commit `c38f0e3b3f9ab3a7b5f11b0a9b5013db169477ad`; a read-only verification confirmed the new guard. A fresh annual test Checkout then opened successfully from the cancelled state. Production/live-mode Stripe remains disabled.
- The exact implementation commit passed GitHub CI run `37063068727`: 233/233 core tests, 80 migrations, 172 protected tables, 43 private browser journeys, 18 public journeys in each runtime mode, restart persistence, a 3,037-row/15-object empty-target restore, all three builds, CSP/SRI, size, publication/secret and Lighthouse gates. CodeQL run `37063068597` and all three Vercel Preview deployments pass at the same SHA.

## Hosted Stripe staging configuration checkpoint

- Created the restricted Stripe Sandbox key `KXRA OS staging billing` with write access limited to Customers, Checkout Sessions and Customer Portal Sessions. No live key was created or stored.
- Saved customer portal configuration `bpc_1ULqnpC84VkhhIRzEh19PWjz` with invoice history, payment-method updates, end-of-period cancellation and cancellation-reason collection. Plan and quantity switching remain disabled.
- Activated webhook destination `we_1ULqtcC84VkhhIRzUqInZXf1` on the stable phase-branch Preview endpoint for exactly `customer.subscription.created`, `updated`, `deleted`, `paused` and `resumed`, using Stripe API version `2025-07-30.basil`.
- Stored `KXRA_BILLING_WORKER_DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_PORTAL_CONFIGURATION_ID` as branch-scoped Preview values only. Updated `KXRA_BILLING_ENABLED=true` and the combined `transactional-email-and-billing` profile. Production received none of these values.
- Preview deployment `dpl_8iUshgA3Ao6e2Vpgi26tJB3DbFhh` reached Ready at the stable phase-branch alias. Authenticated probes returned 200 for `/login` and 400 with the bounded invalid-webhook response for a deliberately invalid Stripe signature, proving the deployed route is enabled and fails closed.
- This configuration checkpoint is superseded by the completed 2 October lifecycle above. Merchant naming, statement descriptor and repeat visual acceptance are complete. Live-mode activation still requires the remaining release evidence and a separate explicit production decision.

## Founding-price and owner-document checkpoint

- Researched current official prices from Canva, Adobe Express, Buffer, Gamma, Zapier, Copy.ai and Jasper. ADR 0045 sets the KXRA launch candidate at £29 per organisation per month or £290 per year. Custom projects, generated media, high-cost research and integrations remain separately priced unless an exact plan includes them.
- The reviewed public pricing snapshot states the launch price, annual option, tax boundary, separate-work boundary and private-preview status. Checkout remains disabled and the snapshot remains hash-bound with publication disabled.
- Migration `0075_owner_approved_legal_documents.sql` makes explicit owner approval evidence authoritative for an `APPROVED` legal document. Independent review is optional evidence. The legacy reviewer field is populated only with a compatibility marker and no longer supplies approval authority.
- A negative database test proves a document cannot become approved without the owner reference and timestamp. Existing presentation and acceptance evidence remains immutable.
- The complete hermetic contract passes 219 core tests, 75 migrations, 172 protected tables, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart persistence, a 3,014-row/15-object empty-target restore, all three optimized builds, CSP/SRI, build budgets, artifact/secret scans and Lighthouse performance/accessibility scores of 1.00 on both measured routes.
- No Higgsfield request, provider charge, external send, production deployment or `main` merge occurred.

## Governed improvement and commercial-positioning checkpoint

- Reviewed the actual repository and product paths rather than the briefs. The platform already contained the necessary evidence, experiment, decision, approval, run and commercial records, but they were fragmented across separate registers.
- Added an owner-only Improvement Loop that deterministically ranks failed AI/routine runs, experiment results awaiting decisions, experiments awaiting measurement, current ideas awaiting tests and unverified enquiries. It creates no mutation and performs zero automatic consequential actions.
- The endpoint requires the verified KXRA owner before database access. Partner navigation omits it and partner/direct API requests return 403. Every signal links to the existing governed workflow that owns the next action.
- Reworked public product positioning around practical value, target users and the understand → prove → test → decide → improve operating loop. Added a `/pricing` route that presents the reviewed £29 monthly and £290 annual launch candidates, preserves separately scoped custom projects and explains auditable free partner access while checkout remains disabled.
- Updated the depth journey’s final chapter from a general controlled-AI claim to measured, governed learning. No generated assets, unsupported proof, customer claim or billable Higgsfield request was used.
- Added ADR 0043 and the actual [platform review](platform-review-2026-09-30.md). The final hermetic run passes 219 core tests, 74 migrations, 172 protected tables, 43 applicable private browser journeys with five intentional skips, both 16-journey public runs, restart/restore, three builds, CSP/SRI, artifact/secret and Lighthouse gates.

## Hosted owner and partner isolation checkpoint

- The controlled `h***@icloud.com` identity completed invitation redemption and all onboarding steps with no mandatory NDA. Its only project grant is PROJECT-002 as viewer; the owner remains the only KXRA owner and uses hosted password plus TOTP assurance.
- Live private UI checks in an isolated Safari partner session showed one partner project, read-only PROJECT-002 access, generic denial for direct PROJECT-003 and crafted UUID routes, no owner Admin access, and an Ask KXRA selector containing only PROJECT-002.
- The owner executed an exact current-state approval changing PROJECT-002 from active to revoked. Under the real hosted `authenticated` role and the partner's exact subject/organisation context, PostgreSQL RLS then returned zero visible projects, zero target-project records, zero target-project files and zero target-project knowledge chunks.
- The owner executed a second exact approval restoring the same PROJECT-002 viewer grant. Hosted RLS then returned exactly one visible project: PROJECT-002. PROJECT-003 and a crafted UUID remained invisible. The accidental no-op approval created during UI preparation was rejected and cannot execute.
- The deployed OS runtime database password had become invalid (`28P01`). Only the restricted `kxra_app` credential was rotated through a local non-echoing helper, verified through the transaction pooler and replaced in the OS Preview branch secret. The resulting Preview is Ready and invalid credentials now reach the correct bounded authentication failure instead of a configuration error. No secret was retained or printed.
- The isolated partner session remained signed in while the owner executed an exact revocation approval. Without logout, `/os/projects` fell to zero projects, PROJECT-002 evidence search changed to the generic `{"error":"Not found"}` response and Ask KXRA exposed no project option. This proves current membership is rechecked on each hosted request rather than cached in the browser session.
- After a fresh owner AAL2 challenge, the already approved restoration executed. The same partner session immediately regained exactly PROJECT-002. Direct `GET /api/projects` returned only PROJECT-002; direct PROJECT-003 and PROJECT-003 search returned generic `{"error":"Not found"}`; PROJECT-002 search returned only PROJECT-002 evidence; and Ask KXRA exposed exactly `PROJECT-002 · US Vehicle Seat Covers`.
- Hosted staging currently contains zero file rows, so a real cross-project object/download attempt cannot be exercised without introducing a safe staged file. The Files UI and `/api/files` returned no files, while the hermetic SQL/HTTP/browser suite continues to cover cross-project file isolation. This is an explicit evidence limitation, not a claimed hosted file pass.

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
- Owner password establishment, hosted sign-in, TOTP enrollment and guarded final owner verification are complete. The database password was rotated by the owner and the documented Supavisor credential-cache delay cleared on a fresh connection. Hosted owner/partner/RLS and exact Preview WAF acceptance now pass; the isolated-cookie HTTP revocation sequence and remaining release evidence remain pending.

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

- Exact owner-approved Terms, Privacy, Cookie, AI/data-processing and Custom Project documents. Independent legal review is optional and risk-based under ADR 0044; NDA/confidentiality is parked for later reconsideration.
- Customer discovery decisions for the initial segment, exact plan limits, free-partner policy and custom-project terms. The launch-candidate price is decided under ADR 0045.
- Entity/public contact details, retention/recovery targets, support/privacy mailboxes and approved public copy/brand assets.
- Later staging credentials and budgets through provider secret stores, never chat or Git.
- When the YouTube slice is connected: a Google Cloud project, YouTube Data API, OAuth consent configuration and the exact Finance Unfolded channel-authorized account.
- When repository analysis is connected: approved archive source, production scanner/SBOM/SAST services and an isolated no-network sandbox design.

These inputs do not block continued local work with synthetic fixtures and disabled adapters.

## Next safe action

Apply and verify migration 0075 through the guarded hosted-staging operator. Then approve exact plan limits and customer documents, configure Stripe test products at £29/month and £290/year, and rerun the deterministic release check. Keep production charging and unrestricted customer access disabled until every release blocker is cleared.

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
- Vercel WAF rule activation and ordinary edge observation pass in Preview. Cloudflare stays DNS-only unless Vercel Trusted Proxy is purchased and verified.
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

## Production domain and exact-commit release — 6 October 2026

- Namecheap now preserves the existing mail records and routes web traffic with `A @ -> 216.150.1.1`, `CNAME www -> 9615c6c50afd3064.vercel-dns-016.com.` and `CNAME app -> 6300ef1703722cdf.vercel-dns-016.com.`. Cloudflare and Google public DNS return the expected records.
- The previously verified production artifacts were first promoted to establish current production aliases. Commit `395a1509d37159916050638e75925e0437d607f5` then passed GitHub CI run `37399310301` and CodeQL run `37399310235`; both dependency audits report no vulnerability.
- Exact-commit production deployments are OS `dpl_GGxucawiGLuBX6WYmCjMDhM4ujxK`, marketing `dpl_BZSuJJKDTkuDfhgg3Ncvdg4GKQnN` and email worker `dpl_8NBG1fSCA65PV87mYJhHsWGgFR3D`. All three reached `READY`. The local Vercel link was restored byte-for-byte to `kxra-os-staging`, and the Git working tree remained clean before this documentation update.
- `https://app.kxra-group.com/login`, `https://kxra-group.com` and `https://www.kxra-group.com` return `200` with HTTPS and the expected security headers. Anonymous `/api/context` returns `401`; anonymous `/os` returns `307` to `/login`.
- Production marketing rejects a wrong-origin enquiry with `403` and a malformed correct-origin request with `400`. A valid synthetic production contact returned `202` with receipt `8e37b4d2-43b4-48a6-9dce-9e399319f807`; it is explicitly test evidence and requires no response.
- The private email-worker root remains unavailable and returns a no-indexed `404`; provider delivery stays disabled. Billing, email, AI, WhatsApp, Storage and telemetry are not live.
- Production Supabase Auth still has no users. The invitation dialog is prepared for the intended owner identity, but no account or email has been created without the required action-time owner confirmation. After invitation acceptance, use the guarded production owner operator and complete MFA before authenticated production acceptance.

## Preview public-ingress acceptance checkpoint — 3 October 2026

- The Preview-only Vercel rule `KXRA enquiry observation` is active in log mode for exact `POST /api/enquiries` traffic. It cannot block requests and does not target Production.
- The public form now has a safe native `POST /api/enquiries` action with hidden route fields, preventing an unhydrated browser from placing enquiry fields in a URL query. The enhanced JavaScript path retains JSON submission, idempotency and visible success/failure states.
- Bounded runtime diagnostics classify configuration, connection and transaction failures without logging a connection string, password, certificate body, enquiry content or client address. The diagnostic contract is covered by a disclosure regression.
- Preview initially failed at TLS verification even though it received the official Supabase Root 2021 certificate, the expected session pooler, the custom pooler username and `verify-full`. The route had passed URL-level `sslmode` alongside an explicit CA object; node-postgres URL parsing replaced the verified CA settings. Public ingress now removes URL-level SSL controls before supplying the certificate-verifying SSL object, matching the private OS connection path.
- The corrected deployment `dpl_3YtRnnXwEZokXchG6n3LX2foYySX` is Ready. An owner-approved synthetic request returned `202 Accepted` with receipt `46d33e37-7a02-4b2b-bc13-29a130cbf069`. Independent Supabase inspection found exactly that `CONTACT` record with `UNVERIFIED` status and `/contact` source path.
- The complete final hermetic contract passes 234 core tests, 80 migrations, 172 protected-table checks, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart and empty-target restore, all three builds, CSP/SRI, budgets, artifact/secret scans and Lighthouse performance/accessibility 1.00.
- Vercel CLI requests use deployment-protection automation bypass and therefore were not used as edge-rule evidence. Ordinary protected-browser attempts produced 12 `Log` observations under the exact Preview rule and host; none were blocked. This checkpoint is complete. Production and `main` remain untouched.

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
- Partner redemption, first-private-access legal denial, PROJECT-002 visibility, crafted/cross-project denial and revocation remain unproved. Exact customer documents remain incomplete and placeholders cannot be activated; solicitor approval is no longer a universal blocker under ADR 0044.

2026-10-01 — Recorded the owner's decision that solicitor approval is not a universal release dependency for customer documents. ADR 0044 requires exact, versioned and owner-approved Terms, Privacy, Cookie, applicable data-processing and Custom Project documents that match implemented product and data flows. Independent legal review is optional and risk-based; regulated project-specific hard stops remain unchanged. Updated public legal/pricing copy, current playbooks, the platform review and handover, and marked conflicting requirements in the historical Phase Completion Brief as superseded. Added a browser regression preventing the generic solicitor gate from returning. The complete hermetic contract passes 219 core tests, 74 migrations, 172 protected-table checks, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart/restore, all three builds, CSP/SRI, artifact/secret scans, budgets and Lighthouse. No placeholder was activated and no production release was authorized.

2026-10-01 — Researched comparable official product pricing and accepted ADR 0045: £29 per organisation per month or £290 per year for the founding KXRA subscription, with custom projects and high-cost usage separate. Updated the disabled reviewed public snapshot and pricing route. Added migration 0075 so owner approval, rather than a legal-review field, is authoritative for approved customer documents while preserving immutable historical evidence. The clean hermetic contract passes 219 core tests, 75 migrations, 172 protected-table checks, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart/restore, all three builds, CSP/SRI, budgets, artifact/secret scans and Lighthouse. Hosted migration, exact plan limits, tax/commercial policy, production Stripe and release evidence remain open.

2026-10-01 — Applied migration 0075 to the authorized Supabase staging project through the authenticated SQL Editor after the credential-based operator path was rejected. The migration transaction returned `Success. No rows returned.` A separate guarded transaction verified all three owner-approval columns, the validated owner-evidence constraint, normalization trigger and function, and zero incomplete approved records before inserting the exact migration ledger entry. The ledger binds `0075_owner_approved_legal_documents.sql` to SHA-256 `85e103d36858161c632db520547f836abb9aa31a081eac806719f9cba5ab5ef7` and source commit `bc6120ca6fa5c2d2aa57f64fcb8f3e6cae95f33c`; that transaction also returned success. No production database was touched and no database credential was stored in Codex, Git or an application environment.

2026-10-01 — Accepted ADR 0046 and implemented the exact founding-plan contract: £29 monthly or £290 yearly, Brand Studio access, 120 generated creative variants and 120 reviewed exports per month, with no rollover. Added a guarded staging operator that accepts only two distinct Stripe TEST price IDs, the exact staging project, a clean pushed phase branch and an apply-only confirmation; it rejects existing mismatches and activates both intervals plus deterministic feature limits in one transaction. The disabled public pricing snapshot now states the exact limits and still excludes Ask KXRA, generated media, high-cost research, integrations and custom delivery. The complete hermetic contract passes 222 core tests, 75 migrations, 172 protected-table checks, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart and 3,014-row/15-object empty-target restore, all three builds, CSP/SRI, budgets, artifact/secret scans and 1.00 tested Lighthouse performance/accessibility. Stripe products, tax/cancellation/refund/grace policy, approved customer documents and release evidence remain required before checkout or sales.

2026-10-01 — Created the Stripe Sandbox product `prod_VMHTknMmr7LV1r`. The approved tax-exclusive recurring prices are `price_1ULYzlC84VkhhIRziFf99Grl` (£29 monthly, default) and `price_1ULYyIC84VkhhIRza8JkYHz5` (£290 yearly). Superseded automatically tax-inclusive monthly price `price_1ULYv0C84VkhhIRzivfFjr42` is archived with zero active subscriptions. Migration `0076_brand_studio_catalogue_seed.sql` installs only the deterministic Brand Studio catalogue/version contract already used by canonical seed logic; no identity, fixture entitlement or provider authority is imported. It is applied to authorized Supabase staging and ledgered at SHA-256 `cfa889bc6b3d3a75e16c277a3b313d99abc6e75bbc2ae432e471187309444cf7` against source commit `ebba44953ec2ee813844ce7ecc5aa5f57a409ad4`. Hosted verification proves 76 exact migrations, 172 RLS-protected tables, 146 exposed functions, one active Brand Studio tool and one active version. The founding plan is active with one plan, two versions, six feature rows and the two approved TEST price references. The exact implementation SHA passes the full local hermetic contract: 222 core tests, 76 migrations, 172 protected tables, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart and 3,015-row/15-object empty-target restore, all three optimized builds, 72 CSP hashes, 129 SRI records, budgets, a 439-file artifact/secret scan and Lighthouse 1.00 performance/accessibility. GitHub CodeQL run `36803453320` and full CI run `36803453498` both pass. Checkout and sales remain disabled pending owner-approved cancellation/refund/grace policy, exact customer documents, restricted billing-worker Stripe configuration, complete staging billing acceptance, WAF and release evidence.

2026-10-01 — Added the exact five-document customer pack as an owner-review draft: Terms, Privacy, Cookie, Data Processing and Custom Project terms. The draft is machine-readable, rendered on script-free public review routes and explicitly cannot be accepted or used for live sales until the owner approves the exact version and hash. ADR 0047 proposes the business-only founding policy: no launch trial, cancellation at period end, bounded refund remedies, a seven-day failed-payment grace period, up to 30 days of read-only recovery and 90 days plus 35 days of backup expiry for ordinary customer content. The acceptance loop found and fixed a production CSP expansion from 9,549 characters; the final script-free document routes use 64 exact hashes and a 3,717-character CSP. Local evidence passes 223 core tests, 76 migrations, 172 protected-table checks, 43 applicable private browser journeys with five intentional skips, all 18 development marketing journeys, restart/restore, all three builds, CSP/SRI, budgets, artifact exclusion, optimized desktop/mobile legal-route checks and a 454-file publication/secret scan. Implementation commit `b0ca8fa1d1e0a0cd14f2a78d10b8ba40d6bfcb46` passes fresh GitHub full CI run `36861911207` and SHA-matched CodeQL run `36861911192`. Publication and checkout remain disabled.

2026-10-01 — Recorded the owner's exact approval of customer-document pack version 1 at SHA-256 `8277d2cbad017feaf4fea238d9eecedd1e7cfff0aaab6fa80fca5a239a8783a9`, accepted ADR 0047 and recorded KXRA as not VAT registered. The byte-frozen source remains unchanged; a separate approval manifest binds all five deterministic document hashes, database versions and applicability. Added a guarded, exact-project staging operator that rejects dirty/unpushed code, wrong authority, changed content, unmanaged conflicts and unexpected active requirements. Terms and Privacy are mandatory only for customer memberships; Cookie is a notice, Data Processing and Custom Project terms are applied when relevant, and NDA remains parked. Public legal and pricing copy now reflects the approved state while checkout and publication remain disabled. The complete clean hermetic contract passes 226 core tests, 76 migrations, 172 protected-table checks, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart and 3,014-row/15-object restore, all three builds, 64 CSP hashes, 101 SRI references, build/artifact/secret gates and Lighthouse performance/accessibility 1.00. Hosted staging import is complete; release-manifest binding remains pending.

2026-10-01 — Began bounded Stripe staging activation. Migration 0077 changes release readiness to inspect explicit owner-approval evidence rather than the deprecated reviewer compatibility marker; the required five-document set remains Terms, Privacy, Cookie, Data Processing and Custom Project, with NDA parked. Added a guarded `kxra_billing_runner` operator and OS staging profiles for test-only subscription billing, including a combined email-and-billing profile. The focused 32-check release/billing suite passes. The complete hermetic contract also passes: 231 core tests, 77 migrations, 172 protected tables, 43 applicable private browser journeys with five intentional skips, both 18-journey marketing runs, restart, a 3,014-row/15-object empty-target restore, all three builds, CSP/SRI, budgets, artifact/secret scans and Lighthouse performance/accessibility budgets. Vercel inventory confirms the current OS Preview has no Stripe or billing-worker credentials yet, so checkout remains safely disabled until the restricted role, Stripe test portal/webhook and exact branch variables are configured and accepted.

2026-10-01 — Applied the approved customer-document pack to the authorized Supabase staging project through the connected administrative database channel. Preflight proved the expected 76-migration schema with zero target documents, zero active requirements and zero incomplete approved rows. The transaction used an advisory lock and rejected prior target rows or unexpected requirements. Post-commit verification recomputed every rendered-content SHA-256 in PostgreSQL and returned five of five exact approved documents, two of two exact active customer requirements and two active requirements in total. Production, checkout and customer charging remain disabled; release-manifest binding and end-to-end Stripe test acceptance are next.

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

## Immersive public landing-page checkpoint

- Reworked the public home page around the owner-supplied visual references: obsidian surfaces, restrained champagne-gold light, architectural frames, circuit-line detail and oversized editorial type. The reference images remain design direction only; their watermarks, malformed generated text, invented people and unsupported claims were not used.
- Added a four-chapter camera-depth journey through professional services and technology, property and hospitality, retail/e-commerce and health services, and mobility/media/controlled AI. A lightweight scroll controller moves chapters through the viewport in depth without a Three.js runtime or paid generated media.
- Progressive enhancement preserves all four chapters as ordinary readable content without JavaScript. Reduced-motion users receive the static layout. Desktop, mobile, 320px reflow, 200% text, landmarks and horizontal-overflow boundaries are covered by browser tests.
- The clean hermetic contract passes 219 database/domain/HTTP/security tests, 74 migrations, 172 protected-table checks, 43 applicable private browser journeys with five intentional skips, all 16 public marketing journeys in development and optimized production, restart persistence, a 3,014-row/15-object empty-target restore, all three builds, CSP/SRI, build budgets, artifact/publication/secret gates and Lighthouse. Mobile home performance and accessibility both score 1.00, with 1,901ms LCP, 0 CLS and 43ms TBT.
- Higgsfield is not required for this implementation and no billable generation was made. The existing guarded Seedance example remains available for a later approved cinematic asset pass. Production and `main` remain untouched.

# 2026-10-05 — Production foundation operator

Implemented a guarded production bootstrap operator for the empty `KXRA Production` Supabase project. After the separately guarded 82-migration initializer, it imports the exact canonical seed, installs the approved customer-document pack and creates four distinct least-privilege login identities for the private OS, public ingress, email worker and billing worker. It is fixed to project `lhbgeucifxxcdoyrnesf`, requires the exact clean pushed source commit, verified TLS, four generated non-reused passwords and an exact apply phrase. Plan and verify modes do not require role passwords. No production credential was read, stored or used and no hosted mutation occurred.

The clean hermetic contract passes 248 database/domain/HTTP/security tests, the 82-migration/174-table RLS audit, 43 applicable private browser journeys with five intentional device-specific skips, both 18-journey marketing runs, restart and 3,037-row/15-object empty-target restore, all three builds, exact CSP/SRI, asset and Lighthouse budgets, artifact exclusion and the 486-file publication/secret scan. The focused production guard suite passes 7/7 tests.

# 2026-10-06 — Production infrastructure checkpoint

The owner-authorized production foundation is now installed in the isolated `KXRA Production` Supabase project `lhbgeucifxxcdoyrnesf`. SSL enforcement is enabled. Guarded migration and bootstrap verification completed with the full schema, row-level security, twelve canonical project/register records, the approved version 1 customer-document pack and four separate least-privilege application identities. Supabase Auth is configured for `https://app.kxra-group.com` and its callback and password-reset routes. No credential value is stored in Git or this record.

Three isolated Vercel production projects now exist for KXRA OS, the marketing site and the email worker. Their project roots, Next.js build settings, production origins, public Supabase browser configuration and private database credentials are set by environment. Billing, email delivery, AI, WhatsApp, storage and telemetry remain explicitly disabled until each live integration passes its own acceptance checks.

The first domain-free production deployment attempt stopped locally before upload because the Vercel client encountered a PostgreSQL socket inside `.runtime`. A repository-level `.vercelignore` now restricts deployment input to application source, shared packages and the three build wrappers. The production-artifact verifier fails when that boundary is absent or loses a required private/local exclusion. Local builds and the artifact/secret checks pass after the repair. The exact repair commit must pass GitHub CI and CodeQL before domain-free production deployments are retried; custom domains remain unassigned until hosted acceptance passes.

Commit `043ad7669a7a42c55cc2e2350aa83e4e9ed65616` passed GitHub full CI run `37390644891` and CodeQL run `37390644966`. Domain-free production deployments then proved that KXRA OS and the email worker build successfully and are `READY` behind Vercel Authentication. Marketing failed before promotion because Vercel adds a `?dpl=` cache marker to hosted static-script URLs while the SRI manifest is keyed by the immutable asset path. The SRI application now removes query/fragment metadata before lookup and still fails closed when the underlying asset is absent. A Vercel-shaped production marketing build, the exact CSP/SRI verifier, deployment-artifact scan and secret scan pass locally after the repair. All three services require one same-commit redeployment after exact-SHA CI and CodeQL pass.

## 2026-10-08 — Cinematic home page and first-recurring-revenue experiment

The owner paused the production invitation and requested a full landing-page depth journey plus a realistic recurring-income plan. New owner constraints: no dependence on previous work, no buyer network, 2–4 hours daily, target £10,000 MRR. These are planning inputs, not evidence of customers or revenue.

Implemented one continuous home-page camera journey with an original perspective-projected architectural canvas, navy/charcoal/gold palette, serif typography and accessible HTML chapters. All home-page content now participates in the journey. Scroll is native and reversible; chapter buttons, a reading toggle, live reduced-motion preference changes, short-viewport/text-zoom fallback and inactive-link isolation are included. No generated reference text, watermarks, invented proof or client imagery was reused. No paid generation or new dependency was required. The phone header is compact on the home page; other page layouts retain their styles.

Fixed failures found during inspection: inherited legacy journey styles distorted the new composition; desktop short-view content exceeded its stage; the phone header consumed excessive height; the development indicator intercepted a chapter control. The new styles use an isolated namespace, adjusted spacing and a compact mobile header. Development indicators are disabled for predictable local interaction.

Validation: TypeScript and optimized double-pass marketing build pass; 18 selected production-mode public browser tests pass across desktop/mobile, including all public routes, legal/pricing, depth reversal, active/inert chapters, viewport text fit, dynamic reduced motion, reading mode, 320px reflow, 200% text and no-JavaScript fallback. CSP verifies 64 exact inline hashes and 102 SRI references. Home JS/CSS is 114.1 KiB gzip, below the 140 KiB budget. Lighthouse mobile home: performance 0.99, accessibility 1.00, LCP 2011ms, CLS 0, TBT 2ms; desktop contact 1.00/1.00. Marketing source boundary and the existing disabled publication snapshot checks pass. Database/form-persistence and private-platform suites were not rerun for this presentation-only change.

Private deliverables are in ignored `.runtime/revenue-sprint/`: execution-blueprint.html, sample-pack.html, prospect-tracker.csv and deterministically calculated economics.json. The research-backed hypothesis is a £500 property-content pilot followed by a separately scoped £1,000/month service. Supplier offerings demonstrate category competition, not KXRA demand. The plan specifies 60 qualified contacts over ten working days, paid-pilot and renewal gates, capacity/economics assumptions, scripts and stop criteria. It is not an approved public pricing change. The sample is fictional and includes creative cards, captions and a storyboard, not a finished client video.

No production deployment, account invitation, credential operation, customer outreach or billing change occurred. Existing £29 subscription/legal terms are unchanged. Source reference images remain untracked and private. This work is local and uncommitted pending review; do not describe it as already published.

## 2026-10-08 — Authorised marketing release and photo-video tool

Owner explicitly authorised publishing the new landing page and adding client-image video creation. Implemented public Video Studio with local-only image processing, captions, ordering, portrait/landscape export, rights confirmation, cancellation and download invalidation. Six desktop/mobile Chromium browser tests pass, including actual playable export and absence of photo POST requests. TypeScript, marketing build, source boundary, publication snapshot, CSP and bundle budgets pass. The new video sample is a real export from fictional original illustrations. No paid API generation was needed. Removed the stale public footer saying publication is disabled; underlying feature/provider gates are unchanged.

Prepared ten sourced Greater Manchester research prospects and personalised unsent email drafts, plus discovery, intake, draft work order, production/approval checklist, delivery/renewal messages and validation metrics in the private launch pack. Demand, budgets and buyer authority remain unverified. Public £29 software pricing is unchanged; £500 pilot and £1,000 retainer remain private validation proposals.

Release commit, CI and hosted verification are pending; do not yet describe this revision as live. Private OS onboarding/integration gates remain separate.

Release verification update: commit `fed9966` passed the complete disposable application/database/browser/restore/build suite and CodeQL, but GitHub's final dependency audit detected newly reported Next.js and sharp vulnerabilities. Updated all existing workspace Next.js minimums to 15.5.27 and the lockfile to sharp 0.35.5 while retaining PostCSS 8.5.28. `npm audit` reports zero vulnerabilities after deduplication. The earlier optimized export stall was fixed by replacing display-animation scheduling with a bounded render interval; removing the final photo now clears its canvas. Final video acceptance passes on desktop/mobile Chromium. Publication awaits verification of the patched commit.

## 2026-10-08 — Marketing release live

Runtime source `0b35187e051b16a8548a640a4911ead706be00df` passed full GitHub CI `37824449616` and CodeQL `37824449557`, including both dependency audits with zero reported vulnerabilities. Evidence: 250 automated tests, 82 migrations/174 protected-table checks, 43 private browser journeys with five intentional skips, 28 development and 28 optimized public browser journeys, persistence/restore, builds, source/secret/CSP/bundle and Lighthouse gates.

Vercel marketing deployment `dpl_3V4eb6sus2QUoGJhFPTb2VyGpzxw` was built from an isolated archive of that exact commit and promoted after the gates passed. https://kxra-group.com now serves the cinematic home and `/video-studio`. Hosted checks confirm security headers and byte-identical sample media. Post-promotion browser acceptance passes all six video tests and eight cinematic interaction tests across desktop/mobile Chromium. An additional live synthetic-photo export produced a playable 720×1280 video with no page errors. A preliminary `networkidle` wait timed out; readiness/interaction checks and subsequent actual playback passed. No authentication-protection settings were disabled.

This release completes the public redesign and local-device video workflow, not the private production OS onboarding or paid provider integrations. Browser-native export is silent and device-local, not persistent cloud upload or generative walkthrough creation. Physical Safari/iOS testing remains unverified. No emails were sent, no client demand/revenue is claimed, and no Higgsfield credits were spent. The private prospect/document pack and original reference PNGs were excluded from Git and deployment. Source remains on `codex/phase-2-completion`; no main merge was performed.

## 8 October 2026 — real-property sample continuation

- Read-only production query confirms zero Auth users and zero Storage buckets in `lhbgeucifxxcdoyrnesf`. Authenticated customer onboarding and saved cloud video projects are not complete. Do not infer readiness from the published marketing site.
- Requested the listing URL and photo-rights confirmation. Rightmove terms prohibit automated collection and restrict reuse; obtain authorised originals from the agency/photographer before producing and publishing a real-property sample. No listing photographs downloaded or published.
- Private permission email, asset-evidence checklist, 20-second production brief and sample acceptance criteria are saved in `.runtime/revenue-sprint/property-photo-permission.html`; no email sent. Existing fictional sample remains honestly labelled. No Higgsfield spend needed for faithful photo sequencing.
- Production owner invitation remains paused pending explicit answer to the pending question. Existing live marketing is preserved.
- Live Video Studio recheck: all six desktop/mobile-sized Chromium tests passed, including playable export, no photo POST, invalid-file rejection and cancellation. Initial sandbox browser launch was blocked; rerun outside that restriction passed. Physical iOS/Safari is not verified.


## 12 October 2026 — Business Improvement Sprints implementation checkpoint

- Added a public Business Improvement Sprints catalog and structured assessment intake: Decision Review from £250, Improvement Sprint from £750, and separately scoped implementation. Prices are launch hypotheses; no proven customer demand or revenue is claimed. Existing subscription pricing is preserved.
- Reused the existing protected custom-project request/proposal/payment-evidence/milestone system. Added database-authorised owner draft preparation, private package selection, state-derived next steps and authenticated plain-text delivery downloads. Draft preparation does not issue a proposal or execute an AI call.
- Supporting service specification, owner playbook, delivery template, commercial-validation experiment, automation/security boundaries, Higgsfield production brief and acceptance checklist are in docs/business-sprints/. ADR 0053 records the scope.
- Production owner setup was authorised for husainkara@hotmail.co.uk. The Auth invitation was sent and email confirmation was observed, but there is no active owner profile/membership yet. The user reported that initial account setup rejected the address/password. A guarded local provisioning helper is prepared, not executed. Password entry and MFA remain user actions.
- Higgsfield API spend is authorised up to £25 total. The first artwork request did not produce an output; a read-only API authentication check returned 401. The private request ledger remains preserved to prevent blind resubmission. User reports the API key page only offers Copy ID. A new-key dialog is open because the secret is shown once on creation; the local form saves credentials without claiming connection verification. No generated artwork or actual billed cost is confirmed.
- First full verification run passed the new private sprint browser journey but exposed test rate-limit contention in optimized public-form retry tests (HTTP 429). Isolated the new synthetic browser identity while preserving application rate limits. A fresh full suite is running; do not infer a final pass before its completion.
- No production deployment or hosted data mutation was performed at this checkpoint. Current workspace instructions prohibit production deployment and external sends. The source reference PNGs and ignored local credentials/research remain private. Live one-off card payment, automated settlement, hosted customer onboarding and connected AI/email/Storage remain unfinished; current project payment evidence is manual.


## 13 October 2026 — exact Higgsfield SDK example verification

Read the official SDK and Seedance 2.5 model documentation again. The TypeScript/npm example is now available at scripts/higgsfield-example/index.ts through the existing higgsfield:seedance:example command. It uses the requested sunset prompt, duration 5, 720p and 16:9, with the official server-only subscribe method. Native Node environment loading avoids another package. Credentials remain ignored and are never printed.

The authorised example was actually run. It failed with AUTHENTICATION_REJECTED and returned no video URL; no successful setup or artwork is claimed. The local private ledger records the rejection and blocks accidental repeat submissions. A newly created API key ID plus its one-time secret must be saved through the local form; Copy ID alone is insufficient. API funding may also be required (last observed API balance $0). The approved total generation spend remains £25, not a recurring subscription.

Final full platform verification is still running; its 252 domain/database/HTTP/security tests currently pass. Exact final browser/build results remain pending. No production release is authorised by the current workspace instructions.


### Final local verification — 13 October 2026

Full isolated CI completed with exit 0: 252 domain/database/HTTP/security tests; migration/RLS verification of 82 migrations and 174 protected tables; 44 private browser journeys passed, six intentionally skipped; 32 public browser journeys passed in each of development and optimized modes. Builds, artifact/source boundaries, dependency and secret checks, persistence/restore and CSP/SRI passed. Lighthouse: mobile home performance/accessibility 1.00/1.00 (LCP 1660ms, CLS 0, TBT 43ms), desktop contact 1.00/1.00. These scores cover tested routes, not every page or physical device.

The exact SDK example entry point was reorganised after CI started; a separate TypeScript check passed and the authorised example was run, producing AUTHENTICATION_REJECTED rather than video output. This external integration remains incomplete. The user must create a fresh Higgsfield API key and save both ID and one-time secret locally. Review the preserved private rejection ledger before a deliberate retry. No code/docs were committed, pushed or deployed during this checkpoint; live pages retain their earlier runtime. Owner provisioning, MFA, production customer flows and live one-off payments remain separate unresolved dependencies.


## 15 October 2026 — Higgsfield single-field credential clarification

Owner reports that key creation displays one API key with no separate secret. Official authentication/SDK documentation still specifies ID:secret; do not assume separate UI fields or ask the owner to duplicate an ID. The local entry form now asks for the whole copied credential unchanged, trims whitespace, validates the documented pair without displaying/logging values, and explains a mismatch without overwriting the saved credential. Authentication remains unverified; no new generation, spend or deployment occurred.


## 15 October 2026 — Higgsfield credential accepted; sample moderated

The owner saved the complete copied credential through the loopback-only form. No value was read into conversation, displayed, logged or committed. Read-only status authentication no longer returned 401 (404 for the deliberately nonexistent request). Preserved the previous AUTHENTICATION_REJECTED example ledger and made exactly one new authorised SDK example request with the original sunset prompt, duration 5, 720p and 16:9.

The provider returned terminal status `nsfw`, request ID `68a96053-9691-42aa-b172-5c0f2c522754`, and no video URL. Credentials are accepted, but the requested successful video-generation verification is not complete. Do not claim generated artwork, playable output, or successful Seedance setup. No automated retry or further generation was submitted. Provider billing/refund status is unknown; do not assume the moderated request was free. The total approved budget remains £25. Further investigation should use the existing request record, not repeat chargeable submissions. No top-up is requested on the basis of this moderation result.

Current source changes remain local and undeployed. Previously recorded full local platform CI results stand; this provider-only check does not establish production onboarding or payment readiness.


## 15 October 2026 — Seedance consultancy homepage

The owner explicitly requested a business-consultancy presentation with Seedance 2.5 scroll footage. One new original architectural request completed (`fc9a38d0-1752-4585-8de0-72589451cda1`). Inspected source frames and metadata; generated an approximately 1.43 MB intra-frame MP4 and 38.7 KB poster for same-origin delivery. Credentials, original footage and provider URLs remain private. The public assets contain only the generated architecture.

Updated the homepage consultancy copy, simpler navigation, depth frames and video scrubbing. Forward/back scrolling seeks a paused silent film; no visitor triggers an API generation or charge. Reduced motion, reading mode, Data Saver, media error and no-JavaScript reading paths remain available. New media-controller unit tests and six desktop/mobile media browser tests passed. The expanded design check found mobile hero text touching the chapter navigation; shortened the copy, and both targeted text-fit retests passed. Final focused browser and optimized-build checks are running.

See docs/architecture/consultancy-scroll-journey.md for architecture, provenance, asset hashes and limitations. No production deployment, external sends, customer data changes or additional API requests were made. Actual provider charge remains unreported; reserved budget is not an invoice. The £25 total authorisation remains in force.


### Verified consultancy preview — 15 October 2026

Final focused acceptance: 22 browser checks passed in development and the same 22 passed against the optimized production build, covering actual local Seedance video playback/seek state, first chapter, reverse scrolling, reduced-motion network exclusion, media failure, no-JavaScript content, landmarks, mobile fit and zoom/reflow. Both media-controller unit tests pass. TypeScript, formatting, marketing source boundary, production CSP/SRI, JS/CSS budgets, artifact exclusions and secret scan pass. Marketing home bundle is 115.0 KiB gzip within the 140 KiB budget.

Optimized Lighthouse: mobile home performance 0.98/accessibility 1.00, LCP 2309ms, CLS 0, TBT 4ms; desktop contact performance/accessibility 1.00/1.00. These results cover the tested Chromium profiles, not physical iOS/Safari or a hosted deployment.

Review URL while the local server runs: http://127.0.0.1:3241 . Desktop/mobile screenshots are in ignored .runtime/consultancy-journey/. The temporary development server was stopped and generated Next configuration restored to its baseline. The optimized server remains available for owner review. No source commit, push, production deployment or hosted provider setting changes were made. The earlier private/commercial work remains preserved. Next release work must respect the current no-production-deployment instruction; hosted customer onboarding, owner MFA and live payments remain separate from this design verification.


## Latest design revision — one continuous industry walkthrough

Owner rejected navy/brass/ivory and separate top-navigation destinations. Implemented ADR 0054: white/graphite/signal-red palette; six linked scenes; primary homepage hash navigation with smooth travel, browser history and direct links; property/retail/professional-services environments; synthetic interactive KXRA OS demo; and the structured assessment form on the same homepage. No live AI or private retrieval is simulated as a real provider response.

A single new twelve-second Seedance request completed: a1ce194f-7f01-4444-a12e-45ac7f122a83. Actual source frames/metadata were inspected. Optimized assets are industry-walkthrough-v2.mp4 (2,859,202 bytes) and poster (36,868 bytes); old dark footage is not referenced by the homepage. Video loading is deferred until travel starts, with reduced-motion/Data Saver/reading and media-error fallbacks.

Automatic review initially blocked the call due to unknown cumulative spend. Authenticated billing evidence and a conservative fixed-request guard resolved that block before submission. The console subsequently reports the new transaction $4.71, total usage $6.68, credit $33.32; auto-top-up remains off. No further generation or funding is planned.

The focused 28-check desktop/mobile design suite passed. Full isolated regression is running, including actual homepage intake persistence. See docs/architecture/consultancy-scroll-journey.md for canonical design and provenance. Source/initial documents, earlier commercial work and credentials are preserved. Current local preview is http://127.0.0.1:3242/ while running. No production deployment, push, external sends or hosted customer data changes occurred.


### Full verification complete — single-page walkthrough revision

Full isolated CI exited 0: 254 domain/database/HTTP/security tests, 82 migrations and 174 protected tables verified; 44 private browser journeys passed, six intentionally skipped; 46 public browser journeys passed in development and another 46 against the optimized production build. Both homepage and dedicated sprint-page enquiry submissions persisted in the protected local inbox. Navigation/history/direct links, platform demo/no external POST, zoom/reflow, media failure, reduced motion and browser video export remain covered.

All builds, dependency audits, persistence/restore, CSP/SRI, source/artifact boundaries, secret scans and JS/CSS budgets passed. Lighthouse mobile home performance 0.98/accessibility 1.00, LCP 2312ms, CLS 0, TBT 8ms; desktop contact 1.00/1.00. Additional scene-fit checks passed for all six scenes at 320×720 and 1440×900. Physical iOS/Safari and hosted acceptance are not claimed.

The optimized design review is available at http://127.0.0.1:3243/ while its local server runs. The development server was stopped and generated Next configuration restored to baseline. This preview is for local review; production enquiry delivery is not configured on it. Automated real storage acceptance used the isolated test database, not production. The actual provider-connected platform, owner MFA and live payments retain their previously documented limitations.

No source commit, push or production deployment was performed. Current no-production-deployment instructions remain applicable. All original source documents/PNGs, earlier commercial implementation and private evidence remain preserved. No further media generation is needed for this revision.

## 16 October 2026 — Workrooms and retirement checkpoint

- User explicitly confirmed removal of both Brand Studio and Video Studio. Removed navigation/catalogue/promotional links, retired public/private entrypoints, disabled studio APIs and new subscription checkout. Preserved historical records, billing portal and approved legal-pack bytes; no provider subscriptions were changed.
- Added project workrooms with durable shared discussions, replies and discussion-only context export using existing records, audit/version history and RLS. Added private owner advisory prompt packs, reviewed score matrices, deterministic ranking and eight-C operating-model navigation.
- Reviewed Kylon public material, three supplied video transcripts and REA primary documentation. Fourth video's transcript unavailable; no invented summary. Reference library is owner-only. No REA code installed.
- Automated advisory deliberation and external agent connections remain unimplemented. No agent execution or provider connection is claimed. See ADR 0055 and docs/workrooms/README.md.
- Verification running; final results will be recorded below. No commit, push, deployment, real credentials or external sends in this increment.

Final local verification: full isolated CI PASS on 16 October 2026: 257 service/security tests; 48 private browser journeys with 6 intentional skips; 42 public journeys in each development and optimized-production run; 82 migrations/174 protected tables; restart and empty-target restore; all three builds; CSP/SRI, bundle budgets and 546-file publication/secret scan. Lighthouse mobile home 98 performance/100 accessibility, desktop contact 100/100. `git diff --check` passes. See docs/workrooms/verification.md. No production deployment or provider activation.

## Team-and-agent workspace rebuild — 16 October 2026

The owner rejected the manual workroom approach and requested a Kylon-like business collaboration platform while retaining KXRA's visual design. ADR 0056 supersedes the previous primary product direction. Existing business/project/governance data and historical discussions remain intact; both studios remain retired.

Implemented locally: private/project rooms, explicit membership, threaded messages, encrypted model connections, room agents, OpenAI/Anthropic/Gemini/OpenRouter/compatible protocol adapters, thread-scoped requests, bounded run logging, cancellation/publication checks, approval-backed tasks and state-change audit. The primary nav is Workspace. Marketing now explains the people + agents + business model using the existing cinematic walkthrough.

Initial checks: TypeScript, three provider/vault/network-policy unit tests, HTTP/database isolation workflow and desktop/mobile browser acceptance passed. Browser acceptance caught and fixed a nested-select accessible-name issue and a PostgreSQL-microsecond/JavaScript-millisecond retrieval bug. Full regression is being rerun after extending the schema inventory checks from 174 to 182 protected tables, 82 to 83 migrations and 148 to 161 exposed functions.

Real provider acceptance, hosted migration and deployment have not been performed. The local fixture refuses real model keys. Kylon-level connector breadth, coding-agent bridges, app building, durable tool workflows, room file retrieval, memory, scheduled runs and commercial activation remain explicitly incomplete; see docs/workspace/completion-matrix.md. Do not report a complete Kylon clone or all-model support.


### Team workspace final local verification — 16 October 2026

Full isolated CI passed (exit 0): 261 service/security tests; 50 private browser journeys, six intentional skips; 42 public journeys in development and 42 in the optimized build; 83 migrations/182 protected tables/161 exposed functions; restart and empty-target restore; all three production builds; dependency, CSP/SRI, artifact, secret and size-budget checks. Mobile homepage Lighthouse 98 performance/100 accessibility. The mobile hero overflow was fixed with the concise “Your team. Amplified.” heading. See docs/workspace/verification.md for evidence and limits.

Local previews are running at http://127.0.0.1:3243/ and http://127.0.0.1:3244/os/workspace. Browser inspection confirmed the current design and persisted synthetic agent result. Generated Next configuration was restored after preview startup. No production deployment, real credentials, provider billing or external sends. The broader requested product remains incomplete as recorded in docs/workspace/completion-matrix.md; live-model verification is not implied by local tests.


### Final operating-view integration verified — 16 October 2026

Continued beyond the first room slice: global Tasks, Approvals and Run History now include accessible room work without duplicating records or bypassing private membership. Room creators can pause/resume agents. The homepage package selector was replaced with a workspace enquiry; pricing now describes separately scoped workspace setup. Previous service records remain historical.

Full CI rerun passed after these changes: 261 tests, 50 private journeys (six intentional skips), 42 public journeys in each development/optimized build, all three builds, 83 migrations/182 protected tables, persistence/restore and security/artifact/budget checks. Restore covered 3,080 synthetic rows and 15 objects. Publication/secret scan: 560 files. Lighthouse mobile performance 98/accessibility 100. Final evidence is docs/workspace/verification.md and ignored .runtime/workrooms/team-ci.log.

Next engineering work is room-scoped files/retrieval and immutable skill/memory versions, followed by durable scheduled/tool execution and a separately authenticated coding-agent bridge. Customer onboarding, actual provider verification, billing scope and hosted activation remain outstanding. No production deployment, push, real credentials or external sends. Read the completion matrix before resuming; earlier statements that global room views or agent pause UI are missing are superseded by this checkpoint.

## Final security and build checkpoint — 16 October 2026

The Kylon-informed KXRA workspace core is locally implemented and tested; full product parity is not complete. Current evidence is [workspace verification](../workspace/verification.md), with exact unfinished work in [the completion matrix](../workspace/completion-matrix.md).

- Additive migration 0084 rechecks the delegated model connection owner’s organisation, contributor project and private-room authority at run admission and completion. Revoked access cancels output rather than publishing it. Six separate revocation regression scenarios pass through the actual application database login.
- Provider DNS lookup is bounded to five seconds; validated public IPv4 answers remain pinned to the outgoing socket. HTTP has its existing 25-second deadline. No real provider credential or billable API call was used.
- Fixed production TypeScript compilation accidentally including temporary preview-cache declarations. Only generated-tree exclusions changed; source and data remain intact.
- Final complete `npm run test:ci` exited 0: 263 service/database/security tests; 84 migrations, 182 protected tables and 161 exposed functions; 50 private browser journeys with six intentional skips; 42 public journeys in development and another 42 against the optimized build. All three builds, dependencies, CSP/SRI, artifact/secret scans, restart and restore passed. Restore contained 3,118 synthetic rows and 15 objects; local RTO 2 seconds. Mobile Lighthouse performance 98/accessibility 100; desktop contact 100/100. Evidence: ignored `.runtime/workrooms/team-final-ci.log`.
- Local preview database `.runtime/workroom-preview` received migration 0084 without reset. Preview URLs remain `http://127.0.0.1:3243/` and `http://127.0.0.1:3244/os/workspace` while their local processes run. These are synthetic local previews, not hosted acceptance.
- Branch remains `codex/phase-2-completion`; baseline `ab19693`. Prior uncommitted work is preserved. No commit/push, production deployment, hosted migration, real credential use or external send occurred in this turn.
- Next implementation: room-scoped file retrieval and immutable skill versions, followed by durable approved workflows. Memory, local coding-agent bridges, provider-account acceptance and commercial activation remain unimplemented or unverified as detailed in the matrix. Do not represent the entire replacement as finished.

## 19 October 2026 — observable parity assessment and conversation history

- Preserved the recovered `ab19693` baseline and substantial dirty work on `codex/phase-2-completion`; no staging, commit, push or deployment. Read AGENTS, saved Genesis brief, workspace records and ADR 0056.
- Saved the supplied public audit as `docs/workspace/kylon-public-audit-2026-10-19.md`: 521 discovered public routes, 200 pages read, representative controls tested by the research thread; no private backend/mobile/Japanese verification. Raw extraction, route manifests and screenshots are not present in this checkout. Original KXRA design remains authoritative.
- Added `docs/workspace/parity-plan.md` with staged code mapping and acceptance for conversations/files, immutable skills/memory, durable workflows, local coding agents/apps, public information architecture and eventual activation. Brand/Video Studio remain retired; subscription checkout remains paused; no 3D/parallax work.
- Implemented 100-message history pages using room-bound immutable IDs and PostgreSQL timestamp/UUID ordering under the authenticated RLS transaction. Added GET room messages, private/no-store responses, historical run receipts, explicit older-thread handling, loading/error/retry and retained loaded history on new-message refresh.
- New tests exercise 205 equal-timestamp rows, exact page boundaries, historical synthetic output, cross-room/unknown/malformed cursors, unauthenticated/private-room denial, revocation and concurrent head insertion. Desktop/mobile tests exercise retry, root-thread selection and refresh. Final full isolated CI passed after fixing the Thread selector's explicit accessible label; exact results follow below.
- Room file retrieval, executable skill versions, provenance memory, durable scheduling/tools/bridges and real-provider/commercial acceptance remain outstanding. No real credential, external send or trading action occurred.

### Final local acceptance — 19 October 2026

`npm run test:ci` exited 0. Evidence: ignored `.runtime/workspace-parity/2026-10-19-final-ci.log`. All 264 service/database/HTTP/security tests passed; 52 private desktop/mobile browser journeys passed with six intentional skips; 42 public journeys passed in development and 42 against the optimized build. Migration/RLS verification remained 84 migrations/182 protected tables. All three builds, dependencies, CSP/SRI, source/artifact boundaries, secret scan and budgets passed. OS route 172.2 KiB gzip; marketing 118.8 KiB. Secret/publication scan covered 564 files.

Restart/restore passed: 182 tables, 3,557 synthetic rows, 15 objects, measured local restore 3 seconds. Mobile homepage Lighthouse performance/accessibility 98/100 (LCP 2369 ms, CLS 0, TBT 48 ms); desktop contact 100/100. These are local tested profiles, not hosted acceptance or physical-device certification.

The first CI failed the desktop history test at an implicit nested Thread label. The explicit accessible label fixes it; final desktop/mobile history journeys passed in 11.5/11.6 seconds. Initial evidence remains in `.runtime/workspace-parity/2026-10-19-ci.log` and `first-history-failure/`; it is not represented as a passing run. CI restored generated Next configuration and stopped its disposable test servers/database.

Continued next-stage assessment in `docs/workspace/room-knowledge-next.md`: the existing scan/index/delivery pipeline follows record/project policies and cannot be used as private-room retrieval without an explicit intersection and derived-output provenance checks. Owner-only content must not become room-readable through agent output. The contract and staged mapping are saved; no room file retrieval implementation is claimed. Branch/HEAD and prior dirty work remain preserved. No commit, push, production deployment, hosted migration, real credentials, external sends or trading.

## 19 October 2026 — room knowledge and reviewed instruction execution

Continued the authorised operational stage after the history checkpoint. Migration 0085 adds three RLS tables for shared indexed room attachments, immutable skill versions and agent bindings, plus bounded file/skill provenance on existing runs. Query/retrieval, trusted admission, immediate dispatch readiness, completion and historical run reads recheck current source/binding authority. Room/global views hide revoked derived output; cached older output is filtered on the next authorised refresh. Owner-only sources never become room-readable through a draft.

Knowledge UI reuses the current visual system: attach indexed shared files, search, select up to three full excerpts, download through guarded delivery, propose an instruction version, explicitly review it and attach it to an agent. New versions never replace bindings automatically. Message-only mode excludes files/skills. Instructions have no code execution or tools and remain subordinate to platform, room and role rules. Global governance records are preserved and not automatically promoted to execution.

Focused CI passed in `.runtime/workspace-parity/knowledge-focused-2.log`: nine service/provider/security checks, six desktop/mobile browser journeys and OS build; 85 migrations/185 protected tables. Subsequent active-tenant, version replacement, review authority and cached-history cases are included in the full regression now running at `.runtime/workspace-parity/knowledge-full-ci.log`. Do not count the history-only CI as acceptance of this stage. A first focused run exposed a test-harness import using the intentionally disabled production fixture guard; the harness now verifies the full development guard directly, while production remains disabled.

No private-room upload policy, arbitrary code/tool skills, memory, durable scheduling, live provider/production scanning acceptance, commit, push or deployment is claimed. Next unblocked engineering work: typed provenance-scoped room memory, then durable draft execution with leases/cancellation/crash recovery before schedules or tools. External acceptance remains prohibited by current workspace instructions.

### Knowledge-stage verification complete

Final full CI exited 0 in `.runtime/workspace-parity/knowledge-final-ci.log`: 267 service/security tests; 54 private journeys with six intentional skips; 42 public journeys in each development/optimized run; 85 migrations, 185 protected tables and 167 exposed functions; all builds, restart/restore, dependency, CSP/SRI, artifact/secret and bundle gates passed. Restore: 4,194 synthetic rows and 23 objects, 3 seconds. OS bundle 173.9 KiB gzip; publication scan 571 files. Mobile Lighthouse 98/100, desktop contact 100/100. The initial full attempt failed only a stale dashboard inventory count, corrected to exact 185; its failed log is preserved.

Applied tested migration 0085 additively to the verified Unix-socket historical fixture preview, with no seeds/reset. Original-column checksums matched all 182 legacy tables / 1,397 rows. No hosted target or real credentials. The HTTP preview process is stopped (loopback health connection refused); no current review URL is claimed. Source and prior dirty work remain preserved. Continuing with permission-scoped, reviewed/expiring room memory; full parity is still unfinished.

## 19 October 2026 — reviewed room memory implementation

Migration 0086, `team-memory.ts`, shared `team-room.ts`, `RoomMemory.tsx` and room runner/API/UI extensions implement immutable typed room-and-agent memory with creator review, opt-in recall, expiry, redacting removal and pinned run provenance. Successful source runs must use no memory, preventing recursive summary chains. Current source authority, review, hashes and expiry gate recall, dispatch, publication and historical/global reads. No global/company memory summary or automatic learning is implemented.

Focused CI passed in `.runtime/workspace-parity/memory-focused-1.log`: 14 service/security checks, eight desktop/mobile journeys, 86 migrations/186 protected tables and OS build. The full regression, including forged-hash, wrong-agent and session admission negatives, is running in `memory-final-ci.log`; earlier knowledge evidence does not validate this stage. Applied only the tested additive migration to the existing fixture preview without seeds/reset, preserving 185 legacy tables / 1,397 rows by original-column checksums. Receipt: `preview-0086-result.json`. Restore its web process after regression; no live URL is claimed yet.

No staging, commit, push, deployment, hosted migration, real credentials, external sends or trading. Current design and earlier dirty work remain preserved. Full parity is unfinished; durable execution is the next dependency ahead of schedules, tool execution and local bridges.

### Memory-stage full acceptance

Final `npm run test:ci` exited 0 in `.runtime/workspace-parity/memory-final-ci.log`: 271 service/security tests; 56 private journeys with six intentional skips; 42 public journeys in each development/optimized mode; 86 migrations, 186 protected tables, 170 exposed functions. All three builds and dependency/publication/CSP/SRI/artifact/secret/budget/recovery gates passed. Restore: 4,737 synthetic rows / 29 objects, 3 seconds. OS bundle 175.2 KiB gzip, marketing 118.8 KiB; 578 scanned files. Mobile Lighthouse 98/100, desktop contact 100/100. Memory desktop/mobile journeys passed in 12.1/12.5 seconds, including removal of output loaded beyond 100 newer messages. This supersedes the pending full-regression status above.

The existing fixture schema remains additively upgraded without reseeding. A guarded existing-store Next/file-worker launcher has restored loopback port 3244; real UI/API smoke verification is in progress before declaring the review URL verified. No unrelated source was staged or discarded. Durable draft jobs remain the next unblocked stage, with schedules/tools/bridges and hosted activation still separate.

Preserved-store preview smoke now passed: http://127.0.0.1:3244/os/workspace, unique health identity, anonymous denial, normal fixture owner sign-in, 11 existing rooms, knowledge/memory API 200 and rendered Memory tab. No demo records or provider calls. Evidence: `preview-running.json`, `preview-smoke-result.json`, `memory-preview.png` under `.runtime/workspace-parity`. Next/file-worker are ephemeral application processes; no OS scheduler/service, new credential or persistent access was installed. Continuing into durable draft execution, then scheduling prerequisites, as requested by the parent continuation.

At the parent's offered natural handover boundary, saved the concrete next contract in `docs/workspace/durable-execution-next.md` and an unapplied, unverified schema proposal in `durable-draft-jobs-proposal.sql`. The proposal is outside automatic migrations; functional code remains the fully verified 0086 slice. Next work is actual queue/worker/UI implementation and its lease/fencing/idempotency/retry/cancel/scope/restart acceptance, then recurring scheduling. Full parity remains active and unfinished. Preserved preview health is confirmed; no repeat of full memory CI was needed for documentation-only changes.

## Durable draft execution implementation in progress

Parent resumed implementation. Additive 0087, `team-jobs.ts`, shared runner preparation/execution, Jobs UI/API and a guarded ephemeral fixture HTTP worker now implement queue admission, exact request/claim idempotency, due instants, leases/fences, bounded pre-dispatch retries, cancellation and post-dispatch uncertainty. No OS service/credential or hosted scheduler was created. Existing synchronous Ask/design are preserved. See `docs/workspace/durable-execution.md` for actual limits and source pointers. Hosted execution remains visibly inactive.

First focused verification passed three new durable scenarios and found a test-cookie tenant-selection error in the fourth; the application correctly enforced 428 after the fixture added another active organisation. The test cleanup is corrected without weakening the guard. Expanded focused verification is running in `.runtime/workspace-parity/jobs-focused-2.log`, including memory/skill/connection withdrawal and cancellation/publication boundaries. Earlier memory CI is historical for these changes. Preview processes owned by this task were stopped after matching their unique health receipt to prevent shared Next configuration races; the existing database/files remain intact and have not received 0087 yet. Restore the guarded preview after current acceptance and a checksum-preserving upgrade.

### Focused durable acceptance and full regression

`jobs-focused-4.log` exited 0: 19 service/security checks, ten desktop/mobile journeys, OS build and 87-migration/188-table verification. This follows fixes for absent-run cancellation and a browser-test UTC/local-time mix-up; earlier failed logs and browser traces remain preserved. Concurrent cancellation retains exact-version conflicts, accepted cancellation fences late output, unknown post-dispatch completion never replays, and active-queue/run limits remain intact. Full current regression is running at `.runtime/workspace-parity/jobs-final-ci.log`; all 276 service/DB/HTTP/security tests and migration/RLS verification have passed, including subsequent SQL NULL-fence and private-owner attempt-denial cases. Browser/build/recovery/publication acceptance is still pending.

Expected current inventory: 87 migrations / 188 protected tables / 176 exposed functions. The preserved preview remains stopped for CI with schema 0086 and original data/files intact; an original-column checksum-preserving 0087 upgrade and guarded preview smoke are prepared for after acceptance. Hosted/recurring execution, external providers/actions and OS persistent access remain inactive.

### Durable stage verified; preview restored

Final `jobs-final-ci.log` exited 0: 276 service/security tests, 58 private journeys plus six intentional skips, 42 public journeys in each mode, all three builds and all dependency/publication/CSP/SRI/artifact/secret/budget/recovery gates. Inventory 87/188/176. Restore: 5,324 synthetic rows / 38 objects in 3 seconds. OS gzip 176.7 KiB, marketing 118.8 KiB; 587 scanned files. Mobile Lighthouse 98/100 (LCP 2363 ms, CLS 0, TBT 44 ms), desktop contact 100/100. SQL NULL-fence and private-owner attempt cases pass in this final run.

Applied only 0087 to the preserved fixture preview after full acceptance: original-column checksums matched all 186 prior tables / 1,397 rows, no seeds/reset/bootstrap. `preview-0087-result.json` records the guarded upgrade. Restored http://127.0.0.1:3244/os/workspace; normal sign-in, anonymous denial, 11 existing rooms, knowledge/memory/jobs APIs and Memory/Jobs UI all pass. Screenshots were inspected. No demo jobs/model calls or agent worker were activated in that store. Existing Next/file-worker processes are ephemeral, with no OS service or new credential/access grant.

Saved the complete family mapping and concrete next sequence in `docs/workspace/remaining-parity.md`: recurring local schedules/occurrence deduplication/timezone-DST/overlap/budgets/pause on the tested queue, then scoped audit export and one operational template. It distinguishes safe local engineering from product decisions and external activation. Full parity remains active; no commit/push/deploy or external send occurred. No extra CI rerun is needed for final documentation-only updates.

### Recurring drafts implementation in progress

Reconciled the resumed tree/runtime: no prior 0088 implementation or duplicate worker. Preserved preview stopped with its matching health/ownership receipt before schema work, without reset/seeds. New additive 0088 and local service/UI implement reviewed immutable daily definitions, IANA early-fold/skip-gap semantics, unique occurrence/tick ledgers, latest-due-day catch-up, overlap/budget controls and pause/revoke child fences through the existing authenticated fixture worker. Verification is running; historical 0087 acceptance does not validate this code yet. First harness attempt hit sandbox loopback EPERM before startup; the normal reviewed escalation runs the isolated test harness. No deployment, billing activation, provider calls or invitation. Approved launch offer and separate owner recovery evidence are reconciled in launch-readiness.md.

The main 0088 full run `schedules-final-ci.log` exited 0: 283 service/security checks, 58 private journeys + six intentional skips, 42 public journeys in each mode, all three builds and recovery/CSP/artifact/secret/budget/performance gates. Inventory 88/191/179, restore 6,126 synthetic rows / 43 objects / 3s, OS gzip 178.8 KiB, scan 598 files. Subsequent narrow workspace review hardening makes review hashes null after pinned-source withdrawal and prioritises pending work over archived history. All 28 service cases pass in `schedules-hardening-ci.log`, including real memory deletion and >100 later archived records with no quota resets/backdating/model calls. Its browser/build gates are still running; it is separate follow-up evidence, not the earlier full run's exact source snapshot. Preview remains stopped/unmodified until these checks finish.

### 0088 final local acceptance

Later `schedules-hardening-ci.log` exited 0: 28 focused service checks, 10 workspace desktop/mobile journeys, migration/RLS and OS build. Current artifact/budget/secret gates passed afterward; OS gzip 178.9 KiB / 200, marketing 118.8 / 140, 598-file scan. These are subsequent narrow workspace changes, distinct from the broader successful full run recorded above. A final placement-copy correction received formatting/preview verification.

Only 0088 was applied to the owned preserved fixture store. All original columns in 188 tables / 1,397 rows compare unchanged; no bootstrap/seeds/reset. SHA-256 `14b75f7fdb60a2ed9923e4e678ab00b480bc92a56051581a61ef98f4ff982487`; next additive migration is 0089, never rewrite applied 0085–0088. Local preview restored at http://127.0.0.1:3244/os/workspace, normal fixture sign-in/anonymous denial, 11 existing rooms, knowledge/memory/jobs/schedules reads and UI smoke pass. Screenshot inspected. Only ephemeral Next/file worker active; no agent worker/demo records/model calls. No push/deploy/hosted migration/real-provider access/billing activation/invitation/external send.

Next work is cursor catalogs, one complete CRM record workflow and approved pilot entitlements/lifecycle/terms before a factual launch snapshot; broader tools, connectors, bridge and hosted acceptance remain. Owner recovery continues separately; do not duplicate invitations or bootstrap initialized production with the stale empty-project playbook. HEAD and branch unchanged, all original dirty work preserved.

### 20 October catalog/workflow/pilot continuation in progress

The task continues from verified 0088. Owned preview was stopped only after matching its health receipt; DB/data remain preserved. Cursor catalogs now use current RLS, native PG precision, active-first bands, deduplicating/abortable UI pages and explicit refresh on band movement. Additive 0089 implements room lead → exact proposal/review → atomic account/opportunity conversion and durable replay receipts. Additive 0090 implements an opt-in FIXTURE-only approved offer/lifecycle, real membership/invitation seat reservations and inactive-draft/conversion fences. No tenant is auto-assigned; unapproved capacity is configurable/read-only proposals. No charges, provider object or external send.

First focused run passed catalogs/CRM and denied pilot activation because canonical legacy fixtures lack a DB fixture-provider tag. Corrected the boundary with a verified-server/environment execution marker in scoped transactions, not profile rewrites or client flags. The second fresh focused run is active. Source/test/UI verification and full regression are required before acceptance or preserved-store migration. Concrete target-bound staging sequence and prerequisites are in staging-release-sequence.md; it authorises no remote action.

Focused acceptance5 passed31 service checks,14 desktop/mobile journeys and OS build. The first full run required correcting the anonymous SELECT test to expect the stronger42501 table-grant denial for the two private pilot tables. The second full run caught a real run-link catalog timeout. EXPLAIN on its guarded stopped disposable store showed protected-run SeqScan authorization for unrelated reserved IDs; a procedural primary-key-first helper in unapplied0090 retains current room/provenance checks and completes the same101-row workload in512ms under the unchanged5s limit. Receiptcatalog-query-profile.json. Current full launch-final-2-ci.log passes all288 service cases and migration/RLS; remaining gates continue. Preview remains paused at88, no data reset or pilot assignment.

## 20 October — catalog/workflow/pilot accepted, preview restored

Full `launch-final-2-ci.log` exited 0: **288** service/DB/HTTP/security tests, **62** private browser journeys plus six intentional skips, **42** public journeys in each development/optimized mode, all three builds and all recovery/security/budget gates. Current inventory: **90 migrations / 195 protected tables / 184 exposed functions**. This is local fixture acceptance, not hosted or payment-provider acceptance.

Evidence: `.runtime/workspace-parity/launch-final-2-ci.log` ends `Hermetic CI PASS`. Restore verified **195 tables / 7,214 synthetic rows / 51 objects / 3 seconds**. OS gzip181.1KiB/200, marketing118.8/140. Secret scan612files/6patterns; artifact isolation excludes21fixture markers/12private-local source classes; CSP71hashes/116SRI scripts. Mobile Lighthouse98performance/100accessibility, LCP2361ms/CLS0/TBT42ms; desktop100/100,LCP431ms/CLS0/TBT0. Focused5 independently passed31service/14browser/OSbuild; full288 includes later anti-spoofing/stale-version/frozen-offer/receipt assertions.

New DB/HTTP/browser coverage proves exact CRM review/source edit invalidation/concurrent replay, private-owner/cross-tenant/membership-withdrawal and direct-DML denial; two-page >100 catalogs/stale-band409; actual invitation/membership five-seat concurrency/held acceptance, cancel/work/publication gates, queue cancellation/schedule pause on next authorised drain, lifecycle/expiry/reconcile, hosted/forged-mode denial and immutable offer/event receipts. No quota reset or extra model runs used to pass acceptance.

Retained failures: focused1 legacy fixture provider tag required a server-auth/environment-derived transaction execution marker; focused2/3 obsolete lowercase invitation-state predicate missed current PENDING/SENT/DELIVERY_FAILED holds (not a demonstrated snapshot race); focused4 UUID/text fixture parameter needed explicit casts. First full run expected empty anonymous pilot SELECT instead of correct42501; assertion strengthened, no grant added. Second full run exposed a5s catalog timeout. Additive0090 point lookup in team_job_run preserves room/provenance checks; owned disposable-store EXPLAIN identified the old nested-loop protected-run SeqScan. `catalog-query-profile.json`: same101rows now512ms under unchanged5000ms. Failed logs retained; no old migration/RLS/quota weakened.

Preview: http://127.0.0.1:3244/os/workspace. `preview-0090-result.json` proves **191 original tables / 1,397 rows unchanged** under original-column checksums, with no seeds/reset/bootstrap; resulting inventory195/184. `preview-smoke-result.json` passes normal synthetic sign-in, anonymous401,11existingrooms and knowledge/memory/jobs/schedules/workflow/pilot APIs/UI. Screenshots inspected. Workflow records remain empty and pilot unassigned; no model/provider call or job worker. Current run ID `local-preview-0eac598a-3c1d-484e-a6e2-461061e00c83`; PIDs89251/89258 are hints only: match live health and receipt before stopping. App/file worker are ephemeral. Never use normal bootstrap launcher on this store.

Frozen applied hashes:0089 `460e9f735724d1c92edd02f29580a1e51b0019a2c8a96ec632eedaaf9ffdb4d7`;0090 `08f134803f79a2a25cbd6907319f2cee0f63e9ebf6f439ca9c579363247300cc`. Do not rewrite applied0085–0090; next0091. Branch codex/phase-2-completion/HEADab196932bc44e1c8fdf7d119a2f082c36bc9d5b0 unchanged; all unrelated dirty work retained; no staging/commit/push/deploy.

Next: remaining-parity.md and staging-release-sequence.md. Actual signed Stripe pilot mapping/test-provider lifecycle, hosted workers/providers/scanning, owner secure handoff and legal/service/usage decisions are still gates. No actual subscription/invoice/payment/credentials, remote migration, external send/spend, persistent OS service/access grant or production operation occurred. Full parity is not claimed. Earlier active-run/paused-preview checkpoints above are historical.

### 20 October0091 billing continuation — verification pending

Added isolated pilot Stripe TEST configuration/binding/intent/event records, strict mocked transport price/account/customer/portal validation, fresh owner checkout/portal/reconciliation API, signed subscription webhook and SQL-authoritative ordering/replay/terminal-cancel/five-seat entitlement reconciliation. No configuration row or real provider object seeded. Existing fixture simulation cannot mutate TEST_STRIPE state; legacy checkout remains410. Focused regression stripe-focused-1.log is active; full current acceptance and guarded preview upgrade still required. Parent reports staging82 hashes match source with0083 onward pending; Vercel team list403 is denied and must not be bypassed. Secure DB operator/TLS/backup inputs and worker project ID remain pending. Separate inspector owns clean candidate inventory; active checkout remains dirty and preserved.

###0091 focused checkpoint

stripe-focused-2.log exited0:37service checks,14browser journeys,91/199migrationRLS andOSbuild. Focused1 passed new service cases but correctly failed missing explicit config-table deny policy; fixed without granting table access. Current focused3 adds a denial-only quarantine for signed invalid bound offer snapshots, first-checkout reservation serialization, current billing-customer entitlement rechecks and bounded redirect expiry. Its source supersedes focused2; full current acceptance still pending. No hosted provider or Stripe call/credential, deployment or charge occurred.

## 20 October final 0091 handover — no further feature writes

Full `stripe-full-1-ci.log` exited 0: **295** service/DB/HTTP/security tests, **62** private browser journeys plus six intentional skips, **42** public journeys in each development/optimized mode, all three builds and every recovery/security/budget gate. A subsequent **SQL-only session-read policy** change passed one focused test with **eight boundary assertions**, migration/RLS verification and type checks; runtime JavaScript was unchanged after the full run. Current inventory: **91 migrations / 199 protected tables / 185 exposed KXRA functions**. These are separate source phases, not a claim of a second full-platform run after the policy change.

**Exact source/evidence distinction:** full-run delta/migration bytes are pinned in `.runtime/workspace-parity/stripe-full-1-source-manifest.json`; `stripe-full-1-ci.log` ends Hermetic CI PASS. Afterwards, only the private stored-session SELECT policy was tightened from current-owner to current fresh-MFA requester, with eight assertions added in tests/pilot-stripe.test.ts. `.runtime/workspace-parity/stripe-session-policy.log` and `stripe-session-policy-result.json` pass all eight boundaries and91/199RLS on the strictly identified owned disposable CI store. It was restarted without bootstrap/seeding/reset, tested and stopped. RuntimeJS stayed unchanged; typecheck/artifact/bundle/secret checks pass afterward. No second full-platform run is claimed after that SQL-only change. The final candidate must still be validated against its exact assembled source.

Full-run restore: **199 tables / 7,349 synthetic rows / 51 objects / RTO3s**. OS gzip181.8KiB/200; marketing118.8/140. Secret/publication620files/6patterns. Artifacts exclude21fixture markers/12private-local source classes; CSP71exact hashes/116SRI references/4119header chars. Mobile Lighthouse97performance/100accessibility,LCP2427ms/CLS0/TBT108ms; desktop100/100,LCP428ms/CLS0/TBT0. These are local synthetic results, not staging/production recovery or provider acceptance.

**Failures/fixes retained:** focused1 new service tests passed but migration verification caught absent explicit deny policy on ungranted pilot_stripe_config; added deny policy, no grants opened. Focused2 passed37service/14browser/RLS/OSbuild. Focused3 passed38service/RLS but13/14browser: mobile post-reload Jobs click preceded hydration; persisted run was successful and Conversation remained selected. Trace/context/screenshot saved in stripe-focused-3-mobile-failure. Native tabs now wait for existing ready state; full desktop/mobile job journeys pass, with no increased timeout or weakened assertion. Explicit immutable provider event guard also passed full CI.

**Delivered:** strict test-only account/price/product/customer/portal protocol validation, checkout/portal/reconciliation API/UI behind reviewed empty/disabled config, separate signature webhook, exact event replay, stale/tied event handling and invalid-offer denial quarantine, canonical version-fenced reconciliation, terminal cancellation, actual five-person pending/membership/invitation holds, current customer mapping checks and work/late-output fences. No body-selected identity/role/price/customer grants. Hosted readiness remains unavailable and fixture simulation cannot mutate provider mode. Legacy checkout410/livemode:false retained.

**Preview restored:** http://127.0.0.1:3244/os/workspace. `preview-0091-result.json` proves every original column/row in **195 tables / 1,397 rows unchanged**; no seeds/reset/bootstrap. `preview-smoke-result.json` passes normal synthetic sign-in, anonymous401,11existingrooms and all knowledge/memory/jobs/schedules/Workflow/Settings surfaces. Pilot remains unassigned; no demo record/provider/model call or agent/job worker. New runID `local-preview-11907ba9-c604-4175-bcc6-db3cf20e8f1d`; appPID99075/filePID99081 are ownership hints only: match current health/receipt before stopping. App/file worker are ephemeral. Never run normal bootstrap on this preserved store.

**Freeze:** additive0091 SHA256 `b4069d0b59b2204856e05aaa1b05f0eee5e618ec4297dd81cf512f2449cca6d2`. Applied0085–0091 frozen; next0092. Final selected file/hash manifest: `.runtime/workspace-parity/stripe-source-manifest.json` (content aggregate, not a Git commit SHA; scope is this delta plus reconciled docs). Parent's dependency-complete inventory must retain earlier workspace/runtime, business-sprints imports and referenced public media; exclude actual.env/.vercel/.runtime/traces/private/root referencePNGs and separate auto-apply helpers. See release-artifact-contract.md and staging-release-sequence.md. Branch codex/phase-2-completion and HEADab196932bc44e1c8fdf7d119a2f082c36bc9d5b0 unchanged; unrelated dirty work retained. No stage/commit/push/deploy here. Parent assembles/validates a separate candidate before its later reviewed scoped commit/push.

**Blocked/pending:** Vercel project-list read for team_rcuJ4xQGKvLPetIFH3ceILH6 returned403 via parent; action is denied, user account/team repair pending, no alternate route attempted. Parent's stagingjlebgsxcvhvpueuibekd read-only ledger inspection found82matching hashes; apply0083–0091 remains pending clean candidate, existing secure TLS operator/CA and backup/isolated-restore evidence. Worker project ID and owner secure handoff/MFA remain separate/pending. Actual Stripe test configuration/delivery, invoice/refund accounting, approved VAT/cancellation/refund/setup/service/usage decisions and hosted providers/workers/scanner acceptance remain unaccepted. No real credentials, provider account writes/objects, external sends/spend, persistent service/access grant, remote migration/deployment or live charges. Full parity/live revenue readiness is not claimed. No further feature slice after this final freeze.

##22October2026 — reference-led local baseline

The clarified brief prioritises the new reference layout/format/context, not comparison against the current KXRA site. Isolated branch `codex/reference-baseline` starts at5ed7401. First local shell/homepage/sample/catalog slice and fixed reference inspection are documented in `docs/workspace/reference-baseline-2026-10-22.md`. Typecheck, focused desktop/mobile controls/routes/width checks and marketing production-mode build pass. No push/deploy/hosted migration or credential/provider action. Exact full visual/content/journey coverage is not complete. Live marketing and the three staging holds remain unchanged; recovery scope is still pending.

##22October2026 — dedicated reference journeys, local batch2

Six app-specific sample journeys, seven partner child pages and13 help articles are now locally accepted, with full16-page product taxonomy and57 authored sitemap destinations. Production-mode browser acceptance9PASS/1duplicate inventory skip; exact per-route CSP/SRI64pages/534scripts/max1095chars PASS, including negative checks. Screenshot saved to Library. See `docs/workspace/reference-journeys-2026-10-22.md`; no push/deploy or hosted change. Remaining product depth/private operations and staging recovery gates stay explicit.

##22October2026 — illustrated reference families batch3

Original collaborative cutaway hero and differentiated solutions/integrations/use-cases/resources/blog/comparison families implemented locally.86 authored destinations,93 static pages. Dev browser19PASS/1duplicate skip, strict CSP/SRI810scripts/max1203chars, type/build and4synthetic provider tests pass. Updated existing Library preview to version1. Scope/evidence: `docs/workspace/reference-families-2026-10-22.md`; next real-platform slices: `docs/workspace/real-platform-next-slices-2026-10-22.md`. No push/deploy or hosted/data/security/billing action; staging holds/recovery gate preserved.

Final corrected build/CSP/typecheck pass; production controls18PASS, then affected hero/inventory/responsive checks5PASS/1duplicate skip after splitting the combined test budget without reducing assertions. Temporary3278test server stopped;3277dev preview retained.

##22October2026 — private reference workbench and persistent CRM

Reference-led three-pane private workspace, authorised room search/context, URL-backed keyboard-accessible views and scoped CRM record search/type/count/stages now use the existing verified APIs. Actual PostgreSQL persistence, new-session recovery, lost-acknowledgement duplicate-safe retry and catalogue recovery accepted locally. Final fresh fixture40HTTP/18browserPASS; production OS build/type/formatPASS. Baseline additionally verified91migrations/199protectedtables. Same actor in two actual tenant contexts denied at API and authenticated RLS layers; source/review/idempotency boundaries retained. See `docs/workspace/private-workbench-2026-10-22.md`.

Private loopback preview3279 retained, synthetic fixture identities only; public3277 retained. Fresh runtime `/var/folders/1b/rx87jbks7ysd9v3n0dgym53w0000gn/T/kxra-wb-5SpOa3`, nonsecret `reference-workbench.json` receipt records runID/PIDs and accepted outcome. `node scripts/reference-workbench-fixture.mjs --verify` creates a new store; never reuses preserved data. Original/repair checkout clean; no hosted mutation/push/deployment/credentials/provider spend/billing/security/staging-hold change. Hosted recovery exclusion and all release gates remain pending.

##22October2026 — local account/access recovery

Getting started now connects existing account/onboarding to authoritative billing state and first persistent room/message work. Pending provider bindings no longer inherit legacy entitlement (additive0092, fresh local stores only); original checkout metadata recovers without exposing redirects/secrets. The status report uses the existing database administration predicate, including customer ORG_ADMIN, without granting roles or weakening MFA/RLS. Local verification:42 HTTP contracts and92-migration/199-table RLS check PASS; final focused Getting started browser6/6 PASS; final OS build/format PASS. Broader compatibility log and earlier corrected failures remain explicitly documented in docs/workspace/activation-and-billing-2026-10-22.md.

Combined synthetic private preview: http://127.0.0.1:3283/os/start. Runtime kxra-wb-b1urc0 is a new private Unix-socket fixture. Accounts/email/model/payment outcomes remain synthetic; actual local rooms/messages/CRM use PostgreSQL. No private deployment/push, hosted migration or credential/provider/billing/staging-hold change. The separately approved public release665a6c0 is live. Preserved apps/os/tsconfig.json generated-type edit is excluded from the source commit; denied restoration was not retried. Next: finish operations-board focused acceptance and commit separately; hosted recovery83–92/rollout, real execution/payment acceptance and concrete commercial/customer-entry decisions remain pending.

##22October2026 — persistent operations board accepted locally

Room Tasks now show four persisted stages with exact-revision creator review, search, useful empty states and contained keyboard/mobile scrolling. Existing APIs and database authority are reused; failed transport does not move a card optimistically. Local focused board/workspace suite6/6 PASS, final combined-source OS build/format PASS. The mobile overflow found by acceptance is fixed without force-clicks; non-creator decisions remain denied by the existing generic409 contract, with unchanged-state assertions. See docs/workspace/operations-board-2026-10-22.md.

Activation is committed as ea0f6d2. Its broad browser run ended25PASS/3intentional skips/2pre-correction report failures; the final Getting started6/6 rerun accepts the correction, so all27 applicable inventory cases have passing evidence across those runs. Combined fixture3283 remains available with synthetic auth/email/model/payment outcomes, actual local PostgreSQL state, no hosted/provider readiness claim. Public665a6c0 and all staging holds remain stable. Next executable local app work is a dedicated persisted non-CRM model or bounded native-bridge protocol; hosted signup, providers, payments and recovery/rollout remain separately gated.

##22October2026 — local self-service signup and customer provisioning

A separate self-service path now registers/verifies a synthetic local identity without an invitation, then transactionally provisions one CUSTOMER organisation/ORG_ADMIN membership/initial project/onboarding record. Duplicate/lost-acknowledgement requests recover the original receipt; verified identity and exact scope are server-derived. New self-provisioned workspaces cannot inherit legacy paid access. Existing invitation lifecycle and suspended-account rejection remain intact; the initial regression caught and corrected a hidden-profile/new-identity ambiguity.

Final source-matched fresh fixture:93 migrations/200 RLS-protected tables PASS;11 affected desktop/mobile browser cases PASS/3intentional skips;42 billing/workspace API contracts PASS; direct SQL guard, final OS production build and production paused/503 boundary PASS. See docs/workspace/self-service-2026-10-22.md for exact logs and safe payment/provider inventory. Preview http://127.0.0.1:3285/signup; runtime kxra-wb-4aJbFN, private Unix socket, no real providers. The paid record in acceptance is an explicit synthetic DB fixture, not a checkout success.

Hosted signup remains disabled, invitation Auth hook unchanged. Actual provider account/key/webhook/card/payout configuration is unverified; no denied environment enumeration was retried. Hosted83–93 recovery/configuration/rollout, secure provider setup and real sandbox acceptance, exact commercial/entry decisions, five app models and native bridge remain launch work. Public665a6c0 and all staging holds unchanged. Generated apps/os/tsconfig.json edit preserved and excluded from this commit.

##22October2026 — Creator Management and Sampling Desk accepted locally

Room-scoped persistent creator roster/brief/follow-up and linked sample request/delivery/post-review models now use exact-version proposals, immutable snapshots, creator-only review and duplicate-safe explicit application. Changed record/creator context, stale/expired/cancelled review, removed membership and cancelled entitlement prevent new stage writes. No creator outreach, shipment/carrier confirmation or notification is performed.

Acceptance:47 API/billing contracts,12 desktop/mobile app/workspace cases,94 migrations/202 protected tables PASS; final enhanced5 API+2 focused browser rerun and production OS build PASS. See docs/workspace/creator-sampling-2026-10-22.md for logs and owner launch inputs. Preview3288 in fresh private Unix-socket fixture kxra-wb-OrerQn. Generated tsconfig remains preserved/excluded; public665a6c0, hosted data/providers/billing and staging holds unchanged. Remaining dedicated models: Remodeling CRM, Recruiting Workspace, Travel Desk; bridge and real-provider/hosted rollout remain separate.

Read-only payment check: existing Safari Stripe tab requires sign-in, redirect account acct_1TtbSfEQpGaUiI7r, intended ownership unverified. User must privately sign in/select intended KXRA account before safe readiness metadata can be checked. No credentials, new login/grants or settings changes performed. Recovery still requires more than the three-record exclusion: fresh backup/restore/configuration plus exact83–94 release authority and hosted acceptance.

## 22 October 2026 — operational case apps accepted locally

Remodeling CRM, private Recruiting Workspace (roles/applications) and Travel Desk now persist structured records, versioned proposals, exact creator reviews and idempotent stage receipts through the existing authenticated API/RLS model. Changed scope/criteria/itinerary invalidates earlier review; manual GBP estimates use exact pence conversion. No quote, hiring decision, booking, payment or external send is performed.

Final acceptance: 51 API/billing contracts, 18 relevant desktop/mobile journeys across the documented runs, 95 migrations/204 protected tables, root typecheck, scoped formatting and final OS production build PASS. The reused fixture reached its 50 uploads/hour cap; its 25/32 compatibility outcome remains recorded. A fresh disposable fixture passes all 32, without resetting counters, deleting data or weakening a guard. See docs/workspace/operational-cases-2026-10-22.md for exact logs/stores. New preview 3290; earlier 3289 evidence/data retained.

Stripe read-only inspection confirms KXRA Group payments/payouts active with no active tasks, two customer records, legacy £499 price showing zero active subscriptions and no displayed payment links. Product edit form inspected and cancelled without saving. Proposed £29/£79/£199 catalogue remains pending approval. See docs/workspace/stripe-readiness-2026-10-22.md and paid-launch-gates-2026-10-22.md. No Stripe writes, hosted/provider/billing changes, private push/deploy or staging-hold restoration. Public 665a6c0 remains live. Generated apps/os/tsconfig.json edit preserved/excluded. Native-agent bridge implementation remains next; local fixtures do not prove real provider readiness.

## 22 October 2026 — native-agent protocol started, transport unavailable

Case apps are committed as 2c31bddf6419a5bacfa51fe236dc3dc44ec8e4a3. A separate bounded native-agent protocol now pins server scope/session and selected source hashes, expires after ten minutes, requires exact creator review and accepts only unverified draft text. Strict input rejects caller identity/tenant/tool/path/command/endpoint authority. Eight deterministic protocol tests, root typecheck and scoped formatting pass. See docs/workspace/native-bridge-contract-2026-10-22.md.

This is protocol foundation only: no request ledger, atomic single-use consumption, device pairing, transport or API/UI handoff yet. Pairing/export/dispatch readiness remains false; absent adapter always fails closed. No fake provider success, credential creation, host access or external action. Next local work is the persistent reviewed request/result ledger with HTTP/RLS/concurrency/recovery/browser acceptance; a real provider connection needs separately approved scope and acceptance. Public/hosted/billing/staging holds unchanged; generated tsconfig remains preserved/excluded.

## 22 October 2026 — local manual bridge accepted

Migration 0096 adds a persistent immutable request/review/result ledger, creator-only scoped manual handoff and single logical export/result receipts with concurrent retry recovery. Current identity/session, room/tenant/write/paid/source authority is checked under locks. Changed payload needs a new request; expiry, revocation, cancellation and changed source block further use. UI covers explicit source review, one recoverable packet, unverified returned draft review and reload history. No native transport/device or external execution is activated; hosted admission remains closed.

Acceptance: 57 API/billing contracts, 8 protocol tests plus 1 production service-boundary test, 20 desktop/mobile journeys, 96 migrations/205 protected tables, root typecheck, scoped formatting and production OS build PASS. Initial JSON ordering/audit-fixture failures and test-only inference failure remain documented; canonical packet validation and attributed fixture writes corrected them without weakening guards. Exact logs/limits: docs/workspace/local-manual-bridge-2026-10-22.md. Preview 3291 in new private Unix-socket fixture kxra-wb-c4gqfP; all earlier data/evidence and generated tsconfig edit retained.

Next smallest owner decision is the exact three-consumed-secret-row staging recovery exclusion described in docs/workspace/paid-launch-gates-2026-10-22.md. It alone does not authorise migration/deployment or clear recovery/hosted acceptance. Pricing approval remains pending. No private push/deploy, hosted mutation, provider credentials/calls, Stripe write or staging-hold change.

## 22 October 2026 — consolidated release-readiness inventory repair

Exact 1468018 was archived and tested in a clean isolated clone. The first CI startup exposed local shared-memory exhaustion; three completed task-owned fixtures were verified/stopped gracefully with all data retained, leaving 3291 available. The unchanged-source rerun ended 318/324 service checks: six stale schema/access-inventory failures. No full-green CI claim is made for 1468018. Its independent publication/marketing boundary/713-file secret scan/production marketing build/93-route CSP-SRI checks pass.

The repair preserves exhaustive table/RPC denial coverage, adds populated owner-only self-service receipts in two tenant contexts, enumerates the five dedicated case/collaboration/bridge tables, and binds strict post-migration inventory to 96/205/199. No source migration, grant, authentication, target/TLS/operator confirmation guard or hosted state is changed. All 33 affected security/control-plane/staging-manifest tests and root typecheck/format pass in a fresh fixture. A clean exact repaired-candidate full CI is the next verification gate, not assumed complete.

See docs/workspace/release-readiness-2026-10-22.md for exact snapshot/archive hashes, functional gaps and proposed provider/destination/scope/test-budget requests. The commercial source still validates the old single pilot; proposed tier prices/seats/credits require approved terms plus authoritative code, not just Stripe objects. Recovery-copy exclusion and pricing remain separately pending. No push, deploy, hosted mutation, credential creation, send or spend. Original generated tsconfig remains unchanged and excluded.
