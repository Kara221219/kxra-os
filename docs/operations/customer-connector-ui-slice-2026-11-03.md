# Customer connector UI and mock adapter follow-up

The secure synthetic checkpoint is retained at `5962a56cfdcaa7104426f6ba95bd78f85ef74e4f`, based exactly on `43e3906859b58e69370a1069a44e6dc1cefc6d03`. This follow-up stays on `codex/customer-connectors-local` in `/Users/kara/Documents/Codex/2026-11-03/task-2/customer-connectors`.

The customer story is: open the local Connections preview → explicitly choose read-only or approved-write scope → read mock notes → prepare an exact write → confirm and approve it → execute separately → read the single saved result. Rejection and revocation are separate actions. No external account is connected, and this is not production readiness or Kylon parity.

## Implementation

- `/os/connections` authenticates the current fixture customer before loading their connection metadata. A link in the development-only fixture sign-in section makes it discoverable.
- The UI explains connection scope, active/revoked/expired state, expiry, read results, untrusted provider content, exact proposal content and single-use approval. It requires a review checkbox before approval and keeps execution separate. No agent bearer is displayed or stored in browser storage.
- A synchronous busy guard prevents double actions. Connection switches, refresh and failures clear local review state. They do not cancel an existing server approval; the UI explicitly says to reject the write or revoke its connection to cancel it. A fresh read is required before another proposal.
- Lost responses, malformed JSON, malformed successful result shapes and conflicts produce a no-automatic-retry state before any state update. A fresh read can reconcile a note committed before its response was lost.
- The mock adapter contract declares one fixed provider, no credentials, two fixed tools, a maximum of 50 returned notes and mandatory write approval. It accepts only a verified authenticated/RLS transaction and invokes one fixed scoped RPC. It exposes no endpoint URL, credential input or dynamic provider registry.
- Shared result schemas validate both the server outcome before transaction commit and the client outcome before React state changes. They check scope, lifecycle state, request/receipt IDs, approval digest and read bounds. Unexpected server results fail closed.
- The local DDL proposal returns the latest 50 notes in chronological order plus the total count. SQL tenant/user predicates, row locks, immutable proposals, wall-clock expiry, single-use execution and revocation remain authoritative.
- Development-only page imports select the mock UI. Production selects a `notFound` component; production API denial stubs remain in place. Artifact verification now also rejects the mock UI's specific control labels.

The frozen release remains at 117 migrations with no changes under `supabase/migrations` or to legacy RPC-count assertions. The connector DDL remains an unnumbered proposal applied only to its disposable fixture database.

## Verification

Final focused run: **23 passed, 0 failed, 0 skipped**. This includes seven browser cases across desktop and mobile, adapter tests, SQL/HTTP security/lifecycle tests and production denial-module tests. Migration/RLS verification passed for the unchanged 117 release migrations and 214 protected release tables; direct access to the additional private connector tables remains denied.

Browser evidence covers default read-only consent, explicit write scope, exact escaped note review, separate approval/execution, double-click single execution, rejection, revocation, connection switching, account isolation, expired server and client-side reviews, failed requests, a committed write with a lost response, and malformed successful connect/list responses. The lost-response test verifies exactly one persisted note, no automatic retry and successful reconciliation by reading again. The latest-50 SQL test checks exact content/order for notes 6 through 55 of a 55-note fixture.

Independent review identified a malformed-success response crash before state validation; shared per-action decoding fixed it, and a browser regression test passed. Final re-review reported no blocking finding and independently passed all four pure adapter/production-module tests. Earlier alert-selector ambiguity was a test-harness issue and was corrected by scoping the alert to the application main region.

The test run reused a retained checkpoint fixture signing key. No new signing key, provider secret, real OAuth grant or real provider credential was created. Test sessions and synthetic capabilities are signed with the existing fixture key. No external provider action, hosted change, publication, push, deployment or spending occurred.

The checkpoint's **1,242/1,242** legacy service result, restart and restore proofs remain retained as historical checkpoint evidence. That full legacy suite is not claimed as rerun after this UI/adapter follow-up. The focused final run exercises the unchanged approval and tenant boundaries through the new adapter and real HTTP/browser flow.

