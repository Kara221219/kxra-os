# Room maintenance, BYOK and recovery follow-on

This is a separate local follow-on to `4a21b80` and activation packet `445683b`. Existing integration-owned files were not edited. No hosted call, credential creation, provider setting, scheduler activation, migration execution or kernel setting change was performed. The deployment remains default off.

**Current acceptance status:** an earlier native checkpoint passed 8/8 (seven native SQL/HTTP scenarios plus the then-current boundary check). The latest pure boundary/CLI suite passes 4/4; the OS production build includes all three new routes and passes. The final SQL has additional audit, fairness, read-compatibility and monitoring refinements that still need a fresh native run. The original-jobs regression invocation retained a real failure in an overly restrictive read predicate and then hung in its existing failure cleanup; the predicate is fixed in this proposal, but the corrected final regression is **not yet accepted**. Per release coordination, no additional native cluster will start until a slot is assigned.

## Implemented changes

`proposals/hosted-room-maintenance.sql` applies after the reviewed base proposal. It adds four RLS-protected tables: exact room rollout approvals, customer BYOK consents, owner recovery cases and private maintenance receipts. It adds eight functions and replaces the base worker-target, discovery and dispatch function bodies. It adds no roles, credentials or triggers. All application mutations and private worker RPCs retain the exact existing `kxra_app` login boundary. A read-only predicate permits authorized authenticated RLS inspection, including the fixture administrator assuming that role, without granting an administrator mutation fallback.

Real-provider queued execution requires an unrevoked, unexpired operator-approved **room + customer tenant + exact connection** rollout, an authenticated customer connection owner's fresh-MFA consent, and the existing target grant and source/entitlement/session/membership checks. Rollout rows start empty. KXRA organisations cannot supply hosted automatic-run funding; the only fixture exception requires explicit server fixture execution mode. The customer connection stays BYOK: the existing provider code decrypts only its selected connection key and has no platform-funded key fallback. Consent is an audited customer ownership attestation; it is not cryptographic proof of an external provider account's owner.

The rollout holds a 1–20 automatic dispatch limit per rolling 24 hours in that room. Dispatch locks the rollout row and conservatively counts all room runs admitted during the current rollout/24-hour window, including failed/cancelled runs. Provider uncertainty is never silently refunded. This gate limits queued dispatch, not independently requested on-demand work. Rollout start is explicit: `starts_at<=now()` is required for consent and dispatch, and expiry is constrained to at most 30 days after that start. Preconfiguring a future window does not enable work early. A consent revocation locks/revokes the room's related execution grants before changing consent, fencing a late worker publication in the same lock order.

### Autonomous reducer and uncertainty

Every execution wakeup's SQL discovery invokes maintenance before selecting work. The independent maintenance POST can also run while execution/admissions are suspended. Both paths only resolve scope from stored grants; wakeups accept no actor, tenant, room, grant or SQL parameters.

One reducer tick selects at most five persisted grants and at most 21 jobs for each definition (root plus the existing 20-occurrence limit). It uses grant row locks, SKIP LOCKED and the existing requester advisory namespace. Known expiry/revocation/expired leases and authority withdrawal receive priority. A busy requester advances its traversal position and reports `busy_skipped`, so it cannot monopolize the first five positions.

- A queued/leased job with withdrawn authority is cancelled, with its lease cleared and a fixed reason.
- A valid expired pre-dispatch lease uses the existing retry path, capped at three attempts. The reducer makes no provider call.
- A dispatched job whose lease or authority is lost becomes **UNCERTAIN**; its run is cancelled/redacted, its attempt is marked uncertain, its lease is cleared, and a recovery case is opened. It is never reset to QUEUED.
- An uncertain scheduled child revokes the grant and pauses the definition; remaining pre-dispatch children stop. The definition cannot be reactivated around an uncertain predecessor by acknowledging a recovery case.
- Completed results are not rewritten. The reducer has no success-publication path, provider SDK, financial calculation or retry-after-dispatch capability.

Existing legacy audit triggers use the stored requester's scope during reduction; the separate authoritative `team.system_maintenance` audit uses **actor_id NULL**, `SYSTEM_REDUCER` provenance, an opaque receipt and bounded outcome counts. Newly backfilled recovery cases are audited too. A restrictive audit SELECT policy additionally prevents an organisation owner outside a private room from discovering these six room-operation actions through the general audit table. Other audit actions retain their original policy. Caller identity is never taken from a maintenance body, and transaction-local identity settings are restored before returning.

### Recovery and stop controls

