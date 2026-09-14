# Security model and verification limits

Every one of the 20 private application tables has RLS. Owner role is a current database membership, never a model classification. A partner must be an active organisation member with an active, unexpired assignment; a record must additionally be `project_shared`. Viewer assignments cannot write. Contributors can propose ideas and notes and can act only on typed tasks assigned to them. Experiments, decisions, project gates and system runs cannot be created through generic records. Owner-only finance, agent/routine definitions, approvals, invitations, partner information, audit logs and group records remain excluded from partner reads.

## Implemented controls

- Verified identity per request, parameterized SQL, transaction-local roles/claims, 5-second statement timeout, no browser service credentials.
- Strict request schemas reject forged IDs/roles and unknown top-level fields; project IDs are validated. Database constraints apply even to crafted direct queries.
- Same-origin mutation checks. HTTP-only, strict same-site local sessions with integrity, issue-time and expiry checks. Hosted cookies refresh via Supabase SSR. Fixture mode fails closed under production, Vercel, non-loopback, weak-secret or hosted-service combinations.
- One-use invitation tokens are stored only as hashes and bound to normalized verified email, project, role and expiry. Redemption creates only the approved partner assignment. No public role-selection endpoint exists.
- Immutable scope/visibility/provenance and complete historical snapshots. FACT promotion requires an accepted exact evidence version, owner reviewer and verification method. Accepted decisions are corrected only through linked supersession.
- Approval digests bind action, organisation, project, exact payload, environment, requester and expiry. Execution requires current owner membership and AAL2 issued within 15 minutes, locks target rows, rejects stale target/access versions and consumes once.
- File metadata and parent record share composite foreign keys. Owner uploads default to `owner_only`; sharing is explicit. Local bytes go to random server-generated names under private quarantine directories. Filenames are sanitized and streamed bytes are bounded at about 20 MB. No file is delivered or ingested before scanning.
- Browser responses have nosniff, no framing, same-origin referrers, private-area no-store. Data/attachment bodies are not logged in API errors. No analytics/replay is enabled.
- Project-gate evidence must be current, accepted, shared and exact-version linked. Gate authorization remains `local_only` and cannot set project execution flags. Trading cannot be enabled with an ordinary database update; no broker adapter exists. Product creation and publication have no route or executor.

## Tested attack paths

The local suite covers owner, contributor, viewer, revoked, anonymous and separate-organisation principals. A generated matrix populates and reads all 20 tables across shared, owner-private, group and other-organisation scopes. It checks schema-wide RLS, unauthorized INSERT/UPDATE/DELETE, and anonymous denial for every exposed application RPC. HTTP tests cover every current private route family, crafted project IDs, direct API access, files, search and Ask.

Approval tests reproduce grant → later revocation → old-grant execution and prove the old grant stays stale. They also cover action/project/recipient/environment/expiry binding, JSON key-order normalization, rejected/expired/consumed requests and concurrent one-use execution. Identity tests cover invitation mismatch, expiry and replay plus AAL1/stale/recent AAL2. Data tests cover direct classification promotion, full version attribution, 201-row finance totals, SQL JSON null/type failures, exact decimal arithmetic and open-risk states. Workflow tests cover exact links, task assignment/result/completion, decision acceptance/supersession, five-principal isolation and persistence across a controlled database restart.

Database tests use local admin only for setup/rollback, then explicitly SET ROLE for each tested query. The application itself uses the nonprivileged login. HTTP tests exercise actual running Next handlers. Browser tests exercise forms and partner screens. This is not equivalent to a hosted Supabase penetration test.

## Open production gates

Hosted Auth/MFA enrollment, challenge and recovery; real email invitation delivery; confirmed owner bootstrap; Supabase Storage policies/object proxy plus trusted malware scanning; production CSP nonce design; durable rate limits at auth/API/upload; abuse controls; application-role pooler verification; secret rotation; request/audit retention; current dependency review; security events; backup/PITR plus object restore; queued-job capability issuance/revocation; private AI/provider evaluation. Complete these in staging with separately approved test credentials before requesting production permission.

Storage byte delivery, agent execution, external sends and paid calls fail closed. Do not remove these gates merely to make a demo appear complete.
