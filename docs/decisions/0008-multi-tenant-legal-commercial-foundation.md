# ADR 0008 — Selected-tenant, exact legal and deterministic commercial authority

Date: 20 September 2026. Status: accepted and implemented as a local foundation.

## Context

The original implementation tied an account to one organization through legacy member/profile rows. The approved customer-platform direction requires one identity to belong to KXRA and customer organizations with different roles, while every request, retrieval and commercial decision remains isolated. First private access also requires exact approved legal acceptance. Subscription tools and custom implementation need separate, deterministic authority.

Browser cookies, JWT metadata, request fields and LLM output cannot safely determine tenant, role, entitlement, usage, price, payment or project-creation authority. Applied migration history and the existing five-project workflows must remain intact.

## Decision

Use a stable global `account_identities` row and many `organisation_memberships`. The only security roles are `KXRA_OWNER`, `KXRA_STAFF`, `ORG_ADMIN` and `ORG_MEMBER`; partner/customer/client is relationship metadata. Legacy account/member rows remain compatibility projections while new tenant authorization uses the normalized records.

A multi-membership account must select an organization. The HttpOnly `kxra_organisation` cookie stores only the requested UUID. The server queries current memberships without tenant context, calls an audited database selector and then sets the verified organization as transaction-local `request.kxra.org_id`. Selected-tenant RLS prevents role or data union across memberships. Headers, paths, bodies and JWT organization claims are ignored as authority.

Legal access uses versioned documents, exact SHA-256 hashes, requirements, immutable presentations and immutable acceptance/decline evidence. Only an `APPROVED` exact document may back an active requirement. A missing acceptance returns `AGREEMENT_REQUIRED` before private data access. Retiring a document preserves evidence; a new mandatory version reopens the gate. `UNAPPROVED_PLACEHOLDER` records cannot activate or satisfy release checks.

Commercial access uses immutable plan versions/features, normalized provider events, deterministic entitlement decisions and transactional usage reservations. Explicit owner free grants are separate entitlement sources and never create fake subscriptions. Money uses integer minor units and database constraints/functions; models never calculate it.

Custom projects remain commercially separate from subscription tools. A customer can submit a private request. Proposal authorship requires an explicit `custom_project.manage` capability. Only the exact current proposal acceptance and its configured payment/deposit state can create a customer project. Proposal, legal and payment hashes remain auditable.

All changes are additive migrations. Live Stripe, approved legal content and provider callbacks remain disabled until their separate staging/release gates pass.

## Consequences

- Every private application transaction must carry a server-verified organization or fail closed.
- Context-selection and agreement routes are the only private-entry exceptions needed to establish access; they still run under identity and RLS.
- New tables, functions, HTTP routes, files, jobs and AI runs must include tenant/legal negative tests.
- Existing single-membership accounts continue through deterministic selection without weakening the multi-membership rule.
- The local commercial model can be tested without credentials, but it is not evidence of Stripe, tax, refund, cancellation or customer-portal readiness.
- Real legal text can enter the active workflow only after qualified counsel/owner approval of the exact version and hash.
