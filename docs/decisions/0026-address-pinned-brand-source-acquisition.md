# ADR 0026 — Address-pinned Brand Studio source acquisition

Status: accepted for local and staging-ready implementation; hosted activation remains disabled.

## Context

Brand Studio previously required customers to paste a website snapshot. That preserved provenance but left the approved AT-35 website refresh workflow incomplete. Fetching a customer-supplied URL inside an authenticated request would create SSRF, denial-of-service, stale-authority and ambiguous-retry risks.

## Decision

Website refresh is an asynchronous evidence workflow. An authorized project writer schedules one acquisition against the exact current source version. PostgreSQL derives organization, project, account, entitlement, locator and version; the request cannot supply authority or a replacement URL.

A dedicated `kxra_brand_source_worker` role is `NOLOGIN`, `NOINHERIT` and `NOBYPASSRLS`. It can execute only claim and completion functions. The worker resolves every hostname, rejects any non-global answer, revalidates every redirect, connects to one validated address while preserving the original hostname for TLS verification, requests identity encoding and bounds redirects, time, content type and streamed bytes. Active HTML elements are removed and decoded text is capped before database completion.

Completion locks both job and source. A changed or retired source cancels stale work. Success creates a new immutable `EXTERNAL RESEARCH` source version and advances only the source pointer. Existing approved profiles keep their exact earlier evidence links and are never overwritten. Failures use bounded reason codes; retryable failures return to the queue with a capped attempt count. No acquisition publishes content, approves a profile or invokes a model.

## Consequences

- Website evidence can be refreshed without giving the browser network or worker authority.
- DNS rebinding, private redirects, unbounded streaming and stale completions fail closed in the tested contract.
- Raw response bodies are not retained; the job stores hashes and bounded transport metadata while the immutable source version stores extracted text.
- Hosted activation still requires a restricted worker connection, controlled egress, observed TLS/DNS behavior, monitoring and failure/recovery evidence.
- Sites requiring JavaScript, authentication, compressed-only responses or more than the current limits remain unavailable and must use owner-authorized supplied evidence.

