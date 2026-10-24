# Hosted self-service implementation — local acceptance only

The source is default-disabled. Turning on a client flag or supplying user metadata cannot enable admission. A reviewed hosted Auth hook/settings change and server+database gates are required separately. No hook was configured or hosted resource changed.

## Identity and recovery

Pre-auth server registration stores only SHA256 email/proof digests. The Auth-admin invoker wrapper consumes a matching current-revision proof for one provider subject; another subject, wrong email/provider, expiry, revocation or revision drift denies it. No caller role/org/user ID is authoritative. The existing invitation hook remains the fallback and retains one-use behavior. Email verification is read from verified server Supabase identity, never the signup response.

Provisioning requires current verified server identity and admission, locks the subject and creates only a CUSTOMER/ORG_ADMIN tenant, first project and onboarding records. Retry recovers the same canonical receipt and cannot rename/convert another offer or grant paid work. A separate own-identity status permits pre-tenant recovery without exposing other tenant records. Revoked/stale authority requires human access review; the UI cannot override it.

Auth fetch is restricted to the pinned staging/production HTTPS Auth endpoint, rejects redirects, caps retained response bytes at 1 MiB and total fetch/body time at 10 seconds, preserves cancellation and sanitizes errors. A timeout can have succeeded remotely; no automatic signup retry occurs. Verification flow uses PKCE and exact internal callback destination. Genuine delivery and hosted email-confirmation settings are not proven by stub tests.

## Evidence

Task artifacts under release-artifacts/ci-publication-e37ce73:

- hosted-self-service-focused.log: initial 37 checks/browser/build pass.
- hosted-self-service-focused-initial-rate-contract-failure.log and hosted-self-service-focused-tenant-expectation-failure.log: retained diagnosed failures; global limiter subject hash corrected, tenant test corrected without changing RLS.
- hosted-signup-reviewed-focused.log: 50/50 service contracts, 99/208 migration verification, 11 browser passes/three existing skips, OS build pass; before final body-cap transport revision.
- hosted-signup-final-transport-contract.log: 25/25 integrated transport/recovery/SDK contract checks on final transport.
- hosted-signup-final-typecheck.log: root strict typecheck pass.
- auth-transport-evidence: worker transport tests and repeated cancellation checks, exact commit 366d7fc.

The browser/SQL tests use disposable local fixtures and injected provider responses. They do not establish real Supabase user creation, delivery, SMTP, cross-device callback or hosted tenant acceptance. Broad final-source CI, genuine sandbox payments, email/model/connector/worker/file scan and exact recovery/rollout remain mandatory.

## Activation gates

Keep KXRA_HOSTED_SELF_SERVICE_ENABLED=false and database config disabled. Reconcile exact applied migration hashes, rehearse 98/99 on a separate clone of the approved limited copy, then obtain exact staging migration/config/deploy actions. Apply the additive Auth wrapper only with its exact hosted security-setting approval and confirmed email-verification/redirect settings. Test invitations, signup/verification/reset/session recovery, duplicate requests, first workspace and two real tenant isolation before enabling public admission. No existing credentials, offers, customer subscriptions or build holds are changed by this source.
