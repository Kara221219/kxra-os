# KXRA observable-feature parity plan

19 October 2026. DECISION: preserve the current KXRA design and existing working product. No 3D/parallax implementation, studios, subscription checkout, production deployment, push, real credentials, external sends or trading. Existing uncommitted work is the baseline, not disposable scaffolding.

## Evidence and acceptance

The [public audit](kylon-public-audit-2026-10-19.md) is EXTERNAL RESEARCH supplied by the parent research thread: 521 discovered routes, 200 pages read, representative public controls tested. It does not verify private Kylon operations. The route manifest and screenshots have not yet been supplied to this checkout. Do not represent their existence here or mechanically reproduce all SEO routes. Current implementation evidence belongs in [verification](verification.md) and [completion matrix](completion-matrix.md), independently of vendor observations.

Read the saved Genesis brief, ADR 0056 and the current completion matrix before implementing. PostgreSQL is authoritative; verified identities, authenticated transactions and explicit private-room membership apply to every added surface. A room identifier, cursor, search query, model output or organisation owner role never substitutes for access.

## Stages and actual code mapping

| Stage | Existing KXRA foundation | Work and gate |
|---|---|---|
| 0: preserve and assess | `apps/os`, `apps/marketing`, `apps/email-worker`; `packages/db`; 0083–0084 room engine; dirty branch `codex/phase-2-completion`, recovered HEAD `ab19693` | Preserve files; map observations separately from implementation; rerun applicable checks. Current slice: historical conversation pagination with room-scoped cursors and negative access tests. |
| 1: reliable conversations and knowledge | `TeamWorkspace.tsx`, `RoomKnowledge.tsx`, `team-workspace.ts`, `team-knowledge.ts`, team-space API; existing file pipeline | History, shared indexed room attachments, search/download and selected agent context implemented and verified locally. Remaining: author identity, unread/message search/live updates and private-room upload policies. Gate: removed member, cross-room/cross-tenant/stale source denial at DB/HTTP; snippets cannot broaden access. |
| 2: executable context and controlled execution | Reviewed immutable room instructions/memory, encrypted connections, bounded drafts, human task decisions and immutable events | Context versions and durable fixture queue/leases/retries/cancellation/recovery/one-off due instants verified in full local CI. Next: recurring/timezone/overlap semantics, then code/tool capability manifests. Revoked context is excluded before dispatch/publication/history; governance rows are not automatically executable attachments. |
| 3: one complete operational workflow | Tasks/Approvals/Run History, existing CRM/commercial/finance registers and file processing | Select one existing business scenario; exact action/version/destination approvals; local-only execution first; durable triggers, overlap policy, retry/backoff and dead-letter evidence. Gate: no external sends under current instructions; connector acceptance remains blocked until separately authorised. Do not invent a connector catalogue. |
| 4: local coding-agent bridge and apps | Existing app routes and registers, no claimed general app builder | Expiring single-use pairing, device identity, signed callbacks, heartbeat/revocation; isolated app records, draft/preview/release/rollback and record threads. Independently implement six useful templates incrementally on proven primitives. Gate: no ambient filesystem or credentials; preview/live isolation; authorisation and concurrency tests. |
| 5: public navigation and trust | Current cinematic KXRA homepage, synthetic platform tour, scoped enquiry intake, current legal/publication snapshots | Shared original product/help/catalog templates reflecting actual capability states; keyboard/mobile navigation, search/filter/no-results, honest CTA states; language decision. Keep approved legal bytes unless an authorised version change is made. Gate: route/CTA smoke, keyboard/viewport/metadata checks; no copied proof or unsupported certification. |
| 6: activation and scale | Existing test commerce and operating controls | Usage ledger/budgets/exports, privacy-aware audit export, notifications, recovery, hosted tenant/provider acceptance, business offer and billing decision. Subscription checkout stays paused. No production or live-account acceptance is authorised now. |

## Feature-family ledger

| Publicly described family | KXRA state at assessment | Acceptance still required |
|---|---|---|
| Rooms/threads/people | Private/project rooms, messages and explicit memberships implemented locally | DMs, object anchors, mentions, unread/search/notifications, real-time reconnect, richer directory and ownership recovery |
| Agents/models/credentials | Room profiles, pause/resume, encrypted owned connections, 5 protocol families plus labelled fixture | Profile versioning, grants, routing/handoffs, real provider tests and key rotation; no universal model compatibility claim |
| Files/memory/skills | Shared-file retrieval, reviewed instructions and typed room memory verified locally; governance library retained | Private-room uploads and code/tool skills remain; project access must not imply private-room access; no global memory summaries |
| Approvals/execution | Human room-task decisions, run receipts/cancellation and scoped global views | Exact tool payload approvals, durable jobs, traces and policy-aware exports; task approval does not execute a send |
| Automations/usage | Operating registers, run token counts and local fixture one-off draft queue verified locally | Recurring/webhook/hosted execution, DST, overlap/replay, cost and credit ledger, reservation and budget enforcement |
| Apps and six templates | Existing business registers, no general builder claim | CRM lead conversion; creator freshness/attribution; sampling overdue queues; remodeling estimates; confidential recruiting; destination-specific travel review, all with record permissions |
| Public shell/catalog/help/partners | KXRA site and original synthetic demonstration retained | Original content model and honest links/search/filter/learning path; no competitor account links or copied legal/commercial terms |
| Native/mobile/localization | Responsive browser application | Physical-device acceptance, any native clients and language coverage require separate delivery; 198 inventoried Japanese routes are not verified translations |

Each stage must update observed / implemented / tested / blocked separately. Green historical CI does not validate new changes. No stage may be marked complete merely because a UI or register exists.

The [room-knowledge implementation record](room-knowledge-next.md), [memory contract](room-memory.md) and [durable draft contract](durable-execution.md) record their bounded scopes. [Verification](verification.md) separates stage evidence. Private-room uploads, general code/tools and hosted/recurring execution remain separate work.

## Current continuation boundary

0088 recurring fixture definitions/occurrences and scoped redacted CSV are implemented; their current full acceptance is tracked in verification.md. Daily-only, 30-day/20-occurrence bounds, latest-due-day catch-up and explicit review are deliberate first-slice limits. Calendar/webhook/hosted workers and unrestricted schedule history are unfinished. The approved pilot is £49/month/workspace for five people with customer-paid AI-provider costs, optional £199 setup for one workflow/onboarding. Charges remain disabled; ten-room/250-monthly-draft capacity and legal/service details are proposals awaiting approval. See [pilot implementation](pilot-offer-implementation.md) and [launch readiness](../operations/launch-readiness.md). Production deployment is not performed by this coding task.
