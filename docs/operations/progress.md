# KXRA OS implementation progress

Updated: 15 September 2026. Status: **Final Milestone 1 complete in the deterministic local environment; not hosted or production ready**.

Current branch: `codex/phase-2-completion`. Requirements-freeze baseline: `4e597ea2039f8758a254cf42637baff26e7067a2`. Reviewed Genesis implementation ancestor: `0c20de47fe1f6cb38646db51c4a90650679aacd7`. Milestone 1 implementation: `7cbc227bb8e03ff0b5f41d930ae8cbe1d9ece7d9`.

The [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) supplements the Genesis and [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md). Requirements omitted from the latest brief were not deleted. Current executable status is recorded in [acceptance evidence](acceptance-evidence.md).

## What was built

Migrations `0014`–`0021` add the production-shaped local account domain without altering prior migrations:

- profiles and server-controlled account lifecycle;
- multi-project invitation grants and separate approved-grant/delivery versions;
- mandatory nine-step onboarding and exact-version agreement acceptance;
- user preferences, provider-neutral session revocation and account security events;
- transactional email outbox and durable rate-limit buckets;
- exact approval/execution for account lifecycle and project-assignment changes;
- RLS isolation for incomplete, suspended and revoked accounts.

The Next.js application now provides:

- owner invitation creation with exact project/role assignments, note and expiry, plus list/resend/revoke controls;
- a branded fragment-token join route, encrypted short-lived join intent, locked email, partner-created password, email verification and atomic redemption;
- a nine-step responsive onboarding wizard with safe back/forward/refresh/mobile resume and mandatory re-entry for new required agreements;
- partner Profile, Security, Preferences, Assignments and WhatsApp controls;
- owner lifecycle, assignment, role, forced-session-revoke and WhatsApp-unpair controls;
- deterministic fake Auth/email providers for local verification only;
- production import-condition stubs and an optimized-artifact fixture scan;
- mobile navigation and account-surface reflow through 320px/200% zoom.

Existing AT-01 through AT-09 operating, finance, seed, file, evidence and project-gate behavior remains passing. Project 004 remains research/paper only. Project 005 remains demand-first; no product creation or publication executor exists.

## Verification

| Check                              | Result                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run check`                    | PASS — typecheck; 53/53 database/domain/HTTP tests; production Next.js build; artifact scan                   |
| `npm run test:artifact`            | PASS — production output excludes all 16 fixture identity, selector, state and secret markers                 |
| `npm run test:restart`             | PASS — 22 completed tasks and 30 accepted supersessions matched across controlled restart                     |
| Account Playwright spec            | PASS — 3/3 owner/partner journey, mobile resume and responsive/keyboard cases                                 |
| Existing workspace Playwright spec | PASS — 6/6 existing desktop/mobile cases                                                                      |
| `npm run format:check`             | PASS                                                                                                          |
| `git diff --check`                 | PASS                                                                                                          |
| Secret/source boundary scan        | PASS — no credential pattern; original documents, full research, runtime and browser artifacts remain ignored |

Representative pages were rendered and inspected at 1440, 768, 390 and 320 CSS pixels and at a 200% zoom reflow equivalent. No horizontal document overflow was observed; owner partner administration collapses before tablet width, mobile navigation is keyboard operable and onboarding remains usable. Local screenshots remain excluded under the repository publication rule.

## Acceptance status

- AT-01 and AT-02 remain **PASS** against 30 RLS tables and 42 exposed functions.
- AT-03 remains **BLOCKED** overall because hosted Supabase identity/MFA/session behavior has not run; its expanded deterministic local subset passes.
- AT-04 through AT-09 remain **PASS**.
- AT-19, AT-20 and AT-21 are **PASS in the deterministic local environment**.
- AT-25's local fake-template/outbox subset passes; full AT-25 remains **BLOCKED** pending an authorized provider test.
- AT-10 through AT-18 remain blocked overall. The Milestone 1 account-specific responsive subset of AT-18 passes.
- AT-22 through AT-24 and AT-26 through AT-29 are **NOT RUN**. AT-30 remains **BLOCKED**.

## Security status

PostgreSQL remains authoritative. Every private request uses a verified principal and nonprivileged transaction-local RLS role. Partner access requires active account, organisation membership, exact project membership and shared data. Suspension/revocation removes access at UI, HTTP and SQL layers. Raw invitation tokens are fragment-delivered, immediately stripped, digest-only in storage and exchanged for a 30-minute AES-GCM HttpOnly cookie. Password and MFA secrets stay in Auth. The local provider is excluded from production builds by conditional modules and artifact scanning.

No production deployment, hosted mutation, real owner/partner account, real credential, external email, provider message, paid model call, spending, publication or trading occurred.

## Active blockers and owner inputs

- Real Terms, Privacy and any required agreement text need qualified owner approval; the two local documents are visibly `UNAPPROVED_PLACEHOLDER`.
- Hosted owner identity, Supabase project, MFA/recovery policy and controlled staging authorization are required only at Milestone 11.
- Resend sender/domain and notification policy remain unapproved and unconnected.
- Storage/scanner, Trigger.dev, OpenAI, Meta, PostHog, Sentry, Cloudflare and Vercel credentials/configuration remain absent by design.
- Provider session revocation, delivery failure/bounce behavior, hosted RLS/pooler behavior and telemetry redaction remain unverified.

## Next safe action

Proceed to Final Milestone 2 only: typed Owner Dashboard, complete Portfolio and Idea Inbox behavior for FR-07, FR-08 and FR-10, with AT-22 evidence. Preserve all current account, RLS, project and hard-stop tests. No provider connection or deployment is needed for that slice.

## Publication boundary

Only application code, engineering documentation and required seed registers may enter the public `Kara221219/kxra-os` repository. Original Word/text sources, the full private Genesis research/brief, archives, `.runtime`, credentials, screenshots and test artifacts remain excluded.
