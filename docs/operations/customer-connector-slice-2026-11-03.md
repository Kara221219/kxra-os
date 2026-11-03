# Local synthetic customer connector slice

Historical checkpoint: `5962a56`. The later local UI/mock-adapter follow-up is documented in [the UI slice handoff](customer-connector-ui-slice-2026-11-03.md); limitations below describe this original checkpoint.

Base: `43e3906859b58e69370a1069a44e6dc1cefc6d03`. Branch: `codex/customer-connectors-local`.

This is a local API/database vertical slice, not a live integration or evidence of Kylon parity. It adds no OAuth, provider grants, credentials, network transport, hosted changes or spending. The DDL is an unnumbered proposal in `database/proposals/customer-connectors.sql`, applied only by the disposable connector harness. The frozen 117-migration release manifest is unchanged. A future release needs separately reviewed migration integration.

## Architecture and use

Run `npm run test:connectors` for a disposable Unix-socket database and loopback Next.js server, generated fixture secret, focused SQL/HTTP tests and migration/RLS verification. The harness stops both services. Private synthetic diagnostics remain under `/tmp/kxra-connectors-*`; no real data is loaded. Existing locked dependencies can be reused locally; no install is required by the harness.

The fixed registry contains only `synthetic-notes`, with `notes.read` and `notes.append`. A local authenticated customer uses `GET/POST /api/customer-connectors`. All POST commands have strict schemas and a 4096-byte request cap; the customer route requires same-origin and the existing verified fixture session. Tenant and user come from server authentication and current database membership. No request or model output can supply an identity, provider endpoint, credential or replacement execution payload.

1. `connect` requires explicit `allow_write: boolean`; read is always granted. It creates a new connection with 24-hour expiry, returning its ID and a signed five-minute synthetic agent capability. Read-only connections cannot propose or execute writes.
2. A machine uses `POST /api/customer-connectors/agent` with `Authorization: Bearer <capability>`. The capability binds its purpose, user, organisation, connection and account session version. The route accepts only `read`, `prepare`, and `execute`. Cookies give this route no authority. Never hand the customer's session cookie or local signing secret to an agent.
3. `read` with `connector_id` returns synthetic notes, marked untrusted, plus a five-minute `read_id` bound to the connection revision.
4. `prepare` with `connector_id`, `read_id` and `note` consumes that receipt into one immutable proposal. The response contains the exact payload, digest, state and expiry.
5. The customer reviews that payload and calls `approve` with `connector_id`, `request_id` and the exact digest, using the customer session route. Agents cannot approve, reject, connect or revoke with their bearer. `reject` cancels pending or approved requests.
6. `execute` takes only connection and request IDs. It revalidates scope, permissions, expiry, revision, approval and digest. A synthetic note INSERT, single-use approval consumption and revision increment commit atomically in PostgreSQL. Replay and older proposals fail closed.
7. `revoke` is terminal and idempotent, cancelling outstanding receipts/proposals. Reconnection creates a new ID. Expired connections cannot read or execute; expired approvals cannot approve or execute. Account session revocation and membership/tenant access loss invalidate agent access.

Private tables deny direct application access and enable RLS. A scoped, authenticated RPC is the sole mutation path. Its SECURITY DEFINER body uses an empty search path, explicit verified user/tenant predicates and actor restrictions. Connection-first row locks serialize revocation and execution. Expiry uses wall-clock time after locks. The SQL actor setting is trusted server context, not a client attestation: database credentials and server session authority must never be exposed to agents.

## Limits before real customers

- No real OAuth authorization/callback/PKCE flow, token vault, token refresh, provider revocation, general MCP registration or provider scopes. The one adapter is deliberately synthetic and statically registered.
- No customer connection/review UI, hosted activation, production acceptance, or integration with the paired-agent runner. The explicit customer approval API requires a future trusted UI/tool permission integration. A customer session itself can approve; an agent must receive only its restricted capability.
- Synthetic effects commit in the same database transaction. A real provider adapter needs an outbox/worker, per-provider idempotency, crash/uncertain-outcome reconciliation and separately reviewed write policies. Do not insert network calls into this RPC or transaction.
- No per-connector rate limits, retention/deletion policy, provider-specific sanitization, paginated reads or full audit UI. Read content must stay untrusted and cannot authorize actions.
- Synthetic capabilities expire in five minutes, cannot be refreshed, and cannot move between connections. Revoke/reconnect is the lifecycle supported here. No production capability issuer exists.
- Runtime guards require explicit fixture mode, development, 127.0.0.1 origin, generated local secret, no hosted auth/database configuration, and no Vercel environment. The production local-guard module disables this slice. The SQL fixture guard alone is not a production activation mechanism.

## Verification

