# Independent GitHub rollback fence — local component

Based on reviewed outbox `413ac0bf1068441f88e497e749cb0a320b2483c5`, this isolated delta closes the demonstrated replay path when the **application** database is restored to a snapshot preceding claim or consumption. It does not enable production routes, provision a provider account, apply hosted SQL or establish real infrastructure durability.

## Send protocol

`GithubProductionExecutor` requires a `GithubRollbackFence` for every COMMENT. A missing port refuses before application consumption; there is no SQL-only or in-memory production fallback. Reads retain their separate authority and broker checks.

1. Verify current application identity/tenant/approval and immutable payload; perform bounded repo/issue preflight.
2. Reserve the stable `(realm, write_id)` in the independent store, and commit durably before returning its random reservation acknowledgment. A repeated reservation always refuses, even for the same attempt or a different attempt after application rollback. Payload, binding, owner/tenant, target and attempt hashes are retained.
3. Commit the application SQL consumption. That local row is bookkeeping and does not itself confer permission to send.
4. Atomically change the independent reservation from RESERVED to BURNED while checking the current realm/epoch and ACTIVE state. Only one caller receives this acknowledgment. The external SEND acknowledgment is not a provider-success receipt.
5. Recheck local authority, expiry and lease, and check the per-call monotonic deadline immediately before constructing HTTPS. Make at most one HTTP attempt. Do not retry after a lost acknowledgment at any boundary.

A lost external reservation acknowledgment strands RESERVED safely. A lost application acknowledgment also leaves the independent witness. A lost external SEND acknowledgment leaves BURNED, with no replacement permit. Cancellation or deadline expiry after a burn never restores permission. The append-only witness permanently prevents resending that stable write; an operator classification, epoch change, application restore or new attempt UUID cannot erase it.

The injectable `GithubDurableFence` commits with `synchronous_commit=on`. Its pool belongs to a separately provisioned database/service and restore administration domain. Realm identity and accepted epoch are supplied by trusted configuration outside application backups, never discovered or regenerated from restored application rows. No signing key, credential vault, provider token or application database credential is held in the external ledger. An asymmetric SQL ticket is unnecessary here because the mandatory final external one-time SEND is enforced at the transport boundary; an application SQL acknowledgment alone cannot start this executor's POST.

## Independent SQL and operator boundary

`database/production/github-external-fence-v1.sql` is unnumbered and review-only. It is **not** an application migration and must never be installed into the application database or included in its restore set. It creates four private RLS tables (realms, writes, observations, events), four empty-search-path functions and one event identity sequence. It seeds no realm or enabled activation.

The separately provisioned NOINHERIT roles are prerequisites, not automatically created by the payload. `kxra_gh_fence` can execute only runtime RESERVE/SEND; `kxra_gh_reconcile` can execute only reconciliation. Neither can read/write tables, execute private helpers or assume the other's function. Each entry point verifies its login identity. The real production workload-to-realm authorization service remains to be wired; these credentials must never be supplied to agents, customers or browsers.

HOLD increments the external epoch, creates an explicit bounded ten-minute restore session and prevents all further reservations/burns under old or new epoch until reviewed resume. Runtime workers cannot HOLD, classify or RESUME. An enabled application activation recovered from a backup cannot override external HOLD or a stale epoch.

LIST uses a bounded 100-record cursor. RESUME checks the complete pending set, including records beyond the current page. Each stable write must be classified for the exact restore session:

- ACCEPTED requires exact body hash, issue and bot identity plus a matching observed comment ID. These are trusted reconciliation-worker facts, not cryptographic GitHub proof.
- NOT_SENT is allowed only for a reservation whose external SEND was never consumed. A BURNED permission cannot be labeled NOT_SENT.
- QUARANTINED explicitly retains an unconfirmed outcome with no replay. Not finding a comment is never proof of nonexecution.

Observations are immutable and replay-idempotent only when identical. They confer no dispatch, vault or provider-read permission and never delete witnesses. Reconciliation requires independently authorized, current read authority to inspect provider effects; no provider call is made by these SQL functions. After rollback, the independent observation is the authoritative external outcome; backfilling application receipt history and projecting this status into the customer UI remain separate integration work. The local test does not fabricate a missing application consumption row to publish an old receipt.

