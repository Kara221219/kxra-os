# Brand source acquisition staging activation

Do not activate this worker during core staging bootstrap. Complete hosted Auth/RLS/private-public separation first. This playbook never authorizes production use or publication.

## Owner/provider checkpoint

1. Create a separate server-only PostgreSQL login that may `SET ROLE kxra_brand_source_worker`. It must not be a superuser, schema/table owner, `service_role`, `postgres`, `supabase_admin` or `BYPASSRLS` role.
2. Store its TLS-required connection string as `KXRA_BRAND_SOURCE_WORKER_DATABASE_URL` in the worker service secret store. Never place it in the OS browser environment, marketing project, chat or Git.
3. Run the worker in a separately reviewable Trigger.dev task or equivalent controlled service with outbound HTTPS only. Deny private/link-local networks at the infrastructure layer as defense in depth.
4. Set `KXRA_PUBLIC_WEB_ENABLED=true` only in that worker service. Keep it false in both Vercel applications.
5. Start with one job per invocation using `npm run worker:public-web`. Do not use watch mode until leases, retries, concurrency and monitoring pass staging acceptance.

## Acceptance

- A permitted project member can queue the exact current website source; viewer, revoked, unassigned, cross-tenant and crafted IDs fail.
- The worker cannot select application tables or execute unrelated functions.
- Public HTML and text succeed through hostname-valid TLS and create one immutable external-research version.
- Loopback, RFC1918, link-local, metadata, reserved IPv4/IPv6, mixed public/private answers and private redirects never reach transport.
- Oversized, empty, compressed, unsupported, redirect-loop, timeout and malformed responses produce bounded visible failure evidence and no source version.
- Killing the worker after claim allows lease recovery without duplicate versions. Changing the source before completion cancels the job.
- Logs, traces and telemetry contain only opaque job IDs, bounded reason codes, timings and counts; no source text, locator query secrets, database URL or identity data.
- Disable the flag and revoke/rotate the worker login to roll back. Existing source versions remain immutable and available under normal project RLS.

Record the staging deployment ID, worker identity, egress policy, test results, reviewer and rollback exercise in acceptance evidence before considering hosted AT-35 complete.