The new authenticated page is `/os/room-operations/<room UUID>` and its GET/POST API is `/api/room-operations/<room UUID>`. Room and RLS checks apply before data access; private outsiders, foreign tenants and forged actor fields are rejected. A room creator can review their own approved customer connection. Recent MFA is required for consent and recovery review; revocation does not require new admission approval.

Recovery acknowledgment records **review without retry**. The job remains UNCERTAIN, no output becomes successful, no charge is refunded, and no schedule is restarted. A durable acknowledgment marker remains on the job after old closed case metadata is pruned. A requester or authorized room creator may review only a room they can currently access.

`proposals/room-maintenance-integration.patch` is retained as the original coordination artifact; its navigation, default-off flag and CLI origin repair are now applied in the composed candidate. It adds a navigation link from the existing Jobs panel, declares the default-off maintenance flag in the shared environment example, and fixes the existing hosted CLI's `URL + path` double-slash construction to `URL.origin + path`. The new maintenance CLI already uses the corrected exact-origin construction. The original fixture launcher is untouched.

### Health and retention

`/api/internal/room-jobs/maintenance` has a 30-second function budget and uses fixed private RPCs with a 5-second per-statement database timeout. POST has a 256-byte/eight-chunk/two-second body budget. GET is read-only. Both use a separately default-off maintenance capability and the existing dedicated room-worker bearer; they never need provider or database credentials at the scheduler.

Private health exposes only aggregate status and counts, with no identities, room/grant/case/job IDs, body text or provider secrets:

- `STALE`: no completed maintenance or last completion older than 180 seconds.
- `ATTENTION`: open uncertain cases, expired leases or old records still awaiting technical cleanup.
- `BACKLOG`: oldest due queued work is over 600 seconds old.
- `OK`: no preceding condition; this means operational health, not successful completion of queued drafts.

Maintenance prunes at most 100 old execution receipts, 100 old maintenance receipts and 100 acknowledged recovery cases per tick, all older than 30 days. It never deletes open uncertainty cases, jobs, runs, attempts, grants, provider outputs or existing audit history. The 30-day raw-wakeup replay horizon is finite and must be approved as an operational retention choice. Job/run idempotency and no-replay fences persist after technical receipt deletion. Acknowledged cases do not reopen after pruning because the durable job marker remains. Customer/business/audit retention beyond these technical records follows the existing policy and is not invented here.

Maintenance is bounded work, not an unlimited sweep. With one tick/minute its upper traversal rate is 300 grant inspections/hour; execution still selects at most one due grant/minute. Known expired/lost work is prioritized over healthy future definitions, and future schedules no longer consume executable selections. Source withdrawal not cheaply visible in the priority key is checked during each selected grant's full authoritative validation. The health surface makes lag visible; capacity must be sized to observed scope counts rather than described as unlimited.

## Exact proposed activation values

All of the following are **proposed values, not applied settings**:

| Item | Proposed value |
| --- | --- |
| Initial execution gate | `KXRA_HOSTED_ROOM_JOBS=false` |
| Initial independent maintenance gate | `KXRA_ROOM_MAINTENANCE_ENABLED=false` until its own acceptance/retention approval |
| Auth mode | Existing `KXRA_AUTH_MODE=supabase`; never fixture mode on a hosted deployment |
| Credential | Existing planned `KXRA_ROOM_WORKER_SECRET`, 64 hex characters; no value generated. Same approved OS server/scheduler stores only; no billing, browser, service-role or provider key reuse |
| Staging rollout registry | One customer tenant, one private room, one exact customer connection, `max_daily_dispatches=2`, `starts_at` equal to the approved UTC start, `expires_at=starts_at+1 hour` |
| Customer approval | Connection creator/room creator, fresh AAL2/MFA within 600 seconds, BYOK consent; then one one-off and one reviewed definition with `max_occurrences=1` |
| Approved trial gates | Only after native/integration and owner approval, both `KXRA_HOSTED_ROOM_JOBS=true` and `KXRA_ROOM_MAINTENANCE_ENABLED=true` on the exact protected staging deployment |
| Execution schedule | One POST wakeup every 60 seconds for that one-hour acceptance window; no automatic command retries. Its SQL also performs maintenance |
| Execution hold | Stop execution wakeups; keep only a separately approved reduction POST every 60 seconds, with execution flag false and maintenance flag true |
| Health | Authorized GET at 60-second intervals; status thresholds 180-second maintenance age and 600-second oldest due work. Use the same approved runner/secret store for health sampling, not a new secret recipient. No alert sender/recipient or monitoring integration is activated here |
| Lease/retry | Existing 45-second lease; max three pre-dispatch attempts; **zero automatic retries after dispatch** |
| Provider request | Existing 1,200 requested output tokens/dispatch; at most two approved automatic dispatches in this staging rollout. Exact customer model/account and provider-dollar ceiling still require owner approval |
| Batch/retention | Five grants/tick, at most 21 associated jobs/grant; three technical pruning batches of 100 rows each; 30-day operational replay/closed-case retention; open uncertain cases retained until reviewed |
| Production | Execution remains off until final native/QA acceptance, exact approved rollout rows, provider ownership/spend terms and genuine delivery are verified |

