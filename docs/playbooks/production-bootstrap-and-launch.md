# Production bootstrap and launch playbook

Status: prepared; execution is not authorized by this document.  
Production Supabase project: `lhbgeucifxxcdoyrnesf` (`KXRA Production`).  
Region and compute: `eu-west-2`, Micro.

This playbook converts the reviewed staging evidence into a controlled production launch. It never treats a provider project name, an LLM decision or possession of a credential as deployment authority.

## Current state

- Production project exists and reports healthy.
- Data API is enabled, automatic table exposure is disabled and automatic RLS is enabled.
- The project is empty: no KXRA migration ledger, application roles, owner membership, seeds, legal documents, plans or provider records have been installed.
- Staging remains separate at project `jlebgsxcvhvpueuibekd`.
- The source branch is `codex/phase-2-completion`; `main` has not been merged.
- Vercel team `husainkara-6439s-projects` is on Pro for the 5 October–5 November 2026 billing period. Production projects and Production variables are not configured.
- Production credentials, domains, Vercel Production variables, live Stripe objects and customer traffic are absent.

## Hard stops

Stop before mutation or traffic if any item is true:

1. the working tree is dirty, the reviewed commit is not pushed or the exact source commit is not recorded;
2. the database target is not exactly `lhbgeucifxxcdoyrnesf`, the region is not London or TLS identity verification is incomplete;
3. the operator uses staging variables, a Vercel runtime, transaction-pooler DDL, a service-role key or a credential supplied through chat;
4. migration history is unknown, altered or already contains an unmanaged KXRA schema;
5. any KXRA table lacks RLS and an intended policy, or any privileged function has an unintended `PUBLIC`, `anon` or `authenticated` grant;
6. the production backup and isolated restore path has not been rehearsed after initialization;
7. Vercel is not Pro, production environment variables are incomplete, an unapproved paid add-on is enabled for renewal or any fixture/local-auth setting is present;
8. public/private artifacts leak private markers, source maps, credentials or customer data;
9. Stripe is in test mode when a live checkout is expected, or live mode lacks its own restricted key, webhook, portal configuration and bounded spend/reconciliation evidence;
10. the owner has not approved the exact commit, production manifest, domain cutover and rollback target.

## Ordered execution

### 1. Freeze the release artifact

- Run the complete hermetic contract on the exact commit.
- Require GitHub CI and CodeQL at the same SHA.
- Record build, migration, canonical-seed, legal-pack and public-snapshot digests.
- Create a rollback reference before any provider mutation.

### 2. Prepare provider separation

- Retain the owner-approved $20 monthly Vercel Pro plan and keep Observability Plus disabled unless the owner separately approves its cost.
- Create or configure isolated production targets for OS, marketing and the email worker.
- Keep marketing free of private OS, database-worker, AI, billing and Storage credentials.
- Retain the owner-approved $50 spend alert. Automatic pausing remains off and may be enabled only with an accepted availability tradeoff.

### 3. Initialize the database

- Use a production-only migration operator with an exact project binding and verified Supabase CA.
- Plan first; the only acceptable initial state is zero applied KXRA migrations and no existing `kxra` schema.
- Apply the exact 82 immutable migrations under an advisory lock, one transaction and ledger row per migration.
- Verify 82 exact hashes, 174 RLS-protected KXRA tables and 148 KXRA functions before continuing.

The reviewed operator is `scripts/production-migrations.mjs`. It requires `KXRA_ENVIRONMENT=production`, the fixed project reference, an exact pushed source commit, a direct or session-pooler PostgreSQL URL using `sslmode=verify-full`, and a separate Base64 Supabase CA. It rejects Vercel execution, a dirty or unpushed branch, transaction-pooler DDL, an unmanaged schema and a non-empty initial target. `apply` additionally requires `KXRA_PRODUCTION_MIGRATION_CONFIRMATION=INITIALIZE:<project-ref>:<source-commit>`. Do not persist those values or run `apply` until the exact release receives production authority.

### 4. Install least-privilege identities

- Create distinct runtime logins for OS, public ingress, email, billing, Storage/file processing and AI only when each capability is enabled.
- Runtime roles are `NOINHERIT`/`NOBYPASSRLS`; no application receives `postgres` or a Supabase secret/service key.
- Use transaction pooling only for request-time application traffic. DDL and session-sensitive operators use direct or session-pooler port 5432.

### 5. Import approved canonical state

- Import the twelve source-backed project records and operating registers through the versioned canonical-seed profile.
- Install the exact owner-approved customer-document pack, founding plan and public snapshot hashes.
- Do not copy staging Auth users, invitations, synthetic enquiries, test subscriptions, webhook events, run logs or provider identifiers.

The guarded `scripts/production-bootstrap.mjs` operator performs this stage together with the four initially required restricted database logins and the approved legal pack. It requires the exact pushed source commit, four distinct generated role passwords and `KXRA_PRODUCTION_BOOTSTRAP_CONFIRMATION=BOOTSTRAP:<project-ref>:<source-commit>`. Its `plan` and `verify` modes never require role passwords. The role passwords must move directly into the matching production secret stores; do not save them in the repository, shell history or chat.

### 6. Bootstrap the owner

- Create or invite the production owner through Supabase Auth using the intended production email.
- Enrol MFA and verify recent AAL2 before granting the owner membership.
- Prove unauthenticated, partner, revoked, crafted-project and direct-API denial against production-like configuration before customer invitations.

### 7. Configure runtime services

- Add production-only Vercel variables from provider secret stores. Never copy Preview bypass credentials.
- Configure production Auth redirect URLs, Site URL, custom SMTP and email templates.
- Create private Storage buckets and verify object-policy, upload, scan, extraction, download and revocation boundaries.
- Keep AI, WhatsApp, YouTube, scheduled routines and generated media disabled until their provider-specific acceptance passes.

### 8. Configure commerce

- Create live Stripe product/prices only after the owner separately approves live-mode activation.
- Use production-restricted keys, a production webhook, a production portal configuration and exact KXRA statement/brand settings.
- Verify checkout, signed lifecycle events, cancellation, replay, out-of-order delivery, entitlement removal and portal return with controlled transactions before customer launch.

### 9. Rehearse recovery and rollback

- Confirm production backup retention after the schema is initialized.
- Restore into a new isolated project and verify migration hashes, row counts, RLS behavior and required object manifests.
- Record RPO, RTO, operator, reviewer and differences. Delete the temporary recovery project only after owner approval.
- Verify Vercel rollback and DNS rollback paths without contacting customers.

### 10. Cut over

- Promote only the exact tested artifacts.
- Attach the approved KXRA domains, enable HTTPS and verify security headers, indexing policy, analytics consent and support routes.
- Run owner, partner, signup/invitation, subscription, Brand Studio, custom-project, billing-management and revocation journeys.
- Open customer onboarding only after all launch checks are green and the owner approves the exact cutover.

## Required launch evidence

- exact Git commit and immutable artifact hashes;
- production migration/seed/legal/commercial manifests;
- database RLS/function/grant audit;
- production Auth/MFA and isolation results;
- Storage/file lifecycle results;
- Stripe live-mode reconciliation evidence when live billing is enabled;
- backup restore and rollback rehearsal;
- Vercel Pro plan and production environment audit;
- domain, TLS, CSP, WAF, telemetry and privacy checks;
- owner approval identifying the exact release, production targets and rollback reference.