Focused proof: 12/12 tests passed against a fresh local PostgreSQL 14 database and real Next.js HTTP handlers. The final test also verifies the default production denial module. Coverage includes user/tenant/revoked-member denial, direct-table denial, hosted SQL denial, explicit read-only scopes, identity/endpoint/payload injection, cross-connection receipts, exact digest approval, agent self-approval denial, bearer-only customer-route denial, session-version revocation, tampering/expiry, concurrent execution/replay, rejection, stale reads, revocation/reconnect and expiry after a lock wait.

All 117 release migrations and the connector proposal applied; migration/RLS verification passed (214 protected `kxra` tables, plus the new explicitly denied private tables). An independent read-only review found wall-clock expiry and raw SQL payload-size defects; both were fixed and tested. It also prompted the separate agent capability interface. Final re-review reported no new blocking implementation defect. The reviewer independently passed the production boundary test; SQL/HTTP runtime tests were run by the implementation owner.

Initial verification failures were harness setup issues: sandbox loopback binding, macOS socket path length and missing run-ID readiness configuration. Those were corrected; the focused final run passed. The first concurrent formatting check saw generated Next.js test output; checks are rerun after harness cleanup.

Final production checks passed: lint/typecheck/formatting, all three builds (OS, marketing, email-worker), production artifact exclusion, OS/marketing build budgets, marketing CSP/SRI, dependency policy, publication snapshot, marketing boundary and secret scan. The actual OS server build contains neither `KXRA_LOCAL_SECRET` nor the synthetic capability purpose marker. Focused raw output is retained in [synthetic test evidence](evidence/customer-connector-synthetic-2026-11-03.txt).

## Changed files

- `packages/connectors/contracts.ts`: fixed registry and strict command schemas.
- `packages/connectors/agent-capability.ts`: signed connection-bound capability issuance and validation.
- `database/proposals/customer-connectors.sql`: private scoped state and transactional synthetic tools/approval RPC.
- `apps/os/lib/customer-connectors.ts`: conditional runtime facade.
- `apps/os/lib/customer-connectors.local.ts`: customer and agent controllers under scoped database transactions.
- `apps/os/lib/customer-connectors.production.ts`: production denial stubs.
- `apps/os/app/api/customer-connectors/route.ts`: authenticated customer lifecycle, review and tools API.
- `apps/os/app/api/customer-connectors/agent/route.ts`: restricted bearer-only agent API.
- `apps/os/package.json`: conditional runtime selection.
- `scripts/verify-customer-connectors.mjs`: disposable local proof and cleanup.
- `tests/connectors/customer-connectors.test.ts`: SQL/HTTP security and lifecycle tests.
- `tests/connectors/production-boundary.test.ts`: production denial boundary test.
- `package.json`: focused verification command.
- `.github/workflows/ci.yml`: separate focused connector proof before legacy CI.
- `docs/operations/progress.md`, `docs/operations/handover.md`: local implementation handoff.
- `docs/operations/customer-connector-slice-2026-11-03.md`: architecture, evidence and limitations.
- `docs/operations/evidence/customer-connector-synthetic-2026-11-03.txt`: raw focused test evidence.

Environment notes: the managed worktree tool was unavailable, so the authorized isolated worktree was created with Git. The sandbox initially blocked loopback binding and tsx IPC; authorized local test execution succeeded. A sandboxed `ps` process inventory was denied, returned no process inventory, and was not retried. The test harnesses confirm their application exit and PostgreSQL shutdown; no denied write remains pending.

## Final broader result

The final fresh `node scripts/ci.mjs --services-only` run passed: **1,242 tests passed, 0 failed, 0 skipped**, followed by release117 migration/RLS verification, restart persistence and empty-target backup/restore verification. Restore covered 214 tables, 7,902 rows and 49 objects, with a reported 3-second RTO. Both application and database cleanup completed. To keep native Unix socket paths short, this run used an exact runtime-source copy in `/tmp/kxra-connector-final-suite-8tn7rxyt`, with read-only Git context pointing at the isolated branch. Full raw output remains at `/tmp/kxra-connector-final-services-proof.log`.

The initial broad run had 1,238 passes and three failures: absent Git context in its temporary copy, the extra candidate RPC changing a fixed count, and candidate migration0118 conflicting with the frozen release117 manifest. The final design removes the proposal from migration discovery and applies it only in its dedicated disposable harness. The final fresh broad run resolved all three failures without changing release RPC assertions or migration expectations.

Passed final checks: dedicated connector proof (12/12), full legacy service phase (1,242/1,242), lint/typecheck/formatting, dependency policy, release migrations/RLS, restart, restore, publication snapshot, marketing boundary, OS/marketing/email-worker builds, production artifact scan, build budgets, marketing CSP/SRI, secret scan and `git diff --check`.

Not run: the full browser/marketing performance suite, separate room-operations CI phases, network dependency audits, real OAuth/provider acceptance, production/staging acceptance and deployment. These remain outside this local connector slice. No checks remain running or blocked, and no hosted state changed.
