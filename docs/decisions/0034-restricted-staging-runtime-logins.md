# ADR 0034 — Restricted staging runtime logins

Date: 27 September 2026
Status: accepted

## Decision

Core staging uses two separate PostgreSQL login roles created only after the managed schema and canonical seeds pass:

- `kxra_app` is `LOGIN`, `NOINHERIT`, `NOBYPASSRLS`, limited to 20 connections and may assume only `anon` or `authenticated` inside a request transaction.
- `kxra_public_ingress` is `LOGIN`, `NOINHERIT`, `NOBYPASSRLS`, limited to five connections and may assume only `anon`.

Neither role owns objects, receives direct object grants, carries role settings, creates roles/databases, replicates or receives superuser authority. The application always sets its bounded request role explicitly; the public marketing ingress now does so in hosted and local execution.

The operator requires the exact Supabase target, clean pushed branch, distinct high-entropy passwords and a separate confirmation phrase. Passwords are transmitted as bound query values into transaction-local settings, used for `ALTER ROLE`, and are never written to Git, tracking rows or output. Each application preflight requires its exact runtime username.

## Consequences

- A leaked public-ingress credential cannot assume `authenticated` or read private context.
- A database URL using an arbitrary low-privilege user no longer passes application preflight.
- Password rotation repeats the guarded apply operation and records only role names, profile, commit and time.
- Worker logins remain absent until their individual capability playbooks are authorized.
