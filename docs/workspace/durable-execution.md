# Local durable draft jobs

19 October 2026. Implemented and verified locally. Full `jobs-final-ci.log` exited 0: 276 service/security tests, 58 private journeys with six intentional skips, 42 public journeys in each mode and all build/recovery/security gates. Migration 0087 is applied additively to the preserved fixture preview with all 186 original tables / 1,397 rows unchanged. Hosted execution is **not activated**. See [verification](verification.md) for exact evidence.

## Actual scope

The Jobs tab queues a fixture draft for one room agent and message, immediately or after a one-off due instant at most seven days ahead. It snapshots the exact message IDs, selected file chunks/hashes, reviewed instruction versions/hashes, opted-in memory IDs/hashes and system/context digest. Later approved context is not silently added. Current account/session, tenant/project/explicit private-room access, agent/connection and source authority are checked at enqueue, claim, immediate dispatch and publication. Existing synchronous Ask remains available through the same extracted context preparation/execution helpers.

PostgreSQL owns queue/attempt state. There are at most 20 active jobs per requester and three pre-dispatch attempts per job; actual dispatch retains the existing 20-run rolling daily limit. Leases are bounded to 5–60 seconds (normal drain: 45 seconds). An account lock and locked row claim prevent concurrent leases; claim UUIDs persist in immutable attempt identities so replayed drain requests cannot execute different work. A server-generated fencing token stays inside trusted application calls. It is not a new credential or OS authority.

Pre-dispatch transient/capacity failures requeue with bounded 2/4-second backoff before the next eligible attempt. Explicit releases have `RELEASED` attempt state, distinct from actual `EXPIRED` leases. An expired pre-dispatch lease can recover. A lost/expired worker after the dispatch boundary becomes `UNCERTAIN`, with output withheld and no automatic replay. Known completed/failed/cancelled results and job/attempt states are committed atomically with the authoritative run. Cancellation is version checked and invalidates queued, leased or dispatched work; late fenced results cannot publish.

Jobs expose room metadata and a currently authorised run link, never prompt bodies, encrypted model keys, hidden source IDs, reserved run IDs or fencing tokens. Output stays in the original `team_runs` record under the existing provenance RLS; global history uses the same record. The job catalog shows at most 100 entries and up to three attempts each. There is no separate broad payload archive.

## Application worker boundary

`scripts/team-job-worker.ts --once|--watch --identity owner|partner` requires the complete guarded fixture environment, a loopback origin, no hosted auth/database/Vercel configuration, and the generated local session secret. It waits for the expected application health identity, signs in through the normal fixture endpoint and uses the standard authenticated HTTP drain endpoint. Its cookie remains only in process memory. Optional `--organisation <uuid>` uses the existing server-verified tenant selection API; it cannot grant membership. Authentication/access denial stops the worker; transient polling failures are bounded.

`npm run dev -- --jobs partner` explicitly starts that ephemeral worker under the existing dev launcher and stops it with the parent process. The default dev command does not start an agent worker. No OS service, launch agent, cron entry, worker account, persistent token, new credential or external scheduler is installed. A separate guarded existing-store preview launcher is used for the preserved review store so its fixture/profile data is not reseeded.

Due jobs execute only while a valid requester worker drains them or the requester uses **Run next due draft**. Recovery/reconciliation also runs on those drain requests. Jobs belonging to an identity that can no longer authenticate do not run; the current room creator can cancel their stale work. This is not an unattended hosted reaper or an exact wall-clock delivery guarantee. Recurring schedules, DST policies, webhooks, general tools/actions and hosted/billed-provider execution remain separate work. Both the HTTP adapter and SQL admission enforce fixture-only execution in this slice.

## Source and verification

- Migration: `supabase/migrations/0087_team_durable_draft_jobs.sql`; expected inventory 87 migrations, 188 protected tables, 176 exposed functions.
- Services: `team-jobs.ts`, extracted preparation/execution in `team-workspace.ts`, pinned memory retrieval in `team-memory.ts` and the existing team-space router.
- UI: `RoomJobs.tsx`, existing workspace tabs/styles and optional action refresh callback.
- Tests: `tests/team-jobs-http.test.ts`, `tests/e2e/team-jobs.spec.ts`, plus retained history/knowledge/memory/provider regressions.

The prior SQL proposal in `durable-draft-jobs-proposal.sql` is historical, unverified design material. The implementation corrects explicit-release phases, null lease consistency, exact client-request idempotency despite later context changes, and a pre-generation fence check. Do not apply the proposal over migration 0087.

First focused run `jobs-focused-1.log` passed three new durable scenarios and failed the fourth fixture's original-cookie reuse after adding a second organisation. The real tenant guard correctly returned 428; production policy was unchanged. The fixture now closes its temporary second membership before reusing the original single-tenant cookie. Expanded verification is running in `jobs-focused-2.log`; final current acceptance belongs in [verification](verification.md).

Subsequent verification found and fixed a real queued/leased cancellation bug: the legacy run-cancel function rejects absent runs, so job cancellation now invokes it only for an existing running run while retaining version/fence checks. Focused run 3 passed all 18 service checks but exposed a browser test timezone error (a UTC string entered as local time made a future job immediately due). The test now constructs browser-local fields and asserts the saved due instant is at least 50 minutes ahead; the UI shows its recorded UTC instant. Failed browser evidence is preserved under `.runtime/workspace-parity/jobs-focused-3-browser-failure/`.

Focused run 4 includes the added concurrent claim/cancel, finish/cancel and active-queue limit case: all 19 service checks pass and desktop/mobile Jobs journeys pass. Build completion is pending. Additional SQL NULL-argument fences and explicit private-owner attempt denial are included in the forthcoming full regression; do not treat the earlier runs as acceptance of those later changes. No cancellation/security fence was relaxed to satisfy tests.

Final full regression now passes, including those additional SQL/owner cases. Jobs desktop/mobile journeys passed in 8.0/7.1 seconds. The preserved-store upgrade used no bootstrap/seeds/reset, and the restored preview passed real fixture sign-in, anonymous denial, existing knowledge/memory/jobs APIs and Jobs UI inspection. No demo jobs/model calls were added to that store and no agent worker was activated there. Ephemeral worker execution/restart behavior was verified against disposable test jobs. [Remaining parity](remaining-parity.md) prioritises recurring semantics, scoped audit export and operational templates; this one-off fixture queue does not complete those families.

## Subsequent 0088 layer

The historical evidence above describes the one-off primitive. [Recurring schedules](recurring-schedules.md) now layers verified local daily reviewed definitions, occurrence/tick ledgers, DST/overlap/catch-up/budget controls, source-aware pause/revoke and redacted audit CSV on that queue. Current inventory is 88/191/179. Current full and later focused hardening evidence are separate in [verification](verification.md). Hosted/weekly/calendar/webhook execution, general tools and unbounded history remain unfinished; no new agent worker was activated in the preserved preview.
