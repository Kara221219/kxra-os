# Isolated paired-agent vertical slice

3 November 2026. Base `43e3906859b58e69370a1069a44e6dc1cefc6d03`, branch `codex/byoa-paired-agent`, separate worktree `.runtime/byoa-paired-agent`. The frozen release, its checkout/artifacts, old rc0091 and original dirty files were not modified. No hosted change, push, provider call, real sign-in, installation, user-file/shell access or actual access grant was performed.

## Implemented scope

This is a genuine database-backed pairing/queue boundary tested with **generated fixture credentials and synthetic adapters only**. It does not activate live pairing. Owners who are current private-room members create an owner-private agent in that room, request a two-minute single-use invitation, and explicitly inspect/approve an exact text task. A device redeems the invitation for a fifteen-minute agent/workspace/room-scoped capability. Polling leases one approved task for thirty seconds; only the first atomic START authorizes generation. A bounded draft is recorded exactly once in the original room/thread, labelled **PAIRED SYNTHETIC DRAFT · review required**.

The older manual bridge interface, `MANUAL_UNVERIFIED` provenance and always-throwing `requireNativeBridgeAdapter()` are unchanged. New paired endpoints independently require guarded local fixture auth, loopback origin, generated session secret, no hosted auth and no Vercel environment. No flag enables a real adapter. All success responses retain `provider_verified:false`.

## Authority and failure semantics

- Human control uses verified cookie identity, current tenant/private-room creator access and fresh owner MFA. Bodies cannot choose a user, role, customer identity or scope grant. Agents are private to their owner and one room in this first slice.
- Only invitation/session hashes are stored. The server-only bounded lookup resolves the capability's current owner/tenant/session revision; each operation then enters an authenticated RLS transaction and independently rechecks the bound agent, membership, paid entitlement, session expiry and revocation. A device token is not a cookie/JWT and is rejected by ordinary workspace routes. It cannot mint invitations or change ownership.
- Sources are at most ten messages from one original thread, at most24KB; objective at most2,000 characters. Canonical source/agent/tenant/owner/thread/session content is hashed by PostgreSQL, immutable in the task row, inspected before approval and rechecked before lease/start/publication. Stale approved work is cancelled rather than blocking later valid work.
- The room and paid-work locks use a consistent order. Two poll retries may retrieve the same lease; only one START returns `dispatched:true`. Repeated acknowledged starts neither generate nor abandon the original run. Concurrent equal results return one message receipt; different content/fence/session fails.
- A lost process or response after dispatch is uncertain. Explicit ABANDON or the next authorised operation after lease expiry records UNCERTAIN. There is no automatic generation/requeue/replay. A new pairing revokes the former session and makes its in-flight work uncertain. Explicit device revoke cancels pending/in-flight tasks and invalidates invitations, polling and late results. A completed message remains history under normal room RLS.
- Presence is an estimate from the last authenticated operation: ONLINE within30seconds, OFFLINE thereafter while the session remains valid, otherwise REVOKED_OR_EXPIRED. Refresh/reconnect is explicit; no daemon, polling service or scheduler is installed. A task expires after ten minutes. Local safety bounds are ten agents per owner, twenty pending tasks per agent and100 displayed task receipts; these are fixture bounds, not sold plan limits.
- Results are text only: at most10,000 characters and20KB. No tools, external destinations, filesystem, shell, automatic memory or financial arithmetic are introduced. Sessions stay in browser memory for the synthetic UI demonstration, never local/session storage or a device credential file.

## Runtime/provider boundary

`paired-runtime.ts` defines the leased-text adapter contract, a synthetic adapter and one explicit cycle with uncertainty handling. `codex-paired-protocol.ts` implements a narrow injected NDJSON channel using initialize → initialized → thread/start → turn/start → bounded agentMessage → turn/completed. It requests read-only restricted roots and untrusted approvals, rejects tool requests/items, foreign context, invalid frames, excessive output and disconnects, and closes the channel. There is no Codex executable launcher or provider sign-in implementation. Its acceptance describes only the synthetic peer under tests/support, not a verified Codex provider or managed-policy compatibility.