RESUME requires explicit review and application-authority attestation hashes, the exact epoch/session, a minimum three-second settling interval, complete classification, and a current session. There is no automatic resume or automatic retry after an uncertain RESUME acknowledgment; an operator reads LIST to recover state.

**Settling is not proof of worker quiescence.** A suspended process can pause between its last check and network execution. The monotonic deadline closes delayed promise/timer continuations, but no finite sleep proves every old process or egress path has stopped. Before production RESUME, the restore coordinator must obtain a verifiable worker-drain/fenced-egress acknowledgment, invalidate stale workload/session authority, reconcile the restored application authority and supply its attestation. That production admission/drain integration is not implemented by this local SQL payload. An already BURNED permission is considered potentially in flight; its witness remains forever and its uncertain outcome is never turned into permission to send again.

## Reproduction and proof limits

Run `node scripts/verify-github-rollback-fence.mjs` from a clean committed checkout. The wrapper takes its own `/tmp/kxra-native-serial.lock` lease and creates a short, newly owned `/tmp/kxra-gho-*` checkout. Existing genuine-production119/outbox fixture acceptance runs first. The additional driver initializes a **second actual PostgreSQL cluster**, on a different Unix socket/data directory, with fsync, full-page writes and synchronous commit enabled. No host URLs, existing databases or real credentials are accepted.

The new cases cover absent/stale/missing fences, role separation, simultaneous executors, lost reserve/app-consume/SEND acknowledgments, HOLD between local consumption and external SEND, actual application pg_dump/verified-empty restores from before claim and before consumption, a fresh post-rollback attempt UUID, positive reconciliation, invalid nonexecution classification, and stale/new epoch refusal to resend the old write. An injected lost provider acknowledgment follows one committed fake effect. Both restored application snapshots lack consumption and retain enabled activation; no second fake POST is issued.

The independent ledger is then stopped while the application remains available, proving transport refuses before application consumption or POST. It is restarted and its exact catalogue, owners, ACLs, rows and sequence state are compared; its witness still refuses reservation. Both owned clusters must stop with status3 and absent PID files before the matching lease is released. Failed fixtures remain retained stopped; uncertain cleanup retains the lease rather than touching an unknown owner.

Existing transport-only fixtures use an explicitly test-owned in-memory fence as protocol fixtures. Those fixtures are not persistence evidence. The two-cluster acceptance is the rollback proof. Real DNS/TLS/provider acceptance, forced power loss, independently managed HA/storage failure and simultaneous rollback/loss of the external ledger are not proved. Restoring or recreating the external ledger from an older snapshot can destroy witnesses; production requires an independently administered, RPO-zero/quorum durable service and a fail-closed continuity/epoch attestation before resumption. A second schema in the application backup is insufficient.

## Exact production dependencies

- Review and integrate the entire delta after `413ac0b`, then review a separate external-store rollout and the full production migration/manifest. Existing canonical fixtures and hosted guard stay unchanged.
- Provision an independent durable failure/backup/admin domain, synchronous replication or equivalent RPO-zero guarantees, protected continuity/epoch configuration and independently accepted loss/failover recovery. These are deployment decisions and access requirements, not accomplished by local fixtures.
- Implement workload-bound realm authorization, transport authentication, managed pool secrets, bounded connections, restore coordinator/drain or fenced-egress acknowledgment, audit retention and owner-approved restore attestation. The local three-second check alone cannot satisfy this gate.
- Wire verified installation/account/issue/bot observations, narrow credential broker, managed custody, encrypted attempt escrow, global provider-rate coordination and production workers. Preserve current independent human approval and tenant/session fences.
- Wire application historical status/backfill and customer connect/propose/approve/reconcile UI using authoritative external observations without inventing app consumption or reauthorizing an old write. Real-provider and hosted activation acceptance remain separate explicit gates. Existing terms, prices, no-overage commitments and the full-feature launch objective are unchanged.

Final exact-head results and hashes are retained in the sibling acceptance-evidence handoff. No real provider calls, real credentials, hosted changes, account installations, deployment, charges, spending or external messages occur in this component task.
