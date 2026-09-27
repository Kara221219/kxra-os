# ADR 0032 — Hash-bound staging database migrations

Status: accepted for staging preparation. No hosted database has been connected or changed.

## Decision

KXRA applies the ordered migration directory to the first Supabase staging database through one guarded operator command rather than manual SQL-file copying. The workflow supports `plan`, `apply` and `verify` and records every filename, exact SHA-256 digest, source commit and application time in `public.kxra_schema_migrations`.

The operator workflow runs only from a clean, pushed `codex/phase-2-completion` checkout with `KXRA_ENVIRONMENT=staging`. It accepts only the declared 20-character Supabase project, the direct endpoint or session pooler on port 5432, the `postgres` migrator identity, database `postgres` and `sslmode=verify-full`. It rejects Vercel execution, transaction pooling, extra connection options, another host, another database and production targets. Applying requires the exact `APPLY:<project-ref>:codex/phase-2-completion` confirmation.

Each migration and its tracking row commit atomically under one session advisory lock. A failed migration rolls back and a rerun resumes from the exact recorded prefix. Unknown files, changed historical hashes, an existing untracked `kxra` schema or source-count drift stop before another migration runs. Verification requires all source migrations, 171 RLS-protected tables with policies and 146 exposed `kxra` functions.

The operator connection is short-lived and never belongs in Vercel. The script does not print the connection URL, password or query parameters. Application and public-ingress logins are configured separately after migration and must remain non-superuser, non-bypass and least privilege.

## Consequences

- Staging schema application is reproducible, resumable and tied to reviewed source.
- Manual partial application and silent historical migration edits fail closed.
- The workflow cannot target production or run from a hosted application.
- A real Supabase staging project and operator connection remain owner-supplied dependencies.
- Seeds, runtime login passwords, owner bootstrap and production release are separate controlled steps.

## Evidence

`scripts/staging-migrations-core.mjs`, `scripts/staging-migrations.mjs`, the three `staging:db:*` commands and `tests/staging-migrations.test.ts` cover manifest continuity, exact hashes, project/endpoint/identity restrictions, apply confirmation and corrupted/unmanaged history.

The endpoint rules follow Supabase's official [database connection](https://supabase.com/docs/guides/database/connecting-to-postgres) and [Postgres role](https://supabase.com/docs/guides/database/postgres/roles) documentation.
