# Protected billing HTTP entrypoints — local source, not activated

The existing email-worker Next.js application now packages `/api/billing/dispatch` and `/api/billing/refresh`. Neither changes `/api/process`, sends email, schedules work, configures secrets, or enables checkout. Both use the existing modern database claim/reconciliation cores. No in-memory mutex represents durable admission.

## Fixed execution boundary

- Explicit `GET` or `POST` only; `HEAD` returns 405 before work. Query strings and any body byte are prohibited. A streamed body must end within 1 second, with at most 64 empty chunks.
- `KXRA_BILLING_HTTP_ENABLED=true` plus the relevant existing dispatch/refresh flag are required. Default is unavailable.
- Dedicated `KXRA_BILLING_WORKER_TRIGGER_SECRET` must be 64–128 base64url characters. This document deliberately supplies no secret value. Authorization must be `Bearer <that dedicated secret>`. There is no email-secret or cron-secret fallback.
- After authorization, the existing configuration parser fixes LIVE/production or STAGING_SANDBOX/staging from server settings, exact project, matching key mode, reviewed catalogue, origin, TLS and genuine runner-to-worker identity. HTTP never supplies a mode, tenant, request ID, limit or budget.
- Dispatch discovers at most 2 canonical requests and shares 45 seconds / 8 provider requests / 2 POSTs. Existing 100/102 claims remain authoritative and unknown POST outcomes remain reconciliation work, never automatic retries.
- Refresh discovers at most 1 subject / 1 wakeup and shares one 45 second, 32 GET, zero POST budget across preflight, payment and historical consent reads. No event/session/status alone grants access.
- SQL uses separate short transactions, 2 second statement timeout, 500 ms lock timeout and 2 second connection limit, with a hard 55 second receipt deadline. Provider HTTP occurs outside SQL transactions. Existing lease/CAS/replay/consent checks remain unchanged.
- Routes retain the existing 60 second function ceiling. Body gating plus 55 second receipt deadline leaves approximately 4 seconds for framework overhead. This is a code budget, not hosted timing acceptance. No fire-and-forget processing is used.
- Responses contain only bounded counts and fixed outcome codes, never request/tenant/provider IDs, checkout URLs, secrets or raw errors.

## Hosting and activation prerequisites

Owner must first integrate this source, run sequential native/aggregate/build checks and verify the exact protected hosted worker artifact. Then separately review configuration of the dedicated trigger secret, existing worker database runner+CA and mode-specific provider settings, reviewed catalogue/legal/tax/policy gates and individual activation flags. Do not create or reuse credentials through this document.

An approved scheduler must send the dedicated billing bearer header to the exact selected worker deployment. No `vercel.json` cron or scheduler was added. Built-in Vercel Cron uses its own configured authorization mechanism; do not assume it automatically supplies this dedicated secret or silently fall back to `CRON_SECRET`. Choose and approve the scheduler/header configuration explicitly. An external scheduler may also require narrowly scoped credentials and a budget approval.

Actual provider sandbox lifecycle, missed-run/overlap recovery, expiry/renewal freshness, failure alerts and deployed 60 second timing still need hosted acceptance. The route tests use injected synthetic SQL/transport; they are not evidence of provider resources, bank settlement or a production-ready payment service. Monetary/compute/scheduler budgets, cadence, ongoing operation and real provider activation remain unresolved owner decisions; fixed per-invocation ceilings are not a spending authorization.
