# Transactional email threat model

## Protected assets

- one-time invitation links and recipient addresses;
- organization, account, invitation and project-assignment boundaries;
- sender reputation and provider quota;
- delivery, failure, bounce and complaint evidence;
- provider API and webhook credentials.

## Threats and controls

| Threat                                       | Control                                                                                                                                                        | Remaining boundary                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Database reader recovers an invitation token | AES-256-GCM ciphertext with worker-only key; SHA-256/AAD binding; no plaintext token column                                                                    | Key custody and rotation require the staging secret store                                               |
| Browser or model sends email                 | Worker functions are private and granted only to a no-login/no-bypass role; the hosted worker accepts an empty POST with one timing-safe server trigger secret | Trigger.dev scheduling and hosted secret rotation remain staging work                                   |
| Revoked invitation is sent                   | Claim checks current state; final authorization repeats state, expiry, version and digest checks                                                               | Provider call follows authorization, so idempotency and reconciliation cover the final network interval |
| Retry sends duplicate mail                   | Stable operation key is the Resend idempotency key; attempts are bounded                                                                                       | Provider retains idempotency state for a limited period; delayed manual replay needs review             |
| Timeout causes blind resend                  | Unknown transport outcome becomes `RECONCILIATION_REQUIRED`                                                                                                    | Operator/provider reconciliation is required                                                            |
| Forged webhook changes state                 | Verify exact raw bytes, timestamp, event ID and signature before parsing; deduplicate event ID                                                                 | Staging must prove real secret rotation and delivery                                                    |
| One provider message maps to two outbox rows | Unique provider-message index                                                                                                                                  | None in the current schema                                                                              |
| Public marketing obtains email credentials   | Staging preflight rejects every email credential and worker trigger secret in marketing; the Resend key is confined to the separate worker                     | Vercel project separation must be evidenced                                                             |
| Sensitive project content leaks in email     | Nine bounded renderers contain operational copy and links only                                                                                                 | Counsel/owner must approve final sender copy                                                            |

## Hard stops

- `KXRA_EMAIL_ENABLED` defaults to `false`.
- Missing/invalid worker login, trigger secret, sender, encryption key, API key or webhook secret fails closed.
- Invalid, expired or altered signatures return a generic rejection and perform no write.
- Provider activation does not authorize real partner invitations or customer contact.
