# Isolated AI admission resume preparation

Based on reviewed AI admission source 2bf5992c08dca0ad35548349d6e6bcd1ac682901. This branch is not merged into the integration or production review branches. No hosted changes, provider traffic, real keys or database application are authorized by this packet.

The new GET /api/ai-connection-admission endpoint uses the server actor and scoped database transaction. Its proposed function accepts only an optional intent UUID, requires the current MFA owner/account session, and returns only that actor's own intent in the current organization. An omitted UUID reads the latest own intent; a foreign explicit reference fails closed. Its eight-field DTO has no key, ciphertext, fingerprint, evidence, endpoint URL or actor/tenant identifiers. It grants no review, vault or execution authority. Existing save checks remain authoritative and race-sensitive.

The UI reads current status on mount and supports a manual reference. Pending review hides the key form. Only current clearance allows resubmission with the immutable admission_id and locked provider/model/endpoint; the key must be entered again. A business review absent at original registration cannot be retroactively bound: complete business review and create a new intent. Expiry, session change and business-review replacement require a new intent. Withdrawal/block requires support, never automatic regrant. Saved status ignores the initial activation deadline but still checks continuing review. Network/invalid responses hide the key form until a fresh status check. Submitted passwords are immediately cleared and never placed in React state, refs, browser storage or status metadata.

## Decisions required before production integration

- Name the independent business/provider review authority and evidence issuer; define review/correction/withdrawal procedures and operator separation. No customer or AI can approve its own request.
- Confirm supported provider/account modes, regional/commercial eligibility and acceptable evidence. Current proposal requires GOOGLE_PAID for Google and CUSTOMER_BILLED elsewhere; this is an unaccepted production policy, not a promise that subscriptions or provider accounts work commercially.
- Decide whether owner plus current MFA remains mandatory, or design a separately reviewed member delegation model. This branch preserves owner-only behavior.
- Approve activation TTL, review expiry/replacement, evidence retention/privacy and customer appeal procedure. Existing proposal defaults are preserved, not newly approved.
- Plan legacy connection migration and draining/cancelling running jobs. Missing admission snapshots deny execution; migration must never silently renew/rebind authority. Already accepted external requests cannot be recalled.
- Review exact production migration and source manifest, full ACL inventory, fresh-target recovery, status RLS/HTTP access negatives, expiry/revocation races and provider acceptance. This proposal remains unnumbered and unapplied; there is no production manifest entry.
- Complete actual signup/payment/legal/provider setup acceptance separately. Saving a reviewed connection does not prove inference, payment acceptance, provider suitability or live readiness.

## Verification boundary

Pure DTO and mocked browser tests can validate the public resume contract without a database. Native function installation, SQL syntax execution, current-session/tenant/RLS behavior and full extension recovery remain NOT RUN in this preparation because the parent explicitly holds database application. Production integration must wait for those results and the policy decisions above. Main release guard and production117 candidate remain unchanged.
