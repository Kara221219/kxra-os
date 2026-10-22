# Native-agent bridge: protocol foundation

22 October 2026. Local code only; no device, provider, transport, pairing credential, host tool, executable download or API route is activated. This starts the bridge implementation after the accepted case-app commit `2c31bddf6419a5bacfa51fe236dc3dc44ec8e4a3`; it does not complete a connected native bridge.

`packages/workspace/native-bridge-contract.ts` defines a strict draft-only request/packet/result contract. Server-resolved actor, organisation, room, creator, active access, entitlement and session revision bind an exact selection of up to ten messages. Sources are marked untrusted quoted data, limited to 24 KB and pinned by content digest. A ten-minute deadline, exact creator approval, unchanged source and current scope are checked again. Request JSON cannot supply identity, tenant, path, command, endpoint, tools, expiry or execution authority. A returned draft binds the request and stored packet digest, remains `MANUAL_UNVERIFIED`/`REVIEW_REQUIRED`, and cannot claim external action or verified provider provenance. No model financial arithmetic or automatic consequential execution is introduced.

The digest is **not a signature or bearer credential**. Approval/current-authority arguments are trusted server inputs, never request-body grants. These pure functions cannot atomically consume approvals, fence concurrent devices or persist revocation. A forged client-computed hash is not authority. Callers must not expose this contract as a working endpoint until the persistent transaction below exists. `nativeBridgeReadiness` explicitly reports pairing, export and dispatch unavailable; `requireNativeBridgeAdapter` always fails closed. Presence of an adapter name or an environment flag cannot activate it.

## Verification and limits

Eight protocol tests cover normalisation/binding, unknown privilege fields, duplicate/foreign/missing context, UTF-8 size ceilings, expiry, revoked/unpaid/cross-tenant/replaced sessions, changed sources, unapproved/cancelled/consumed review states, result binding, untrusted instructions, malformed authority/clock overflow and absent-adapter denial. Logs: `/tmp/kxra-native-bridge-contract-final.log`, `/tmp/kxra-native-bridge-typecheck-final.log`. These are deterministic in-process contract tests, **not** device pairing, PostgreSQL persistence, concurrent one-time consumption, provider output or hosted acceptance. There is no synthetic “connected agent” response.

## Next executable local slice

1. Reuse `actor()`, same-origin handling, `packages/db` authenticated RLS and the established source preparation/revalidation patterns in `team-workspace.ts`. Create an additive local request/review/result ledger, with immutable snapshots and exact versions; do not accept authority from JSON or weaken the model's current source policy.
2. Under one transaction and row lock, recheck current room/session/entitlement/source plus exact reviewer, consume a single-use handoff once and retain duplicate/uncertain receipts. Reject changed body/request reuse, cancelled/revoked access and expired leases. This ledger is not implemented by the protocol functions.
3. Add an explicitly labelled manual draft handoff UI over that ledger using the existing authenticated session, without creating persistent device credentials. Returned text remains unverified and reviewed; it cannot execute tools, modify files, send messages, charge or change access automatically.
4. Prove HTTP and direct SQL tenant/room denial, concurrent/replayed/expired/revoked handoffs, interruption/recovery and desktop/mobile persistence in a fresh private fixture. Actual Codex/Claude device pairing/adapter/provider success needs a separately approved concrete connection, scope/data/budget and real acceptance; fail closed until then.

No new hosted migration, billing/provider activation, push/deployment or staging-hold change. Public design and generated tsconfig edit remain preserved.