Raw focused output: [23-test proof](evidence/customer-connector-ui-synthetic-2026-11-03.txt). Visual review: [desktop mock UI](evidence/customer-connections-ui-2026-11-03.png). The screenshot deliberately includes HTML-like untrusted mock text, rendered as text.

## Remaining limits

This is one mock provider and a local customer UI. It does not implement OAuth/PKCE, a token vault, refresh/revocation at a real provider, MCP discovery, external writes, customer billing activation, paired-agent integration, hosted access or real-provider acceptance. A real provider adapter needs a separately reviewed outbox/worker, idempotency and uncertain-outcome reconciliation; network calls must not be inserted into the atomic database adapter interface.

The UI does not resume historical proposal IDs after navigation; their server-side expiry/rejection/revocation rules still apply. Connection metadata has no pagination, while note results are bounded to the latest 50 with an explicit count. Provider-specific policy, audit UI, retention and rate limits remain future work.

## Changed areas

UI: `apps/os/app/os/connections/page.tsx`, `apps/os/components/CustomerConnections.local.tsx`, `CustomerConnectionsPage.local.tsx`, `CustomerConnections.production.tsx`, `CustomerConnections.module.css`, and the local fixture entry link.

Adapter: `packages/connectors/adapter.ts`, `results.ts`, `contracts.ts`, `apps/os/lib/customer-connectors.local.ts`, and `database/proposals/customer-connectors.sql`.

Verification: focused SQL/HTTP tests, new adapter/browser tests, production boundary tests, `scripts/verify-customer-connectors.mjs`, `scripts/verify-connector-production.mjs`, the artifact scanner, package scripts and CI steps. Runtime selectors live in `apps/os/package.json`. This report, raw test evidence, screenshot, progress and handover records document the stopping point.

## Final production boundary and stopping point

The final OS production build passed. Artifact scanning excluded 24 fixture/UI/secret markers across OS, marketing and email-worker outputs; the unchanged marketing/email-worker artifacts are retained from the checkpoint. OS and marketing budgets, marketing CSP/SRI, publication snapshot, marketing boundary, dependency policy, lint/typecheck/formatting, secret scan and `git diff --check` passed.

The built OS was then started on loopback with no database, provider credentials or signing key configured. Actual HTTP verification passed: `/os/connections` returned 404 with no mock UI; `/api/customer-connectors/agent` returned 503; unauthenticated `/api/customer-connectors` returned 401. The production process shut down cleanly. [Raw production boundary proof](evidence/customer-connector-ui-production-2026-11-03.txt).

No checks remain running or blocked. The full legacy suite, marketing performance/browser suite, real OAuth/provider acceptance and hosted activation were not rerun or performed in this follow-up. The retained checkpoint remains the source for the legacy 1,242-test, restart and restore evidence.

## Later integration coordination

Extension DDL remains at `database/proposals/customer-connectors.sql`. It is not in `supabase/migrations`, is not a release migration and is installed only by the connector's disposable fixture harness. A later integration must review and assign extension migrations deliberately; it must not add this proposal to frozen release discovery implicitly.

Files likely to overlap other feature integration: root `package.json` scripts, `apps/os/package.json` conditional imports, `.github/workflows/ci.yml` verification order, `scripts/verify-production-artifact.mjs` marker lists, `apps/os/components/LocalFixtureLogin.tsx` local entry links, and `docs/operations/progress.md` / `handover.md`. The new page and CSS module are confined to `/os/connections`; shared auth, database runtime, global CSS, legacy OS catchall and release migrations were not changed.

All connector test databases used fresh private `/tmp` runtimes with separate Unix sockets/ports, and all were stopped. No shared fixture database was opened or modified. After the coordination update, no further fixture runs were needed; subsequent combined verification should use the existing shared fixture-lock protocol. The separately active custom-app worktree at `/Users/kara/Documents/Codex/2026-11-03/task-3/custom-apps` was not altered.
