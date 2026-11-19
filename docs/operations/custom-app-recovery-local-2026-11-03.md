# Custom-app restart and fresh-database restore acceptance

Dedicated continuation of `ba3f73b4152aa801b0a29dd9fc719acc217386ff` on `codex/custom-app-local-lifecycle`, checkout `/Users/kara/Documents/Codex/2026-11-03/task-3/custom-apps`. This closes the previously unverified **local graceful-restart and fresh-database restore** scope for the installed custom-app extension. It does not establish crash recovery, independent-cluster/role recovery, hosted recovery, or combined connector/paired-agent recovery.

## Reproduce

From a clean isolated checkout without `.env`/development environment files or hosted variables:

```sh
node --import tsx --test tests/custom-app-recovery.test.ts
npm run test:custom-app-recovery
```

The native command accepts no runtime, source, target, URL or credential arguments. It creates a fresh private `.runtime/cr-*` cluster with Unix-socket-only PostgreSQL and synthetic fixtures. It waits at most 60 seconds for `/tmp/kxra-native-serial.lock`, then acquires that same lease atomically; occupied/stale leases are never removed. A timeout starts no fixture. It records the source HEAD, exact proof-source hashes and extension-manifest hash. Native commands receive explicit environments and an owned private empty passfile, preventing ambient libpq configuration and home credential lookup. Provider calls, external publishing, account changes, deployment and spending are absent.

Both source and freshly restored database remain in the stopped owned cluster for inspection. The command does not drop databases or delete/reuse prior fixture folders, dumps or checkpoints. Startup attempts always enter verified cleanup, including partial failures. A failed/uncertain stop retains the lease and reports failure rather than claiming cleanup. SIGKILL and abrupt controller failure still require explicit owner reconciliation.

## Exact successful receipt

- Receipt: `.runtime/cr-e82522/receipt.json`, result `PASS`.
- Log: `.runtime/custom-app-recovery-run-6.log`.
- Restored target: `kxra_app_restore_08e90b01d704`, created from `template0` only after an absence check, then verified empty of user tables/functions before restore.
- Dump: `.runtime/cr-e82522/database.dump`, SHA-256 `d2c2bc1813761a217a45e6c76f69a8b09a929ba1962f4c032bd59e5e53a34279`.
- `owned_services_stopped: true`; `lease_released: true`. Target and source are retained; no target DROP was performed.
- Executed source HEAD was `ba3f73b4152aa801b0a29dd9fc719acc217386ff` plus the final recovery files. Every `proof_sources` SHA in the receipt was checked against the final files before commit. This is not mislabeled as a run after the later documentation/commit operation.

The dataset has two organizations, two apps, three immutable schema versions, four local release events, a v1 record with two revisions, a retained historical-v2 record, and a real browser save whose committed response was interrupted. The primary app has latest schema v2, active v1 after rollback, revision 5 and three publication events.

| Checkpoint | Apps | Schema versions | Releases | Records | Record revisions |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before/after actual restart | 2 | 3 | 4 | 4 | 5 |
| Backup source/restored before probes | 2 | 3 | 4 | 5 | 6 |
| Restored after controlled recovery writes | 2 | 3 | 4 | 6 | 7 |

The checkpoints differ intentionally: a rolled-back request is successfully recovered after restart, and a separate rolled-back request is recovered after restore. Exact matching is asserted **between the corresponding pre/post recovery checkpoints before these new writes**, not between unrelated phases. Complete five-table row values, metadata, immutable history and receipts are hashed inside PostgreSQL without client numeric conversion. The source checkpoint is checked unchanged again after all target probes.

Retained files include `canonical-catalog.json`, `extension-catalog.json`, `before-restart.json`, `after-restart.json`, `backup-source.json`, `restored-before-probes.json`, `restored-after-probes.json`, synthetic request plans and source/restarted/restored browser screenshots.

## What the proof actually executes

The runner installs the two pinned local proposals, seeds through authenticated HTTP and performs a real committed-response interruption in Chromium. It then stops the application and PostgreSQL, restarts the owned cluster, compares the full extension/catalog evidence, and starts a new application process. The original interrupted request is replayed three times with its immutable receipt unchanged; tenant/app denial, pinned historical rendering and immutable-write denial checks still pass. A deliberately rolled-back request is absent, then succeeds once and is idempotent on repeat.

