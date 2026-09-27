# Account and invitation threat model

Date: 27 September 2026. Scope: account, invitation, onboarding, selected-tenant, first-private-access legal, hosted MFA sign-in and password-recovery contracts through Phase 2 Slice 33 on `codex/phase-2-completion`. File processing, delivery and knowledge retrieval threats are detailed in the [file/knowledge threat model](file-knowledge-threat-model.md).

## Protected assets

- Account identity, credential and MFA state.
- Invitation capability, approved project/role grants and recipient email.
- Organization/project memberships, selected context, lifecycle state and active sessions.
- Legal source versions, immutable presentations/acceptances, profile data and preferences.
- Audit, security-event and transactional-delivery history.
- All project, file, finance, knowledge and future AI context reached after sign-in.

## Trust boundaries

The browser is untrusted. Auth verifies identity; it does not decide KXRA authorization. Next.js maps the verified subject to a global KXRA account, resolves current organization memberships and supplies one verified selected organization to a nonprivileged database transaction. PostgreSQL RLS and typed functions decide access, legal readiness and state transitions. The organization cookie is a selector only. Email is an untrusted delivery channel carrying a bounded invitation capability. Local Auth/email/billing transports are test doubles and are separated from production artifacts.

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
| Cross-tenant role or context confusion            | Normalized memberships; explicit selection; transaction-local verified organization; selected-tenant RLS; audited context    | Re-run through hosted pooler, caches and distributed workers       |
| Forged tenant header/body/JWT/cookie              | Inputs cannot set authority; cookie UUID is revalidated by a security-definer selector and current membership                | Verify edge/proxy/header normalization in staging                  |
| Reuse of another tenant's legal acceptance        | Acceptance binds account, membership, organization, presentation and exact document/wording hashes                           | Verify approved-document import and hosted concurrency             |
| Stale session after suspension/revocation         | Account/RLS state checked per request; session version increments; outbox is cancelled                                       | Verify Supabase global sign-out/refresh-token invalidation latency |
| Weak/reused account operation                     | Password policy and one-use reset/verification tokens; durable rate buckets; generic errors                                  | Add distributed edge/provider limits and credential-breach policy  |
| Password-only entry after TOTP enrollment         | Hosted sign-in derives assurance and the exact verified factor server-side; the actor boundary independently requires AAL2   | Exercise provider refresh, multi-tab and factor-loss behavior      |
| Forged factor ID or recovery destination          | Browser supplies only a six-digit proof; callbacks use an exact internal allowlist                                            | Inspect deployed proxy, callback and provider logs                 |
| Existing session abuses password-reset form       | Hosted reset requires a signed HttpOnly ten-minute intent bound to the exact verified recovery subject                       | Prove PKCE email-link behavior and global revocation latency       |
| Provider password changes before local audit      | Intent is consumed and global sign-out attempted regardless; response explicitly reports the changed-password recovery state | Exercise audit outage and provider timeout in staging              |
| Fixture exposure in production                    | Conditional production stubs, runtime guards and optimized-artifact marker scan                                              | Repeat against staging and deployed artifacts/metadata             |
| Concurrent/stale owner mutation                   | Current-state approval digest, recent AAL2, row locks, target/access versions and one-use execution                          | Verify real AAL2/recovery and pooler behavior                      |
| Legal placeholder misrepresentation               | Active requirements and release manifests reject `UNAPPROVED_PLACEHOLDER`; synthetic approvals exist only in tests           | Counsel/owner supplies and approves exact production documents     |

## Data minimization

KXRA tables store email digests/hints for operational views and provider-safe identity/state evidence. The invitation row currently retains normalized recipient email because local rendering and locked registration require it; RLS limits it to owner/redeeming account paths. Passwords, password reset secrets and MFA secrets do not enter PostgreSQL. Security/audit metadata is bounded and must not include raw credentials, tokens or confidential project content.

## Failure policy

Unknown, malformed, stale, expired, revoked, mismatched or rate-limited account operations return bounded generic errors. A missing provider, account, membership, agreement or project grant denies access. External delivery and hosted mutation remain disabled until their separate acceptance evidence exists.

Hosted sign-in and recovery controls are implemented against the provider contract but remain locally tested only. They do not constitute evidence that Supabase email templates, redirect configuration, refresh behavior or global session invalidation work in the connected staging project.
