# ADR 0025: Customer service and privacy authority

Status: accepted locally. Date: 26 September 2026.

## Context

Customer readiness requires a private path for support, subscription cancellation or withdrawal, and personal-data requests. A support request must not itself mutate Stripe, erase records or assert a legal outcome. Privacy requests can contain personal information that another administrator in the same customer organization should not automatically see.

## Decision

- PostgreSQL stores a hash-bound request, an append-only customer-visible timeline and a separate manager-only internal-note timeline.
- The authenticated account and selected organization come from the verified database session. Request bodies cannot choose a submitter, tenant, role or handler.
- Personal-data access, erasure and correction requests are visible only to their submitter and a principal with `customer_service.manage`. Shared support and subscription requests are also visible to a current organization administrator.
- Only a KXRA platform owner in the KXRA tenant or an explicitly capability-granted handler in the selected customer tenant can acknowledge, progress, resolve or close a request or read internal notes.
- Every mutation binds the immutable request hash, expected version and idempotency key. Exact retries return the first result; stale, conflicting and crafted requests fail closed.
- Subscription cancellation and withdrawal requests must reference a current subscription in the selected tenant. Submitting or resolving the request never changes provider billing state.
- Data requests record the requested workflow only. Identity verification, statutory assessment, disclosure, correction and erasure remain controlled human/provider actions and cannot be inferred from the request state.

## Consequences

- Customers receive an auditable portal path before email or provider integrations are enabled.
- Internal handling notes cannot leak through the customer-visible request or event policies.
- Stripe cancellation, data export/deletion, approved response periods, notification delivery and legal outcomes remain release-gated provider and counsel work.
