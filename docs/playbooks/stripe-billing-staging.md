# Stripe billing staging activation

This playbook activates test-mode subscription reconciliation after core staging passes. It does not authorize live charges, production products or customer onboarding.

1. Complete the owner-approved plan, price, feature limits, VAT/tax treatment, trial, cancellation, refund, failed-payment and grace policy. Keep unapproved plans inactive.
2. In Stripe test mode, create the exact reviewed product and recurring price. Record the `price_…` ID as an active TEST `price_references` row linked to the approved KXRA plan version. Do not place the Stripe secret key in a browser variable.
3. Create a restricted database login that may assume only `kxra_billing_worker`. It must not be superuser, own KXRA objects, bypass RLS or assume `authenticated`.
4. Store `KXRA_BILLING_WORKER_DATABASE_URL` and `STRIPE_WEBHOOK_SECRET` only in the private OS server environment. Marketing must receive neither. `STRIPE_SECRET_KEY` is not needed for webhook-only activation.
5. Register `https://<private-staging-origin>/api/webhooks/stripe` for `customer.subscription.created`, `updated`, `deleted`, `paused` and `resumed` only.
6. Create one controlled Stripe test customer and bind its `cus_…` ID to the exact synthetic staging organization. Never derive organization authority from Stripe metadata.
7. Keep `KXRA_BILLING_ENABLED=false` during core staging preflight. Enable it only in the separately reviewed billing staging environment after role, endpoint and reference checks pass.
8. Exercise signed `trialing`, `active`, `past_due`, `paused`, `unpaid`, `incomplete`, `incomplete_expired` and `canceled` events. Verify only trialing/active grant exact plan features and every other state removes access on the next action.
9. Exercise exact replay, altered replay, out-of-order delivery, unknown customer, unknown/inactive price, wrong environment, multiple items, invalid signature, old timestamp and an oversized body. Repair an unknown test price, replay the exact event and verify deterministic recovery.
10. Inspect owner-visible provider receipts and normalized subscription state. Confirm no raw webhook body, card/payment data, secret, internal organization ID from metadata or cross-tenant record is exposed.
11. Rotate the webhook secret using Stripe's documented overlap procedure and rerun signature/replay checks. Record redacted event IDs, states, commit, environment and reviewer in acceptance evidence.

Checkout, Customer Portal, invoices/refunds, cancellation execution and accounting reconciliation remain disabled after this playbook. Implement and accept those flows separately before any live-mode decision.
