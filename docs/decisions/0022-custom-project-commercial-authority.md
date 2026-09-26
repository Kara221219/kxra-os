# ADR 0022: Custom-project commercial authority stays separate from subscription access

Status: accepted locally on 26 September 2026. Approved legal content and connected payment evidence remain pending.

## Context

Customer subscriptions provide access to packaged KXRA tools. They must not create a right to custom implementation, expose another member's confidential request, reveal internal KXRA triage, let a customer set commercial terms, or create a delivery workspace before the exact proposal and payment gate are satisfied.

The initial commercial schema preserved separate request, proposal, acceptance, payment and project records, but the application did not provide the complete bounded journey. Its request policy also allowed every ordinary member in one customer organization to read every request, and payment-gate calculation did not subtract refunds.

## Decision

- An ordinary customer can read only a request they submitted and the linked proposal, acceptance and payment totals. Customer organization owners and administrators retain organization oversight.
- Internal triage is visible only to the platform owner or an active membership with `custom_project.manage`.
- The database, not the interface or a model, decides whether the selected actor may triage, issue terms, record controlled payment evidence or activate delivery.
- Proposal acceptance binds the exact immutable proposal hash. The delivery project can be created only after current acceptance and the configured net-payment gate; refunds reduce the amount received.
- Payment entries use integer minor units and the proposal currency. Provider or bank references are evidence, not permission and not an invoice.
- Subscription access and custom-project delivery remain separate products and records.

## Consequences

- Same-tenant customer users cannot browse each other's private requests unless they hold organization administration authority.
- Internal commercial assessment is absent from the customer result set even when the customer can see request state.
- A crafted identifier, forged customer payment call, missing capability, stale acceptance, expired proposal, wrong currency or insufficient net payment fails in PostgreSQL.
- The local journey now covers request, triage, exact proposal, acceptance, payment evidence and controlled project creation. Versioned change requests, delivery evidence, milestone acceptance, invoices, approved legal text and a connected payment provider remain separate acceptance work.
