# ADR 0011 — Governed KXRA Brand Studio local product

Date: 24 September 2026. Status: accepted and implemented with a deterministic local text adapter; source fetching, external generation and publication remain disabled.

## Context

The Phase Completion Brief establishes KXRA Brand Studio as the first subscription product: a source-linked, customer-correctable brand profile followed by campaign briefs, editable creative, rights/claims review and export. The commercial foundation already provides tenant selection, project RLS, entitlements and transactional usage reservations. The AI substrate provides permission-safe evidence envelopes, but no external model has approved data, retention, region or budget controls.

A shallow demo could infer a profile, display generated copy and offer a publish button. That would lose source provenance, permit stale approvals, blur subscription authority with project authority and imply external capabilities that are not connected.

## Decision

Implement Brand Studio as a project-scoped, versioned product workflow under PostgreSQL authority:

1. a user with current project-write access and `brand-studio.access` supplies a consented text snapshot and rights basis;
2. KXRA creates a source-linked draft profile whose inferred fields are classified and evidenced;
3. corrections create a new immutable draft version; an exact decision approves or rejects that version without overwriting the previous approved version;
4. a campaign brief binds one exact approved profile version and requires its own exact approval;
5. generation reserves `brand.generate` units before dispatch and records an input hash, adapter and adapter version;
6. the current local adapter makes no network or model call and creates bounded text variants in `REVIEW_REQUIRED` state;
7. editing creates a child variant and supersedes the parent;
8. export approval binds the exact creative hash and requires explicit brand, claims, rights, accessibility and compliance checks;
9. export creation reserves `brand.export`; each download rechecks current membership, project access, current entitlement and exact review/content state before returning private no-store bytes.

Store source, profile, campaign, creative, review, export, delivery and product-event evidence in dedicated RLS tables. Expose only bounded authenticated functions for state changes. Direct DML remains unavailable to browser roles.

Accept a public HTTPS locator only as metadata. The current implementation requires the user to paste the source snapshot and records the fetch state as `PROVIDER_DISABLED`. It does not resolve DNS, follow redirects or fetch remote content. A later fetch adapter must add DNS rebinding/redirect controls, response limits, MIME checks, rate limits and staging evidence before activation.

Keep publication and scheduling outside the product. Export is authorization to download a reviewed artifact, not authority to send, spend, schedule or publish. No publication executor, provider credential field or hidden automatic action is present.

Seed a provenance-backed `brand-studio` tool catalogue definition and three local fixture entitlements only: `brand-studio.access`, `brand.generate` and `brand.export`. Do not seed a paid subscription or claim a live £30 plan.

## Consequences

- Customers can complete a truthful first-value loop locally while every consequential transition remains reviewable and version bound.
- A partner sees Brand Studio data only for currently assigned projects; viewers can read only their assigned project and cannot mutate it.
- Quota and money remain deterministic database state. The generator cannot grant access or alter usage.
- The implementation supports text, Markdown and JSON export. Image/video generation, remote source refresh, asset transformation, provider queues and publication remain future work.
- Brand generation is separate from Ask KXRA's approved AI run contract. Any external model adapter must use an approved model/skill/budget policy or an equivalently reviewed execution contract and must retain run/provider evidence.
- AT-35 and AT-36 are partially satisfied locally. Remote fetch/refresh, external-model failure/eval evidence, full asset rights workflow and staging revocation remain open.

Implementation: migrations `0047`–`0048`, `packages/brand-studio`, Brand Studio server/UI modules, `tests/brand-studio.test.ts`, `tests/brand-studio-http.test.ts` and `tests/e2e/brand-studio.spec.ts`.
