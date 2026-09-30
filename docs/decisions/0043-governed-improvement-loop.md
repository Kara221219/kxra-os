# ADR 0043 — Governed improvement signals use existing operating evidence

Date: 30 September 2026  
Status: Accepted

## Context

KXRA OS already stores ideas, experiments, experiment results, decisions, AI runs, routine runs, enquiries and approvals. These were available through separate registers, so the owner had to discover stalled work manually. Calling the platform “self-improving” without connecting those records would create autonomous-AI theatre and could encourage an agent to infer permissions, approve itself or act on unverified output.

## Decision

Add an owner-only Improvement Loop that derives a deterministic queue from current PostgreSQL records under the verified owner transaction and RLS context. The first signal classes are:

- failed AI or routine run → repair;
- measured experiment without a linked decision → decide;
- current experiment without a result → measure;
- current promising idea without an exact-version experiment → test;
- unverified public enquiry → review.

The view ranks these signals but creates no autonomous mutation. It links into the existing typed experiment, decision, run, enquiry and approval paths. The endpoint calls the existing owner boundary before querying. Partners receive neither navigation nor API access.

## Consequences

KXRA can improve from measured outcomes while PostgreSQL remains authoritative. Models may later help summarize an already-authorized signal, but cannot calculate access, change the queue’s authority, approve work, spend, publish, deploy, contact a customer or release a product. A new signal class requires explicit tests and an authorization review.

