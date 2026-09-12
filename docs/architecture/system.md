# Implemented architecture

Status: local vertical slice. Baseline: preserved Genesis brief; current user instructions take precedence. The message's approved-brief block was an empty placeholder, so the existing full saved brief was used. This is recorded as an implementation assumption, not newly asserted owner approval.

## Request and trust flow

Browser → Next.js route or server component → verified principal → active KXRA member → PostgreSQL transaction → `SET LOCAL ROLE authenticated` + verified subject/assurance claims → RLS → scoped response. Mutations require the configured same-origin header and bounded validated inputs. Anonymous role exists for database negative tests; protected HTTP endpoints reject unauthenticated callers.

Supabase mode verifies `getUser()` with the authentication server, then matches signed claims to the returned subject. Middleware refreshes cookies; it is not an authorization boundary. All handlers independently authorize. Local fixture mode requires explicit selection, nonproduction, no Vercel, exact loopback origin, runtime directory, no hosted database/Supabase URL, and a generated signing secret. Never deploy fixtures.

The application DB login must be NOINHERIT, NOBYPASSRLS, not superuser, not table owner and a member only of `authenticated`/`anon`. No service-role API client is present. Verified subject claims are set server-side, never taken from a request body. Every transaction resets on completion; pooled connections cannot retain a prior request identity.

## Schema

`organisations`, `members`, `projects`, `project_memberships`, `records`, `record_versions`, `files`, `approvals`, `audit_events`, `whatsapp_pairings`, `inbound_events` are real PostgreSQL tables with RLS enabled. Foreign keys bind membership and file metadata to the same organization/project. Dedicated tables cover access, files and approvals. The first slice uses a typed record register (`kind` enum plus JSONB fields) for the operating registers. This is a deliberate incremental simplification of the fuller brief: advanced experiment, ledger, scoring and execution tables remain future migrations.

All new evidence has one of the nine required classifications. New user records are drafts; edits increment a version and append a snapshot/audit event. Record identity, author, organization, project, kind and visibility are immutable. This prevents changing a record's access class and inadvertently publishing historical private versions. Sharing an existing private record requires a future explicit reviewed-copy workflow; no hidden switch publishes it. Accepted records cannot be edited in place.

Projects contain stage/status/next action and nullable scores. No client update grant exists for project gates or scores. `live_execution_enabled` has a database constraint requiring false. Product creation is false and has no available execution route.

## Approval architecture

Only owners create/read approvals. The server validates typed acceptance/membership payloads, stores the exact payload and hash, and applies a 24-hour expiry. Only current owner AAL2 can approve/reject or execute. Narrow functions lock the approval and target; acceptance checks exact record version and scope, while execution consumes the approval once. Membership changes increment access_version; current database membership checks enforce revocation immediately even with a still-valid session. `publish`, `spend`, `deploy` have no executor. Synthetic AAL2 is a local test fixture, not real MFA.

## Knowledge and AI

Full-text search runs inside the current principal's RLS transaction. Both global search and explicit project search are filtered before producing the evidence envelope. Explicit inaccessible scopes return the same unavailable response as missing resources. Ask KXRA returns excerpts with record ID, classification and version. It does not call an LLM. Attachments stay outside context in quarantine. No vector store, autonomous memory or cross-project cache exists.

AI Team, Skills and Routines are persistent definitions imported from source; generic record forms allow definitions to be maintained. The future hierarchy is Owner → Chief of Staff → COO/CFO Analyst/CMO/CTO → useful specialists. Run execution and job dispatch are disabled; an empty run register does not indicate agents are working.

## Stack retained

Next.js/TypeScript is implemented. PostgreSQL RLS is implemented locally with Supabase-compatible auth helpers; Supabase Auth adapters exist. Vercel, hosted Supabase Storage, Trigger.dev, Resend, PostHog, Sentry, Cloudflare and GitHub hosting/deployment are retained target services but unconnected. No fashionable substitute was introduced. The local database is a development test environment, not a replacement production provider.

## Public website

An original typography-led ivory/forest-green page describes the venture approach and invites contact via the user-provided public email. No customer logos, revenue claims, fabricated case studies or cloned reference artwork. No telemetry or form sends. Private data is never passed to public components. Publication remains prohibited.
