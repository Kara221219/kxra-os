# Local operations

Final Milestone 1 uses deterministic local Auth, email and PostgreSQL adapters. They provide executable contract evidence without contacting Supabase, Resend or another provider.

## Start

Run from the repository root:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3210`; the exact loopback host matters. Startup creates an isolated Unix-socket PostgreSQL database, applies additive migrations, imports the seven projects plus classified required registers and runs the deterministic private-file worker beside Next.js. Existing runtime data is preserved. Local fixture accounts, Auth state, private objects, outbox captures, signing secrets and preview logs live under ignored `.runtime` paths.

The independent public application runs separately:

```sh
npm run dev:marketing
```

Open `http://127.0.0.1:3220`. To exercise form storage outside the hermetic test runner, set the exact `KXRA_MARKETING_ORIGIN`, a generated 64-plus-character `KXRA_PUBLIC_INGRESS_SECRET`, `KXRA_PRIVATE_APP_URL` and a dedicated least-privilege `KXRA_PUBLIC_DATABASE_URL`. Never reuse the private OS connection. `npm run test:ci` supplies an isolated local equivalent automatically.

Database binaries default to Homebrew PostgreSQL 14. Set `KXRA_PG_BIN` to the directory containing `initdb` and `pg_ctl` elsewhere. Filesystem access to the cluster is equivalent to local administration; never put real credentials or production data in it.

## Account workflow

The development login lists clearly labelled synthetic identities. Owner partner administration can create a fake multi-project invitation and inspect its fake outbox delivery. The link enters `/join`, where the invited synthetic user creates their own password, verifies email and completes the nine-step wizard. Resend/revoke, reset/change password, fake MFA, session revoke, assignment changes and lifecycle controls are available for local acceptance.

Invitation/verification/reset values are displayed only by the local test surface where necessary to complete deterministic tests. They are not production behavior. Never copy fake proof values, fixture accounts or runtime state into a hosted environment.

## Verify

Keep the preview running for HTTP and browser suites:

```sh
npm run check
npm run format:check
npm run test:restart
npm run test:e2e
git diff --check
```

`npm run check` performs TypeScript checking, all database/domain/HTTP tests, exact public snapshot/source checks, both production Next.js builds and artifact/secret scans. The artifact scan rejects 21 known fixture, private-source, customer, state and secret markers. A clean optimized build is required; do not treat a development bundle as the production artifact.

Install the browser once with:

```sh
npx playwright install chromium --only-shell
```

If a combined E2E run is interrupted by a terminal/session limit, run the two specs separately and record both results:

```sh
npx playwright test tests/e2e/workspace.spec.ts
npx playwright test tests/e2e/accounts.spec.ts
```

The account spec includes a complete owner-to-partner flow, mobile interruption/resume and responsive/keyboard checks. Representative 1440, 768, 390 and 320 layouts plus 200% zoom reflow were manually inspected for the milestone. Screenshots and Playwright artifacts remain ignored because the repository publication rule allows code, documentation and required seeds only.

Run `npm run test:restart` after `npm test`. It snapshots the retained synthetic AT-08 graph plus file versions, chunks and processing jobs under the application RLS role; hashes every registered private object; restarts only this workspace's cluster; and compares the complete manifest and hashes. It never resets the database. `npm run db:stop` stops only this cluster. Destructive reset is intentionally disabled.

The worker can also be run explicitly:

```sh
npm run worker:files
npm run worker:files:reconcile
```

These commands use the fixture scanner/extractor only inside guarded local mode. The adapter deliberately refuses production/Vercel execution. It recognizes a bounded test set and does not replace a production malware service or extraction sandbox.

## Routine evidence

The owner **Routines** screen displays the nine typed manifests. They are imported as draft and disabled. Exact owner approval is required before enablement; the local UI can then plan one reviewed schedule date. Planning writes an authoritative queued run but does not start an always-on worker, Trigger.dev task or external delivery.

Routine worker contracts are exercised by `tests/routines.test.ts` under the dedicated `kxra_routine_worker` role. Do not use the application login or a browser session to claim, checkpoint, complete, recover or requeue runs. Notification records are intents only and remain `DISABLED` / `NOT_SENT`.

## WhatsApp evidence

The owner/partner WhatsApp screen is a redacted status surface. Authenticated challenge creation returns a synthetic one-use code, but provider completion/ingress functions are executable only under `kxra_whatsapp_worker`. Local SQL and HTTP tests exercise exact pairing, project scope, deduplication, media consent, revocation and disabled outbound intents. There is no local Meta webhook or sender, and no real phone, token or message should be used.

## Environment boundary

`.env.example` lists hosted target variables with placeholders only. `npm run dev` creates guarded local configuration. Fixture mode rejects production, Vercel, non-loopback, hosted Supabase/database combinations and weak/missing generated secrets. Default production package conditions resolve local Auth/UI modules to stubs; hosted Auth must be configured for real use. Hosted file processing additionally needs a private Storage bucket, a server-only Storage secret, a restricted worker database connection, a trusted scanner and a disposable no-network extractor. None is connected by local setup.

The application role must never own tables, bypass RLS or use a Supabase service/admin connection as `DATABASE_URL`. A local test pass does not authorize provider setup, external email, deployment or production data.

If the preview becomes unresponsive after a tool restart, identify the exact listener before terminating it. Do not kill unrelated Node or PostgreSQL processes.
