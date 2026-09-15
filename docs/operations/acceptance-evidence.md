# Phase acceptance evidence

Review date: 15 September 2026. Branch: `codex/phase-2-completion`. Requirements-freeze baseline: `4e597ea2039f8758a254cf42637baff26e7067a2`. Reviewed Milestone 1 implementation: `7cbc227bb8e03ff0b5f41d930ae8cbe1d9ece7d9`.

This ledger records executable evidence against the cumulative Genesis, Phase Completion and Final Completion contracts. The environment used Node.js 22.22.3, synthetic identities, deterministic local Auth/email doubles, a Unix-socket-only PostgreSQL 14 cluster and a local Next.js preview. No real credentials, hosted mutation, external send, paid call, product publication, trading or deployment occurred.

**PASS (local)** means the complete acceptance scenario ran in the named deterministic environment. It does not imply hosted or production acceptance. **BLOCKED** means the complete test requires missing implementation, owner input or separately authorized provider/staging access. A passing subset is recorded without changing a blocked overall test.

## Recorded command results

| Command or scenario                               | Result                                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                   | **PASS** — typecheck, 53 tests with 0 failures, optimized OS build and production artifact scan                      |
| `npm run test:artifact`                           | **PASS** — 16 fixture identity, selector, state and secret markers absent from `.next`                               |
| `npm run test:restart`                            | **PASS** — 22 completed tasks and 30 accepted supersessions identical after controlled restart                       |
| `npx playwright test tests/e2e/accounts.spec.ts`  | **PASS** — 3/3 account journey, mobile resume and responsive/keyboard cases                                          |
| `npx playwright test tests/e2e/workspace.spec.ts` | **PASS** — 6/6 retained desktop/mobile workspace cases                                                               |
| `npm run format:check`                            | **PASS**                                                                                                             |
| `git diff --check`                                | **PASS**                                                                                                             |
| Manual responsive review                          | **PASS for Milestone 1 surfaces** — 1440, 768, 390, 320 and 200% zoom reflow inspected; artifacts kept local/ignored |

The combined `npm run test:e2e` terminal invocation was not used as final evidence because the supervising session stopped returning its terminal report. Both constituent specs were then run separately and all nine scenarios passed.

## Preserved Phase acceptance tests

