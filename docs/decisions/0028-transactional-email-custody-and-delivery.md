# ADR 0028 — Transactional email custody and delivery

Status: accepted for local/staging implementation. Provider activation remains disabled.

## Decision

KXRA OS queues transactional email in PostgreSQL and delivers it through a separate `kxra_email_worker` role. The role is `NOLOGIN`, `NOINHERIT` and `NOBYPASSRLS`; a separately credentialed worker may call only the claim, final authorization, completion and provider-event functions.

One-time invitation tokens are never stored in plaintext. The private OS seals a token with AES-256-GCM under a worker-only 32-byte key, binds the ciphertext to the token SHA-256 digest as authenticated data and stores the ciphertext separately from the outbox. The worker decrypts only after claiming a current item. PostgreSQL rechecks invitation version, state, expiry and token digest immediately before provider dispatch.

Resend receives the immutable outbox operation key as its idempotency key. Retryable rejection uses a bounded retry schedule; permanent rejection stops; uncertain transport outcome enters `RECONCILIATION_REQUIRED` and is never blindly resent. Provider message IDs are unique. Raw-byte Svix webhook verification precedes parsing and a deduplicated provider event updates delivered, delayed, bounced, complained, failed or suppressed state.

## Consequences

- Browser, authenticated application and model roles cannot claim, authorize, complete or reconcile delivery.
- Revocation after claim but before final authorization cancels delivery. The unavoidable interval between final authorization and an external side effect is reconciled through the provider idempotency key and webhook evidence.
- A lost encryption key makes queued one-time links unreadable. Rotate by cancelling affected rows and issuing fresh invitations; never retain an old key indefinitely.
- Provider acceptance is `SENT`, not proof of inbox delivery. Only a verified provider event records `DELIVERED`.
- Core staging keeps email disabled. A verified sender, controlled recipient allowlist, dedicated database connection and webhook secret are required before activation.

## Evidence

Migration `0064`, `tests/transactional-email-worker.test.ts`, the complete access matrix and the production artifact scan cover encrypted custody, role limits, exact provider request, retry classification, revocation, signed webhook replay and provider-state reconciliation.

Current provider behavior was checked against the official [Resend idempotency guidance](https://resend.com/changelog/idempotency-keys), [webhook verification guidance](https://www.resend.com/changelog/managing-webhooks-via-api) and [rate-limit behavior](https://resend.com/changelog/api-rate-limit).
