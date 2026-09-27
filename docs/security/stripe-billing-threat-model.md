# Stripe billing threat model

## Protected assets

- organization and customer identity mappings;
- plan, price, subscription and entitlement state;
- usage allowance and customer access;
- provider event evidence and webhook credentials;
- customer-bootstrap, Checkout and Customer Portal intents.

## Threats and controls

| Threat | Control | Remaining boundary |
| --- | --- | --- |
| Forged webhook grants subscription access | HMAC-SHA256 over exact raw bytes, timestamp tolerance and constant-time signature comparison before parsing | Real Stripe secret rotation needs staging evidence |
| Event or Customer metadata chooses another tenant or plan | Ignore metadata for authority; resolve the provider customer and active price mapping in PostgreSQL. Customer metadata is checked only as a non-authoritative response correlation | Hosted staging must prove provider behavior with one synthetic tenant |
| Live event activates an unreleased product | Adapter rejects `livemode=true`; database requires environment-matched active price and plan records | Production activation requires a later reviewed migration/configuration decision |
| Duplicate or older event corrupts state | Unique event ID, exact raw hash, provider timestamp/event ordering and replay mismatch rejection | Provider event retrieval/replay needs operator credentials in staging |
| Unpaid customer retains access | Only `ACTIVE` and `TRIALING` produce effective periods; every newer event closes prior periods | A future grace policy needs legal/commercial approval and exact tests |
| Unknown customer/price is silently dropped | Durable owner-only failed receipt; exact replay can recover after mapping repair | Alert delivery and operator workflow remain disconnected |
| Browser/model applies provider state | One private function is executable only by a no-login/no-bypass worker | Worker login and network egress require staging setup |
| Provider payload leaks customer data | Persist only bounded IDs, state, periods, quantity and raw-body digest; no raw body or payment data | Provider dashboard remains outside KXRA retention control |
| Multi-price subscription overgrants features | Strictly require one item/price | Product bundles need a reviewed composition policy before support |
| Browser chooses tenant, customer, name, price or amount | PostgreSQL derives tenant, organization name, active customer and active TEST price after current legal/admin checks; request schemas accept none of those authority fields | Hosted staging must prove the complete bootstrap-to-webhook path |
| Duplicate bootstrap creates multiple provider customers | Organization advisory lock persists one intent and one Stripe idempotency key before the call; retries reuse it and validated worker recording creates one unique mapping | Requests unresolved for 23 hours stop for operator reconciliation |
| Duplicate clicks create multiple subscriptions | Organization-scoped advisory lock reuses one open intent and one Stripe idempotency key | An unresolved intent older than 23 hours requires reconciliation |
| Provider redirects leak credentials or send customers to an attacker | Calls use fixed Stripe API URLs with redirects prohibited; returned URLs require exact Stripe hosts and are worker-recorded before delivery | DNS/TLS and Stripe availability remain provider boundaries |
| Oversized or incompatible provider response exhausts or corrupts the server | Pin API version, stream at most 100 KB and strictly parse test-mode Checkout/Portal objects | API-version upgrades require a reviewed migration and staging run |
| Public marketing receives billing credentials | Staging preflight rejects worker URL and Stripe secrets in marketing | Hosted project separation needs staging evidence |

## Hard stops

- `KXRA_BILLING_ENABLED` defaults to `false`.
- Missing worker URL or webhook secret fails closed.
- Live-mode, malformed, unsigned, oversized and altered events perform no write.
- Unknown references, inactive prices and terminal/non-paying states create no entitlement.
- Webhook activation does not authorize Checkout, Portal, refunds, cancellations, live charging or customer onboarding.
- Customer/session activation requires a test secret, reviewed Portal configuration and `KXRA_BILLING_ENABLED=true`; Checkout additionally requires an active TEST price. Live keys and live responses fail closed.