At the proposed cadence, the trial has up to 60 execution POSTs plus 60 read-only health GETs: **120 application requests/hour**, excluding user UI/API requests. During an execution hold, substitute 60 reduction POSTs for the execution POSTs; do not run both POST schedules together. These are hosting/database operations, not provider calls. No new scheduler or monitoring account, purchase or secret store is assumed.

The reduction CLI is `node --import tsx scripts/team-room-maintenance.ts --once`. Read-only monitoring uses `--health`. It emits only allowlisted counters/status, exits 2 for attention, exits 1 for an unavailable/rejected request and does not retry. It follows no redirects and accepts only an exact HTTPS origin. The dispatcher CLI must receive the proposed one-line URL repair before it is used. Direct POST delivery through an already approved scheduler is also possible. Vercel Cron's GET behavior remains incompatible with these POST endpoints without a separate reviewed adapter; this task does not create one.

The room allowlist and conservative dispatch count now enforce the narrow staging scope; this is no longer a production-global flag-only rollout. Rollout rows must be installed only by the approved operator through an exact reviewed target plan, not by a customer body or a worker. The customer BYOK consent must be obtained through authenticated review; an operator must not fabricate it with a direct table insert.

## Migration and integration coordination

Release owns allocation centrally. Billing currently owns **0113**. Release has reserved **0114 for the composed room base plus maintenance, in that order**, with 0113 billing and 0115 admission. Both SQL files remain proposals here; no migration was installed. Our cumulative delta is +6 protected `kxra` tables and +4 exposed `kxra` functions over the old 112-migration baseline. Recompute final inventory after billing/security changes; do not copy a historical count into the merged release.

Base SQL SHA-256: `f94f89a8280e65ac62abd53f1faa8e37e458407ac84b33e00d5607da9957d3df`.

Follow-on SQL SHA-256: `1b2c78f78fbacbdbe0de0b2a79ef0312054ea024e68155061ae86148b152fb0f`.

These hashes bind this local review packet only; any final fixes require updated hashes. The latest source requires the final native rerun before installation. Existing `team-workspace.ts`, DB transaction helper, Jobs component, Auth routes and environment example were not overwritten. The follow-on proposal contains explicit reviewed function replacements; integration must reconcile them with independent QA/security changes, never apply old function bodies blindly over a newer fix.

The original `room-maintenance-fixture-context.patch` is superseded by the stronger 4e68130 guarded fixture helpers already present. The regression runner now uses those real test files directly rather than making temporary patched copies. It must not apply either proposal twice after release promotes the composed SQL into numbered migration 0114.

## Grant-fence composition review

The follow-on target function now retains the exact strict CASE from 4e68130, with only the customer BYOK conjunct added. Missing hosted grants fail closed; the empty-grant exception requires verified fixture mode with hosted execution off. Browser manual drain remains fixture-only. Fresh MFA grant issuance retains the separate base admission predicate, without granting queued claim/dispatch/finish an empty-grant bypass.

The reducer installs stored grant context, then checks grant activity, base context and the full runtime target predicate. Rollout/consent expiry or revocation therefore invalidates pending work rather than merely blocking dispatch. Native tests now include four additional withdrawal scenarios, but are NOT accepted until QA runs them in its exclusively assigned database window.

Composition verification: nine pure boundary/source regressions pass and full typecheck passes. The full native final-source run remains pending, including the earlier 4e fixture-only delta and all 709 refinements. The historical 23-pass base result and eight-pass earlier maintenance result do not establish final combined acceptance.

## Verification commands and remaining blocker

```sh
# No database or hosted calls:
node --import tsx --test tests/operations/room-maintenance-boundary.test.ts
npm run typecheck
npm run build:os

# Fresh synthetic PostgreSQL/app only, when release assigns the local slot:
KXRA_PG_BIN=/path/to/pg/bin node scripts/verify-room-maintenance.mjs
KXRA_PG_BIN=/path/to/pg/bin node scripts/verify-room-maintenance.mjs --regression
```

