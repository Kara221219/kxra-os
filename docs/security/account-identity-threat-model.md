# Account and invitation threat model

Date: 15 September 2026. Scope: Final Milestone 1 local account, invitation, onboarding and administration paths at implementation commit `7cbc227bb8e03ff0b5f41d930ae8cbe1d9ece7d9`.

## Protected assets

- Account identity, credential and MFA state.
- Invitation capability, approved project/role grants and recipient email.
- Organisation/project memberships, lifecycle state and active sessions.
- Agreement versions/acceptances, profile data and preferences.
- Audit, security-event and transactional-delivery history.
- All project, file, finance, knowledge and future AI context reached after sign-in.

## Trust boundaries

The browser is untrusted. Auth verifies identity; it does not decide KXRA authorization. Next.js maps the verified subject to a KXRA account and supplies claims to a nonprivileged database transaction. PostgreSQL RLS and typed functions decide access and state transitions. Email is an untrusted delivery channel carrying a bounded invitation capability. The local fake Auth and email transports are test doubles and are separated from production artifacts.

## Threats and controls

| Threat                                            | Implemented local control                                                                                                    | Remaining hosted verification                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Public or role-selecting registration             | Profile registration requires a valid encrypted join intent; role/project grants come only from invitation rows              | Verify hosted callback/configuration has no open path              |
| Invitation leak through URL/referrer/logs/storage | Token is a fragment, removed immediately, posted once, hashed before lookup and excluded from responses/cookies/logs/storage | Verify CDN, proxy, Sentry and PostHog capture policy               |
| Stolen/replayed invitation                        | Digest-only storage, expiry/revocation/current-version checks, locked verified email and atomic one-use redemption           | Exercise real email/Auth transitions and concurrent hosted use     |
| Resend restores stale grant                       | Delivery version/token rotates while approved grant version stays immutable; material changes replace invitation             | Verify provider cancellation/reconciliation behavior               |
| Email/role/project forgery                        | Server reads verified Auth email and current DB grants; strict schemas and composite foreign keys reject body claims         | Verify Supabase claim/email-confirmation semantics                 |
| Onboarding bypass                                 | Actor creation requires active state, completion timestamp and current required agreements; SQL controls completion          | Verify hosted route/cookie refresh and multi-tab behavior          |
| Self-promotion or cross-project access            | No partner mutation grants protected fields; RLS requires active exact memberships                                           | Re-run through hosted pooler and Storage                           |
| Stale session after suspension/revocation         | Account/RLS state checked per request; session version increments; outbox is cancelled                                       | Verify Supabase global sign-out/refresh-token invalidation latency |
| Weak/reused account operation                     | Password policy and one-use reset/verification tokens; durable rate buckets; generic errors                                  | Add distributed edge/provider limits and credential-breach policy  |
| Fixture exposure in production                    | Conditional production stubs, runtime guards and optimized-artifact marker scan                                              | Repeat against staging and deployed artifacts/metadata             |
| Concurrent/stale owner mutation                   | Current-state approval digest, recent AAL2, row locks, target/access versions and one-use execution                          | Verify real AAL2/recovery and pooler behavior                      |
| Legal placeholder misrepresentation               | Seed records and UI label exact versions as `UNAPPROVED_PLACEHOLDER`                                                         | Owner supplies qualified approved documents                        |

## Data minimization

KXRA tables store email digests/hints for operational views and provider-safe identity/state evidence. The invitation row currently retains normalized recipient email because local rendering and locked registration require it; RLS limits it to owner/redeeming account paths. Passwords, password reset secrets and MFA secrets do not enter PostgreSQL. Security/audit metadata is bounded and must not include raw credentials, tokens or confidential project content.

## Failure policy

Unknown, malformed, stale, expired, revoked, mismatched or rate-limited account operations return bounded generic errors. A missing provider, account, membership, agreement or project grant denies access. External delivery and hosted mutation remain disabled until their separate acceptance evidence exists.
