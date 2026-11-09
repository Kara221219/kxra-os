# Joined customer directory proof: prepared, not executed

Frozen application checkpoint: `14d1f269e44730b567116aa08cdbe7bdfeeb4609`, tree `6cabf8e1cc3fffe0e040abb7435f4ac13a3474fd`. This separate branch adds test infrastructure only. Application, identity, database adapter, proposal and release/default/grant source bytes are unchanged.

## Intended evidence

`scripts/verify-customer-directory-joined.mjs --reviewed-local-window` prepares an exact tracked-file source copy and disposable Unix-socket PostgreSQL cluster under a unique private temporary directory. It verifies the exact genuine application126 catalog before separately installing the metadata proposal. It proves that the proposal is ungranted before applying narrow grants exclusively in this owned test database.

The application process has no fixture-auth settings. It runs the unchanged Next application and real Supabase SDK against a strictly loopback synthetic Auth service implementing user verification and JWKS. Ephemeral ES256 keys/tokens stay in memory. The real application126 access-token hook derives the original session epoch after a synthetic session is inserted by the actual `supabase_auth_admin` test role. Normal Next cookies, `actor()` and `packages/db.query/scoped` perform each directory read; there are no substitute identity/query ports in the successful path. Unrelated custom-app, AI, billing and paid features remain off.

The planned cases cover default-off, missing/ungranted RPC, positive bounded SSR, role/foreign-session/missing-session/stale-MFA denial, page/filter/history flows, no-store HTTP responses, private-field exclusion, responsive views and session/membership revocation. A history-restored stale success is a failure to investigate, not a permitted test relaxation. The harness does not claim that no-store alone clears Next's client navigation cache.

## Ownership and containment

The normal atomic native lease is acquired only after source preparation, and before opening ports or starting resources. Targets use unique loopback ports and a nonce-matched health response. PostgreSQL ownership checks bind data path, socket path, port, PID, recorded process birth, command and PID-file start epoch; a missing initial birth record or changed identity prevents stop and retains the lease. Idle database errors are captured into a controlled failure flag rather than left as uncaught events. Next cleanup checks recorded process-group/birth identity instead of its mutable process title. Async spawn failures and cooperative signals are handled; uncertain cleanup retains the lease. The frozen worktree and executed tracked copy are hash-checked after execution. Receipts, logs and screenshots live only outside tracked source.

A child-only preload blocks HTTP/fetch/socket targets other than the owned app/Auth ports and database socket, and records content-free denial markers. Browser HTTP and WebSocket routing is installed before pages, blocks non-owned origins, and service workers are disabled. The child guard accepts only the literal owned IPv4 addresses/ports or database socket, rejecting DNS aliases, custom lookup/transport hooks and URL-plus-options address overrides. These are JavaScript/Playwright interception controls, not an OS firewall or a claim of OS-level network isolation. No real provider calls, real credentials, package installation, TLS warning bypass, hosted grant, migration promotion or persistent access is authorized by this proof.

## Execution prerequisites and limits

Do not run until the parent releases the serial native/build/browser window and independent review is complete. Start with a clean committed branch and a clean allowlisted environment, not a sourced env file. Use resident dependencies and browser binaries only. Retain receipts even on failure and do not manually clear the lease.

This is a mocked Supabase service with actual SDK verification and actual Next/database composition, not live Supabase Auth acceptance. Browser acceptance and source hash receipts are currently NOT RUN. Joined account-epoch and legal revocation cases are not included; the earlier independent SQL authority proof covers those broader cases, and is not relabelled as joined evidence. Full application build budgets, artifact checks and final aggregate acceptance remain separate requirements.