| Test                              | Status           | Exact current evidence                                                                                                                                                                                                                                                                                              | Remaining boundary                                                                                                              |
| --------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| AT-01 full access matrix          | **PASS (local)** | `npm test`; generated owner, contributor, viewer, revoked, onboarding, suspended, anonymous and other-organisation cases cover all 30 RLS tables. Security tests enumerate all 42 exposed functions. HTTP tests cover current private route families, crafted IDs, cross-project files/search/Ask and direct calls. | Every future table/function/route must extend the matrix. Hosted pooler/grants remain untested.                                 |
| AT-02 current approval authority  | **PASS (local)** | Existing stale/replay/concurrency coverage remains; account lifecycle and assignment executors add current before-state/access-version binding, recent AAL2, one-use approval and audit tests.                                                                                                                      | Future publish/spend/deploy executors require separate exact-state tests; none exists now.                                      |
| AT-03 identity contract           | **BLOCKED**      | Expanded local subset passes invitation binding/replay/expiry, local AAL1/AAL2, self-password, verification/reset, MFA/recovery and session-version behavior. Fixture combinations and production artifact exclusion fail closed.                                                                                   | Hosted Supabase enrollment/challenge/recovery, confirmed-email, refresh/revocation and owner bootstrap need authorized staging. |
| AT-04 private uploads             | **PASS (local)** | Existing SQL/HTTP/browser tests retain owner-private default, explicit scoped sharing, cross-project denial and quarantine. Suspended/revoked account denial was added.                                                                                                                                             | Clean scanning, Storage and byte delivery remain AT-10.                                                                         |
| AT-05 safe seed/provenance        | **PASS (local)** | Fresh/repeat/reorder/rollback tests still prove five exact projects, stable IDs, null scores, source envelopes, 13 agents, 12 skills and nine disabled routines. Local account fixtures add exactly two visibly unapproved legal placeholders and no real partner data.                                             | Private foundational sources remain intentionally outside public Git.                                                           |
| AT-06 classification/history      | **PASS (local)** | Exact FACT evidence/reviewer/method, complete versions, immutable accepted records and decision supersession remain passing.                                                                                                                                                                                        | Rich diff presentation remains later UX work.                                                                                   |
| AT-07 full financial totals       | **PASS (local)** | Exact decimal, 201-row uncapped totals, currency separation, unknown/zero and SQL null/type rejection remain passing.                                                                                                                                                                                               | No ledger reconciliation, bank balance or FX engine.                                                                            |
| AT-08 complete operating loop     | **PASS (local)** | Typed P002 loop and five-principal isolation remain passing; restart evidence now matches 22 completed tasks and 30 supersessions.                                                                                                                                                                                  | Broader portfolio/committee/score workflows remain later milestones.                                                            |
| AT-09 project gates               | **PASS (local)** | P002 fitment/safety, P003 rights/geometry and P005 reviewed-demand gates remain exact-version/local-only. P004 live and P005 product flags still fail.                                                                                                                                                              | No approved numeric thresholds, delivery, publication or live adapter.                                                          |
| AT-10 document lifecycle          | **BLOCKED**      | Quarantine/access subset remains passing.                                                                                                                                                                                                                                                                           | No clean scan, extraction, chunks, authorized download, object reconciliation or restore.                                       |
| AT-11 evidence envelope           | **BLOCKED**      | RLS-scoped record search and cross-project bait denial pass.                                                                                                                                                                                                                                                        | No chunks, synthesis, citation validator, delivery recheck or durable redacted AI run.                                          |
| AT-12 run/skill lifecycle         | **BLOCKED**      | Definitions and completed-run forgery denial pass.                                                                                                                                                                                                                                                                  | No typed executable manifests, capability broker, run steps, retries or handoff.                                                |
| AT-13 budgets/model boundary      | **BLOCKED**      | Deterministic non-model finance remains passing.                                                                                                                                                                                                                                                                    | No reservation ledger or model dispatch.                                                                                        |
| AT-14 routines/recovery           | **BLOCKED**      | All nine routines remain disabled.                                                                                                                                                                                                                                                                                  | No scheduler, idempotent slots, calendar/checkpoint/retry execution.                                                            |
| AT-15 paired identity/ingress     | **BLOCKED**      | HMAC helper remains passing; account UI permits notification only with an active pairing.                                                                                                                                                                                                                           | No pairing challenge, durable verified ingress, project selection or delivery workflow.                                         |
| AT-16 scoped delivery/idempotency | **BLOCKED**      | External delivery remains impossible.                                                                                                                                                                                                                                                                               | No message transport/outbound intent/reconciliation/human-takeover flow.                                                        |
| AT-17 public build                | **BLOCKED**      | Existing local homepage and private OS production build pass. Fixture artifact scan covers the OS bundle.                                                                                                                                                                                                           | No independent marketing app, required routes or approved-publication snapshot.                                                 |
| AT-18 usability/recovery          | **BLOCKED**      | Account and retained workspace E2E total 9/9. Milestone 1 surfaces were reviewed at 1440/768/390/320 and 200% reflow with keyboard/mobile navigation.                                                                                                                                                               | Full product-wide state/WCAG matrix, hermetic CI and database-plus-object restore remain absent.                                |

## Added completion tests

### AT-19 — Invitation, self-password and return flow: PASS (local)

Evidence: `tests/account-contracts.test.ts`, `tests/account-http.test.ts`, `tests/e2e/accounts.spec.ts`, migrations `0014`–`0021` and the optimized artifact scan.

