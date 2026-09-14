# Implemented architecture

Status: working local milestone through the first reviewed operating loop and project gates. Reviewed implementation commit: `0c20de47fe1f6cb38646db51c4a90650679aacd7`. The preserved private Genesis brief remains the baseline; current user instructions take precedence.

## Request and trust flow

Browser → Next.js route or server component → verified principal → active KXRA member → PostgreSQL transaction → `SET LOCAL ROLE authenticated` + verified subject/assurance claims → RLS → scoped response. Mutations require the configured same-origin header and bounded validated inputs. Anonymous role exists for database negative tests; protected HTTP endpoints reject unauthenticated callers.

Supabase mode verifies `getUser()` with the authentication server, then matches signed claims to the returned subject. Middleware refreshes cookies; it is not an authorization boundary. All handlers independently authorize. Local fixture mode requires explicit selection, nonproduction, no Vercel, exact loopback origin, runtime directory, no hosted database/Supabase URL, and a generated signing secret. Never deploy fixtures.

The application DB login must be NOINHERIT, NOBYPASSRLS, not superuser, not table owner and a member only of `authenticated`/`anon`. No service-role API client is present. Verified subject claims are set server-side, never taken from a request body. Every transaction resets on completion; pooled connections cannot retain a prior request identity.

## Schema

Twenty application tables have RLS enabled. The core scope tables are `organisations`, `members`, `projects`, `project_memberships`, `records`, `record_versions`, `files`, `approvals`, `audit_events`, `whatsapp_pairings` and disabled `inbound_events`. `verifications` records reviewed FACT transitions. `record_links`, `experiment_results`, `result_evidence`, `workflow_tasks` and `workflow_task_versions` hold the exact-version operating graph. `invitations`, `project_gate_policies` and `project_gate_authorizations` hold identity onboarding and controlled local gate authority. Foreign keys bind membership, evidence, files, tasks, results and gates to their organisation/project source records.

The general operating registers still use a typed record table (`kind` enum plus constrained JSONB fields). Experiments, decisions, workflow tasks and system runs cannot be forged through generic record writes. Typed security-definer functions create their structured relationships, then ordinary RLS protects reads. Ledger reconciliation, persisted score assessments, document chunks and executable AI/job tables remain future migrations.

All new evidence has one of the nine required classifications. New user records are drafts; edits increment a version and append a snapshot containing content, classification, lifecycle status, editor, provenance and time. Record identity, author, organisation, project, kind, visibility, source and provenance are immutable. A FACT transition requires a current accepted evidence version, owner review and a recorded verification method. Accepted records cannot be edited in place; a linked superseding decision creates a new immutable decision chain.

Projects contain stage/status/next action, complete source provenance and nullable scores. Stable IDs derive from source codes rather than input order. Seed import verifies complete source envelopes and runs in the same advisory-locked transaction as migrations; changes, unknown references and partial imports fail visibly. No real partner grant is part of canonical seed import. Local test memberships are applied separately.

## Operating loop and project gates

A contributor can submit a project idea. An owner can create an experiment only from the exact submitted idea version and current accepted evidence, with a currency-specific cost cap plus success and stop criteria. The owner assigns the exact experiment version to a current contributor. Only that assignee or an owner can record a result; result evidence is exact-version linked. An owner then creates a decision linked to that experiment, result and accepted evidence. Acceptance copies the reviewed outgoing links to the immutable accepted decision version. Corrections use a linked superseding decision.

Projects 002, 003 and 005 have versioned, data-backed gate policies. Their evidence packets require respectively exact SKU/fitment/safety claims, rights/geometry QA claims, or a specific buyer problem with reviewed demand evidence. The packet must itself become accepted through the ordinary exact approval flow before an owner can request and execute gate authority. Resulting authority is always `local_only`; it never flips a project execution flag. Thresholds remain visibly `proposed_unset` because no owner-approved numeric thresholds exist. Project 004 has no live gate: `live_execution_enabled=true` fails at the database layer and no API, UI, job or broker executor exists. Project 005 product creation remains false with no creation/publication route.

## Approval architecture

Only owners create/read approvals. The server validates typed acceptance, membership and project-gate payloads and applies a 24-hour expiry. The canonical digest binds action, organisation, project, complete payload, environment, requester and expiry; JSON key order is normalized. Only a current owner with AAL2 issued within the last 15 minutes can approve/reject or execute. Narrow functions lock the approval and target, recompute the digest, reject stale target state and consume exactly once under concurrency. Membership requests bind the current `access_version`, before/after state and intended expiry, so an older grant cannot undo a newer revocation. `publish`, `spend` and `deploy` still have no executor. Synthetic AAL2 proves the local contract only.

Invitations are created by a recent-AAL2 owner for one project, role, normalized email digest and expiry. Only a verified authenticated identity with the matching email can redeem the one-use token; replay, mismatch and expiry fail. The token is shown once locally and is not stored in plaintext or sent. Hosted Supabase MFA/enrolment and email delivery are not yet validated.

## Knowledge and AI

Full-text search runs inside the current principal's RLS transaction. Both global search and explicit project search are filtered before producing the evidence envelope. Explicit inaccessible scopes return the same unavailable response as missing resources. Ask KXRA returns excerpts with record ID, classification and version. It does not call an LLM. Attachments stay outside context in quarantine. No vector store, autonomous memory or cross-project cache exists.

AI Team, Skills and Routines are persistent definitions imported from source. Their exact expected seed counts are 13 agents, 12 skills and nine disabled routines. Run execution and job dispatch are disabled; direct generic writes cannot manufacture a completed system run. The future hierarchy remains Owner → Chief of Staff → COO/CFO Analyst/CMO/CTO → useful specialists.

## Stack retained

Next.js/TypeScript is implemented. PostgreSQL RLS is implemented locally with Supabase-compatible auth helpers; Supabase Auth adapters exist. Vercel, hosted Supabase Storage, Trigger.dev, Resend, PostHog, Sentry and Cloudflare remain target services but are unconnected. GitHub is the code remote; production deployment is prohibited. The local database is a development test environment, not a replacement production provider.

## Public website

An original typography-led ivory/forest-green page describes the venture approach and invites contact via the user-provided public email. No customer logos, revenue claims, fabricated case studies or cloned reference artwork. No telemetry or form sends. Private data is never passed to public components. Publication remains prohibited.
