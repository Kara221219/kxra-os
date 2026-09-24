# Security model and verification limits

KXRA OS treats PostgreSQL as the authorization and state authority. Authentication establishes a verified subject. Current account state, one selected active organization membership, exact project membership, legal readiness, record visibility, entitlement/usage state and current approval state determine what that subject may do. Browser input and LLM output cannot calculate or grant permission.

Phase 2 Slices 1–4 add normalized many-to-many identity, explicit tenant selection, an exact first-private-access legal gate, deterministic commercial authority, revocation-safe private file/knowledge and AI lifecycles, and the governed Brand Studio product loop. See [ADR 0008](../decisions/0008-multi-tenant-legal-commercial-foundation.md), [ADR 0009](../decisions/0009-secure-file-and-knowledge-lifecycle.md), [ADR 0010](../decisions/0010-permission-safe-ai-execution.md), [ADR 0011](../decisions/0011-kxra-brand-studio-local-product.md) and the linked threat models.

## Enforced controls

- All 143 private tables have RLS and at least one explicit policy. Internal ingress/rate-limit/worker tables use explicit read or deny policies and are mutated only through bounded functions. Tests reject a new table without RLS or a policy.
- The application login is non-superuser, `NOINHERIT` and `NOBYPASSRLS`. Each request enters a transaction, sets `ROLE authenticated`, verified subject claims and one server-derived `request.kxra.org_id`, then resets the pooled connection.
- `account_identities` and `organisation_memberships` are authoritative for tenant context. A multi-membership account must explicitly select one organization. The HttpOnly cookie is only a UUID selector; the database verifies a live membership and records the context event.
- Headers, URL segments, request bodies, JWT organization/role metadata and model output cannot select tenant or elevate role. A forged or revoked selection returns typed `TENANT_ACCESS_DENIED`.
- Selected-tenant policies prevent role/data union across memberships. Revoking one membership takes effect on the next request without cancelling another valid membership.
- Owners are current `KXRA_OWNER` members. Customer `ORG_ADMIN` does not gain group-owner APIs. Project access still requires the selected organization and a current project assignment unless the selected organization role has its bounded administrative project visibility.
- `SUSPENDED` and `REVOKED` account states fail closed across account, project, file, search, Ask, legal and commercial paths.
- Project membership alone never exposes another person's Idea. Partners see only their submissions or active owner-approved shares in an accessible project. Viewers cannot write.
- Ask accepts exactly one project, authorizes it before retrieval and has no all-project fallback. Missing, multiple, inaccessible and revoked scopes fail before context retrieval.
- File upload intent, object key, lifecycle promotion, chunks and delivery authority are server/database controlled. Browser roles cannot choose a key, claim processing work or mark a file clean.
- Only the current `INDEXED` file version can enter search/Ask. Derived chunks inherit tenant, project, parent record, exact versions, classification and audience and remain behind parent RLS.
- Downloads use a server proxy. It creates an authorization event, reads the private object, verifies hash/size, rechecks membership version/project/record/lifecycle and returns `private, no-store`; no permanent raw object URL is exposed.
- Ask query and agent runs retain hashes and exact version references rather than raw prompts/answers. Model context is created only after RLS retrieval into an immutable one-project envelope. Atomic query/run/citation revalidation immediately before delivery clears references and withholds output after revocation or stale evidence.
- Browser roles cannot mutate AI execution evidence or call private worker functions. `kxra_ai_worker` can only claim a pre-authorized run, record its exact skill-bound tool call and finish/fail with usage and QA evidence. A model or document cannot add tools, permissions, budget or project scope.
- AI budget arithmetic and reconciliation run under PostgreSQL row locks. Unknown model substitution, paid dispatch with zero reservation, unapproved agent/skill versions, invalid schema/citations and usage overage fail closed.
- The deterministic scanner/extractor is fixture-only and fails closed in production/Vercel. Hosted processing cannot activate without a trusted scanner and isolated extraction worker.
- Brand Studio records remain project scoped after tenant selection. Read access follows current project RLS; every mutation repeats current project-write and entitlement checks inside a security-definer function.
- Website locators accept only public HTTPS syntax and cannot contain credentials, non-443 ports, local/internal hostnames or IP literals. The current product performs no fetch or redirect traversal and requires a customer-supplied, consented snapshot plus rights basis.
- Profile and brief versions, source evidence and creative content are immutable after review. New corrections create lineage. Export requires the latest review of the exact content hash and all brand, claims, rights, accessibility and compliance checks.
- Generation and export reserve deterministic feature usage before work. Export delivery rechecks current membership, project access, entitlement and exact review/content relationship and records withheld attempts. Publication and scheduling have no route or executor.
- Routine manifests are owner-readable and change only through typed functions. Exact-hash approval precedes enablement; direct browser DML cannot create, claim, checkpoint, complete, retry or recover runs.
- Routine slots/events are unique and authoritative in PostgreSQL. Calendar facts are explicit, leases expire, checkpoints append, and retry reauthorizes the current manifest version, service identity and scope before protected work.
- `kxra_routine_worker` has only bounded worker function execution. It cannot approve/enable manifests or deliver a notification. Notification intents remain append-only with their adapter disabled.

## Legal gate

