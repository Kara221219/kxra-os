# ADR 0048 — Prepare a blocked release candidate before launch sign-off

Date: 3 October 2026  
Status: Accepted

## Decision

KXRA will assemble the first customer release record from exact approved sources before seeking final launch sign-off. The source is `docs/operations/evidence/release-candidate-v1.json`; the guarded staging operator binds it to customer-document pack v1, the KXRA Founding monthly plan, the reviewed disabled public snapshot and evidence for core Preview, authorization/RLS, Stripe Sandbox and transactional email.

The candidate is deliberately stored as `BLOCKED`. It contains no invented accessibility or security reviewer and no claim of a provider-backed backup restore. The deterministic release check must therefore return exactly:

- `PROVIDER_EVIDENCE_INCOMPLETE`;
- `ACCESSIBILITY_REVIEW_MISSING_OR_INVALID`; and
- `SECURITY_REVIEW_MISSING_OR_INVALID`.

An existing candidate with the same immutable release version cannot be replaced or silently changed. The operator requires the exact staging project, clean pushed phase branch, verified database TLS and a separate apply phrase. It creates no deployment, publication, live charge or customer access.

## Consequences

The owner Admin screen can present the remaining launch work as concrete engineering and owner-sign-off actions. A candidate cannot become ready merely because its source exists. Hosted backup/restore evidence and two named human reviews must be completed and bound to a later exact manifest revision before production can be considered.
