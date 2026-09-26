# ADR 0029 — Stripe subscription reconciliation

Status: accepted for local/staging implementation. Checkout, portal and provider activation remain disabled.

## Decision

KXRA accepts Stripe subscription state only through a raw-body verified webhook and a separate `kxra_billing_worker` role. The role is `NOLOGIN`, `NOINHERIT` and `NOBYPASSRLS` and may execute one bounded reconciliation function. Browser, authenticated, anonymous and model roles cannot apply provider events.

Provider metadata never chooses a KXRA organization, internal plan or entitlement. Reconciliation resolves the Stripe customer ID through an existing `billing_customers` mapping and resolves the single Stripe price ID through an active `price_references` row for the matching TEST environment. Unknown customers and prices create durable failed evidence and no subscription. An exact replay may recover only after the missing mapping is installed; changed bytes or provider identity fail as a replay mismatch.

The local/staging adapter accepts only test-mode events. It normalizes the eight documented Stripe subscription states, maps Stripe `canceled` to KXRA `CANCELLED`, and forces deleted events to `CANCELLED`. Only `ACTIVE` and `TRIALING` create effective entitlement periods. `PAST_DUE`, `INCOMPLETE`, `INCOMPLETE_EXPIRED`, `PAUSED`, `CANCELLED` and `UNPAID` fail closed because KXRA has no approved grace policy.

Every newer event closes prior effective periods before creating current periods. Provider creation time plus event ID orders updates. Exact duplicate events return their prior result, older events remain `IGNORED`, and unknown references remain visible to the owner for reconciliation.

## Consequences

- A client redirect, request body, Stripe metadata field or model output cannot grant access.
- A valid Stripe event cannot activate an unreviewed or live price.
- Multi-price subscriptions are rejected until KXRA defines an explicit product-composition policy.
- Webhook acceptance proves provider reconciliation only. It does not create Checkout, a Customer Portal session, a refund, a cancellation or approved accounting evidence.
- Core staging keeps billing disabled. Test products, prices, tax/refund/cancellation policy, a restricted worker login and one controlled Stripe test customer are prerequisites for activation.

## Evidence

Migration `0065`, `packages/integrations/billing.ts`, `packages/integrations/billing-worker.ts`, the Stripe webhook route, `tests/stripe-billing-worker.test.ts`, the access matrix and migration audit cover signature binding, test-mode enforcement, exact replay, out-of-order events, restricted role access, reference resolution and entitlement withdrawal.

The implementation follows Stripe's official documentation for [webhook signatures](https://docs.stripe.com/webhooks/signature), [subscription states](https://docs.stripe.com/api/subscriptions/object), [subscription events](https://docs.stripe.com/api/events/types) and [idempotent provider requests](https://docs.stripe.com/api/idempotent_requests). Checkout and Customer Portal behavior will use the official [Checkout Session](https://docs.stripe.com/api/checkout/sessions/create) and [Portal Session](https://docs.stripe.com/api/customer_portal/sessions/create) contracts in a later slice.
