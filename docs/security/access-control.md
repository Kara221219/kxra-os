# Security model and verification limits

Final Milestone 2 retains PostgreSQL as the authority for KXRA access. Authentication establishes a server-verified subject. KXRA profiles, account state, current organisation membership, exact project membership, onboarding/agreement readiness, explicit record access and current approval state determine what that subject may do. Neither browser input nor an LLM can calculate or grant permission.

## Enforced controls

- All 36 private tables have RLS. Tests enumerate the schema and reject a new table without RLS and an explicit matrix decision.
- The non-owner application login enters one transaction per request, sets only server-derived subject/assurance/email claims and resets the connection after use.
- Owners are current active database members with active account profiles. Partners also need a live, unexpired project membership and a `project_shared` record. Viewers cannot write.
- `SUSPENDED` and `REVOKED` account states fail closed across account tables and all existing project/file/search/Ask paths. Organisation or project revocation independently removes access.
- Protected profile, role, organisation, project, permissions, account state and onboarding-completion fields have no partner mutation path. Direct SQL writes fail under RLS/grants.
- Exact owner approvals bind before/after state, action, target, project, recipient, environment, requester, expiry and access version. Recent AAL2, row locks, digest recomputation and one-use consumption prevent stale or concurrent replay.
- Project membership alone never exposes another person's Idea. Partners see only their own submissions or active, owner-approved explicit shares in a project they can still access. Share, membership and account revocation each fail closed independently.
- Generic record writes cannot create or mutate Ideas. Typed Idea functions enforce exact schemas, current versions, allowed state transitions, exact evidence versions and terminal archives.
- Work Log rows originate from persisted audit/security events and carry a unique source identity. Admin reads are owner-only, return boolean connection presence instead of credential values and create an audit event before returning data.
- Session revocation increments a server-checked version. The fake provider also increments its provider session version; a stale signed cookie is rejected.
- Same-origin checks cover mutations. Strict request schemas reject unknown fields and crafted IDs. Durable database rate-limit buckets protect join exchange, registration, reset and other account operations.
- Private response headers disable caching, sniffing and framing and use same-origin referrers. Safe errors do not include data, secrets, raw tokens or attachment bodies.

## Invitation and credential controls

The owner chooses normalized email, one or more exact project/role grants, note and expiry. Raw invitation, verification and reset tokens are generated once and stored only as SHA-256 digests. Passwords are never stored in KXRA tables, issued by the owner, placed in email or returned by an API. The local provider stores only scrypt salt/hash data in ignored mode-0600 runtime state; hosted credentials belong to Supabase Auth.

Invitation URLs use a fragment so the raw token is not part of the HTTP request or referrer. Client code removes the fragment before exchange. A bounded exchange turns the digest and invitation preview into an AES-256-GCM, HttpOnly, same-site join-intent cookie lasting at most 30 minutes. Registration uses its locked email. Redemption rechecks current digest, approved grant version, verified email, expiry, revocation and replay inside the database transaction.

Resend rotates the delivery token without altering the approved grant. A material grant change replaces the invitation. Revocation cancels pending outbox rows. Account suspension/revocation cancels access and delivery and creates auditable lifecycle/security events.

## Fixture exclusion

Local fixture mode requires explicit local configuration, exact loopback origin, no Vercel/production/hosted-service combination and generated secrets. Development-only package import conditions select the local provider and identity selector. Production builds select fail-closed stubs. The artifact test scans all optimized Next.js output for 16 forbidden fixture markers, including fixture emails/IDs, UI labels, selector/state filenames and local secret names.

This is defense in depth. The production target still requires hosted configuration review; a passing artifact scan does not prove hosted identity, deployment or secret management.

## Tested attack paths

The local contract suite covers owner, contributor, viewer, revoked, onboarding, suspended, anonymous and separate-organisation principals. The expanded matrix reads and attempts unauthorized writes against all 36 tables and audits all 52 exposed functions. HTTP tests cover every current private route family, crafted project IDs, direct API access, cross-project files, search, Ask, Ideas and owner control-plane routes.

Account tests cover locked-email registration, weak/mismatched passwords, uninvited registration, token mismatch, expiry, replay, old links after resend/replacement, forged lifecycle/profile/assignment fields, exact grants, onboarding bypass, agreement re-acknowledgement, MFA transitions, password reset/change, session revocation, WhatsApp preference without pairing and immediate suspension/reactivation/revocation isolation. Browser tests cover the owner-to-partner journey and mobile resume. Production artifact tests prove the local fixture surface is absent from the optimized build.

Control-plane tests cover submitter-only Ideas, explicit share grant/removal, membership revocation, cross-project denial, generic-write bypass attempts, stale Idea and governance versions, every Idea state, duplicate merge, complete approval envelopes for all enabled actions, recent-AAL2 denial, one-use/concurrent/stale execution, exact Dashboard counts, stable Portfolio pagination, linked Work Log rows and audited/redacted Admin access. Browser tests repeat the owner/partner boundary and responsive behavior through 320px and 200% reflow.

Database tests use local administration only to create/rollback adversarial fixtures, then explicitly switch to application roles. HTTP tests call real Next.js handlers. Browser tests use the rendered application. These results do not constitute a hosted Supabase penetration test.

## Existing hard stops

File bytes remain quarantined and undeliverable until trusted scanning, extraction, object RLS and delivery-time authorization exist. No model synthesis, agent/job execution, provider message, spending, publication, deployment or live trading executor exists. Project 004 remains paper/research only and Project 005 remains demand-gated.

## Hosted checks deferred to Milestone 11

The following remain blocked: verified owner bootstrap; Supabase registration/email-confirmation behavior; hosted MFA enrollment, challenge, recovery and recent-AAL2 claims; refresh/session revocation across devices; application-role pooler and RLS behavior; Storage policies and object proxy; real Resend acceptance/bounce/retry; durable distributed abuse controls; CSP nonce design; provider secret rotation; telemetry redaction; backup/PITR and object restore; and delivery-time revocation across jobs/providers.

No real credentials, production data, external sends, paid calls or deployment were used.
