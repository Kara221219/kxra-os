# Stripe billing staging activation

This playbook activates test-mode hosted billing sessions and subscription reconciliation after core staging passes. It does not authorize live charges, production products or customer onboarding.

1. Complete the owner-approved plan, price, feature limits, VAT/tax treatment, trial, cancellation, refund, failed-payment and grace policy. Keep unapproved plans inactive.
2. In Stripe test mode, create the exact reviewed product and recurring price. Record the `price_…` ID as an active TEST `price_references` row linked to the approved KXRA plan version. Do not place the Stripe secret key in a browser variable.
3. Configure a test Customer Portal policy that exposes only the owner-approved cancellation, payment-method and invoice functions. Record its `bpc_…` identifier as `STRIPE_PORTAL_CONFIGURATION_ID`.
4. Create a restricted database login that may assume only `kxra_billing_worker`. It must not be superuser, own KXRA objects, bypass RLS or assume `authenticated`.
5. Store `KXRA_BILLING_WORKER_DATABASE_URL`, `STRIPE_WEBHOOK_SECRET`, the test-only `STRIPE_SECRET_KEY` and Portal configuration only in the private OS server environment. Marketing must receive none.
6. Register `https://<private-staging-origin>/api/webhooks/stripe` for `customer.subscription.created`, `updated`, `deleted`, `paused` and `resumed` only, using the pinned API version in ADR 0030.
7. As the synthetic customer administrator, use **Connect secure test billing** once. Verify KXRA sends only the database-held organization name and non-authoritative intent correlation, records one `cus_…` mapping and reuses the same operation under concurrent/repeated requests. Never derive organization authority from Stripe metadata.
8. Keep `KXRA_BILLING_ENABLED=false` during core staging preflight. Enable it only in the separately reviewed billing staging environment after role, endpoint and reference checks pass.
9. Open Checkout and Portal from Business Tools. Verify the request contains no browser-selected customer, price, amount, organization or redirect authority; duplicate clicks reuse one intent; ordinary members and another tenant cannot bootstrap a customer or receive a session.
10. Complete one test Checkout and verify the return URL itself grants nothing. Exercise signed `trialing`, `active`, `past_due`, `paused`, `unpaid`, `incomplete`, `incomplete_expired` and `canceled` events. Verify only trialing/active grant exact plan features and every other state removes access on the next action.
11. Exercise exact replay, altered replay, out-of-order delivery, unknown customer, unknown/inactive price, wrong environment, multiple items, invalid signature, old timestamp and oversized bodies/responses. Repair an unknown test price, replay the exact event and verify deterministic recovery.
12. Inspect owner-visible customer/session intents, provider receipts and normalized subscription state. Confirm no raw webhook body, card/payment data, secret, authoritative organization ID in metadata or cross-tenant record is exposed.
13. Rotate the webhook secret using Stripe's documented overlap procedure and rerun signature/replay checks. Record redacted session/event IDs, states, commit, environment and reviewer in acceptance evidence.

Live mode, invoices/refunds, provider cancellation execution and accounting reconciliation remain disabled after this playbook. Accept them separately before any live-mode decision.
