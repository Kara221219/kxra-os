# ADR 0049: Owner release-review attestations

Date: 3 October 2026  
Status: Accepted

## Context

The founding private-launch candidate is deliberately blocked by three evidence gaps: provider-backed hosted backup and restore evidence, a named accessibility review and a named security review. Automated checks support the two reviews but cannot truthfully replace the accountable human decision.

Review evidence must refer to the exact candidate that was inspected. It must also remain separate from deployment and publication authority so that recording a review cannot accidentally launch KXRA.

## Decision

KXRA records accessibility and security reviews as immutable owner attestations in `kxra.release_review_attestations`.

Each attestation requires the verified active owner, recent MFA at both the application and database boundary, the exact blocked release manifest, the unchanged candidate SHA-256, the exact versioned review-packet SHA-256, every required boolean check set to true, and reviewer notes of 20–4,000 characters. The database derives the reviewer identity from the authenticated session and permits one attestation of each type for a manifest. Direct inserts, partner access, AAL1, partial checklists, candidate drift and replay fail closed.

The candidate digest omits only the two empty review placeholder fields. This lets both reviewers attest to the same base candidate without either review mutating what the other reviewed. Attestations remain separate evidence until a later guarded finalization step binds them with provider-backed backup evidence.

Recording an attestation does not change the manifest state, deploy code, publish the website, enable live Stripe, grant access or merge `main`.

## Consequences

- Accessibility and security sign-off are explicit, attributable owner actions rather than inferred automated results.
- The owner cannot attest through a stale browser session or after the reviewed candidate changes.
- Automated evidence remains necessary but cannot impersonate the human reviewer.
- The launch candidate remains `BLOCKED` until provider-backed backup and restore evidence exists and a separate guarded finalization path validates all three evidence classes.

