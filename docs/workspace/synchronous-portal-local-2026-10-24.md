# Synchronous customer portal delivery — local source

Base owner source:7177426. Frozen checkout/profile dependencies c7aa0d3 and b7d09ff were cherry-picked locally so the real shared bounded transport and profile are available. The final portal commit contains only new portal files/tests/notes plus the explicitly requested five-line shared100 SQL guard. Integrate that commit after the existing dependency work, not these duplicate local dependency cherry-picks.

## Frozen HTTP and availability contract

`POST /api/live-billing/portal` accepts exactly `{request_id:UUID,offer_key:approvedOffer}`. No actor, org, role, kind, mode, provider ID or URL input exists. It checks same origin and bounded JSON; responses are private/no-store/no-referrer. `portalDeliveryConfiguration(env)` is exported from `packages/authz/portal-delivery.ts` for server availability props. It checks `KXRA_PORTAL_DELIVERY_ENABLED=true`, existing `KXRA_MODERN_BILLING_DISPATCH_ENABLED=true`, production Node mode, exact project and canonical origin. Both flags remain unchanged/off by default. This function reads no credential settings.

The real server principal must be verified active Supabase CUSTOMER/ORG_ADMIN with recent AAL2 MFA and current legal acceptance, before a shared actor/tenant-derived8-per900-second portal rate budget. Signup admission does not authorize or disable this existing-customer path. Only then does the authenticated own-tenant100 request API reserve PORTAL under the fixed server mode. No privileged worker operation or credential-profile load precedes that reservation.

## Universal outstanding-request hold

The five-line addition to `modern_core_request_live_billing_intent` runs under its existing org advisory lock, after exact UUID replay and before a fresh insert. A new PORTAL UUID is refused while that org has another PORTAL in REQUESTED, INFLIGHT or UNCERTAIN. This protects every existing authenticated wrapper, not just the new HTTP endpoint. Exact replay returns its recorded state. A separate explicit user operation after known CONSUMED may reserve a fresh UUID. No helper, role, grant, table or0113 migration was added. Preserve the owner's other100 parser fixes during integration; this is a narrow diff to an unpublished migration.

## Actual synchronous source flow

1. Authenticated reservation must return the same request UUID in REQUESTED state. Claimed/UNCERTAIN/CONSUMED replays stop before credential load or provider work, with manual-review guidance.
2. Reuse the existing worker/key/TLS configuration and actual immutable107 attestation factory. The worker executor opens a short transaction and requires the real `kxra_billing_runner` LOGIN → `kxra_billing_worker` role pair; no admin login is borrowed or role created.
3. Claim the original UUID through the mode-fixed existing100 capability. Compare canonical UUID, actor, org and approved offer to the authenticated request again after the claim, preventing a foreign UUID race from reaching provider IO.
4. Run the existing shared LIVE/STAGING_SANDBOX PORTAL adapter outside SQL transactions, with fresh HTTP-principal/legal and worker-current fences before/after provider work. The bounded transport permits only account/current price/customer/configuration GETs and one exact portal-session POST: five calls total, one POST, bounded body/time, no arbitrary endpoint/connected-account header/customer/config/return URL. The reviewed portal configuration must permit cancellation and disable subscription updates as enforced by the existing adapter. No configuration or subscription is changed directly by this code.
5. Validate the ephemeral Stripe URL and adapter-derived portal expiry (`created+1800`). Persist only safe finish metadata: original UUID, outcome, provider session ID and hash. URL and expiry are absent from durable receipts/hash inputs. Atomic100 finish rechecks current generation and downgrades late authority/kill-switch loss to UNCERTAIN. Lost/uncertain completion never yields a URL or automatic retry.
6. Only after durable CONSUMED, fresh HTTP authority and exact authenticated replay recheck does this response return `{state:'READY',request_id,url,expires_at,delivery_ready:true,dispatch_ready:false,entitlement_authority:false}`. This enables no paid access and claims no overall background dispatcher readiness.

No portal GET recovery exists. If the response is lost after CONSUMED, the URL cannot be recovered from application storage. A replay reports review required; it never repeats POST. A user may explicitly request a separate new operation once the prior state is known CONSUMED. An already delivered URL is a short-lived external bearer capability; app-side checks at response time do not promise revocation of an already-issued Stripe URL.

## Documented portal URL forms

Client-safe `packages/workspace/portal-url.ts` exports `validatedPortalDeliveryUrl(input,livemode?)`. No Node, server, key or configuration imports exist. It permits exact HTTPS `billing.stripe.com` with no credentials/port/hash, either:

- `/p/session/<opaque-token>` with no query; or
- exact `/p/session?secret=live_...` / `?secret=test_...`, one secret query only, optionally checking the attested server mode.

This second form is shown in Stripe's actual portal-session documentation: [Session object](https://docs.stripe.com/api/customer_portal/sessions/object), [Create session](https://docs.stripe.com/api/customer_portal/sessions/create). Neither form is logged or persisted here. The client should structurally validate the returned URL with this helper and still require matching UUID, future expiry and no entitlement authority; never send a client mode to the API.

## Verification boundary

- `node --import tsx --test tests/synchronous-portal.test.ts`:16 passing pure/injected checks. Includes actual shared PORTAL adapters in both modes, positive five-call/one-POST flow, updates-enabled config rejection before POST, untrusted body/destination/credential-header rejection, foreign actor/org/race, default-off-before-credential-load, uncertain/lost/consumed replay, late authority/kill switch, actual worker facade scope wrappers and admin SET ROLE identity rejection, plus both documented URL forms.
- Complete repository TypeScript check passes. New TS files pass Prettier; whitespace check passes. No assertion or build threshold was relaxed.
- `tests/portal-reservation-concurrency.db.test.ts` is automatic native test SOURCE only, not executed by this worker. Its generated private credential-free Unix-socket/no-TCP guard precedes setup. Two independent transactions must show actual SQL lock contention and exactly one portal reservation; original UUID replay, INFLIGHT hold, known-CONSUMED fresh operation, late activation-loss UNCERTAIN persistence and fresh-UUID rejection are asserted. Synthetic committed intent history is retained in the disposable fixture; cleanup disables only that test activation/mapping. Local admin SET ROLE in this SQL capability test is explicitly not proof of the genuine runtime runner profile.

Owner still must run exact combined native migrations/tests (LIVE and separate STAGING_SANDBOX fixtures), full API/browser navigation/response-loss/concurrency acceptance, production artifact boundary and actual sandbox provider cancellation lifecycle. No real credentials, provider/DB/browser calls, hosted schema, permissions, portal settings, legal/tax/banking settings, charges, deployments, staging holds or publication changed in this task. The source implements the synchronous flow; genuine hosted/provider readiness remains unverified.
