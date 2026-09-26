# Transactional email staging activation

This playbook activates one controlled non-production sender after core staging passes. It does not authorize real customer or partner contact.

1. Verify a dedicated sending subdomain in Resend. Keep the root domain and public marketing project free of provider credentials.
2. Choose the exact `KXRA_EMAIL_FROM` value and one owner-controlled staging recipient. Approve all nine rendered templates before sending.
3. Create a restricted database login that may assume only `kxra_email_worker`. It must not be superuser, own KXRA objects, bypass RLS or assume `authenticated`.
4. Generate a 32-byte random encryption key, encode it as base64url and store it as `KXRA_EMAIL_SECRET_KEY` in the private OS and worker secret stores only.
5. Store `KXRA_EMAIL_WORKER_DATABASE_URL`, `RESEND_API_KEY` and `KXRA_EMAIL_FROM` only in the worker. Store `RESEND_WEBHOOK_SECRET` and the worker URL in the private OS server environment. Never add them to marketing or client variables.
6. Register `https://<private-staging-origin>/api/webhooks/resend` for delivered, delivery-delayed, bounced, complained, failed and suppressed email events.
7. Keep `KXRA_EMAIL_ENABLED=false` while running configuration preflight. Activate email only in a separately reviewed provider environment after the restricted role and recipient allowlist are confirmed.
8. Send one synthetic invitation to the controlled address. Verify ciphertext exists without plaintext token, one provider request uses the outbox operation key, provider acceptance records `SENT`, and the signed event records `DELIVERED`.
9. Exercise invalid signature, replay, expiry, revocation-before-send, 429 retry, permanent failure and uncertain transport. Uncertain transport must remain `RECONCILIATION_REQUIRED` with no automatic resend.
10. Rotate the webhook secret and prove both provider-documented transition signatures during the rotation window. To rotate the encryption key, first cancel or drain every queued secret and issue fresh links.

Record commit, environment, sender domain, controlled recipient owner, provider message/event IDs, timestamps and redacted results in acceptance evidence. Delete the synthetic account after the retention check. Leave real invitations disabled pending legal copy and owner approval.
