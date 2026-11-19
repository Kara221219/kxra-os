# Independent launch QA

Run from a clean isolated clone at the candidate SHA, with Node 22+, `npm ci`, native PostgreSQL 17 and installed Playwright Chromium. Never run against the shared desktop checkout. No environment files may be present in the repository root or any application directory. Do not copy real credentials into this checkout.

```sh
node --test tests/launch-qa/runner.test.mjs
node tests/launch-qa/run.mjs contracts
KXRA_PG_BIN=/opt/homebrew/opt/postgresql@17/bin node tests/launch-qa/run.mjs services
KXRA_PG_BIN=/opt/homebrew/opt/postgresql@17/bin node tests/launch-qa/run.mjs full
```

`contracts` executes the existing injected-transport/fake-identity checks for recovery/MFA/admission, payment evidence, signed webhook rejection, uncertain customer/checkout dispatch, worker scope, model protocol/SSRF/vault boundaries, terms, telemetry and production bridge fencing. It is deliberately a fast diagnostic subset, not end-to-end acceptance.

`services` runs the unmodified CI service phase: fresh isolated PostgreSQL/HTTP fixtures, all service/security/concurrency tests, migration/RLS verification, persistence and empty-target restore. It includes real local database transactions rather than replacing authorization with mocks. `full` runs the existing entire CI harness, including the service phase, a separate fresh browser database, desktop/mobile private and development/optimized marketing browsers, browser restart/restore, all builds, publication/secret/artifact/CSP/budget checks and Lighthouse. Existing explicit project skips must be reviewed in the child log. Do not relabel them as coverage. No stages or assertions are removed.

When `KXRA_PG_BIN` is explicit, the runner also prepends it to the child PATH so dump/restore tools match the database engine. The wrapper passes only a narrow process environment and rejects automatically loaded Next environment files. It creates mode-0600 local logs and a JSON receipt under ignored `.runtime/launch-qa/<uuid>/`. Receipts identify HEAD, dirty status, command scope, time and exit status. A dirty run is not exact-commit acceptance. Raw logs remain private; publish only a reviewed numeric summary. The wrapper never sends provider requests itself, controls a shared browser, pushes, deploys, changes a feature flag or upgrades dependencies.

The original CI harness requires loopback listening; a restricted environment may need execution approval. A sandbox failure is a failed attempt, not an application failure. It must be retained alongside the successful retry. Full synthetic acceptance always retains `hostedAcceptance: NOT_RUN` and `customerReady: false` because provider identity, delivery, production data/configuration, settlement and customer support need separate evidence.

Integration inputs: supply the exact integrated SHA (auth recovery, billing and design together), dependency lockfile, expected migration count/hashes, intended product/plan and bounded workflow acceptance scope. Include any new test filenames in the contract subset only if they are pure injected/mock tests; all `.test.ts` tests are already included in service CI. First run service acceptance, then full; keep all receipts and reconcile every failure/skip. Provide the release owner with commit-bound hosted acceptance results listed in `docs/operations/launch-qa-2026-10-30.md` separately. Never request or exchange secret values.

The full mode also runs delivery and maintenance native suites in two separate serial generated fixtures, preserving the original seed actor's daily quota. Services-only is the original service/restart/restore phase, not acceptance of those additional operations phases. Each operations dataset must pass its own retained-state restart and empty-target restore proof. No original browser or recovery case is replaced.