After quiescing the source application, `pg_dump` creates the snapshot and the source is rechecked. `pg_restore --single-transaction --exit-on-error` restores only the fresh empty owned database, **preserving object owners**. Exact catalog/data evidence must match before any target probe. A new application process reads the restored target; HTTP and Chromium repeat the tenant, schema/publication, receipt/idempotency and rendered-record checks. The known committed request does not add a record/revision; a separately rolled-back request can be recovered once. Preview remains separate and is covered again by the existing custom-app aggregate.

## Strict manifest and review

`packages/custom-apps/local-extension-manifest.json` pins the two proposal-file hashes and exactly five tables/seven functions. A fresh canonical baseline must have 117 migrations, 214 `kxra` tables and 207 exposed `kxra` functions. The captured catalog tracks table structures, policies, constraints, indexes, triggers, owner and ACL grants; function definitions/owners/ACLs; other user relations and routines, including views/materialized views, sequences, foreign/composite relations and aggregates. The installed catalog is then frozen for all subsequent snapshots. Native transactional negative probes introduce unknown objects, direct app-role grants, owner changes, altered constraints/policies/function bodies; every change is rejected and rolled back.

No canonical recovery, migration-discovery or unknown-table/function test was weakened or changed. The original application code and both proposal SQL files are unchanged from `ba3f73b`.

Independent review findings fixed and retested: ambient libpq environment inheritance; cleanup skipping partial startup; incomplete catalog owner/ACL/object coverage. Diagnostic failures also caught signature formatting, the room API's 201 status, PostgreSQL's equivalent nested/flat AND deparsing, and an ACL type-code mistake. Constraint/default/index/policy comparison uses PostgreSQL's precedence-preserving pretty deparsers. ACL comparison expands defaults into exact grants; sequence ACL defaults require lowercase `s`, distinct from relation kind `S` and the foreign-server ACL code. See [PostgreSQL ACL function documentation](https://www.postgresql.org/docs/14/functions-info.html). Owners, grantor, grantee, privilege and grantability remain checked; actual grants or logical definition changes still fail. The earlier failed receipts/logs and read-only diagnostic outputs are retained; they are not counted as successful recoveries. Final independent review reported no concrete remaining high/medium findings.

Final guards: **11/11 unit cases passed**. Final existing custom-app aggregate: **16/16 passed**, including SQL/HTTP/browser cases, with 117 migrations/219 protected tables. Root lint/typecheck, dependency policy, publication snapshot, marketing boundary and secret scan pass. The unchanged product build remains within budget: 19 page graphs, largest 203,258/204,800 bytes. These are separate receipts and overlapping counts must not be summed. The historical canonical 1,246-test result is retained and was not presented or rerun as custom-record recovery evidence; no prior canonical fixture was removed.

## Portable integration handoff and remaining scope

Carry the command, `scripts/custom-app-recovery.mjs`, `scripts/custom-app-recovery-evidence.mjs`, the manifest and guard tests into the isolated integration checkout. Paths derive from the checkout; choose a short checkout path for Unix-socket limits. Install the two manifest-pinned custom-app proposals in order. Keep them outside canonical release migration discovery until the release owner allocates reviewed migrations. The source/target probe requires only the repository's synthetic auth/project fixtures and existing local installer.

For combined recovery, capture the canonical baseline **before any lane's proposals**, verify each lane's pinned sources, and build an explicit reviewed union catalog manifest with the correct per-lane permission profile. Reuse `recoveryCatalog` and the five-table `customAppRecoveryEvidence`; keep the dedicated custom-app manifest for those five data tables. The dedicated guard's permission profile is specific to custom-app forms and is not a generic allowlist for connector secret ledgers or paired-agent workers. Do not silently admit another lane as “baseline”, change 214/207 to observed counts, or filter unknown names by prefix. Combined fixture/orchestration acceptance remains the integration lane's responsibility.

The proof restores a new database within the same owned cluster, where login roles already exist. Independent-cluster role/global-object provisioning, role credentials, crash/WAL recovery, concurrent-writer production RPO/RTO, encrypted/remote backups, production-scale data, hosted Auth/provider delivery and platform-level disaster recovery remain unverified. This is a synthetic local data-recovery receipt, not a hosted launch or full Kylon-parity claim.
