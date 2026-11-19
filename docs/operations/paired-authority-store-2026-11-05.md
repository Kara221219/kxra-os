# Paired authority and restore fence: local review slice

Branch `codex/paired-execution-admission`, continuing checkpoint `80a81aa58f3bb55a91dbddb3dadcd69c19f68a7d` from integrated base `d60a463941bc10430dccf359f8b189a4d6e1107e`. No other branch or checkout is changed.

## Scope and installation boundaries

`database/production/paired-admission-v1.sql` is an **unnumbered proposal**, outside hosted migration discovery. It adds empty private paired agent/device/review/authority/consumption tables in a dedicated schema. Agents, devices and authority rows default disabled. No authority issuance, credential, installer, pairing activation, production route, execution or publication port is supplied. No production migration was run.

The reader uses the real application login and authenticated transactional RLS. Its policy checks current identity/session, organisation membership/version, existing project access and explicit room membership even for an owner in a PROJECT room. It matches private agent ownership, device/session/realm/epoch, independently stored runtime/auth/source review artifacts, runtime subject and auth-binding digest, source body and original thread. The narrow definer consumption function rechecks these predicates while locking authority and revocation rows; readers cannot directly mutate authority or consumption. Verified server identity is a constructor input, never extracted from task payloads or paired tokens. The disposable harness generates synthetic identity records; its `source: supabase` principal exercises the nonfixture SQL branch and is **not** live Supabase authentication acceptance.

Only `current_task(uuid)` and `consume(uuid,uuid,uuid,text,uuid)` receive authenticated EXECUTE. Only task ID, manifest and snapshot digest receive authenticated SELECT. The new schema grant adds no `kxra_private` USAGE or unrelated helper grants. All installation DDL, revokes and narrow grants are one transaction, so no committed intermediate PUBLIC-function exposure exists. Rollback and complete pre/post effective private-function ACL comparison belong to native acceptance. No corrective numbered migration or weakened release inventory is used.

`database/production/paired-external-fence-v1.sql` belongs in a **separate restore/admin domain**, not the application database. It assumes a separately provisioned NOINHERIT, NOBYPASSRLS runtime role; this proposal creates no role, credential, active realm or operator/resume endpoint. Realms default disabled and bind org/account/device/session. The only runtime entry is a purpose-specific burn. Task IDs are globally unique across realm, epoch, fence and attempt changes. Burn history cannot be updated/deleted through SQL triggers, and the runtime has no direct table privileges. Administrative restore/truncate access remains an operational trust boundary.

`PairedAdmissionStore` is injected and default-off, with private/redacted pools and a copied immutable configuration. It reads through RLS, commits an independently durable burn, then rereads/revalidates before application consumption. Lost acknowledgements, aborts, unavailable stores and rejected authority never trigger automatic replay. A burned task can remain unconsumed in the application: that is intentional uncertainty, not proof of execution or permission to retry. Permit expiry takes the earliest lease, device, review artifact and stored review expiry.

**Application receipts cannot independently attest an external burn.** The app SQL function accepts a caller-supplied permit UUID for storage binding. An executable boundary must verify the exact external subject and permit at launch, authenticate runtime measurements, pin immutable artifacts, enforce current revocation/expiry and own containment/cleanup. This store is deliberately not a complete `PairedAdmissionPorts` implementation. Do not wire it directly to a process launcher.

## Verification and recovery

Run `node scripts/verify-paired-admission-store.mjs` from a clean committed checkout. It acquires `/tmp/kxra-native-serial.lock` before creating its own exact-source clone; it never clears a foreign lock. Its fresh `/tmp/kxra-pas-*` fixture removes only the two source-validated fixture migrations, uses the genuine 117 baseline, explicit fixture mode, loopback origin and generated secret, and starts two Unix-socket-only disposable clusters. No existing database port, browser, credential or provider is used. A full application pg_dump/pg_restore into another owned database must not replay a burn retained in the other cluster. Separate local clusters demonstrate backup separation, **not** real independent administration, durable infrastructure or launch quiescence.

