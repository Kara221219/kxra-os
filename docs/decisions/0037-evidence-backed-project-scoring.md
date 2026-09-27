# ADR 0037 — Evidence-backed project scoring

Date: 27 September 2026  
Status: accepted

## Decision

KXRA Venture and Confidence Scores are derived by PostgreSQL from a versioned `genesis-1` assessment. An assessment records one to ten exact weighted Genesis factors, a 0–5 rating, a rationale and at least one exact current accepted project-evidence version for every rated factor. Confidence is optional and, when supplied, requires all four bounded dimensions: evidence quality, independence, recency and directness.

The owner requests an exact approval envelope before an assessment can affect a project. Recent AAL2 is required to approve and execute it. Execution rechecks the project governance version, prior score state and every evidence record/version. Any drift stops the transition. The model and browser never write a score directly.

Partial assessments update coverage and deterministic lower/upper bounds while leaving both headline scores null. Venture Score appears only at 100% weighted coverage. Confidence Score appears only when all factors and all four confidence dimensions are present; it is an evidence-strength measure, not a probability of success. Applying a newer assessment preserves the earlier version as `SUPERSEDED`.

## Consequences

- Project prioritisation cannot silently convert missing evidence into zero or optimism.
- Requested assessments and approval envelopes are owner-only. Applied and superseded factor/evidence summaries inherit active project access, while the approval envelope remains owner-only.
- Cross-project, unaccepted, stale-version and malformed evidence fails before an assessment is created.
- Project governance changes or evidence drift after approval prevent execution.
- Initial project records correctly remain `Not Assessed` until real evidence is reviewed and approved.
