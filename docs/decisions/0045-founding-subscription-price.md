# ADR 0045: Founding subscription price

Status: accepted by the owner on 1 October 2026.

## Decision

KXRA will use **£29 per organisation per month** as the initial launch-candidate price for packaged KXRA OS access. The annual launch candidate is **£290 per organisation per year**. Applicable VAT or other tax is added according to the approved tax treatment.

The subscription includes only the tools, members, projects and usage allowances in the exact accepted plan version. Custom projects, bespoke integrations, generated media, high-cost research and services are separate commercial engagements unless an exact plan version explicitly includes them.

Owner-issued free partner access remains available through auditable grants and does not create a paid subscription.

## Release conditions

The price may be shown publicly as the reviewed launch price while KXRA remains in private preview. Checkout, charging and unrestricted customer onboarding remain disabled until:

1. exact enforceable plan limits are approved and represented in `plan_features`;
2. tax, cancellation, refund and grace policies are approved;
3. exact owner-approved customer documents match the implemented offer;
4. Stripe production products, prices, webhooks and reconciliation pass the release acceptance suite;
5. the deterministic release manifest reports ready.

## Review

Review price and packaging after the first 10 paying organisations using conversion, activation, retained usage, gross margin, support demand and custom-project conversion. Price changes require a new immutable plan version; existing contractual treatment must remain explicit.

Research record: `docs/research/subscription-pricing-2026-10-01.md`.
