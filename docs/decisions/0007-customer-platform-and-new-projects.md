# ADR 0007 — Customer platform, Brand Studio and controlled project expansion

Date: 19 September 2026. Status: accepted as a target architecture; not implemented.

## Context

KXRA OS began as the internal operating system for a five-venture group. The owner has now approved an additional customer-facing direction: organizations should subscribe to useful business tools, starting with an original Brand Studio; custom projects are scoped and charged separately; mandatory legal acceptance precedes private access; the owner may grant partners free access. The portfolio also adds a Finance Unfolded YouTube engine and a secure GitHub repository intelligence/reuse project.

The current schema assumes one organization membership per account, the public preview shares the private application build, and no subscriptions, entitlements, complete AI run substrate or provider adapters exist. Extending those assumptions directly would create tenant-isolation and public/private leakage risk.

## Decision

Retain the internal venture OS and add a multi-tenant customer platform through additive migrations. Normalize account identity from many-to-many organization membership. Keep authorization roles small (`KXRA_OWNER`, `KXRA_STAFF`, `ORG_ADMIN`, `ORG_MEMBER`); treat partner/customer/client as commercial metadata. Require one exact tenant and, for project work, one exact project before retrieval.

Create deterministic plans, entitlements, usage reservations and explicit owner free grants. Keep custom-project proposal, acceptance, milestones and billing separate from subscription tools. Add a first-private-access legal gate that can activate only solicitor-approved exact documents.

Build KXRA Brand Studio as the first subscription tool. Build a separate marketing application with approved public snapshots and no private import/credential path. Add Projects 006 and 007 with the hard stops in their project specifications and the current Phase Completion Brief 02.

The changed identity/tenant foundation is a prerequisite before later file, Ask, AI and provider work. Existing migrations and accepted history remain immutable. Provider activation, public publication, deployment and live billing still require their own release gates.

## Consequences

The existing five-project local implementation remains valid evidence for its current schema, but it is not customer-SaaS readiness. New RLS and negative tests must cover dual-organization identities, separate customers, entitlements, legal gates and service workers. Ask KXRA's existing all-assigned-project option must be removed for partner/customer use before any model activation.

The single self-contained execution contract is [CODEX PHASE COMPLETION BRIEF 02](../operations/CODEX-PHASE-COMPLETION-BRIEF-02.md), including AT-31 through AT-47 and owner connection steps.
