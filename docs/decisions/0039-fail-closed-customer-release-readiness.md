# ADR 0039: Fail-closed customer release readiness

Status: accepted locally; production inputs absent.

## Decision

Customer readiness is a deterministic database decision over one exact release manifest. A manifest must reference approved, hash-matched NDA, Terms, Privacy, Cookie, Data Processing and Custom Project documents. It must also contain validated plan and price data, included usage, separate custom-project treatment, cancellation/refund/grace/tax policies, retention and subprocessors, exact public-copy integrity, five required staging evidence classes, support/privacy/security contacts, and named human accessibility and security reviews.

The owner Admin view displays the latest manifest and exact blockers. It cannot edit legal content, approve evidence, deploy, publish, charge or contact a customer. Missing or malformed fields remain blocked. Synthetic test evidence proves only the contract and cannot activate production legal documents.

## Consequences

- A nonempty JSON object can no longer satisfy the release gate.
- One approved document cannot stand in for the complete legal set.
- Provider connection and automated test results cannot replace named human reviews.
- Production remains blocked until counsel, commercial owners and staging evidence supply the exact manifest inputs.