Both native modes use fresh Unix-socket-only clusters and sanitized fixture environments. They stop their owned server/cluster, restore generated configuration and remove temporary test copies. The test subprocess group has a 180-second upper bound so a failed legacy test cannot retain the database slot indefinitely. No other task's database or kernel setting is altered by the harness.

Earlier native coverage already exercised two customer tenants and requesters, private withdrawal, exact rollout/BYOK consent, room dispatch budgets, pre-dispatch exhaustion, lost dispatched calls, late completion, scheduled pause, concurrent backlog reduction, retention, owner recovery HTTP, origin/impersonation rejection and no new roles/triggers. Final tests additionally check per-table retention batch caps, busy-requester traversal, old-work health, private audit isolation, exact future-start rejection and backfilled-case audit; those latest refinements remain **pending** the coordinated native slot.

Retained evidence: `/tmp/room-maintenance-5.log` (8/8 earlier checkpoint), `/tmp/room-maintenance-boundary-final.log` (current pure checks), `/tmp/room-maintenance-build-start-window.log`, `/tmp/room-maintenance-types-final.log`, and `/tmp/room-maintenance-regression-3.log` (retained failed/aborted regression; not acceptance).

The local resource blocker was macOS SysV shared-memory exhaustion. This task removed only two verified unattached segments from its own failed initializations, changed no kernel setting and stopped no other service. Its last owned PostgreSQL PID **58378** and regression PIDs **58316/58478/58480** are stopped. No fixture remains active. Release requested no new native cluster until its coordinated test window; that is the remaining verification blocker, not authorization to skip tests.

Genuine owner/adviser decisions still include actual provider-account ownership and charging responsibility, dollar limits, technical/customer/audit retention policy, scope/expiry and the exact deployment/DB/scheduler/monitor targets. Engineering mechanisms for bounded reduction, quarantine, owner review, health, cleanup, BYOK gate and rollout gate are implemented locally; these are no longer merely roadmap items. Actual protected delivery and real provider acceptance remain separate hosted evidence and are not claimed from local tests.


## Bounded transport follow-up

The maintenance route now allows 30 seconds, rather than terminating at 10 seconds while a permitted 2-second body read, 5-second pool acquisition and bounded SQL/commit/rollback are still possible. This is a hosting-duration cap change, not a longer SQL statement allowance or any retry. The finite maintenance CLI has a 35-second fetch deadline and separately consumes at most 16 KiB / 64 chunks / 2 seconds of response body, rejects missing/non-object/malformed summaries, cancels its reader and emits only the existing finite summary. Synthetic tests exercise oversize, empty-chunk flooding, stalled body, malformed data and planted response secrets. No operation was sent. Actual hosting latency, cadence, private delivery, request cost and long-tail acknowledgement behavior still need the release acceptance window.


## Numbered migration test contract

Root service discovery now includes `tests/room-operations.test.ts`, importing the two native suites and both boundary suites sequentially on the existing generated service fixture. It creates no PostgreSQL cluster. Neither native suite blindly executes proposal SQL. The shared `tests/support/room-operations-schema.ts` installer first requires the existing generated fixture guard and a credential-free private Unix socket.

With `0114_hosted_room_operations.sql` present, it requires exactly `begin;\n` + base.trim() + `\n\n` + maintenance.trim() + `\ncommit;`, allowing only outer whitespace and no additional SQL, that name in `public.kxra_local_migrations`, all six operations tables, and the latest composed routine bodies, SECURITY DEFINER and empty search path. This path only verifies; it never installs or repairs proposals. Missing/partial/drifted state is a failure. Before promotion only, an empty schema can receive both proposals atomically once under an advisory lock, with a restricted public fixture receipt. Subsequent calls verify that receipt/hash and actual routines. A pre-promotion database must not be reused after source promotion; a standalone receipt is rejected in promoted mode. The standalone regression launcher delegates to the same installer.

Dependencies: the existing generated migration ledger and fixture roles/seeds, root local loopback app, proposals retained byte-for-byte in composed 0114, and SQL installed before native assertions. Synthetic FIXTURE connection probes explicitly set execution mode while retaining hosted execution on; absent grants still fail. Explicit hosted empty-grant tests remain unchanged. Native scenarios and complete combined acceptance still await the QA serial database window. Pure schema contract, boundary, typecheck, OS build, format and secret checks pass locally; these do not substitute for native execution.
