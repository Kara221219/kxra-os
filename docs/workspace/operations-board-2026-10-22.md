# Persistent room operations board

Local follow-on to the reference workbench and getting-started slice,22October2026. This changes the room Tasks UI over the existing persisted room items/decision APIs. It adds no new database schema, external executor, connector or commercial capability.

Four columns show proposed, approved, completed and declined work with recorded revisions, loaded-record search, an explicit empty state and a contained keyboard-focusable horizontal scroll area. Only the room creator sees decision controls; every write still checks current server membership and exact item version. Failed transport leaves the task in its recorded stage. Proposals do not execute external actions. Responsibility remains explicit text in the existing title, not a newly invented assignee relation.

Prepared acceptance checks proposal persistence, a503 decision failure followed by retry, exact-version approval, stale-version409, member visibility without creator decision controls with non-creator409 (the existing generic stale-or-unavailable decision contract), completion/reload/search and360–1440 layout. Existing workspace acceptance exercises the separate global approvals/tasks path. Production build passes; browser results will be recorded when completed.

No hosted migration/deployment, live provider, paid call, credential operation or staging-hold change. Public marketing665a6c0 stays unchanged. All provider/readiness/recovery gates in activation-and-billing-2026-10-22.md remain applicable.

## Accepted result

`/tmp/kxra-operations-browser-final.log`: **6/6 PASS**, desktop/mobile board and existing workspace/history journeys, including failed-decision retry, actual persisted approval/completion, stale-version conflict, non-creator authority denial with unchanged state/version, reload/search and360/390/768/1024/1440 containment. The initial run found mobile intrinsic grid overflow blocking the proposal button; the component now has a min-width-zero single-track wrapper and bounded scroll container. No forced clicks or skipped layout assertions were used. An initial test incorrectly expected403 for non-creator decisions; the established SQL transaction returns a generic409 for stale or unavailable decisions. The corrected test requires that exact error and confirms the task remains APPROVED at revision2.

`/tmp/kxra-verified-private-build.log`: final combined source production OS build PASS. Scoped Prettier and diff whitespace checks PASS. Source-matched isolated harness `/Users/kara/Documents/Codex/2026-10-19/task/kxra-operations-acceptance-i9_vrz9b`; its local-only Next root override encloses the shared dependency link. Preview `http://127.0.0.1:3283/os/workspace`, runtime `/var/folders/1b/rx87jbks7ysd9v3n0dgym53w0000gn/T/kxra-wb-b1urc0`, nonsecret identity receipt `reference-workbench.json`. Fixture data is retained. Original candidate Next configuration and the denied generated tsconfig restoration remain untouched.

Actual local persistence and server checks are accepted; external actions, AI results and billing providers are not established by this board. This is a room task board, not completion of the five remaining operational app models or the native bridge.
