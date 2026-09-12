# ADR 0001 — Secure local foundation

Date: 2026-09-11. Classification: DECISION (engineering implementation within user scope).

Use the requested Next.js/TypeScript and Supabase/PostgreSQL architecture. Build an isolated application in this workspace; preserve the separate older parent-repository prototype and all Genesis documents. The older prototype's custom file-based authentication is not imported.

Use a private local PostgreSQL cluster and explicit synthetic identities to prove the authorization model without real credentials or provisioning external accounts. Keep RLS as the database authority and authenticated routes as the HTTP boundary. Retain the full preferred infrastructure as the production target.

Use a typed generic register for early workflow delivery; retain dedicated access, file and approval tables. This allows working classification, scope, history, search and approvals now; it does not claim advanced financial-ledger or autonomous-agent workflows complete. Normalize individual register domains incrementally as their workflows are implemented.

The approved-brief field in the message was a placeholder. Use the pre-existing complete `KXRA-GENESIS/CODEX-GENESIS-BUILD-BRIEF.md` as the engineering baseline; current direct user constraints override source-document instructions. Initial brief SHA256: `6432d2b7bb9e0942c8f8de20975beefbcca5a681125b8a748b49086bc2d34a0e`.

No model IDs are asserted to be available APIs merely because the desktop application displays them. Sol/Astra are retained as requested policy labels, with all model execution disabled pending provider verification and owner budget boundaries.
