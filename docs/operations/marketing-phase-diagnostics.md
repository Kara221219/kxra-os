# Bounded marketing phase timings

The published 3817ddc CI run 40193968781 passed 902 service checks and 98
private-browser cases (six skips), then the mobile reference baseline exceeded
its existing 30-second case limit. Marketing reported 60 passes, one failure,
one skip. The available sanitized summaries do not locate the failed marketing
action. Three unchanged local mobile repetitions passed; the remote cause is
unproven.

The diagnostic-only revision 310886b added wrappers. All 101 original browser call ASTs
and their arguments remain in order, with the same assertions, route inventory,
responsive widths and screenshot. Marketing configuration and its 30-second
budget are unchanged. Wrappers add synchronous capture and an awaited function
boundary; they do not add retries, sleeps or longer budgets.

At most 60 capture attempts per case emit fixed JSON to ordinary test stdout.
That original combined journey used 22 timed actions, at most 44 records. Allowed fields:
fixed kind/phase/state, validated ordinal 0–9, elapsed milliseconds, test-worker
RSS MiB, machine free MiB and one-minute load. Numeric values are bounded or
null. No URLs, browser content, errors, environment, credentials, action results
or arbitrary snapshot properties are serialized. No new artifact destination,
retention, raw trace export or network capture is added. Any future publication
must disclose the additional stdout fields.

Capture exceptions never replace action results or original exceptions. Invalid
phase/ordinal configuration rejects before the action. Initial clock failure
produces unknown elapsed time. Unit tests cover privacy, each failing capture
port, invalid inputs/readings, bounded capture and actions after cap exhaustion.

Local validation: eight focused tests and full typechecking passed. Two desktop
and two mobile instrumented cases passed; measured in-test totals were
8.85–11.82 seconds, slowest individual phase 2.65 seconds (mobile screenshot).
This is not controlled evidence of the remote environment or a complete remote
pass, and does not prove absence of a product defect. No application, migration,
dependency, workflow, quota, timeout or assertion was changed. Development-server
generated configuration edits are excluded from this diagnostic candidate.

## Subsequent partition proposal

Exact 310886b CI run 40204222793 passed 910 service checks, service restart and
empty-target restore, and 98 private-browser cases with six skips. Development
marketing reported 60 passes, one timeout, one skip. Later remote build,
browser-recovery, performance and audit gates were not reached. Every timing
phase, including the final error assertion, logged PASS, but the mobile body
used 31.98 seconds against its 30-second case limit: ten catalogue navigations
used 20.80 seconds, screenshot 5.15 seconds, integrations 3.93 seconds. This
supports cumulative duration; it does not establish a product defect or resource
exhaustion.

The proposed test partition gives the UI/sample/integration journey and the
catalogue inventory separate cases. Each retains 30 seconds, but the combined
allowance increases from 30 to 60 seconds per viewport. This is a deliberate
test-design change, not a claim that the aggregate budget is unchanged.

All original assertions, route order and default full-load navigations remain.
Catalogue starts at the preceding responsive loop's final 1440x950 viewport,
with inherited project device semantics. Both cases assert page errors. The
fresh catalogue context no longer inherits sample state, navigation history,
cookies/storage or cache from the UI case; combined-context continuity coverage
therefore changes. No product repair is claimed. Current instrumentation emits
at most 24 UI records and 22 catalogue records per viewport; field restrictions
and the 60-attempt per-case capture cap are unchanged.

Eight focused browser executions, eight helper tests, full typechecking and
formatting passed locally. Independent source review accepted the disclosed
partition. The final combined source has no complete suite or remote pass yet.
Application, migration, dependency, workflow and hosted state are unchanged.
