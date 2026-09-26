# ADR 0024: Immutable invoice adjustments

Status: accepted locally. Date: 26 September 2026.

## Context

An issued invoice may need cancellation or a partial/full credit. Editing or deleting the original record would destroy the evidence accepted by the customer and could falsely imply a provider payment or refund. A combined-value limit also permits invalid tax composition even when the total remains bounded.

## Decision

- Every invoice has an immutable SHA-256 evidence hash over its project, proposal, reference, subtotal, tax, total, currency, due date and controlled accounting reference.
- Only a current `custom_project.manage` principal can create a void or credit note. The function derives organization and authority from the authenticated database session and locks the invoice row.
- A void binds the exact invoice hash, reason, accounting reference and idempotency key. It is allowed only while the invoice is `ISSUED` and has no credit notes.
- Credit notes are immutable, hash-bound and idempotent. Cumulative subtotal, tax and total are each bounded by the corresponding original invoice component.
- Invoice state is derived as `ISSUED`, `PARTIALLY_CREDITED`, `CREDITED` or `VOID`. These states remain commercial evidence and never assert provider payment or refund truth.
- Customers can read adjustment records only through current project RLS. They cannot issue, void or credit an invoice.

## Consequences

- Original invoice evidence is retained while every adjustment has an attributable record and audit event.
- Concurrent adjustment attempts serialize on the invoice and cannot over-credit it.
- Connected accounting and payment providers must later reconcile their own immutable references to these records. They must not overwrite them or infer authorization from an LLM.
