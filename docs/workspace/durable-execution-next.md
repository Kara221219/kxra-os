# Next slice: durable draft execution

19 October 2026. Historical pre-implementation contract. The bounded queue is now implemented under migration 0087 and undergoing verification; see [current implementation](durable-execution.md). [The original SQL proposal](durable-draft-jobs-proposal.sql) remains unverified design material outside automatic migrations and must not replace 0087. Full parity remains active. No OS scheduler/service, persistent access, new credential, external provider or deployment is authorised.

## Existing constraints and reusable code

`runTeamAgent` in `apps/os/lib/team-workspace.ts` currently prepares context, admits a run, calls the provider and finishes inside the request. A stale running record is displayed differently after 60 seconds; that is not durable reconciliation. Migration 0086 already rechecks files, instruction skills and memory at admission, immediate dispatch, publication and historical reads. `scripts/file-worker.ts` demonstrates an ephemeral application worker, but its storage authority must not be reused to grant broad agent access.

Preserve synchronous Ask and its tests initially. Extract preparation/execution helpers without changing the current envelope or output. The prepared snapshot must pin message IDs, selected chunks/hashes, exact instruction versions/hashes, opt-in memory IDs/hashes and the system/context hash. Rebuild that exact snapshot at dispatch; never silently select newly created context. Keep model/connection configuration pinned before any future hosted adapter. All output continues through existing run RLS and provenance receipts.

## Proposed bounded first delivery

Add authoritative `team_jobs` and `team_job_attempts`, explicit read-column grants and narrow mutation functions. No prompt bodies, provider keys or generated output belong in queue metadata. Hidden source IDs, reserved run IDs and lease tokens must not become ordinary table/API reads. Job metadata stays in its room; outputs remain only in the original run row under current provenance RLS. Current verified inventory is 86 migrations / 186 protected tables / 170 exposed functions; the draft's two tables and six exposed functions would require exact expectations of 87 / 188 / 176 after validation.

Accept only a strict draft request with agent/message/context choices, request UUID and optional one-off due instant. Server identity supplies author, organisation and current session version. Queue admission should be fixture-only initially, check current room/project/explicit private membership and source authority, and bound active jobs and future due times. The proposal uses 20 active jobs, maximum seven days ahead, three pre-dispatch attempts and 5–60-second leases; these are proposed bounds, not current capability claims. The existing 20-run rolling daily limit remains unchanged at actual dispatch.

Claim with an advisory account lock plus row locking/`SKIP LOCKED`, a unique claim request UUID, a server-generated fencing token and an immutable attempt identity. Duplicate drain requests must never execute another job. One live lease per account complements the existing run concurrency rule. Recheck account/session, tenant/project/room, agent/connection and source authority before dispatch and result publication. Cancellation must invalidate the fence and suppress late publication. Persist run admission and the dispatched phase atomically; persist run completion and final job/attempt state atomically.

A pre-dispatch crash can requeue within the bounded attempt/backoff policy. A crash after dispatch becomes `UNCERTAIN` with withheld output; never automatically replay a request that may have reached a billable provider. An expired fence cannot publish. Record exact attempt phases and safe error codes. Review the draft's use of `EXPIRED` for explicit pre-dispatch releases: a distinct released/retry phase may be clearer. Cancel/withdrawal and final state must remain honest even when current source permissions hide the associated run.

## Local worker and UI boundary

Prefer an ephemeral fixture worker using the normal guarded loopback fixture sign-in and same-origin authenticated drain endpoint. This avoids inventing a hosted service identity or impersonating request-body account IDs. Require an explicit existing synthetic identity (`owner` or `partner`), hold its cookie only in process memory, and optionally select an organisation through the existing server-verified context endpoint. Every drain request then uses the normal verified actor and authenticated RLS transaction. Verify all fixture/loopback/no-hosted/generated-secret guards before starting. No launch agent, system cron, credential/access grant or unattended hosted service is part of this slice.

Suggested application routes: POST/GET `/api/team-space/:room/jobs`, POST `/:room/jobs/cancel`, and POST `/api/team-space/jobs/drain` with a claim request UUID and optional room resource filter. A Jobs tab should show due time, queue/lease/dispatch/final status, attempts, cancellation and authorised run links. Provide an explicit run-next-due control and one-off local due time; no recurring/DST, webhook, exactly-once provider or external-action claim. Hosted drain/queue controls remain unavailable until a separately approved scoped worker adapter is implemented and accepted.

## Required acceptance before promotion

- Exact enqueue and claim idempotency, no duplicate result/run under concurrent drains, immutable snapshots and no exposed tokens/prompt/key material.
- Owner without private-room membership, viewer, unauthenticated, wrong tenant, revoked membership/session and wrong source/agent denial at database and HTTP layers.
- Future job is not claimed early; due work persists across an ephemeral worker restart. Actual bounded lease expiry and stale-token publication refusal; pre-dispatch retry/backoff/exhaustion and post-dispatch uncertainty without replay.
- Cancellation while queued/leased/dispatched, file/skill/memory withdrawal/expiry, connection/agent pause and current session changes before dispatch or publication. Global run views must retain the original provenance gates.
- Desktop/mobile queue → drain → recorded fixture draft → history/cancel journey. Use original KXRA styles and accessible controls. Keep tests within the existing daily run budget; never clear quotas, delete audit rows or disable guards to make tests pass.
- Focused team verification followed by applicable full regression when executable source is complete. Do not rerun the earlier memory suite solely for documentation changes. Preserve failed evidence, update the completion matrix and operations documents, and only then additively upgrade the preserved preview using before/after original-column checksums and no seed/reset.

After this prerequisite, implement recurring schedules/timezones/DST, overlap/replay and kill-switch semantics on the proven queue, then approved tools and a separately authenticated coding-agent bridge. Broad live integrations, external sends, real providers, credentials and production activation remain outside current authority.
