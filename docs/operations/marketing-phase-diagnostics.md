# Bounded marketing phase timings

The published 3817ddc CI run 40193968781 passed 902 service checks and 98
private-browser cases (six skips), then the mobile reference baseline exceeded
its existing 30-second case limit. Marketing reported 60 passes, one failure,
one skip. The available sanitized summaries do not locate the failed marketing
action. Three unchanged local mobile repetitions passed; the remote cause is
unproven.

This change adds diagnostic wrappers only. All 101 original browser call ASTs
and their arguments remain in order, with the same assertions, route inventory,
responsive widths and screenshot. Marketing configuration and its 30-second
budget are unchanged. Wrappers add synchronous capture and an awaited function
boundary; they do not add retries, sleeps or longer budgets.

At most 60 capture attempts per case emit fixed JSON to ordinary test stdout.
The current journey uses 22 timed actions, at most 44 records. Allowed fields:
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
