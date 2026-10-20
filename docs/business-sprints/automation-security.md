# Automation and security

## Implemented assistance

- Package selection prefills from a validated public query parameter.
- Server validates structured intake and assembles bounded text into the existing enquiry storage, preserving consent, origin, rate limits, bot trap and request identity. Retrying an unchanged request reuses its idempotency key.
- Private package preference is saved with the request's constraints.
- Owner preparation endpoint builds a deterministic proposal draft from a database-authorised request and public package definitions. It issues no contract, changes no price record and calls no LLM.
- Owner and customer next-step guidance derives from existing request/proposal states.
- Authorised delivery summaries can be downloaded as versioned plain text through authenticated database RLS; downloads are private and never cached publicly.
- Existing proposal hashing, acceptance, refunds, net payment gates, project creation, delivery acceptance and commercial change authority remain authoritative.

## Boundaries

Public catalog source contains no private request, internal triage, credentials or project evidence. Public enquiry does not create account access. Draft API verifies server identity, calls database capability checks and reads through authenticated RLS. Customers cannot invoke owner preparation even with crafted IDs or forged role headers. Readiness depends on real production memberships and MFA.

Future AI drafting must retrieve authorised evidence before model execution and log agent/skill/model/input/output/review and cost within the existing AI run system. It must not choose permissions, calculate finances, issue proposals, settle payments or auto-publish delivery. Unconnected AI/email/billing/storage must remain visibly unavailable.

## Payment readiness

Current custom-project payments are controlled evidence records. Existing Stripe integration is test-mode subscription billing; it is not a live one-off project Checkout implementation. Do not present a card-pay button or claim automated project settlement until exact project/proposal/version/amount/currency verification, webhook authenticity, duplicate handling, refunds, expired proposals and cross-tenant tests pass. An owner-verified bank receipt can use the existing evidence path when commercially agreed, but it is manual confirmation.
