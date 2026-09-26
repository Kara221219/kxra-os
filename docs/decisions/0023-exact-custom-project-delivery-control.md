# ADR 0023: Custom-project changes and deliveries require exact bilateral evidence

Status: accepted locally on 26 September 2026. Provider accounting and approved legal terms remain pending.

## Context

Creating a delivery workspace is not enough to control a paid customer engagement. Scope or price can change after acceptance, KXRA can claim a milestone is complete, and an invoice can exist without payment. Treating any one of those records as permission for the others would create commercial, security and audit risk.

## Decision

- The accepted proposal stores the exact delivery project it created. Every later commercial record resolves through that database relationship.
- A change request binds project, proposal, version, scope delta, integer price delta, currency and caller request ID into one SHA-256 hash.
- A change becomes effective only after separate `KXRA` and `CUSTOMER` decisions accept that exact hash. Either party can reject it. Relationship type, current membership, project access and `custom_project.manage` determine the party; callers cannot choose it.
- KXRA submits versioned milestone delivery evidence against a milestone key in the accepted proposal. A newer submission supersedes an unaccepted version.
- Only the authorized customer can accept the exact latest delivery hash. Acceptance never authorizes payment, publication or unrelated project access.
- Invoice records use integer minor units, exact currency and a controlled accounting reference. They are customer-visible evidence and do not set payment state; payment remains a separate record/provider reconciliation.
- All mutation occurs through bounded security-definer functions under the selected authenticated organization. The tables expose RLS-filtered reads only.

## Consequences

- Subscription entitlement still cannot authorize custom delivery.
- A stale hash, crafted project, wrong currency, missing party, duplicate party decision, unauthorized delivery, forged invoice or cross-project read fails closed.
- KXRA OS now has a complete local request-to-delivery evidence path. Connected accounting/payment providers, credit-note/void operations and solicitor-approved customer terms remain release work.
