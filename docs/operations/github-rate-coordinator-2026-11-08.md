# GitHub shared installation rate coordination

## Scope and current state

This additive local slice starts from accepted observer source `dc66323542a445be15b4a98c28ad3224a0e165b3`. It implements a durable PostgreSQL rate store, a concrete adapter and a default-off wrapper around the existing installation-token executor. Existing transport/contracts, SQL migrations, historical release manifests, routes and activation remain unchanged. No hosted database, provider API, real credential, permission, payment or deployment was used.

The SQL file `database/production/github-rate-coordinator-v1.sql` is review-only and unpromoted. It is for a separately operated durable database outside application backup/restore administration. It requires a separately provisioned restricted `kxra_gh_rate` role; this code neither provisions real access nor discovers a database. The payload seeds no realm, enabled target, activation or credential. Its tables are private with RLS enabled and only the checked runtime function is granted.

## Admission and durable state

All cooperating installation-token workers must use the same trusted server-pinned realm and epoch. A realm serializes every admitted target, which is deliberately more conservative than separate App or installation buckets. Its server-owned target allowlist binds App, installation and account IDs. Each exact reservation includes a fresh UUID, those IDs, binding and operation digests, and READ or COMMENT kind; there are no user IDs, tokens or provider response bodies in rate history.

The store locks the realm before checking its clock, target and budget. It admits at most one outstanding reservation. Runtime calls cannot refund, delete, reset, prune or automatically expire it. Duplicate reservation UUIDs never return a second permit. Unknown reservation acknowledgement strands the reservation safely rather than allowing another attempt.

Default local policy is at least one second between completed requests, at most 60 requests in a rolling minute and 3,000 per hour, and at most one comment per minute and 30 per hour. Configuration can only tighten these bounds. Completed reservations remain in each rolling window until the later of reservation and completion time ages out. This prevents delayed preflight or settlement from moving the real request outside its counted budget. Count scans are bounded to the last hour, while a separate indexed latest-time lookup preserves longer spacing policies and future-clock denial. There is no calendar-bucket reset or refund for a rejected/preflight-failed call.

A completion records both the normalized rate controls and CONFIRMED/UNCONFIRMED settlement. Exact duplicate completion is idempotent; contradictory evidence is rejected. Uncertain provider outcomes force durable HOLD. Valid rate timestamps impose at least a minute of cooldown and can only extend the existing deadline; for stop signals, missing, invalid or stale controls force HOLD. Completion during HOLD never reactivates the realm. There is no automatic retry, sleep, operator resume or reconciliation API in this slice.

These conservative limits are local policy, **not a guarantee against GitHub's secondary limits**. Other programs using the same provider identity or IP are outside this store. Capacity, workload identity, all-path routing and shared ownership must be established before activation.

## Adapter and executor wrapper

`GithubPostgresRateCoordinator` uses an explicitly injected pool, parameterized SQL, bounded statement/lock timeouts and synchronous commit. The pool itself must enforce connection/query bounds. Unknown commit acknowledgements and malformed/mismatched acknowledgements are generic failures; no automatic SQL retry occurs. Ordinary inspection and errors do not expose configuration.

`GithubRateLimitedExecutor` is independently gated by `KXRA_GITHUB_SHARED_RATE_ENABLED`. The original provider transport gate also remains in force. The wrapper reserves before authority, custody, DNS or provider access, invokes the unchanged reviewed executor, then records settlement through a separate bounded coordination call. It keeps the external rollback/send fence and durable attempt consumption requirements intact.

Execution evidence and coordination status are separate. A successful or rejected comment is not relabeled unexecuted when its rate receipt fails. Exact ACCEPTED, REJECTED and UNCERTAIN evidence is retained. `executor_invoked` distinguishes no invocation from an invocation that produced no usable result. Unknown completion halts the wrapper; contradictory no-HOLD acknowledgement for an uncertain outcome is rejected.

Private reads receive one more authority check after rate persistence, together with the original resolved lease expiry, binding/window expiry, cancellation and both gates. No credential is refreshed. A late aborted broker result cannot overwrite a newer lease's expiry. Failed checks withhold private data. Write acknowledgements remain historical evidence after authority withdrawal rather than being falsely erased.

## Coverage limits

The existing observer remains unwired to this gate. Its three App-JWT reads and public bot lookup need their proper quota classes; its installation-token repository read must eventually share this installation quota. The public bot lookup also has an IP-scoped unauthenticated quota. This implementation does not claim to coordinate those calls or unmanaged GitHub traffic.

Rate admission is not consent, execution authority, token provenance, custody or proof of provider permission. Managed signer/custody/workload identity, exact-purpose leases, encrypted attempt escrow, customer consent/routes and live provider verification remain required. The runtime role is trusted to report settlement truthfully; SQL cannot independently observe remote completion.

The store cannot detect its own rollback. Restoring an older ACTIVE backup can erase an in-database HOLD. Recovery therefore requires fencing/stopping workers outside this database and advancing their externally pinned epoch before restoring. Restore into a held environment, retain the new external epoch, reconcile lost history, and only then consider separately approved activation. No stale backup, automatic lease expiry or same-epoch restart may be treated as permission to resume. The existing independent external-effect fence is still required for comments.

History is intentionally retained with no runtime pruning. Production retention/storage planning and a reviewed operator recovery process remain open. Uncertain calls can hold a whole realm until reviewed; this safety-first availability tradeoff is intentional.

## Verification

Pure regression suite: `node --import tsx --test tests/github-rate-coordinator.test.ts`. The current suite covers exact admission order, default gates, concurrency, forged acknowledgements, deadlines/late completion, known and uncertain outcomes, exact receipt preservation, stale private reads, lease expiry, parameterized SQL, commit-acknowledgement loss and error redaction.

Native proof: `node scripts/verify-github-rate-coordinator.mjs`. It requires clean committed source, clones the exact head, acquires the existing owned native-fixture lease and starts only a disposable Unix-socket PostgreSQL instance with synthetic identities. It verifies the real adapter/wrapper, role/ACL boundaries, malformed inputs, quota/spacing/concurrency, cooldown and HOLD, duplicate/contradictory receipts, restart, rollback and restore-fencing behavior. Source, phase and cleanup evidence must be checked before calling this passed; no provider call is made by the fake transport.

Full application fixture CI and release composition are separate integration gates. Do not run raw `npm test` without its generated fixture and call the result full acceptance. This additive payload is not in the hosted migration catalogue and must not be applied through an existing release operator.

## Official references

[GitHub REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) distinguish installation-token and unauthenticated IP budgets and describe additional secondary limits. [GitHub REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api) recommend serial requests, spacing writes and respecting rate-control responses. This connector remains narrower than the general API guidance: it does not follow redirects or retry provider writes.
