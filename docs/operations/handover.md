# Engineering handover

Updated: 27 September 2026.

## Current checkpoint

Work from /Users/kara/Desktop/P1/The KXRA Group on `codex/phase-2-completion`. Slice 34 implementation commit `d46358dbcc40814abf4a9bc6cb76484b9bce3587` passes the complete local contract, full GitHub CI run 36295329624 and SHA-matched CodeQL run 36295329649.

The branch is not merged and nothing is deployed. Preserve the private `KXRA-GENESIS` package, original source documents and unrelated parent-repository applications. PostgreSQL authorization, tenant/project isolation, Project 004's paper-only boundary, Project 005's demand gate, the Projects 006/007 no-side-effect boundaries and the repository publication boundary remain non-negotiable.

Read, in order:

1. [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md);
2. [acceptance evidence](acceptance-evidence.md) and [progress](progress.md);
3. [architecture](../architecture/system.md), [security](../security/access-control.md), [ADR 0015](../decisions/0015-independent-public-marketing-boundary.md) and the [public marketing threat model](../security/public-marketing-threat-model.md);
4. ADRs 0008–0011 and their threat models;
5. the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md) and root [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) for preserved requirements.

## Actual delivered state

Final Milestones 1–4 and Phase 2 Slices 0–34 are committed remotely. Slice 34 adds migration `0068`; the current schema has 171 RLS-protected tables and 146 audited public functions.

Slice 34 adds:

- exact accepted-evidence versions and rationales for the ten Genesis scoring factors;
- deterministic coverage and score bounds, with unknown headline scores until evidence is complete;
- optional complete four-dimensional confidence evidence, explicitly separated from success probability;
- hash-bound owner approval, recent-AAL2 execution, stale-state/evidence rejection and immutable superseded history;
- owner assessment/history UI and applied-result visibility limited by active project RLS;
- SQL, HTTP and browser attack/acceptance coverage documented by ADR 0037.

Slice 33 adds:

- server-derived assurance and factor selection after hosted password sign-in;
- an independent application-actor AAL2 gate for direct private access by enrolled hosted identities;
- a dedicated TOTP challenge surface that accepts only a six-digit proof from the browser;
- an exact callback allowlist and signed HttpOnly ten-minute recovery intent bound to the verified Supabase subject;
- provider password update, current KXRA account-state verification, intent consumption, explicit partial-failure handling and global sign-out;
- ADR 0036, account-threat-model additions and a complete hosted sign-in/recovery staging acceptance sequence.

Slice 8 adds:

- separate `apps/marketing` source, runtime and optimized build;
- a hash-bound disabled publication snapshot and all required current/preserved routes;
- original layered industry storytelling with reduced-motion/mobile/no-JavaScript treatment;
- three accessible public forms using one origin-bound, HMAC-digested, idempotent, rate-limited write RPC;
- two new RLS tables, one owner-only unverified private inbox and an audit event per accepted submission;
- exact snapshot, source-boundary, artifact/private-marker, SQL/HTTP and 10-scenario public browser evidence;
- ADR 0015, a threat model and a staging/release playbook.

No Trigger.dev task, always-on scheduler, hosted worker or notification sender exists. No YouTube token, upload/schedule executor, repository archive fetcher, candidate process runner, Git writer, merge/release/deploy route or production scanner exists. Synthetic local evidence proves the contracts only.

Preserved earlier slices include normalized global identity, selected tenant, exact legal gate, private file/knowledge lifecycle, permission-safe Ask/AI runs, owner control plane, seven project workspaces and Brand Studio. Slices 19–21 provide the local custom-project path through triage, exact proposal, acceptance, payment gate, activation, bilateral changes, milestone delivery/acceptance, invoices and immutable adjustments. Slice 22 adds exact private support, subscription cancellation/withdrawal and personal-data request workflows with isolated internal handling notes. Slice 23 adds a disabled-by-default, address-pinned website-source worker and immutable refresh evidence. Slice 24 adds append-only human source correction and database-enforced stale-lineage blocking through final export delivery. Slice 25 adds encrypted invitation-link custody, a restricted email worker, idempotent Resend transport and signed provider-state reconciliation. Slice 26 adds a restricted billing worker, raw-body Stripe verification and metadata-independent test subscription reconciliation. Slice 27 adds test-only hosted Checkout/Portal session intents, fixed/bounded provider calls, worker-recorded redirect custody and customer billing controls. Slice 28 adds database-derived, idempotent Stripe test-customer bootstrap and worker-recorded mapping. Slice 29 adds a hash-bound, resumable and environment-guarded staging migration operator. Slice 30 adds a canonical-only staging seed profile and operator that excludes all local executable/fixture authority. Slice 31 adds separate exact non-inheriting runtime logins for the OS and public ingress. Slice 32 adds guarded singleton-owner preparation, hosted TOTP controls, AMR-based recent step-up and provider-confirmed global sign-out. Hosted execution of these paths and all other provider acceptance remains pending.

