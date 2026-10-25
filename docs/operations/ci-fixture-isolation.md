# CI fixture isolation and optional capture

Remote source 100b9db passed lint, 890 service checks and migration/RLS checks
(112 migrations, 208 protected tables), then failed four private browser cases:
94 passed, four failed, six skipped. Production build, recovery, performance and
audit stages were not reached. CodeQL passed without new findings; 21 older
findings remained open and alerts 29–38 remained fixed. Nothing was dismissed.

Two remodeling cases failed in diagnostic setup before their original test
bodies. The bounded health rejection did not prove the transport cause, although
the roughly 1.39-second failure is consistent with its 1.2-second deadline.
Capture initialization and persistence rejection now disable only capture,
with a fixed warning; they cannot replace a substantive test result. Privacy and
context guards, the health deadline, response budgets and assertions remain.
The original remote proposal/refresh failure causes are still unproven.

The knowledge-fixture upload conflicts match deterministic cross-suite quota
accumulation. Services create 28 partner upload intents; both healthy browser
projects need 26. The application permits 50 per user per hour. In that failed
run the two aborted remodeling fixtures reduced usage to exactly 50 before the
mobile launch and memory fixtures failed. UUID filenames/rooms do not partition
the actor's quota. No quota, counter, timestamp, retry or permission is changed.
The new transactional regression uses fresh synthetic actors and verifies the
50/51 boundary, exact retry at capacity, changed-payload rejection and independent
actor capacity, then rolls back all regression data.

Full CI first completes an isolated service subprocess in `.runtime/ci-services`,
including all service tests, original AT-08/10 restart proof and empty-target
restore. That runtime and its evidence remain. Only after it exits does CI create
the separate browser runtime `.runtime/ci`, with new PostgreSQL, session key,
origins, run identity, processes, readiness and diagnostics attestation. Focused
workspace mode is unchanged. No service-created data are silently imported.

Two browser setup dependencies are explicit now. The dashboard creates a unique
idea through the normal UI, checks the matching POST succeeds with 201, then
retains its original visibility assertions. The pagination journey creates its
own guarded room, authenticated schedule/job setup and terminal historical
metadata instead of selecting a room left by service tests. Its original 102
job/schedule and load-earlier assertions remain. Two extra partner uploads bring
the fresh browser phase to 28, below the same limit of 50. No worker/provider or
consequential external action runs to prepare this historical fixture.

Browser restart compares selected noncredential idea, case record/action,
upload, chunk and processing-job digests, requiring nonempty browser data and
executed case proposals. Object existence, size and SHA are verified before and
after restart using descriptor reads and final-component no-follow checks.
Missing/corrupt objects, leaf symlinks, hardlinks and traversal have negative
tests; this is not universal protection against intermediate directory symlinks
or malicious same-user filesystem mutation. Browser restore compares those DB
digests in source and empty target as well as the original complete table-count,
migration/RLS/policy and copied-object manifests. Service recovery remains
independent. These are two local synthetic proofs, not equivalence to the former
combined dataset, private staging copy or managed Auth/Storage/provider recovery.

Recovery guards check fixture/loopback context, runtime Unix socket and run UUID
before connecting. Local source identity derives from HEAD; present GitHub
metadata additionally must match HEAD and valid run/attempt fields. Ordinary
local full CI remains supported. Safe export still requires its stricter
source/run-bound attestation and validation; no fallback to raw artifacts exists.
A service-phase failure precedes browser attestation and can yield no JSON.

The 60-minute workflow limit and original browser limits/assertions are unchanged.
The full 104-case browser suite has six existing project exclusions:

- Desktop skips the mobile-only account interruption/resume journey.
- Mobile skips the desktop account lifecycle journey.
- Mobile skips the single responsive matrix (which itself covers four widths).
- Mobile skips the single authoritative business-sprint preparation journey.
- Mobile skips the single authoritative customer-support lifecycle journey.
- Mobile skips the single authoritative tenant-selection/legal-gate journey.

Preliminary isolated service validation passed 898 checks, restart and restore;
the first full browser run exposed the two setup dependencies (95 passed, three
failed, six skipped). Both corrected setup journeys then passed all four
desktop/mobile cases. These are retained preliminary results, not final-source
aggregate or remote acceptance. Final source-keyed receipts must establish full
services, all 104 browser cases, both recovery scopes, builds, security,
production-marketing and performance/audit stages before any remote pass claim.
No further public publication, hosted migration, deployment or checkout change
is authorized by these local repairs.
