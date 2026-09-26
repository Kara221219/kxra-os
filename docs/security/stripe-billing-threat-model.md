# Stripe billing threat model

## Protected assets

- organization and customer identity mappings;
- plan, price, subscription and entitlement state;
- usage allowance and customer access;
- provider event evidence and webhook credentials;
- future Checkout and Customer Portal sessions.

## Threats and controls

| Threat | Control | Remaining boundary |
| --- | --- | --- |
| Forged webhook grants subscription access | HMAC-SHA256 over exact raw bytes, timestamp tolerance and constant-time signature comparison before parsing | Real Stripe secret rotation needs staging evidence |
| Event metadata chooses another tenant or plan | Ignore metadata for authority; resolve existing provider customer and active price mappings in PostgreSQL | Checkout must create those mappings through a separately authorized path |
| Live event activates an unreleased product | Adapter rejects `livemode=true`; database requires environment-matched active price and plan records | Production activation requires a later reviewed migration/configuration decision |
| Duplicate or older event corrupts state | Unique event ID, exact raw hash, provider timestamp/event ordering and replay mismatch rejection | Provider event retrieval/replay needs operator credentials in staging |
| Unpaid customer retains access | Only `ACTIVE` and `TRIALING` produce effective periods; every newer event closes prior periods | A future grace policy needs legal/commercial approval and exact tests |
| Unknown customer/price is silently dropped | Durable owner-only failed receipt; exact replay can recover after mapping repair | Alert delivery and operator workflow remain disconnected |
| Browser/model applies provider state | One private function is executable only by a no-login/no-bypass worker | Worker login and network egress require staging setup |
| Provider payload leaks customer data | Persist only bounded IDs, state, periods, quantity and raw-body digest; no raw body or payment data | Provider dashboard remains outside KXRA retention control |
| Multi-price subscription overgrants features | Strictly require one item/price | Product bundles need a reviewed composition policy before support |
| Public marketing receives billing credentials | Staging preflight rejects worker URL and Stripe secrets in marketing | Hosted project separation needs staging evidence |

## Hard stops

- `KXRA_BILLING_ENABLED` defaults to `false`.
- Missing worker URL or webhook secret fails closed.
- Live-mode, malformed, unsigned, oversized and altered events perform no write.
- Unknown references, inactive prices and terminal/non-paying states create no entitlement.
- Webhook activation does not authorize Checkout, Portal, refunds, cancellations, live charging or customer onboarding.
