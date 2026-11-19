# Durable GitHub connector dispatch and reconciliation — local only

Base checkpoint: `033491708d1a753b32fb71674e222661597a8334`, retaining the earlier synthetic checkpoint `5962a56`. Original audited base: `43e3906859b58e69370a1069a44e6dc1cefc6d03`. Branch: `codex/customer-connectors-local`. Worktree: `/Users/kara/Documents/Codex/2026-11-03/task-2/customer-connectors`.

This slice implements a durable PostgreSQL approved-write outbox and a GitHub REST protocol adapter exercised only against a separate persistent local fake HTTP provider. Real GitHub API destinations and real token values are rejected. It does not establish live-provider acceptance, production readiness or Kylon parity.

## Provider and exact supported behavior

GitHub issue comments were selected because one bounded append operation gives a concrete approval, dispatch and lost-acknowledgement recovery flow. Current [official issue-comment documentation](https://docs.github.com/en/rest/issues/comments) specifies the read/create endpoints and Issues read/write permissions; current examples use `X-GitHub-Api-Version: 2026-03-10`. The adapter also reads [repository metadata](https://docs.github.com/en/rest/repos/repos#get-a-repository) to verify repository/account identity before dispatch. [Installation authentication documentation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation) describes repository/permission-constrained installation tokens with one-hour expiry; the fixture models this lifecycle without obtaining a token.

Supported protocol: GET repository identity, GET one issue's comments, and POST one exact approved comment. No edit, delete, pull-request review, repository creation or arbitrary endpoint is supported. The binding is deliberately fixed to synthetic account 101, installation 303, repository 404, author 202, `fixture-org/fixture-repo`, issue 1. Real account/target configuration is not enabled.

Reads scan at most three constructed pages of 100 comments, return at most 50 comments to the UI, mark content untrusted and explicitly indicate incomplete scans. Provider pagination URLs are never followed. Each response is capped at 262,144 bytes with a two-second deadline; redirects are refused. The POST body includes the fully reviewed note and a unique correlation marker. GitHub's documented create contract is not treated as a remote exactly-once or idempotency-key guarantee.

## Durable boundaries

| Phase | Durable state | Meaning and permitted next step |
| --- | --- | --- |
| Fresh scoped read and proposal | PENDING | Immutable payload binds user, tenant, connection, provider account/installation/repository/issue, credential reference/version, scope, session version, full body and marker. |
| Exact digest approved | APPROVED | Only the owning verified customer can approve; a worker cannot approve. |
| Approval consumed into outbox | QUEUED | Durable work, no write HTTP request started; cancellation can prevent dispatch. |
| Provider preflight rejected/unavailable | NOT_EXECUTED | This attempt never reached the write dispatch boundary. The reason distinguishes provider preflight rejection, unavailable authority and other preflight failure. |
| Single claim committed | DISPATCHING | One attempt UUID is fenced durably before network IO. Revocation/cancellation after this point cannot guarantee non-execution. |
| Known local failure before HTTP | NOT_EXECUTED | Even after claim, an invalid lease or expired approval before HTTP is definite local non-execution. |
| Documented provider rejection | REJECTED | A valid authentication/validation rejection response was observed; this operation is not automatically retried. |
| Valid matching 201 acknowledgement | ACCEPTED | Provider acceptance recorded with exact body hash, author, target and comment ID. This is not a global exactly-once guarantee. |
| Timeout, malformed/oversized/redirected response, ambiguous 5xx, or lost worker | UNCERTAIN | No replay or automatic lease-based retry. Explicit reconciliation may only read. |
| Queued cancellation/revocation | CANCELLED | Cancellation happened before the dispatch boundary. |

Connection-first row locks coordinate lifecycle and writes. A tenant/user/provider-target advisory lock precedes preparation/claim and serializes across separate connections. Previously queued work remains held behind any same-target DISPATCHING or UNCERTAIN attempt. The claim response includes an explicit `claimed` flag so concurrent callers cannot mistake an existing dispatch for a new permit.

The approval payload and digest cannot be replaced by the client. Worker operations use server-resolved authenticated/RLS scope; the customer HTTP contract does not expose claim, receipt insertion or arbitrary worker evidence. Every new private table enables RLS, denies direct application DML and is reached only through scoped security-definer functions with empty search paths and explicit tenant/user checks. The production runtime does not select these functions.

## Credential and receipt behavior

The broker interface resolves a reference plus version/scope/expiry. The fixture implementation accepts only a literal fake token, exact connection reference/version and a nonexpired lease no broader than the connection's expiry. Values are never stored in database rows, receipts or UI; references and versions are metadata. No existing credential store or provider secret was inspected or copied. Only generated fixture session material and literal fake provider material were used.

Grant rotation is an explicit fixture action, not OAuth refresh. It invalidates outstanding old-version reads/proposals/queued writes. Revoked connections cannot refresh; reconnecting cannot bypass a still-uncertain write on the same user/tenant/provider target. A callback after connection revocation can record a historical outcome but cannot dispatch again. Account/membership loss continues to deny access; if it also prevents receipt persistence after an in-flight result, the durable claim remains conservative rather than being replayed.

Receipts bind attempt UUID and payload digest. Accepted evidence must match body hash, author ID and issue URL; provider comment association is unique within the user/tenant/repository scope. Duplicate evidence is idempotent. Late uncertainty/rejection observations cannot downgrade terminal acceptance. No raw provider errors, token values or HTTP response bodies enter receipts.

Reconciliation reads the bound issue, matches the exact full body and expected author, and records matching acceptance. No match, incomplete scans, malformed content, wrong author/target or multiple matches remains uncertain; absence is not proof that a write did not occur. Revoked/expired read authority does not trigger token refresh, fallback access or another POST.

## Customer recovery UI

The development-only `/os/connections/github` page exposes explicit scope selection, fresh reads, full account/target/body review, approval, queueing and one dispatch action. Reloading retrieves durable outcomes and receipts. UNCERTAIN has read-only reconciliation and no dispatch button. Cancellation and revocation notices explain the after-claim race. The UI never displays provider token values, and untrusted comments render as text.

Both connector pages return 404 in the production build. Unauthenticated GitHub/customer API requests return 401, the existing agent endpoint remains 503, and the production GitHub helper is an unavailable stub. Actual authenticated real-provider acceptance is not claimed.

## Final verification

- Dedicated local fixture suite: **39 passed, 0 failed, 0 skipped**. Includes real loopback HTTP, customer browser recovery, two real tenant contexts, scoped approval, concurrent duplicate claims, prequeued cross-connection hold, cancellation/revocation before and after claim, grant/session changes, changed-payload denial, malformed/oversized/lost acknowledgements, redirects, bounded/foreign/duplicate read evidence and reordered receipts.
- Actual worker process SIGKILL after fake-provider commit: restart classified uncertainty, did not POST again, and read-only reconciliation found acceptance.
- Actual database and fake-provider restart: **two retained writes, one uncertain, four receipts** survived unchanged; no POST replay occurred.
- Additional isolated wire regression runner: **6/6 passed**, including five bad lease forms before any fetch, expiry specifically after claim/before HTTP, ambiguous transport start, URL restrictions under valid fixture configuration and exclusive lease ownership. Three wire checks also appear in the dedicated suite; counts are not summed as unique tests.
- Independent review fixed the SQL/schema identity-field mismatch and cross-connection uncertainty fence; final re-review found no blocker. Reviewer independently passed the final 6/6 isolated wire checks and `git diff --check`, without running native fixtures.
- Fresh current-runtime-source aggregate: **1,242/1,242 legacy tests**, migration/RLS, restart and empty-target restore passed. Restore covered 214 tables, 7,902 rows and 49 objects, reported RTO 3s. This is new evidence for this slice, not retained pre-UI evidence.
- Final lint/typecheck/formatting, dependency policy, OS production build, artifact scan excluding 27 fixture/UI/secret markers, OS/marketing budgets, marketing CSP/SRI, disabled publication snapshot, marketing boundary and secret scan passed. Marketing/email artifacts remain unchanged from their prior builds.
- Actual production-artifact HTTP checks passed for both connector page404s, GitHub/customer unauthenticated401s and agent503, with no database, provider credentials or signing key configured.

The first two attempted native starts were held by another lane's lease and performed no SQL/provider-simulator work. The first actual run passed 37/38; its sole failure was the test worker's TypeScript top-level-await launcher format. Wrapping the test process entry point fixed it; the clean 39-test run proves the crash scenario. No authority guard was weakened.

Evidence: [native/restart output](evidence/github-outbox-native-2026-11-03.txt), [current-source aggregate receipt](evidence/github-current-source-aggregate-2026-11-03.txt), [production boundary output](evidence/github-production-boundary-2026-11-03.txt). The full aggregate log is retained locally at `/tmp/kxra-github-current-source-aggregate.log` with a hash in the receipt. Source-only extra wire cases were run separately and selected for future harness/CI execution; runtime implementation was unchanged after the successful native/aggregate runs.

Not run: real OAuth/App installation, actual provider API acceptance, hosted database/worker activation, full browser/performance CI phases, network dependency audits, publication, push or deployment. No spending occurred.

## Integration and remaining work

Extension DDL: `database/proposals/github-connector-outbox.sql`, following the earlier `database/proposals/customer-connectors.sql` only inside the disposable harness. Frozen `supabase/migrations` discovery remains 117 with unchanged legacy RPC assertions. Neither proposal has a hosted migration number or hosted activation.

Likely integration overlaps: `apps/os/package.json` runtime/page selectors; root `package.json` scripts; `scripts/verify-customer-connectors.mjs`; the artifact scanner and production verifier; the `CustomerConnections.local.tsx` entry link; progress/handover docs; and `scripts/native-fixture-lease.mjs`, copied unchanged from the custom-app lane's exclusive-file lease helper. The wrapper retains an owned lease if cleanup is uncertain and never removes another lane's/stale lease. Native suites used `/tmp/kxra-native-serial.lock` serially with paired-agent/custom-app runs. Fresh private Unix-socket runtimes and ports were used throughout.

No general GitHub integration is enabled. Real GitHub App authorization, installation/account attestation, token issuance/secure vault implementation, approved real-target configuration, live policy and provider acceptance still require implementation and explicit approval. No real credentials or existing access grants were used. Distributed/provider exactly-once behavior, unbounded reconciliation, arbitrary provider tools and automatic retry remain unsupported. An unresolved write deliberately holds later same-target work until accepted evidence is found; there is no operator override that invents non-execution.
