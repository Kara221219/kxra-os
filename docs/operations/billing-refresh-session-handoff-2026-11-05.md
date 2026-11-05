# Bounded billing refresh connection reuse — local handoff

Base `d60a463941bc10430dccf359f8b189a4d6e1107e`; branch `codex/billing-refresh-session-20261105`; isolated checkout `/Users/kara/Documents/Codex/2026-10-30/task/kxra-refresh-session-20261105`. This is one concrete capacity-efficiency change from the earlier handoff, not a provider-read redesign, hosted scheduler change or claim that all launch capacity gates are cleared.

## Implemented behavior

`billing-http-runtime.ts::runBillingHttpInvocation("refresh",…)` now uses `createBillingRefreshSession` for exactly that invocation. The scheduler CLI already calls this core, so it benefits without changing its cadence/configuration. Dispatch stays on the old per-transaction adapter. No connection/session survives invocation close or is shared across invocations, tenants through client-supplied authority, accounts or modes. The existing private profile/mode/TLS/runner validation occurs before the session is constructed; no environment values are enumerated or logged.

The session opens one connection lazily. Each query still BEGINs a separate transaction, installs the same local timeouts and worker role, verifies the genuine `kxra_billing_runner`→`kxra_billing_worker` identity, executes the fixed worker operation, and COMMITs before returning. Provider HTTP therefore runs outside a transaction. Transaction-local role/GUC state is reset by PostgreSQL rather than cached as authority. No scope, consent, payment observation, SQL result or entitlement is cached.

Unexpected concurrent use is refused immediately: no second socket, unbounded wait queue or mixed transaction. Role/identity/SQL/connection error permanently closes that invocation's session; no silent reconnect/retry. Idle PostgreSQL `error` events are handled without exposing their raw driver contents or crashing on an unhandled event. Expiry prevents later work. The runtime always closes in finally, including transport-construction failure; late asynchronous client creation is also closed rather than connected after expiry.

Cleanup is reserved **inside** the existing 55-second receipt envelope, normally the final 1s. Queries stop before that reserve; close cannot add a new 1s after the receipt deadline. The existing 45-second provider gate remains. Unconfirmed/failed/hung cleanup is finite and unavailable, not reported as a clean successful invocation. This is an application deadline, not a claim that timers run despite an indefinitely blocked event loop.

## What improved, and what did not

The controlled native comparison executes **twenty database transactions**, not twenty provider requests. Baseline: 20 separately connected backend sessions. Candidate: one backend session, still 20 separately committed transactions with identity checked each time. This removes 19 repeated connection setups for that workload. Real loopback PostgreSQL executed both paths. No TLS/hosted latency or user-facing SLA was measured; do not translate the count into invented milliseconds or throughput.

Actual worker-core tests in both LIVE and STAGING_SANDBOX now assert one connection for the empty refresh discovery path; the unchanged dispatch path still uses multiple. Strict paid refresh still needs 20 provider GETs on the successful path, has a 32-request ceiling and uses the existing durable 32-permit budget. Allocation/pacing/expiry logic and SQL are byte-identical to base. There is no paid-proof age increase: cap 300s, actual selected policy expiry and paid-period end remain authoritative. Zero grace, no plan changes, prices, refund/renewal/cancellation rules and existing payment repair guard are untouched.

The prior example's conservative 58s/60s projection still has 2s headroom; no planner constant was relaxed to claim a better guarantee. This change removes recurring connection setup work from that envelope. It does not manufacture a verified first-claim bound, provider allocation or spare database slots. The 20-GET ideal 300s lower bound remains 172,780 reads/workspace/30days; the example 8,000 available reads cannot support it. Current read-allocation failure continues to refuse activation. Any future reduced-read authority path still needs its own evidence/race/consent review; shadow cache is not silently promoted.

**Resource tradeoff:** up to one runner socket per active refresh invocation can now stay idle between transactions while provider work runs, bounded by the receipt envelope. Existing concurrency ceiling 16 therefore implies up to 16 retained runner sockets, in addition to app/other-worker demand. Measure direct/session-pooler slot capacity before rollout. Native backend-PID reuse is evidence for the direct local fixture; a pooler may assign physical backends differently. The old standalone refresh-query adapter is unchanged. Password rotation does not itself terminate an already authenticated connection; emergency response must use worker membership revocation or session termination. Native membership-withdrawal denial is proven; customer/session/binding authority remains checked by the existing worker RPCs.

