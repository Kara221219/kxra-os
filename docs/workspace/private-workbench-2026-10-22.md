# Reference-led private workspace and persistent CRM

22 October 2026. Continuation of c3e33f3 on the isolated `codex/reference-baseline` branch. Local fixtures only. No push, deployment, hosted schema/data/access change, credentials, paid provider call or staging-hold change.

## Actual implementation

The story is: a verified fixture user opens an authorised room, writes a message or lead through the existing API, reviews an exact conversion, executes it once in PostgreSQL, signs out, and recovers the same messages/records in a new session. The UI does not infer authorisation from a URL, client role or model output.

- Three-pane workbench: searchable authorised-room rail, selected thread/app surface, scoped room brief/context. KXRA cream/green/white hierarchy follows the new reference-led public workspace composition.
- Room tabs use a validated `view` query parameter. Reload and fresh session links recover the selected view; unknown values fall back to Conversation. Arrow keys/Home/End and tab/panel relationships are explicit. Existing eight-second visible refresh, historical cursor loading and retry remain.
- Context pane derives visibility, contributor/creator state, active agents and active attached sources from the current server-authorised detail. Links select actual Knowledge/Workflow views. Local model output remains explicitly synthetic.
- CRM gives loaded-page counts, search and type filtering, empty/loading/error states, explicit capture/propose/review/execute stages, existing exact-version forms and durable receipts. Counts are labelled loaded records rather than misleading global totals. The current room keys the CRM instance, preventing state carry-over between room components.
- Existing actor/same-origin/strict-input/RLS/version/idempotency implementation is unchanged. Source updates invalidate review; repeated execution returns the same receipt. No new schema migration or external CRM connection is introduced.

## Disposable fixture runner

`node scripts/reference-workbench-fixture.mjs --verify` starts a **new** fixture database and loopback preview on3279. It never opens an existing preview or accepts a caller-provided runtime/database URL. It constructs a clean environment, generates only synthetic local session material, creates mode0700 custody, uses PG17 over a private Unix socket with TCP disabled, and verifies the application run ID. The non-secret receipt records the exact runtime, origin, controller/app process IDs and verification outcome. SIGINT/SIGTERM shuts down the task-owned application and database; unexpected app exit also triggers cleanup. Failed tests retain the fixture for diagnosis; they never claim acceptance.

Installed PG17 on this Mac needs `LC_ALL=C`; the first clean-environment baseline stopped before server startup without it. The runner now supplies that locale explicitly. No global PATH, service or PostgreSQL installation changes are made.

Focused baseline from a short fresh committed snapshot:39 HTTP tests, migration/RLS verification (91 migrations,199 protected tables),14 browser tests and OS production build PASS. This is focused workspace evidence, not full-platform CI.

## Acceptance evidence

Final candidate:40 HTTP tests and18 desktop/mobile browser tests PASS. The production build, TypeScript and formatting checks PASS. The browser run completed in3.1 minutes. All boundaries in the local story were exercised. Tests include actual local browser→API→PostgreSQL→new-session recovery; lost save acknowledgement retry without duplicate records; historical fetch failure/retry; catalog failure/recovery; source-version invalidation; private membership withdrawal; anonymous401; unrelated-member404; and **one verified actor in two real tenant contexts**, with API read/review/foreign-source denial and direct authenticated-RLS isolation. No test uses hosted credentials or claims synthetic model output is a real provider run.

The initial new tenant test needed an explicit original-tenant cookie after adding the second membership. Its inaccessible foreign source correctly returns409 `Lead changed` under migration0089 rather than404; the test now reflects that contract and proves no mutation. Early browser assertions were narrowed from hidden select options to rendered message paragraphs; the record-type selector now has an exact accessible label. The runner includes schedule HTTP fixtures required by the older catalog pagination browser test.

Logs: `/tmp/kxra-private-baseline.log`, `/tmp/kxra-private-candidate-3.log`, final acceptance log recorded below, `/tmp/kxra-private-typecheck.log`, `/tmp/kxra-private-build.log`. Screenshots/traces contain synthetic local records only and remain private local test evidence.

## Launch-critical gaps

This is an implemented local persistent CRM/workspace slice, not hosted readiness. Staging recovery scope/token-record exclusion remains unanswered; fresh safe backup/restore and83–91 migration acceptance are still required before the existing holds can be restored. Real hosted session/MFA and two-tenant checks, providers/workers/scheduler/scanning/key recovery and connector expiry/revocation/retry remain separately unaccepted. Other five public app templates and the native agent bridge are still not operational models. Billing remains inactive, with commercial/provider decisions and real test-mode lifecycle evidence outstanding.

## Preview and supporting paths

Private workspace: http://127.0.0.1:3279/os/workspace (local fixture identities, choose partner for the accepted CRM rooms). Selected accepted CRM route is recorded in `.runtime/reference-workbench/preview.json`. Internal screenshots `private-workbench-desktop.png` and `private-workbench-mobile.png` in that directory were visually inspected; they contain synthetic records and are not uploaded or shared.

Public new-build preview remains http://127.0.0.1:3277. These loopback URLs work on the connected Mac only; they are not hosted previews.

Final fixture receipt: `/var/folders/1b/rx87jbks7ysd9v3n0dgym53w0000gn/T/kxra-wb-5SpOa3/reference-workbench.json`. Final HTTP40PASS; browser18PASS. Final production build `/tmp/kxra-private-build-final.log` and typecheck `/tmp/kxra-private-typecheck-final.log` PASS. Final fixture acceptance log `/tmp/kxra-private-final.log`.

Reference API guidance checked against [Next15 useSearchParams](https://nextjs.org/docs/15/app/api-reference/functions/use-search-params) and [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). No auth/RLS implementation or schema changed in this batch. The Supabase changelog Markdown endpoint was not readable through the web fetcher; no new Supabase feature or client version is introduced.

The fixture receipt confirms `HTTP and browser PASS`; the preview is retained. Process IDs are ownership hints only: verify current health/run ID before stopping. The application listener may be a child of the recorded Next controller. React checklist reviewed: URL-derived selection, effect cleanup, no new shared server state, stable keys, scoped current-room data, accessible search/tabs/status and no new dependency.