Evidence is written in the fixture's `.runtime/pas/{acceptance,acl,cleanup}.json`; the outer verifier reports exact commit and clone path. Only verified owned cleanup releases its lease. If cleanup is uncertain, keep the lease and reconcile the named owned resources before any retry.

Initial recovered checks: 42/42 focused admission/runtime/stub transport/manual guard checks; repository lint; dependency policy (269 locked packages); disabled publication; marketing boundary; secret scan. The first transport run lacked sandbox process-inspection capability: 37/42 passed and cleanup was uncertain. Approved metadata inspection identified only owned descendants PID47502/47506, groups47501/47505, cwd `/private/tmp/kxra-codex-Qrg7HD/work` and `/private/tmp/kxra-codex-gh4acO/work`, started05:59:21/22 UTC. Narrow cleanup confirmed both absent. The capability-enabled retry passed42/42. This was a sandbox-only failure, not an approval denial. No real CLI was invoked, OS policy changed or foreign process terminated.

The initial lease wait is resolved. Native DB/ACL/concurrency/restore acceptance passed14/14 on exact source `8c2ca36692b0f09d071d416091c74362a52605d4`; see the completed acceptance record below. This is local synthetic storage acceptance, not hosted execution acceptance.

## Review findings addressed and remaining gates

Independent review found earlier lease-only expiry, missing database runtime/auth binding, project-membership locking and nullable CHECK/direct-SQL fence acceptance. Corrections tighten expiry, compare exact review digests, lock project/member rows and reject null/missing purpose/task/fence identifiers and null supplied consumption fences. Native regressions cover these cases. Pool exposure and mutable enable options were also corrected. Final independent source/harness/evidence review reported no new findings; it did not independently rerun the tests.

Before any production wiring: compose existing paid/terms/business/provider policy authority (this slice does not supply a paid/business admission gate), authenticated device setup and review issuance/revocation workflows, immutable contained execution, launch verification of the independent fence, atomic original-thread publication/status/reconciliation, operator restore/continuity/quiescence procedures, least-privilege external-store provisioning and infrastructure durability acceptance. Actual HTTP/UI acceptance is a later wiring gate; this slice adds no HTTP/UI surface. Existing 503/404/manual/native/installed-CLI guards remain closed.

Real installed Codex capability/version/schema and deny-all-tool/egress acceptance, commercial customer-local gateway eligibility and API-key versus subscription permission remain unresolved separate gates. Credential use/creation/storage, live pairing, installation/background service, TLS/hosted endpoints, provider calls/spend, hosted schema/configuration changes, push and deployment are not authorized here.

