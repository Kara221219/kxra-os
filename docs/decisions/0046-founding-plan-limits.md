# ADR 0046 — Founding plan limits

Date: 1 October 2026  
Status: Accepted for Stripe TEST activation; public checkout remains disabled

## Decision

KXRA's first paid plan is **£29 per customer organisation per month** or **£290 per year**, in GBP and exclusive of VAT where applicable. Both billing intervals provide the same monthly allowances:

- KXRA Brand Studio access;
- 120 generated creative variants per calendar month; and
- 120 reviewed exports per calendar month.

Unused units do not roll over. Generated media, high-cost research, external integrations and custom-project delivery are excluded and require a separate approved price or allowance. Ask KXRA remains a controlled preview capability and is not represented as an included paid feature until provider cost, retrieval quality and support evidence are accepted.

The limits match the existing tested Brand Studio fixture contract and provide approximately four generation and export units per day. They are a launch hypothesis, not a permanent entitlement. Review conversion, activation, retained usage, provider cost, support load and gross margin after the first ten paying organisations. Any change creates a new immutable plan version; an LLM cannot change allowances or calculate charges.

## Activation boundary

The guarded staging operator accepts only two distinct Stripe TEST `price_…` identifiers, the exact Supabase staging project, a clean pushed phase branch and the explicit apply phrase. It creates one exact plan, two active versions, six feature rows and two TEST price mappings inside one transaction. Existing mismatched rows cause takeover rejection.

Checkout stays disabled until Stripe test products, webhook reconciliation, cancellation/refund/grace policy, tax display, exact owner-approved customer documents and the customer-release manifest all pass.
