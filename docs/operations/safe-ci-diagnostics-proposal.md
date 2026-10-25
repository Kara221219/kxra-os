# Proposed synthetic CI failure evidence

This is the historical review proposal. A local implementation and prepared workflow now exist; see `safe-ci-diagnostics-implementation.md`. Public source publication and external artifact retention remain unapproved. The
failed 5821ad8 run produced runner-local Playwright traces but uploaded zero
artifacts. Raw traces can contain credentials and response bodies even when the
test data is synthetic. Do not upload `test-results`, trace ZIPs, screenshots,
server logs, SQL, environment files or runtime/backup directories.

## Minimal proposed implementation

1. `tests/support/safe-ci-diagnostics.ts`: accept a strict event union containing
   only monotonic elapsed milliseconds; fixed endpoint categories (`detach`,
   `knowledge`, `workspace-render`); fixed methods; HTTP status integers; request
   ordering; and booleans/counts for active attachments, download availability,
   empty-list visibility and mutation/render completion. No arbitrary strings,
   headers, cookies, query strings, bodies, IDs, filenames, DOM text, exceptions
   or console messages are accepted. Bound events, counts and total size.
2. Enable capture only after the existing `localModeConfiguration` guard passes,
   exact loopback origin is verified, health identity matches the generated run
   UUID, and the fixture creator attests that it created fresh synthetic data.
   Capture must fail closed on any hosted/environment/run mismatch. Do not read
   backup files, broad environment dumps or unrelated runtime content.
3. `scripts/export-safe-ci-diagnostics.mjs`: validate the strict union again and
   export only regular files in a new dedicated, private directory. Reject
   symlinks, traversal, unknown fields, unexpected names, excessive file counts
   and bytes. Refuse to export on any validation or scope failure. Exact commit,
   GitHub run ID and attempt must match approved metadata; artifact names contain
   those identifiers only, not customer or fixture text.
4. A separately approved `.github/workflows/ci.yml` change could upload only
   this validated directory on failure with an immutable action commit, one-day
   retention and `if-no-files-found: error`. Validation precedes upload. Failure
   to create safe diagnostics must preserve the original failed verification
   outcome and must never fall back to raw artifacts. No additional job timeout,
   assertion relaxation, remote rerun or hosted credentials are proposed.

## Required proof before workflow review

Negative tests must show that poisoned headers, bodies, queries, text and errors
cannot enter exports; hosted/non-loopback/missing-attestation runs are refused;
run/SHA mismatches, unknown fields, oversized data, symlinks and traversal fail
closed. A synthetic failed test must produce usable bounded timing and state
evidence without any fixture secret, cookie, URL payload or raw trace content.

The local implementation records only strict structured synthetic evidence and can export validated JSON locally. Its prepared workflow performs no external upload until the exact source is approved and executed in CI. Publication and retention effects require that review.
