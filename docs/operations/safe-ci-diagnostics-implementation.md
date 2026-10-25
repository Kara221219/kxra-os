# Local synthetic diagnostic implementation

This change implements a local collector and validating exporter. It does not
change CI, publish source, upload artifacts, collect raw Playwright traces or
change any application, database, credential or provider configuration.

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

Tests call `createSafeDiagnostics` with the same root/environment/health/metadata
plus fixed suite, viewport and ordinal. `record` accepts only the typed strict
event union; `finish` accepts fixed outcome/failure categories and writes once.
Record monotonic integer elapsed milliseconds. Do not pass raw exceptions,
network headers/bodies/URLs, DOM text, test titles, filenames or customer data.
Resource fields are bounded numeric measurements only; they do not allow process
names, process lists or environment dumps.

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
creates a new `.safe-ci-diagnostics-export` under its own repository. It requires
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

Any workflow integration, immutable upload-action pin, one-day retention and
external upload still require exact review/approval. Current code performs no
network calls and no external upload. Root owns integrated browser/harness
acceptance; this worker runs synthetic filesystem/schema tests only.

Evidence availability is bounded: failures before attestation, abrupt process
termination/job cancellation, or a rejected capture/export can yield no summary.
This does not justify a raw-artifact fallback or a successful verification result.