- Owner creates one invitation with two exact projects/roles, note and expiry; fake branded mail contains no password.
- `/join#token=…` strips the fragment before network navigation, exchanges once and preserves a sealed, expiring server-only return intent through reload/verification.
- Email is locked; partner creates/confirms a policy-valid password; verified identity redeems atomically once and receives exactly the approved grants.
- Weak/mismatched password, mismatched identity, old token after resend/replacement, expiry, revocation, replay and rate exhaustion fail.
- Tests assert the raw invitation token is absent from request URLs after exchange, console, local/session storage, cookies, API responses and Auth state.

Hosted email/Auth semantics remain part of blocked AT-03/AT-30.

### AT-20 — Mandatory onboarding: PASS (local)

Evidence: SQL/HTTP contracts plus complete desktop and mobile browser journeys.

- All nine steps validate required state. Back, forward, refresh and mobile interruption return to the current server-owned step.
- Project Access shows only assigned projects with read-only role/permission data. WhatsApp skip is optional.
- Missing required profile, preference or agreement data blocks completion. Acceptances store exact document version/timestamp and placeholders are explicitly unapproved.
- Completion stores `onboarding_completed_at`, activates the account and enters the OS. A new required agreement returns the user to step 8 without erasing prior history.

### AT-21 — Partner/owner account controls: PASS (local)

Evidence: provider contract tests, SQL/HTTP adversarial tests and the E2E account journey.

- Partner changes permitted profile/preferences, password, fake MFA/recovery and session state; role, organisation, project, permissions and completion-state forgery fail in UI/API/SQL.
- Owner invitation resend/revoke, lifecycle suspend/reactivate/revoke, assignment add/remove/role change, forced sign-out and WhatsApp unpair bind current state and append audit/security evidence.
- Suspended/revoked users lose UI/API/SQL/file/search/Ask access immediately; stale sessions and old approvals fail.

Real Supabase MFA/session behavior remains blocked under AT-03/AT-30.

| Remaining added test                 | Status      | Current evidence boundary                                                                                                                                                                         |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AT-22 Dashboard, Portfolio and Ideas | **NOT RUN** | Final Milestone 2 is next. Existing generic views do not satisfy the frozen operating dashboard/portfolio/idea contract.                                                                          |
| AT-23 project-specific workspaces    | **NOT RUN** | Current pages do not implement every common and specialist module.                                                                                                                                |
| AT-24 approvals, Work Log and Admin  | **NOT RUN** | Existing controls cover implemented actions only, not the full frozen action/admin set.                                                                                                           |
| AT-25 transactional email            | **BLOCKED** | Local subset passes all nine versioned renderers, safe invitation link, idempotent outbox and sent/failed/cancelled/bounced states. Authorized Resend acceptance/delivery/failure remains absent. |
| AT-26 marketing forms/publication    | **NOT RUN** | Independent marketing app, forms and approved-publication snapshots are absent.                                                                                                                   |
| AT-27 telemetry/security controls    | **NOT RUN** | Production providers and complete cross-cutting security matrix are not configured.                                                                                                               |
| AT-28 hermetic CI                    | **NOT RUN** | No GitHub workflow creates disposable services and runs the full contract.                                                                                                                        |
| AT-29 backup/restore drill           | **NOT RUN** | No database-plus-object empty-target restore evidence.                                                                                                                                            |
| AT-30 hosted/staging contract        | **BLOCKED** | Requires preceding milestones, owner inputs and separately authorized staging/provider credentials.                                                                                               |

## Security and accessibility review notes

The [account threat model](../security/account-identity-threat-model.md) records assets, trust boundaries, attacks, controls and hosted gaps. Owner partner administration was adjusted to collapse before tablet width, and onboarding submission waits for client hydration to avoid stale-step submission. Mobile navigation uses a keyboard-operable disclosure model. Manual inspection found no document-level horizontal overflow at the required milestone widths.

Legal text remains unapproved. Local fake proofs, files and screen captures are ignored and absent from production output. All external providers remain disconnected.

## Next evidence gate

Final Milestone 2 must implement FR-07, FR-08 and FR-10 and pass AT-22 without regressing AT-01 through AT-09 or AT-19 through AT-21. No provider connection, production deploy or publication is authorized.