References reviewed: [Kylon advertised BYOA behavior](https://docs.kylon.io/agents/bring-your-own-agent), [official Codex App Server protocol](https://learn.chatgpt.com/docs/app-server). KXRA branding/assets and existing design are preserved. A real adapter must separately prove installed-version schemas, deny-all tool/filesystem policy, customer-owned authentication, TLS/device/token storage, lifecycle/rotation and permission/budget/retention behavior before any live pairing or installation is approved.

## Named acceptance evidence

Run: `node scripts/paired-agent-fixture-check.mjs --isolated-synthetic --ui`.

The small serial cohort creates a fresh `/tmp/kxra-paired-*` store, Unix socket, random available ports, unique app health identity and new browser contexts. It never reuses a release database, browser session, runtime or build directory, and starts no worker. PostgreSQL and application processes are stopped afterward. Native fixture breadth was kept to this slice; no competing full-platform CI was started.

Final `.runtime/paired-check-4.log` exited0:

- Five unit/protocol cases: explicit bound cycle; disconnect/revoke/late-result no replay; official protocol through a synthetic process including split UTF-8; denial of tools/foreign/malformed/oversize/lost connections; acknowledged duplicate start does not generate or abandon.
- Five real DB/HTTP cases: concurrent invitation redemption, exact approval and duplicate result; expired/replaced invitation, foreign member/agent/general bearer rejection and direct-DML denial; offline/reconnect/uncertainty/cancel/revoke; private membership withdrawal/session expiry; changed sources/stale queue head and a populated foreign active tenant.
- Migration/RLS verification: **118 migrations /216 protected KXRA tables**; expected exposed-function inventory209. All ten focused cases pass.
- Actual desktop1440px/mobile390px journeys: create private agent → request/redeem invitation → propose → inspect exact source → approve → run → original conversation result → revoke, with reflow checks. Screenshots were visually inspected. Runtime `/tmp/kxra-paired-ukU5cP`, app port63131/PG63130 were task-owned and stopped.
- Typecheck/format lint passes. OS production build passes. OS compressed budget **201,971bytes /204,800** (17pages). Source secret/publication scan passes. No broad platform/hosted/provider acceptance is claimed.

Earlier evidence is retained: run1 failed before startup because the nested Unix socket path exceeded macOS103bytes; switched to fresh short temp paths without touching/reusing a store. Run2 passed7/8 but the fixture membership-update setup lacked an audit actor; fixed the fixture transaction rather than the audit guard. Run3 passed10tests/RLS but its UI runner's top-level await was incompatible with CommonJS before any browser launched; wrapped its main function. No authorization assertion or timeout was weakened.

Independent read-only source review found and closed: org/room lock inversion; stale task blocking; missing VIEW route enum; duplicate START generation; and a selector-context race (the current selector is disabled while busy). Review did not independently execute tests. The final reviewer reports no concrete remaining source blockers.

## Remaining gates

Live credential redemption and hosted endpoints remain unavailable by design. Real customer/provider sign-in, actual Codex/other adapters, installer/secure device identity and credential renewal/rotation, managed no-tools permissions, installation consent, hostile-network/hosted/multi-user acceptance and operating/budget policies remain separately approved work. The release owner must reconcile migration118 ordering with any concurrent work; this migration was applied only to disposable fixtures. No frozen release or hosted ledger was changed. Full observable feature parity is not claimed.

Final test-only strengthening: `.runtime/paired-check-5.log` again passes all10unit/protocol/DB/HTTP cases and118/216RLS, after the foreign-tenant case explicitly establishes a valid fresh-MFA/session/fixture context and proves the selected tenant before denying the other tenant's agent. Runtime code did not change after run4's desktop/mobile acceptance. This serial cohort used `/tmp/kxra-paired-DmSopW`, app63423/PG63422, then stopped both processes. No full-platform CI or hosted acceptance is implied. Lint initially included generated `.next-paired-*` cache files; the new cache prefix is now ignored rather than formatting generated artifacts. Next16's generated app AGENTS.md guidance is retained. Final source/hash evidence is stored under this worktree's `.runtime/paired-source-manifest.json`; it is not a release artifact or a push/deployment approval.
