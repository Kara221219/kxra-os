# Local reviewed manual agent handoff

22 October 2026. This is a persistent **local manual draft exchange**, not a paired Codex/Claude adapter or proof of real provider execution. Public design, hosted state, signup/billing activation and the three staging build holds remain unchanged.

## Implemented flow and authority

Migration `0096_local_manual_agent_bridge.sql` adds an immutable request/packet/review/result ledger. A verified room creator selects up to ten messages, records a purpose, inspects the exact context, explicitly approves it and records one recoverable handoff receipt. Returned text is bound to that request/digest and needs a second explicit review. Acceptance records a draft only; it does not publish a message, launch a process, modify a file, charge, send or execute anything.

States: `PROPOSED → APPROVED → EXPORTED → RESULT_PROPOSED → ACCEPTED`; rejection/cancellation stops further use. Requests and returned text cannot be edited to reuse approval. Changed purpose/context requires a new request and review. Export/result retries recover the original logical receipt, including uncertain acknowledgements; this is not a claim of exactly-once delivery or execution at an external provider. No external transport is called.

Authenticated API routes live under `/api/team-space/:room/bridge`. Caller JSON supplies no identity, organisation, room override, command, path, endpoint or tool authority. SQL repeats verified identity/session, room creator/write access, entitlement and exact source checks under row/source/membership locks. Pilot cancellation shares the established advisory lock. Sensitive packet/result columns have no direct authenticated SELECT grant; the metadata catalogue uses RLS, and scoped RPCs release context only after current authority/source checks. Mutators require the application login and server-owned guarded local fixture/admission context. Data API/anonymous/hosted calls cannot activate this path.

The UI uses the same signed-in local session; no pairing token or persistent device credential is issued. The Bridge tab is explicitly manual/unpaired, with source inspection, review, receipt recovery, result review, search and reload history. Room-keyed mounting prevents carrying inspected context into a different room. Native adapter requests/dispatch fail closed with 503; the production route and UI remain unavailable. `MANUAL_UNVERIFIED`, `DRAFT_TEXT_ONLY` and `execution_permitted:false` remain explicit. Context/result text is rendered as escaped text, never HTML or a command.

Expired, changed-source or stale-session requests cannot be exported, imported or accepted. Existing accepted history remains readable past its handoff deadline only while current identity, room and source authority still hold. Cancellation/rejection remains available to stop work without new paid access. No already-delivered data is claimed to be retractable from an external recipient.

## Verification and evidence

Fresh source-matched harness `/Users/kara/Documents/Codex/2026-10-19/task/kxra-bridge-acceptance-japvvyb0`; preview `http://127.0.0.1:3291/os/workspace`; private Unix-socket runtime `/var/folders/1b/rx87jbks7ysd9v3n0dgym53w0000gn/T/kxra-wb-c4gqfP`, identity receipt `reference-workbench.json`. Its Next root override only encloses the shared dependency link; candidate configuration and preserved generated tsconfig were not reset.

The initial focused run failed two cases: raw JSON key order changed through PostgreSQL JSONB, and negative fixture inserts lacked an audit actor. Canonical strict packet normalisation now preserves the stored digest through key reordering; the fixture writes are attributed in a local transaction, with audit triggers unchanged. `/tmp/kxra-bridge-focused.log` remains retained. The corrected run `/tmp/kxra-bridge-focused-corrected.log` passes eight protocol plus six HTTP/database contracts and both desktop/mobile bridge journeys.

Coverage includes concurrent exports and returned results, one logical receipt, lost acknowledgement/retry, new-session persistence, out-of-order return rejection, changed payload/source, cancellation/export races, expired/stale-session/withdrawn-room access, unpaid admission, room members/private outsiders, same actor in a second tenant, direct SQL write/sensitive-column denial, unknown capabilities, and unpaired 503. Browser tests exercise inspect/review/export/recover/return/accept/reload/search and overflow at 360/390/768/1024/1440 widths.

A test-only type inference failure in the JSON reordering regression was corrected by treating deserialised test data as unknown; its runtime assertions remain intact. Root typecheck and the final protocol rerun logs are `/tmp/kxra-bridge-final-typecheck-corrected.log` and `/tmp/kxra-bridge-final-protocol.log`. Broad regression/build result follows below when complete. This does not claim a complete repository-wide test run.

## Remaining activation gates

No real provider/device, pairing credential, native installer, filesystem/shell authority, hosted worker or live checkout has been accepted by these fixtures. Native transport readiness remains false; only the guarded local manual exchange is implemented. Actual device pairing/transport, secure connection scopes/data terms/budget, expiry/revocation, uncertain external outcomes and real provider output need separately approved implementation/acceptance. Existing provider tests and billing events are synthetic; the PostgreSQL/HTTP/browser persistence and authorisation above are real local execution.

Supabase's current [changelog](https://supabase.com/changelog) and [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) were checked. No SDK change, hosted query or installation was needed. The absent Supabase CLI and this repository's contiguous four-digit migration contract retain the existing guarded fresh-local-store workflow; no hosted migration ledger was touched.

## Terminal accepted result

`/tmp/kxra-bridge-regressions.log` ended **LOCAL MANUAL BRIDGE FULL ACCEPTANCE PASS**: 19 prior case/collaboration/billing contracts, 18 prior desktop/mobile app journeys, 32 knowledge/memory/jobs/schedules/audit/workspace/provider contracts and final production OS build all pass. `/tmp/kxra-bridge-final-source.log` ended **BRIDGE FINAL SOURCE ACCEPTANCE PASS**: eight protocol tests, one production-boundary test, six bridge HTTP/database contracts and both bridge browser journeys pass. Combined inventory: 57 API/billing contracts, 9 protocol/boundary tests and 20 desktop/mobile journeys; 96 migrations/205 protected tables. Final root typecheck (`/tmp/kxra-bridge-source-typecheck.log`), scoped formatting and whitespace checks pass.

The production-boundary test calls the internal service entry points in a clean production-mode child with fixture-shaped flags and no configured database; all reject before database use. This is a direct service-boundary test, not real hosted Auth/provider acceptance. The strengthened paid-access test also proves an already returned draft cannot be accepted after cancellation. Room-keyed mounting and final test sources are accepted by the final focused rerun. No tests remain running at this checkpoint; the isolated preview is retained.