## Exact verification and failure receipts

Final module/domain/transport/scheduler/read-budget regression log: `/tmp/kxra-refresh-session-complete-final.tap` — **139 passed, 0 failed, 0 skipped**. Includes 12 session cases plus existing HTTP, capacity, scheduler, allocation, durable-budget, paid refresh/access and portal checks. Counts from earlier subsets overlap and are not added.

Final native receipt: `/private/tmp/kxra-rs-1GZPSI/receipt.json`; log in that same directory — **8 passed, 0 failed, 0 skipped**. The receipt binds final helper/runtime/native-test/runner source hashes; all match the handoff files. Coverage:

- Actual LOGIN runner/NOLOGIN worker, twenty short transactions and baseline comparison; idle/no-open-transaction observed between queries.
- Transaction-local RLS scope does not leak to the next query or a different invocation.
- Administrative session cannot impersonate the genuine runner, even after SET ROLE.
- SQL error, unexpected overlap and hung statement/expiry fail closed with no reconnection.
- Revoking worker membership invalidates an already connected session on its next transaction.
- Terminating only the positively identified backend in this owned fixture causes no unhandled process error and no silent reconnect.

The fixture uses a fresh Unix-socket-only PostgreSQL 17 cluster, generated fixture auth material and an exclusive `/tmp/kxra-native-serial.lock`; no real credentials or provider/account is used. `owned_postgres_stopped:true`, `lease_released:true`. Earlier owned fixtures were also stopped/released; no unrelated process/IPC/service was inspected, stopped or changed. Databases/receipts remain retained, not reset/deleted. The first native attempt at `/private/tmp/kxra-rs-BvaV1F` failed a CommonJS/top-level-await test-loader boundary before cases executed; fixed by the test setup hook. Its failure remains a failure receipt. Earlier passing cohorts are historical source versions, not final 8-case evidence. A compile-time pg.connect Promise return-type mismatch was corrected without changing role authority.

Final root typecheck, scoped Prettier, publication/secret scan (1,275 files) and diff checks pass. No full-platform CI, production build, actual customer checkout, hosted TLS/session pooler, provider API or deployed scheduler acceptance is claimed. `docs/operations/evidence/billing-refresh-session-local-2026-11-05.json` records source/log hashes and unchanged authority/budget file hashes.

## Adversarial source review and integration gate

The author performed a separate failure-path/invariant review and fixed two concrete issues before final evidence: cleanup must not extend the 55s capacity model, and idle driver errors need explicit containment. Native PostgreSQL independently checks the identity/RLS/transaction/connection assertions. **No separate external reviewer's execution or approval is claimed.** The integration owner should obtain its normal independent source review before merging; this handoff does not replace it.

Review the helper and runtime composition as one diff. No migration, new role, grant, secret, price, schedule or customer policy is required. Existing source-pinned composition records may need a new reviewed exact-source manifest; do not edit their old hashes to imply prior acceptance of this source. Re-run combined canonical/native/private ACL, billing lifecycle, worker build and capacity gates on the integration commit as appropriate. Keep the previous runtime for rollback; no deployed schedule change is needed by this patch.

Before any eventual activation, verify actual DB slot allocation, account/provider reads, measured claim/receipt latency, protected delivery and bounded outage behavior. Pause new checkout if those cannot sustain admitted paid tenants, while preserving billing repair, cancellation, webhook and refresh for existing customers. No buying capacity, provider/account setting mutation, hosted worker invocation, real charge, new credentials or activation is authorised by this local work.

## Reproduction — local fixtures only

```sh
node --import tsx --test tests/billing-refresh-session.test.ts tests/billing-http.test.ts tests/billing-refresh-capacity.test.ts tests/billing-refresh-scheduler.test.ts tests/billing-read-allowance.test.ts tests/billing-scheduler-budget.test.ts tests/live-paid-refresh.test.ts tests/live-paid-access.test.ts tests/synchronous-portal.test.ts
node scripts/verify-billing-refresh-session.mjs --synthetic
```

The native wrapper uses the pinned local PostgreSQL 17 binaries, creates only its own private fixture and refuses a held shared lease rather than removing it. It creates synthetic roles/table grants inside that new fixture only; these are not production grants. No provider fetch or production settings are needed. Do not run the fixture command alongside another owned native cohort without the shared lease.
