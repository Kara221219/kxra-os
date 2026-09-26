# ADR 0027: Append-only Brand evidence corrections

Date: 26 September 2026  
Status: Accepted for the deterministic local and staging-ready contract

## Context

Brand Studio stores an exact source version behind every inferred profile field. Website refresh can add newer evidence without rewriting an approved profile, but customers also need to correct missing, outdated or contradictory source text. Replacing content in place would destroy provenance. Allowing an approved profile, campaign, creative request or prepared export to continue silently after its source changes would make the exact evidence binding misleading.

## Decision

A correction creates a new immutable `brand_source_versions` row classified `USER-SUPPLIED INFORMATION`. Append-only revision metadata binds the new version to the exact superseded version, reason, actor request and project. The current source pointer advances transactionally; prior source and profile versions remain unchanged.

PostgreSQL determines whether every evidence link for a profile version still points to its source's current version. It rejects profile approval, campaign creation/approval, generation start/output and export creation when evidence is stale. Final export authorization repeats the check and records `SOURCE_EVIDENCE_CHANGED` without returning content. Exact request replay returns the original correction only when its source, expected predecessor, content hash and reason match.

The UI displays current source text and revision provenance, provides an explicit correction form, marks affected profiles, and removes stale profiles/campaigns from new campaign and generation controls. The browser and model do not decide freshness.

## Consequences

- Corrections remain auditable and reversible by creating another version.
- A website refresh or human correction cannot silently change an approved profile.
- Existing approved profile history remains available, while consequential downstream actions require a replacement profile version linked to current evidence.
- A source change can invalidate a prepared export immediately before delivery.
- Hosted acquisition, model generation, publication and legal/compliance review remain separate activation gates.

## Evidence

Migration `0063`, `tests/brand-source-corrections.test.ts`, Brand Studio SQL/HTTP/browser tests, the complete RLS/function audit and the recovery drill enforce this decision.