- Only an exact `APPROVED` legal document/version/hash may back an active requirement. Database validation rejects `UNAPPROVED_PLACEHOLDER`, retired, mismatched or missing documents.
- Presentation stores an immutable copy of title, rendered content, hash and acceptance wording before a response is possible.
- Acceptance/decline binds account, membership, organization, requirement, document/version/hash, wording/version/hash, presentation/responded times and a unique request ID.
- Missing current acceptance returns `AGREEMENT_REQUIRED` before private HTML/API/project/file/search/Ask access. Context selection, login/recovery and agreement presentation remain reachable.
- Refresh/retry is idempotent. Another account cannot reuse evidence. Retiring a document preserves history; a new mandatory version reopens the gate.
- Release-manifest checks reject placeholders and incomplete/mismatched legal or commercial state. Real launch remains blocked on qualified counsel and owner approval.

## Commercial controls

- Plan features, entitlement decisions, usage allowance and monetary values are deterministic database/domain state. Models never decide access or calculate money.
- Signed billing fixtures use bounded raw bodies, timestamp tolerance, HMAC-SHA256 and constant-time comparison. Event IDs and provider times make replay/out-of-order reconciliation idempotent.
- Usage reservations lock effective allowances. Concurrent requests cannot exceed the available quantity; completion explicitly records success, failure or released usage and integer minor-unit cost.
- Owner free grants require KXRA owner authority, reason, scope and expiry. They remain separate from subscriptions and revoke before the next protected action.
- Billing, entitlement, usage and grant tables are tenant-scoped; cross-tenant reads/writes fail under RLS.
- Custom-project proposal authors need an explicit `custom_project.manage` capability. Customers cannot self-author price/scope or activate projects.
- Subscription entitlement alone cannot create delivery work. Activation requires the exact current proposal acceptance and its configured payment/deposit gate.

## Invitation, credential and fixture controls

Raw invitation, verification and reset tokens are generated once and stored only as digests. Passwords never enter KXRA tables. Invitation URLs use fragments; the client removes the token before exchange. A bounded AES-256-GCM HttpOnly join-intent cookie binds the locked email and invitation version. Redemption rechecks current digest, verified email, expiry, revocation and replay.

Fixture mode requires explicit development configuration, HTTP `127.0.0.1`, an unprivileged port, no Vercel/production/hosted Auth/database combination and a generated secret. Production imports resolve fail-closed stubs. The production artifact scan rejects 16 fixture identity/state/secret markers.

## Tested attack paths

The local matrix covers owner, contributor, viewer, revoked, onboarding, suspended, anonymous, other-organization, customer-admin and dual-membership principals. It reads and attempts unauthorized writes across all 143 tables and audits all 118 exposed functions.

SQL/HTTP/browser tests cover crafted tenant/project IDs, forged headers/body/JWT metadata, immediate membership revocation, cross-tenant projects/commercial state, direct API access, files, indexed chunks, search, Ask, nested workspace resources, exact legal presentation/acceptance and typed gate errors. File tests cover EICAR, executables, macros, active PDF, archive policy, MIME deception, extraction failure, idempotent retry, forged worker calls, cross-project discovery, revocation between authorization and delivery, stale query evidence, object mismatch/orphan reconciliation and restart hashes. AI tests cover draft/approved manifest boundaries, exact run scope, prompt/tool injection, worker grants, invalid output, timeout/provider failure, retry, concurrent budget reservation, unknown model substitution and revocation before claim and after synthesis. Routine tests cover exact disabled imports, owner/partner/anonymous access, direct DML denial, duplicate logical slots, Europe/London DST, missing/closed exchange calendars, lease expiry, checkpoint-preserving recovery, revocation before retry, quiet unchanged completion and one disabled notification intent for terminal actionable failure. Brand Studio tests cover hostile locators, anonymous/crafted/viewer denial, project isolation, source/profile/brief versions, exact decisions, quota accounting, immutable lineage, incomplete review, export authorization, entitlement revocation and desktop/mobile completion. Billing tests cover signature tamper/expiry, event replay/order, concurrent usage and free-grant revocation. Custom-project tests cover customer self-pricing denial, stale/hash mismatch, payment gating and cross-tenant isolation.

Account, owner-control, project-workspace, finance, approval and browser-responsive suites remain part of the same clean disposable contract. These tests use synthetic local administration to create adversarial fixtures, then execute application behavior under the non-bypass roles. They are not a hosted Supabase or provider penetration test.

## Existing hard stops

No external model synthesis, general agent/job executor, provider message, live billing, Brand Studio publication, public YouTube action, code execution from a candidate repository, production deployment or live trading executor exists. Project 004 remains paper/research only. Project 005 remains demand gated. Legal placeholders cannot activate. Only locally processed synthetic files can become indexed/deliverable; hosted processing remains disabled.

## Hosted checks deferred

Still blocked: real owner bootstrap; Supabase registration/email/MFA/recovery/refresh/session behavior; hosted pooler RLS; private Storage bucket/policies, trusted malware engine and isolated extractor; approved legal content; Stripe checkout/webhook/portal/tax/refund/cancellation; Resend acceptance/bounce/retry; Trigger.dev workers; external model retention/region/rate/spend and crash-recovery controls; a production-safe website fetch service; Meta/YouTube/GitHub provider grants; telemetry redaction; CSP/edge controls; secret rotation; database-plus-object empty-target restore; and delivery-time revocation across distributed jobs.

No real credential, production data, external send, paid call, deployment or customer onboarding was used in this evidence.