Primary references checked during this slice: [PostgreSQL 14 RLS](https://www.postgresql.org/docs/14/ddl-rowsecurity.html), [row locking](https://www.postgresql.org/docs/14/explicit-locking.html), [Supabase function privileges and security](https://supabase.com/docs/guides/database/functions). Definer ownership bypass is explicit; genuine reader RLS does not imply the consumption definer runs as the caller.

## Historical recovered checkpoint status

The native verifier was attempted from clean source `ea1cbd1`; it refused at `acquireNativeFixtureLease` before clone/resource creation. The recorded foreign owner is `feature-integration-full-ci`, PID42369 (`node scripts/integration-ci.mjs`), created05:45:31 UTC; metadata inspection confirmed it was alive. This is **pending resource coordination**, not an approval denial or uncertain database startup. No database/test-owned PostgreSQL process was started by this slice, no foreign lock/process was changed, and the verifier must wait for the owner to release its lease. Independent read-only review subsequently closed the direct-SQL null-fence finding; no remaining concrete source findings were reported. Review did not independently run tests.

Final local source/evidence identity is recorded in ignored `.runtime/paired-store-manifest.json`. Evidence logs are `.runtime/paired-store-unit-final.log` (42/42), `paired-store-lint.log`, `paired-store-types.log`, `paired-store-boundaries.log`, and `paired-store-native.log` (lease refusal). The 42-check JavaScript implementation/tests are unchanged by the final SQL/harness-only correction; the corrected SQL still requires native acceptance. A committed candidate and static/unit evidence do not make it installation-ready.


## Completed disposable acceptance — 5 November, 06:17 UTC onward

After the integration owner reported release, this task independently observed `/tmp/kxra-native-serial.lock` absent. The verifier then acquired/released only its own lease. First run13acb8b, `/private/tmp/kxra-pas-qxN28p`, passed rollback and ACL checks but failed seed setup because the existing room audit trigger requires an actor ID. Its receipt confirms both clusters stopped and `clean:true`; the lock was absent before correction/retry. This was a synthetic fixture defect, not a production relaxation or access-control rejection.

Correction `8c2ca36692b0f09d071d416091c74362a52605d4` binds only the generated audit identity on the fixture admin seed connection. App requests still use separate authenticated transactional RLS. Exact-source retry `/private/tmp/kxra-pas-aOvR35` passed **14/14** scenarios:

1. Atomic proposal rollback leaves no schema or ACL change.
2. ACL surface limited; no unrelated private-helper expansion.
3. Default-off adapter refuses before storage.
4. Foreign tenant/member, stale session and owner nonmembership denied through RLS.
5. Source mutation and mismatched reviewed subject/auth binding denied in SQL.
6. Missing/null purpose, task ID and task fence rejected by constraints.
7. Direct SQL rejects a null supplied fence.
8. Project membership withdrawal serializes with SQL consumption.
9. Eight concurrent attempts produce exactly one app consumption and external burn.
10. Permit expiry respects earlier device/source/runtime/auth review-row expiry.
11. Lost external commit acknowledgement remains burned without app consumption or retry.
12. Revocation/abort after independent burn prevent app consumption.
13. External HOLD/stale epoch/null purpose and foreign-tenant subject fail closed.
14. Actual pre-consumption application pg_dump/pg_restore cannot replay the independently burned task.

Native evidence: `/private/tmp/kxra-pas-aOvR35/.runtime/pas/{acceptance,acl,cleanup}.json`. The ACL manifest compares **348** existing private-function identities/effective authenticated EXECUTE and schema USAGE records before/after, all unchanged; **68** were executable in the baseline and remain so. Existing authenticated private-schema USAGE was already true; this slice does not expand it. Direct negative calls to existing `claim_live_paid_refresh(integer)` and `webhook_reconciliation_scope_attestation()` return42501. New schema authenticated EXECUTE is exactly `consume` and `current_task`; SELECT is limited to authority task ID/manifest/digest. Other new app tables, helper functions and the external ledger remain inaccessible to their runtime roles. This is authenticated effective ACL verification plus direct runtime negatives, not an exhaustive raw ACL audit of every administrative role.

Cleanup receipt records `clean:true` and `independentClustersStopped:true`; the verifier required both pg_ctl stop success, status3 and absent postmaster.pid files before releasing its own exact lease. The shared lock was independently absent afterward. No task-owned cluster/process remains uncertain. No unknown lock was removed, and no hosted/real-provider resource was touched.

Read-only independent source/evidence review confirmed the seed correction, all14 recorded scenarios, unchanged348-function ACL surface and meaningful application-restore separation. The reviewer did not start services or rerun tests. No remaining concrete source findings were reported. Execution, operational external-store independence, real identity/device/paid/business/policy composition, installed provider and HTTP/UI acceptance gates above remain open.

Final handoff commit only updates documentation after tested code8c2ca36. The ignored source manifest identifies both code-tested source and handoff source, file/log hashes and fixture receipts. No code changed after native acceptance.
