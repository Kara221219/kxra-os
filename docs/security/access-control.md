# Security model and verification limits

Every private table has RLS. Owner role is a current database membership, never a model classification. A partner must be an active organization member with an active, unexpired assignment; a record must additionally be project_shared. Viewer assignments cannot write. Contributors can propose ideas, notes, tasks and experiments in assigned projects. Owner-only finance, agent/routine definitions, approvals, partner information, audit logs and group records remain excluded from partner reads.

## Implemented controls

- Verified identity per request, parameterized SQL, transaction-local roles/claims, 5-second statement timeout, no browser service credentials.
- Strict request schemas reject forged IDs/roles and unknown top-level fields; project IDs are validated. Database constraints apply even to crafted direct queries.
- Same-origin mutation checks. HTTP-only, strict same-site local sessions with integrity/expiry checks. Hosted cookies refresh via Supabase SSR. No public registration or role assignment endpoint.
- Immutable scope/visibility/history, owner acceptance through bounded exact approvals, MFA assurance checks, expiry and single-use execution, optimistic edit conflicts.
- File metadata and parent record share composite foreign keys. Local bytes go to random server-generated names under private quarantine directories. Filenames are sanitized. Actual streamed upload bytes are bounded at ~20MB. No file is delivered or ingested before scanning (delivery currently wholly disabled).
- Browser responses have nosniff, no framing, same-origin referrers, private-area no-store. Data/attachment bodies are not logged in API errors. No analytics/replay is enabled.
- Trading cannot be enabled with an ordinary database update because of a hard constraint; there is no broker adapter.

## Tested attack paths

Owner/anonymous/partner/viewer/revoked principals; active and expired assignments; private record and version reads; crafted IDs, forged authors, direct writes and role escalation; cross-project file foreign keys, file listings/download attempts and full-text/Ask retrieval; origin forgery, tampered session; owner MFA, exact payload hash, stale/missing version and replay; actual approval execution and access revocation.

Database tests use local admin only for setup/rollback, then explicitly SET ROLE for each tested query. The application itself uses the nonprivileged login. HTTP tests exercise actual running Next handlers. Browser tests exercise forms and partner screens. This is not equivalent to a hosted Supabase penetration test.

## Open production gates

Hosted Auth/MFA enrollment and recovery flows; confirmed-email bootstrap and invitations; Supabase Storage policies/object proxy plus trusted malware scanning; production CSP nonce design; durable rate limits at auth/API/upload; abuse controls; application-role pooler verification; secret rotation; request/audit retention; dependency review; security events; backup/PITR restore drill; queued-job capability issuance and revocation; private AI/provider evaluation. Complete these in staging with approved test credentials before requesting production permission. The user prohibited production deployment and real credentials in this session.

Storage byte delivery, agent execution, external sends and paid calls fail closed. Do not remove these gates merely to make a demo appear complete.
