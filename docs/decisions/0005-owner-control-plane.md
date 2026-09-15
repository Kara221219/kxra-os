# ADR 0005 — Typed owner control plane and explicit Idea access

Date: 15 September 2026. Status: accepted for Final Milestone 2 local implementation.

## Context

The Genesis foundation stored useful classified records, but generic record lists could not satisfy the frozen Dashboard, Portfolio, Idea Inbox, approval, Work Log and Admin contracts. In particular, ordinary project sharing was too broad for Ideas: a partner must see their own submissions and explicitly shared Ideas only, while project assignment remains a separate prerequisite. Missing Venture and Confidence scores must remain unknown rather than receiving invented values.

## Decision

Keep PostgreSQL as the source of truth and add typed sidecar tables for Ideas, Idea history, Idea evidence, explicit Idea shares, project-governance history and Work Log entries. Preserve the original project stage/status fields as source material and place reviewed lifecycle/disposition changes in versioned governance columns.

Disallow generic Idea writes. Create and update Ideas only through typed database functions with exact input shape, current-version checks, valid state transitions and evidence-version validation. A partner can read an Idea only when all of these are true:

1. the account, organisation and exact project membership are current;
2. the partner submitted the Idea, or an owner granted a current explicit share;
3. the underlying typed Idea and generic record pass the same RLS decision.

Use complete approval envelope version 2 for every newly enabled consequential request. Bind action summary, before/after state, recipient, cost fields, risk, organisation, project, requester, environment and expiry into the immutable digest. Require recent AAL2 and one-use, version-checked execution for Idea sharing and project governance.

Compute Dashboard counts and Portfolio aggregates directly over the complete RLS-scoped PostgreSQL result, independent of display pagination. Keep score, finance and recommendation unknown where evidence is absent. Build the Work Log as a projection of persisted audit and security events. Make Admin owner-only, audit every view and expose connection presence rather than secret values or generic mutation controls.

## Consequences

Partner project assignment no longer implies access to the group Idea Inbox. Sharing and revocation are explicit, reviewed and immediately enforced at SQL and HTTP layers. Idea versions and evidence references remain attributable. Portfolio ordering is stable, and null values remain honest.

The control plane adds six RLS tables and ten exposed typed functions, increasing the local authorization matrix to 36 tables and 52 functions. Future workflow, AI, routine and delivery milestones must append genuine Work Log source types rather than simulate activity. External execution, real AAL2 and hosted provider behavior remain blocked until their later milestones and staging gates.
