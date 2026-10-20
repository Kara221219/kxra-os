# ADR 0055 — Project workrooms, owner review tools and studio retirement

Date: 16 October 2026. Status: local implementation; not deployed.

## Decision and authority

The owner requested Kylon-inspired collaboration, the four supplied video references for personal use, and explicitly confirmed removal of **both Brand Studio and Video Studio**. These requirements supplement Genesis; they do not remove the eight C’s, approvals, RLS, project isolation or source classification.

Reuse existing PostgreSQL project memberships and versioned `kxra.records` notes for shared discussions and private owner review packs. Server identity, organisation context and RLS remain authoritative. The client cannot select its author, role or visibility. No new migration is required.

Workrooms provide durable discussions, replies and a bounded discussion-only export. They are manually refreshed; no realtime synchronization or live agent membership is claimed. Advisory reviews provide five analytical perspectives, explicit evidence/uncertainty, owner-reviewed score matrices and deterministic weighted rankings. A ranking is neither a probability nor an execution approval. No provider is called and no agent-run event is fabricated.

Retire both studio routes with an explanatory page, remove their navigation and promotions, return authenticated API status 410, and stop creating new subscription checkout sessions. Retain records, historic jobs, approved legal-pack bytes and billing portal access. Subscription packaging must be reviewed before checkout resumes; no replacement price or promise is silently approved. Existing provider subscriptions are not cancelled by this local change.

## Boundaries

- Public marketing describes workrooms without exposing personal video references or owner review content.
- Shared discussion retrieval requires current project access. Exports include only the selected shared thread and up to 200 replies, never all project files or owner-only notes.
- Private board endpoints require owner role; data is also owner-only under RLS. Review pages list the current owner's reviews. Existing organisation-owner privileges on generic records remain unchanged; this is not a separate vault inaccessible to another authorised organisation owner.
- Existing note editing/version history remains available; workrooms do not create a second permissions engine.
- Replayed create requests return the same matching record; changed content using the same ID is rejected. Review updates reject stale versions.
- REA is a research source, not installed code or a trusted executable integration.
- No production deployment, external sends, real credentials, subscription cancellation or autonomous execution in this change.

## Acceptance contract

1. Owner and assigned contributor create a shared discussion/reply and see it after reload.
2. Anonymous requests receive 401; unassigned/crafted project and thread combinations disclose nothing; viewers cannot write.
3. Direct authenticated SQL excludes another project's thread and owner-only board record.
4. Membership revocation blocks subsequent detail and export requests.
5. Discussion export excludes private notes and carries private/no-store headers.
6. Partner cannot access advisory endpoints or find owner notes through generic records.
7. Reviewed score totals match fixed code weights; missing/invalid scores, duplicate options and stale updates fail.
8. Desktop and mobile workflows save, reload and export; no horizontal page overflow.
9. Studio navigation and promotional links are absent. Old studio API paths and new subscription checkout return 410. Billing portal/history are retained.
10. Optimized builds, existing permission suites, public/private boundary checks and secret scan remain passing.
