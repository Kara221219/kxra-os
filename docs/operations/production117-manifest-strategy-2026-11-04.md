# Resolve the fixture0118 blocker with a separate production117 candidate

Base: accepted `5bc7e2fbe838375d4a986de27ae4d3075d9b15a8`. This strategy adds no production SQL, weakens no guard and executes no hosted operation. The main integration history and its119-migration fixture cohort remain intact. Source validation is not deployment or migration approval.

## Dependency determination

The first117 hash-pinned migrations do not reference paired fixture relations/functions. Their production functionality includes signup/onboarding, business checkout admission, billing/paid proof, the existing customer API-key model path, rooms and on-demand runs, and default-off hosted room operations. None requires0118 or0119.

| Fixture dependency | Effect when omitted from the production cohort |
| --- | --- |
| 0118's paired agents/tasks, private invitation/session ledgers, resolver schema and control/device functions | Only the local paired feature loses its database backing. `pairedControl` and `pairedDevice` call `fixturePairingOnly` before any RPC/pool access; production declines503. A direct internal resolver helper is not a general customer login. |
| 0119's paired task-status function and boundary assertion | Depends on corrected0118; omit both together. It is not a production security patch to earlier117 functionality. Never keep0119 alone or promote the old unsafe checkpoint. |
| Local paired→connector/app orchestration proposal | Depends on both paired migrations and other unnumbered fixture proposals; remains excluded and production-denied. |
| GitHub mock/outbox/vault/custody and schema app proposals | Separate fixture-only slices, not dependencies of the ordinary BYOK room journey. Their local checks continue in the integration lane; no unnumbered proposal is added to this production candidate. |
| Paired UI | `RoomPairedAgents` is gated by `local` and current room authority; the production local-mode implementation is always false. The shared API still rejects forged paired requests before touching the absent paired schema. |

Source tests inspect the actual first117 SQL and execute transformed actual paired entry functions with forbidden database/pool seams in production mode. Production builds and HTTP-denial checks on the separate candidate add artifact/runtime evidence. This does not establish hosted auth/provider/payment acceptance or make real paired CLI support available.

## Explicit source strategy; no silent filtering

`npm run release:prepare-review` requires a clean committed119 integration source matching **all117 approved-baseline name/hash entries plus exactly the two pinned fixture hashes**. It reserves a new owned directory atomically in this workspace, clones locally with no hardlinks, creates a separate review branch, verifies then removes only0118/0119, and commits those exclusions plus `.release/source-strategy.json`/README. Existing destinations are never overwritten. Failure may leave an owned partial review directory for inspection; it never resets or edits the integration/frozen/source worktrees.

The original fixture files remain recoverable at the manifest's source commit and in the untouched integration checkout. Candidate metadata lists exact excluded bytes/hashes, source SHA, policy hash, resulting117/214/207 profile and explicit authorization:false. The candidate SHA is recorded in the preparation receipt after commit. Applications, guard/policy, all other packages/scripts and dependencies must have an empty diff from the source parent. No role, target, TLS, branch, pushed-head, confirmation, ledger or unknown-object guard is relaxed.

`release:check` still BLOCKS the integrated119 tree. The separate117 candidate passes only SOURCE_ELIGIBLE_FOR_REVIEW. Its branch is deliberately a review branch, not the operator's required production phase branch. No target was inspected. This resolves the accidental fixture inclusion in the source plan; it does not authorize deployment or repair an initialized production database.

The broad local suite expects119 and should run on the pinned integration source, or an independently owned fixture clone restoring only the recorded fixture hashes. Do not put those files back into the production candidate to make its default fixture tests pass. The release CI must identify its117 production validation and119 fixture regression cohorts explicitly before promotion. Existing accepted fixture evidence remains distinct from candidate builds and future upgrade acceptance.

## Read-only target-plan states

`reviewHostedUpgrade(candidateRoot,{managed,applied})` accepts sanitized ledger rows containing only name,sha256,source_commit. It invokes the unchanged hosted source guard first, requires a unique exact ordered contiguous prefix and historical40-hex source provenance, and reuses strict unknown/hash/unmanaged checks. Its output always has authorization:false and apply_implemented:false.

| Observed target state | Prepared disposition |
| --- | --- |
| No KXRA schema and empty ledger | INITIALIZATION_REVIEW_REQUIRED. Existing target/backup/Auth/role/seed checks and approvals still apply. No reset or bootstrap is inferred. |
| Exact matching prefix through113 or116 | UPGRADE_REVIEW_REQUIRED with only the remaining reviewed files. The current production operator is initialization-only and must not be used as an incremental upgrader. A separately reviewed target-bound upgrade executor/plan is required. |
| Exact matching117 | No pending schema migration; still UP_TO_DATE_REVIEW_REQUIRED for actual inventory/ACL/roles/configuration and application compatibility. Source exclusion alone requires no database change. |
| Applied118/119, unknown file, changed hash, missing/gapped/reordered/duplicate entry or managed-but-untracked KXRA schema | Refuse. Do not remove ledger entries, drop fixture schemas/data, replay assumed history, or lower inventory counts. Quarantine for exact read-only reconciliation and a separately approved remediation/restore plan. |

No ledger in this task is presented as a freshly inspected hosted ledger. Unknown current production state remains a release dependency.

## Failure and rollback implications

For a future incremental plan, preserve transaction-per-file DDL **and ledger** atomicity. A failure before commit must leave the prior exact prefix and prior schema/data; a committed migration followed by lost acknowledgement must be omitted from the next plan, not rerun. Stop on the first error and re-read authoritative ledger/hash state. Do not use a success URL, local cache or assumed row count as migration evidence.

There is no automatic down migration. Candidate source rollback is a code/artifact choice, subject to compatibility with the actual retained schema. A schema/data rollback needs an explicitly approved backup/restore target and retention plan; never restore into an existing target or delete financial/authority evidence to recreate a green state. Excluding source0118/0119 does not undo them if they were previously applied elsewhere.

A local native rehearsal is prepared behind explicit `verify-hosted-release-native.mjs --upgrade-rehearsal`: fresh owned template0 target, prefix113, synthetic sentinel, failure after each114–117 DDL+ledger write inside its transaction, exact rollback fingerprint/ledger/data checks, resume excluding committed files, and equality with independently fresh117 application schema. Schema dumps use one fixed synthetic restrict key without removing ACL/definition content. The normal marker harness remains unchanged by default. **It has not been executed under this task's “without applying anything” constraint; clarification is pending.** Planner/source tests do not substitute for this transactional database acceptance.

## Remaining decisions and receipts

1. Confirm the intended production offer excludes real paired CLI/device execution until its real identity/tool-isolation/authentication and production migration design pass separate review. If paired execution is required now, this117 strategy is not the complete offer; do not relabel fixture0118 as production.
2. Supply the exact sanitized target ledger/hashes/schema/ACL/roles and current release rollback/backup receipt through authorized read-only access. No assumption is made that production is empty or at117.
3. Clarify whether newly owned disposable local migration rehearsals are allowed despite “without applying anything”; until then none run. Hosted migration application is excluded in all cases here.
4. Approve a separately reviewed incremental production operator only if the actual target needs one; preserve its bounded failure/resume and no-destructive-rollback contract. Current initialization-only behavior is unchanged.
5. Reconcile117 production CI and119 fixture regression cohorts, then review exact candidate artifacts, terms, actual AI eligibility/provider/payment/worker setup and target actions. No broad launch acceptance follows from resolving0118 alone.

Commit-specific preparation/build/tests/review and remaining limitations are retained in the enclosing workspace's `acceptance-evidence/production117-strategy-acceptance.json`.
