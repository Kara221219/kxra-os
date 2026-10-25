# Local synthetic diagnostic implementation

This locally prepared change implements a strict collector/exporter and its CI,
reporter and test integration. No source publication or external upload has been
performed. The prepared workflow would retain only validated synthetic JSON for
one day after failure, and only if export succeeds. Raw Playwright artifacts stay
runner-local. Application behavior, SQL, credentials and provider settings are
unchanged.

## Integration contract

The plain Node core is `scripts/safe-ci-diagnostics-core.mjs`. Node 22.22.3 was
verified to import its existing TypeScript local-fixture guard directly; Node
may emit a static module-type warning. No loader or package configuration change
was made. `tests/support/safe-ci-diagnostics.ts` provides the typed test API.

After the harness has created its fresh isolated synthetic database and read the
matching loopback health response, call:

```js
mintDiagnosticsAttestation({ root, environment, health, freshFixture: true, metadata });
```

`metadata` has only `sourceSha`, `githubRunId` and `githubRunAttempt`. The SHA must
equal local repository HEAD; in GitHub context all three values must also match
the exact GitHub environment identity. Health must be exactly the KXRA service
and generated fixture-run UUID, matching the guarded environment. Only known
environment properties are read; secrets are neither enumerated nor serialized.

Minting occurs once in the private runtime, creating `safe-ci-diagnostics` and
its private attestation file. Reusing an existing attestation directory fails.
The attestation is a procedural assertion by the reviewed fixture creator, not a
cryptographic proof of database provenance or permission to copy hosted data.
Freshness describes the runtime/database at initial attestation, not a pristine
DB for each test. Service and browser fixtures subsequently accumulate within it.

Tests call `createSafeDiagnostics` with the same root/environment/health/metadata
plus fixed suite, viewport and ordinal. `record` accepts only the typed strict
event union; `finish` accepts fixed outcome/failure categories and writes once.
Record monotonic integer elapsed milliseconds. Do not pass raw exceptions,
network headers/bodies/URLs, DOM text, test titles, filenames or customer data.
Resource fields are bounded numeric measurements only; they do not allow process
names, process lists or environment dumps. RSS/heap/CPU are for the current Node
process, not aggregate Chromium/Next/PostgreSQL or the whole job. OS load and free
memory are host-level. These measurements cannot by themselves prove absence or
presence of resource pressure.

`OTHER` suite and `TEST_RESULT` events support a generic failures-only reporter
without copying test titles or paths. Source line is a bounded public integer.
Reporter ordinals 48–63 can be reserved by the caller; this is a naming convention,
not an additional file allowance.

The generic CI reporter can use `writeHarnessDiagnostics` after child exit. It
requires the original private attestation and exact GitHub identity, not the
fixture session secret or a live server. Its fixed harness-stage union accepts
no command, exception or log text.

## File and export boundaries

- At most 64 events and 16 KiB per summary; at most 15 targeted summaries plus
  one reserved harness summary, 16 files and 256 KiB total.
- File names derive only from fixed suite/viewport enums and bounded ordinals.
- The runtime and diagnostic directory must be owned/private directories;
  regular files must be owned/private, single-link and size-bounded. File opens
  use `O_NOFOLLOW`, descriptor metadata checks and exclusive creation.
- Runtime/child identity and attestation are rechecked around persistence and
  export. Observed directory/attestation changes, unknown files or properties,
  nonfinite/out-of-range values, binding drift and symlinks fail closed.
- These protections assume a private, quiescent, reviewed runner. They are not a
  general sandbox against malicious approved code or a concurrent hostile process
  running as the same OS user; no portable Node path API can provide that claim.

After verification exits, the proposed exporter command is:

```sh
node scripts/export-safe-ci-diagnostics.mjs
```

It accepts no arguments. It reads only `.runtime/ci/safe-ci-diagnostics` and
creates a new `safe-ci-diagnostics-export` under its own repository. It requires
the exact GitHub SHA/run/attempt and rejects hosted environment markers. It
revalidates every summary and all bindings before creating output; only parsed,
allowlisted JSON is copied. Existing output is never overwritten or cleaned.
No raw-artifact fallback exists. Errors emit only a fixed rejection code.

A filesystem error during output creation can leave partial but already validated
JSON. A future reviewed upload step must require the export step's **success**
outcome, not directory existence or `failure()` alone. Failure of diagnostics
must preserve the original verification/test error; callers must catch and
separately mark diagnostics failure. They must never replace the original failure
with a successful result, skip its assertion or upload raw files instead.

The locally prepared workflow pins official actions/upload-artifact v7.0.2 to
cf430e030ddbb5b0abf93d22962f4752f3646cd9 and uploads only the fixed nonhidden
safe-ci-diagnostics-export/*.json directory on exporter success after failure.
Retention is one day, hidden files are excluded, overwrite is disabled and missing
files fail. The action definition/tag was checked through official GitHub API
metadata. No job timeout, permission or retry setting was changed. Exact source
publication and this future retention action still require owner approval.

The core and exporter make no network calls. Integrated helpers perform bounded
loopback health and canonical fixture reads; they make no provider/external
requests. Case source identity is tracked passively from the exact save request
and existing rendered Stage/Revision marker. No canonical warm-up or awaited
sampling occurs before the original five-second waiter starts. UI/canonical
sampling occurs only after a proposal failure or at test end, bounded to 1.5s.
All instrumentation has some observer effect and is not a proven remote repair.
The 90-second case limit and original five-second wait-before-click remain.
Failure categories label where an exception is observed; event chronology is
needed to determine where the timer actually expired.

The generic reporter records only fixed suite/viewport enums, a public source-line
integer, outcome and numeric resources for unexpected private-test failures.
It never copies titles, paths, errors or attachments. Harness summaries record
fixed stages and exit codes while retaining the original failed command/result.
Later standalone dependency-audit steps remain separate from the disposable
verification summary. Capture rejection emits a fixed warning only; export never
falls back to raw evidence or an existing output directory.

Evidence availability is bounded: failures before attestation, abrupt process
termination/job cancellation, or a rejected capture/export can yield no summary.
This does not justify a raw-artifact fallback or a successful verification result.
