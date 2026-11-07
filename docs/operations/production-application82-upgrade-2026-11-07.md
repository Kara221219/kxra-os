# Reviewed application82→126 upgrade path

This separate implementation starts from the production ledger's actual82-migration cohort and rehearses every remaining migration83–126. It does not initialize a database, lower the old operator's cutoff, relabel fixture history or change the reviewed117 operator, fa49 application operator, SQL payloads, historical manifests or original117–126 profiles.

Production read-only evidence identified82 exact matching names/hashes and historical source provenance, an RLS-enabled ledger owned by postgres, and residual service_role TRUNCATE/TRIGGER/REFERENCES/MAINTAIN grants. The source82 application catalog components were independently reconciled, but that observation is neither continuing authorization nor a future state assumption. Every invocation reads the target again.

## Interface and exact state binding

Use `node scripts/production-application-upgrade.mjs plan|apply|verify`. Existing target environment requirements remain: production environment, exact clean source commit, fixed direct project host/database/postgres identity, fully verified TLS and required CA. A present mismatched project marker is rejected; no marker is invented or set.

Plan is read-only and reports exact pending names/hashes, source and catalog hashes, finite ledger metadata, blockers and `applyEligible`. Historical ledger rows include their unchanged source_commit and canonical UTC applied_at text with all six fractional digits. Finite AD timestamps in years1–9999 are required; BC, infinity and unsupported ranges are rejected rather than collapsing eras. No JavaScript Date conversion is used for ledger binding.

The entire ledger metadata snapshot is bound into the plan: owner, RLS/FORCE, relation kind/persistence/options/replica identity, columns/order/types/defaults/collations/identity/generated state, complete constraints, primary index and readiness, policies, triggers, rules, ACLs, column grants and dropped-column count. Only its hash and finite nonsensitive summaries are returned. The exact known four-column structure and checks are required. RLS must remain enabled and FORCE must remain false; no policy, trigger, rule, extra column/index, non-owner grant or column grant is accepted. Historical ledger entries and this metadata must stay unchanged across every migration.

Apply requires `KXRA_PRODUCTION_APPLICATION_UPGRADE_PLAN_SHA256` and `KXRA_PRODUCTION_APPLICATION_UPGRADE_CONFIRMATION=UPGRADE82_126:lhbgeucifxxcdoyrnesf:EXACT_SOURCE_COMMIT:EXACT_PLAN_SHA256`. These bind the reviewed plan, not just a target row count. Existing initialization/application confirmations are not substitutes.

The existing advisory lock is shared with earlier operators. Each of the44 transactions rechecks the exact plan, locks the ledger/Auth sessions, executes the original validated in-memory SQL, appends its exact name/hash/current source commit, verifies the resulting source-derived prefix catalog, and confirms the entire preexisting ledger and metadata are unchanged. DDL/data/ACL/ledger failure rolls back that migration. Already committed prefixes are retained and are not replayed.

Lost or uncertain COMMIT acknowledgement stops immediately. Reconnect and run plan to determine whether that transaction committed. Its new plan, with authoritative names/hashes/provenance/timestamps, is required before proceeding. A126 target with the current exact plan is a verified no-op. Verify requires126 with no blockers and a matching profile.

## Existing service_role ledger grants are still a blocker

Read-only plan returns `LEDGER_NON_OWNER_PRIVILEGES_FORBIDDEN`, the exact grants and `applyEligible=false`. Apply refuses before any migration SQL. It does not revoke privileges, disable RLS, add policies or rewrite history. RLS does not prevent TRUNCATE, and TRIGGER/REFERENCES/MAINTAIN are not assumed harmless.

A separately authorized remediation review would need to assess whether any legitimate provider/operator workflow uses those four explicit grants, review relevant defaults/event triggers, and define a narrowly scoped removal of only those grants while preserving ledger RLS, owner, columns, constraints, policies and all rows. Such remediation is not implemented or executed here. After any authorized change, obtain a fresh plan; never reuse the blocked plan as approval. No hosted mutation or new permission is implied by this document.

## Catalogs, roles and provider limits

Separate source-derived PostgreSQL14 and17 profiles cover every prefix82–126. The source SQL is unchanged and the117–126 suffix fingerprints must exactly match the earlier profiles. Actual Auth/session interfaces and privilege checks are reused. The current V2 runtime/bootstrap helper expects114 room-delivery grants and is not a shortcut for an82 target. This path neither calls runtime provisioning nor claims the prefix82 role-attribute subset proves full V2 readiness. Extra runtime role observations remain target-state evidence, not source-catalog approval.

Provider-owned Auth definitions, real GoTrue insertion/refresh and token-hook configuration remain separate acceptance gates. The operator installs only already reviewed SQL when its prerequisites are met; it does not activate hooks, features, billing, external fence databases or providers. Catalog equality does not prove deployed binary/configuration, every provider revocation policy, customer usability, backup recovery or a zero-overage guarantee.

## Local proof and retained evidence

`node scripts/verify-production-application-upgrade-native.mjs --derive-source-profile` writes candidate source profiles only inside an owned temporary runtime. The normal invocation independently reproduces committed profiles, then runs real PostgreSQL rollback and committed-but-unacknowledged tests for all44 migrations, with replan/no-replay checks for every prefix. It also covers an uncertain uncommitted outcome, normal uninterrupted82→126 apply, verify/no-op, unchanged old provenance and microsecond timestamps, mid-transaction timestamp/provenance/RLS tampering, metadata/grant blockers, fixture-name collision rejection, source schema drift, no session backfill and no operator role provisioning. Synthetic historical timestamps are test data, not copied production rows.

Residual service_role grants are created and removed only by local fixture setup to prove both the blocked observed state and a separately prepared owner-only test state. The operator itself performs neither action; the blocked fixture snapshot must remain unchanged after its refused apply. The fixture also demonstrates TRUNCATE's RLS bypass inside an owned transaction that is rolled back.

Both engine runs require clean committed source and the standard serial native lease. Owned process/PID cleanup must be verified before lease release. No hosted queries, credentials, deployments, payment or remote push are part of these proofs. Final tested commit and runtime receipts are supplied in the task handoff; combined application acceptance at a later integration commit remains separate evidence.
