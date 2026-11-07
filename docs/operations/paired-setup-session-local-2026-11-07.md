# Paired setup original-session fence

The additive `database/production/paired-setup-session-v1.sql` follows the existing paired setup/options and custom-app original-session payloads. It replaces `setup_human` in place so direct RPCs and the existing RLS policy require a live, originally bound Auth session, while retaining the predicate OID, owner and grants. No existing policy, request tuple, account epoch, payment authority or immutable session binding is rewritten.

`hosted_setup_session_current()` is a narrow authenticated-role definer interface for the server's `kxra_app` login. It takes the existing paired exclusive transaction fence before checking the private original-session predicate. The runtime must call it in the same transaction as its operation. Direct REQUEST/CANCEL independently recheck `setup_human` after their existing fence, so preflight is not their authority. Exclusive acquisition avoids a shared-to-exclusive upgrade deadlock. No private helper is granted to request roles.

The new `b00_paired_setup_session_authority` Auth statement trigger runs after `a00_custom_app_session_authority` for INSERT, UPDATE and DELETE. Auth writers therefore take custom-app then paired authority before row mutation. The setup checks never take a custom-app lock while holding paired authority. Existing immutable capture rules still prohibit backfilling an old/unbound provider session.

## Local verification

Run `node scripts/verify-paired-setup-session.mjs` from a clean committed checkout with existing dependencies. It acquires the shared native lease, makes its own disposable exact-source clone, removes only the two previously documented fixture migrations, boots an owned Unix-socket cluster, and applies the existing reviewed production payloads followed by this payload. Credentials, hosted targets and extra arguments are refused. Evidence and cleanup receipts are retained under the emitted temporary checkout's `.runtime/proof/` directory. The lease is released only after owned cleanup is confirmed.

The tests cover rollback and catalog/data preservation, helper and private ACLs, original predicate OID/owner/grants, valid request idempotency, OPTIONS/STATUS/direct-RPC/RLS denial for missing/expired/deleted/foreign/unbound sessions, revoked account and epoch changes, new original sessions, two concurrent preflights without a shared-lock upgrade, authorized alternate request tuple values, both winner orders for concurrent deletion and expiry updates versus direct and guarded REQUEST/CANCEL, and absence of activation, devices and authorities.

The exact-source native run at `62f13e3e165fec4459e51acda9495a7fd0638096` passed 25 phases, with cleanup confirmed in `/private/tmp/kxra-setup-session-W4TE4Q/.runtime/proof/cleanup.json`. Two additive-source regression tests, root type checking and changed-file formatting also passed. Independent read-only review found no blocking SQL issue.

This is synthetic native PostgreSQL evidence. It does not establish the real provider's deployed Auth schema, trigger order, session deletion semantics, hook configuration or hosted end-to-end behavior. Canonical migrations and historical release profiles are unchanged. Release composition and hosted acceptance remain separate work.
