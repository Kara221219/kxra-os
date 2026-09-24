# ADR 0013 — PostgreSQL-authoritative governed routine engine

Date: 24 September 2026. Status: accepted for deterministic local execution.

## Context

KXRA imported nine routine descriptions, but registry text did not establish executable schedules, authorization, deduplication, recovery or delivery behavior. The completion contract requires exact approval, typed triggers, daylight-saving and calendar handling, checkpoint recovery, revocation before retry and quiet notification behavior. Trigger.dev is the intended hosted dispatcher, but it is not connected and must not become the authority for permissions or run state.

## Decision

Store routine manifests, immutable versions, project scopes, calendar facts, logical runs, checkpoints and notification intents in PostgreSQL behind RLS. An exact version binds its hash, trigger, timezone/calendar, service identity, scope, action graph, budget, concurrency, attempts/backoff, lease and notification policy. Imported versions start `DRAFT` and manifests start disabled. Only the owner may approve the expected hash, enable the approved current version or plan/enqueue a bounded local run.

One unique logical key represents each schedule slot or event. PostgreSQL computes local schedule eligibility and UTC instants from the declared timezone and recorded calendar facts. A dedicated `kxra_routine_worker` role may only claim a pre-authorized run, append checkpoints and complete/fail/recover/requeue through private functions. Recovery preserves checkpoints. Requeue repeats manifest, version and service-identity authorization. Notification outcomes are append-only intents fixed to `DISABLED` / `NOT_SENT`.

Trigger.dev may later wake or transport work, but it cannot determine identity, tenant, project, approval, retry or delivery authority. An external adapter must recheck current authority immediately before every consequential action.

## Consequences

The local contract proves idempotent slots, DST/calendar planning, leases, checkpoint recovery, retry cancellation and notification intent behavior without claiming an always-on scheduler or external delivery. The schema adds eight RLS tables, six owner control functions and six private worker functions. Hosted scheduling, provider adapters, distributed concurrency and real notifications remain separate staging acceptance work.

