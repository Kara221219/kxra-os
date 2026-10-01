# ADR 0030 — Stripe hosted test billing sessions

Status: accepted for local and staging implementation. Provider activation and live billing remain disabled.

## Decision

KXRA uses Stripe-hosted Checkout and Customer Portal pages. Card and payment details never enter KXRA OS. Only an active customer-organization administrator who has passed current identity, tenant, onboarding and legal gates may request a session.

PostgreSQL derives the organization, existing Stripe customer and active TEST price mapping. The request body may provide only a UUID idempotency request and, for Checkout, an active plan-version identifier. It cannot provide a Stripe customer, price, organization, role, amount, currency, redirect URL or entitlement.

The database serializes open sessions per organization and kind. Exact retries reuse the same intent and provider idempotency key. A different request cannot create another open Checkout or Portal session. Unresolved requests stop after 23 hours and require reconciliation rather than creating another provider operation after Stripe's idempotency-retention boundary.

The server calls only fixed Stripe API endpoints, pins API version `2025-07-30.basil`, prohibits redirects, uses a test secret key, limits responses to 100 KB and accepts only test-mode response objects. Checkout redirects must use `checkout.stripe.com`; Portal redirects must use `billing.stripe.com`. The no-login/no-bypass billing worker records the validated result before the URL is returned.

Checkout success never grants access. Only the separately signed subscription webhook and PostgreSQL reconciliation may create entitlement periods.

## Consequences

- A reviewed customer and TEST price mapping must exist before Checkout.
- A reviewed test Customer Portal configuration is mandatory.
- The approximately £30 price, tax, trial, refund, grace and cancellation policies remain owner/legal/accounting decisions.
- Test sessions are visible only to current organization administrators and KXRA owners under RLS.
- Live keys, live sessions, charges, refunds and provider cancellation remain prohibited.

## Evidence

Migration `0066`, the hosted Stripe adapter, restricted billing worker, billing API, customer billing controls and `tests/stripe-hosted-billing.test.ts` cover derived authority, replay, duplicate-session suppression, fixed provider destinations, bounded responses, customer/redirect validation and worker-only recording.

The implementation follows Stripe's official contracts for [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create), [Customer Portal Sessions](https://docs.stripe.com/api/customer_portal/sessions/create), [idempotent requests](https://docs.stripe.com/api/idempotent_requests) and [API versioning](https://docs.stripe.com/api/versioning).