Legal seed records remain `UNAPPROVED_PLACEHOLDER` and inactive. No production legal text, product, price, subscription, customer or credential is seeded.

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

Local evidence does not prove hosted Supabase, Storage, MFA, Resend, Stripe, OpenAI, YouTube, Meta, Trigger.dev, PostHog/Sentry, Vercel, Cloudflare, production repository scanners/sandboxing or hosted backup behavior.

## Next implementation slice

Continue Final Milestone 10 production quality without deploying:

1. after the owner creates the separate staging projects, run the guarded database, canonical-seed, restricted-runtime-role and owner plan/apply/verify sequences in [staging connection and preflight](../playbooks/staging-connection-and-preflight.md), complete hosted TOTP, then configure and evidence the exact Vercel WAF rate rule;
2. activate Brand-source acquisition only as a separately credentialed worker using the [staging playbook](../playbooks/brand-source-acquisition-staging.md) and prove real egress/TLS/failure behavior;
3. activate one controlled Resend recipient using the [transactional email playbook](../playbooks/transactional-email-staging.md), then exercise test subscription reconciliation using the [Stripe staging playbook](../playbooks/stripe-billing-staging.md) only after pricing, tax and provider decisions;
4. add human assistive-technology, field Web Vitals and broader provider-failure/load evidence;
5. repeat recovery against authorized staging with encrypted provider backups;
6. keep deployment/publication disabled until legal, public-copy, provider and owner approval.

## Security invariants

- Verify server identity, active account and selected organization before retrieval. The organization cookie is a selector only.
- Set `request.kxra.org_id` from verified membership inside each transaction. Never accept tenant/project authority from request, JWT or model fields.
- Require one authorized project for project-bound retrieval and reauthorize before bytes, model context, export, intent or provider delivery.
- Treat files, website snapshots, repository content and model output as untrusted evidence without instruction or tool authority.
- Require an exact approved legal version before private production access; placeholders cannot activate.
- Calculate entitlement, usage and money in deterministic database/domain code.
- Subscription access never authorizes custom implementation.
- Brand Studio export never authorizes publication.
- PROJECT-006 approval never authorizes upload while the adapter is disabled; creator and final reviewer must differ.
- PROJECT-007 assessment never proves safety; proposal approval never authorizes execution, merge, release or deploy.
- Every new table needs RLS/policy and every function/route needs negative access tests.

## Owner/provider connection order

The next material gate is the separately authorized staging connection. Before staging can become customer-ready, the owner will need to complete these bounded steps in order:

1. obtain solicitor-approved legal documents and release versions;
2. create a hosted Supabase staging project, configure exact Auth redirects plus TOTP enrollment/verification, and create the confirmed owner Auth user;
3. create the private Storage bucket and production scanning/extraction service identities;
4. configure Stripe products/prices/webhook endpoint after pricing decisions;
5. configure Resend and DNS only after approved sender copy and domains;
6. configure OpenAI project/data controls and explicit budgets;
7. configure YouTube OAuth for the exact Finance Unfolded account only when the disabled local intent contract is accepted;
8. configure Meta WhatsApp, Trigger.dev, PostHog, Sentry, Vercel and Cloudflare in separate staging acceptance slices.

Never paste secret values into chat or Git. Use the provider dashboards and Vercel/Supabase secret stores referenced by the relevant future playbook.

## Private business-readiness artifacts

The ignored private business pack contains the Customer Discovery Pack, tracker and Solicitor Brief alongside the business plan, decks, financial model and playbooks. They are not public-repository content. The solicitor brief is an instruction pack, not legal advice or approved customer-facing terms.
