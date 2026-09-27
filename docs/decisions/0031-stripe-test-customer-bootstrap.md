# ADR 0031 — Stripe test customer bootstrap

Status: accepted for local and staging implementation. Provider activation and live billing remain disabled.

## Decision

A current customer-organization administrator who has passed identity, selected-tenant, onboarding and legal gates may create the organization's single Stripe test customer from Business Tools. PostgreSQL derives the organization, requesting account and organization name. The browser supplies only a UUID request identifier; it cannot supply a tenant, role, customer ID, customer name, email or provider metadata.

The database serializes bootstrap requests per organization and persists one provider idempotency key before any network call. Concurrent or repeated requests reuse that operation. An unresolved request older than 23 hours stops for reconciliation before Stripe may prune the idempotency key.

The server calls only `POST https://api.stripe.com/v1/customers` with the reviewed test key and pinned API version. It sends the database-held organization name and an intent identifier as non-authoritative correlation metadata. The response must be a test-mode Customer with the exact name and correlation identifier. The restricted billing worker atomically records the validated provider customer ID and activates the unique organization mapping before Checkout becomes available.

Stripe metadata is never authorization evidence. Subscription reconciliation and hosted sessions continue to resolve the customer through the PostgreSQL mapping. No email, payment method, card data, address, tax choice, plan, price or subscription is created by bootstrap.

## Consequences

- Customer administrators no longer depend on a manual database insert before test Checkout.
- An ambiguous request is retried only with the original idempotency key; after 23 hours it requires operator reconciliation.
- A conflicting provider customer or existing organization mapping fails closed and may leave a test-only Stripe object for operator review.
- Billing remains disabled unless the separately reviewed staging configuration enables it.
- Live customer creation, production charging and customer onboarding remain prohibited.

## Evidence

Migration `0067`, the Stripe customer adapter, restricted worker recording, billing-customer API, Business Tools control and `tests/stripe-hosted-billing.test.ts` cover organization derivation, duplicate suppression, worker-only recording, exact replay, ordinary-member denial, fixed provider destination, bounded response handling and response-correlation validation.

The implementation follows Stripe's official [Customer creation contract](https://docs.stripe.com/api/customers/create), [idempotent request behavior](https://docs.stripe.com/api/idempotent_requests), [metadata limits and purpose](https://docs.stripe.com/api/metadata) and [API versioning](https://docs.stripe.com/api/versioning).
