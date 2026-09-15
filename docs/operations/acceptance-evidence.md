# Phase acceptance evidence

Review date: 16 September 2026. Branch: `codex/phase-2-completion`. Requirements-freeze baseline: `4e597ea2039f8758a254cf42637baff26e7067a2`. Final Milestone 1 evidence: `08ac3d25f1f4127f617d91a41fa7dd353565e98b`.

This ledger records executable evidence against the cumulative Genesis, Phase Completion and Final Completion contracts. The environment used Node.js 22.22.3, synthetic identities, deterministic local Auth/email doubles, a Unix-socket-only PostgreSQL 14 cluster and a local Next.js preview. No real credentials, hosted mutation, external send, paid call, product publication, trading or deployment occurred.

**PASS (local)** means the complete acceptance scenario ran in the named deterministic environment. It does not imply hosted or production acceptance. **BLOCKED** means the complete test requires missing implementation, owner input or separately authorized provider/staging access. A passing subset is recorded without changing a blocked overall test.

## Recorded command results

| Command or scenario                   | Result                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run check`                       | **PASS** — typecheck, 71 tests with 0 failures, optimized OS build and production artifact scan |
| `npm run test:artifact`               | **PASS** — 16 fixture identity, selector, state and secret markers absent from `.next`          |
| `npm run test:restart`                | **PASS** — 32 completed tasks and 50 accepted supersessions identical after controlled restart  |
| `npm run test:e2e`                    | **PASS** — 25 executed desktop/mobile scenarios; 3 intentional device-specific skips            |
| `npm run format:check`                | **PASS**                                                                                        |
| `git diff --check`                    | **PASS**                                                                                        |
| Milestone 3 responsive browser matrix | **PASS** — five project workspaces at 1440, 768, 390, 320 and 200% reflow                       |

Browser screenshots, traces and reports remain local/ignored under the repository publication rule.

## Preserved Phase acceptance tests

| Test                              | Status           | Exact current evidence                                                                                                                                                                                                                                                                                                                    | Remaining boundary                                                                                                              |
| --------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| AT-01 full access matrix          | **PASS (local)** | `npm test`; generated owner, contributor, viewer, revoked, onboarding, suspended, anonymous and other-organisation cases cover all 44 RLS tables. Security tests enumerate all 61 exposed functions. HTTP tests cover current private route families, crafted IDs, cross-project files/search/Ask/Ideas/workspaces and owner-only routes. | Every future table/function/route must extend the matrix. Hosted pooler/grants remain untested.                                 |
| AT-02 current approval authority  | **PASS (local)** | Existing stale/replay/concurrency coverage remains. All currently enabled actions produce complete version-2 envelopes; Idea share and project governance add current-version binding, recent AAL2, one-use execution and audit tests.                                                                                                    | Publish/message/spend/deploy/high-cost-AI executors remain absent and require separate exact-state tests when implemented.      |
| AT-03 identity contract           | **BLOCKED**      | Expanded local subset passes invitation binding/replay/expiry, local AAL1/AAL2, self-password, verification/reset, MFA/recovery and session-version behavior. Fixture combinations and production artifact exclusion fail closed.                                                                                                         | Hosted Supabase enrollment/challenge/recovery, confirmed-email, refresh/revocation and owner bootstrap need authorized staging. |
| AT-04 private uploads             | **PASS (local)** | Existing SQL/HTTP/browser tests retain owner-private default, explicit scoped sharing, cross-project denial and quarantine. Suspended/revoked account denial was added.                                                                                                                                                                   | Clean scanning, Storage and byte delivery remain AT-10.                                                                         |
| AT-05 safe seed/provenance        | **PASS (local)** | Fresh/repeat/reorder/rollback tests still prove five exact projects, stable IDs, null scores, source envelopes, 13 agents, 12 skills and nine disabled routines. Local account fixtures add exactly two visibly unapproved legal placeholders and no real partner data.                                                                   | Private foundational sources remain intentionally outside public Git.                                                           |
| AT-06 classification/history      | **PASS (local)** | Exact FACT evidence/reviewer/method, complete versions, immutable accepted records and decision supersession remain passing.                                                                                                                                                                                                              | Rich diff presentation remains later UX work.                                                                                   |
| AT-07 full financial totals       | **PASS (local)** | Exact decimal, 201-row uncapped totals, currency separation, unknown/zero and SQL null/type rejection remain passing.                                                                                                                                                                                                                     | No ledger reconciliation, bank balance or FX engine.                                                                            |
| AT-08 complete operating loop     | **PASS (local)** | Typed P002 loop and five-principal isolation remain passing; restart evidence now matches 32 completed tasks and 50 supersessions.                                                                                                                                                                                                        | Broader portfolio/committee/score workflows remain later milestones.                                                            |
| AT-09 project gates               | **PASS (local)** | P001 revisit, P002 fitment/safety, P003 rights/geometry, P004 paper-readiness and P005 reviewed-demand gates are exact-version/local-only. P004 live and P005 product flags still fail.                                                                                                                                                   | No approved numeric thresholds, delivery, publication or live adapter.                                                          |
| AT-10 document lifecycle          | **BLOCKED**      | Quarantine/access subset remains passing.                                                                                                                                                                                                                                                                                                 | No clean scan, extraction, chunks, authorized download, object reconciliation or restore.                                       |
| AT-11 evidence envelope           | **BLOCKED**      | RLS-scoped record search and cross-project bait denial pass.                                                                                                                                                                                                                                                                              | No chunks, synthesis, citation validator, delivery recheck or durable redacted AI run.                                          |
| AT-12 run/skill lifecycle         | **BLOCKED**      | Definitions and completed-run forgery denial pass.                                                                                                                                                                                                                                                                                        | No typed executable manifests, capability broker, run steps, retries or handoff.                                                |
| AT-13 budgets/model boundary      | **BLOCKED**      | Deterministic non-model finance remains passing.                                                                                                                                                                                                                                                                                          | No reservation ledger or model dispatch.                                                                                        |
| AT-14 routines/recovery           | **BLOCKED**      | All nine routines remain disabled.                                                                                                                                                                                                                                                                                                        | No scheduler, idempotent slots, calendar/checkpoint/retry execution.                                                            |
| AT-15 paired identity/ingress     | **BLOCKED**      | HMAC helper remains passing; account UI permits notification only with an active pairing.                                                                                                                                                                                                                                                 | No pairing challenge, durable verified ingress, project selection or delivery workflow.                                         |
| AT-16 scoped delivery/idempotency | **BLOCKED**      | External delivery remains impossible.                                                                                                                                                                                                                                                                                                     | No message transport/outbound intent/reconciliation/human-takeover flow.                                                        |
| AT-17 public build                | **BLOCKED**      | Existing local homepage and private OS production build pass. Fixture artifact scan covers the OS bundle.                                                                                                                                                                                                                                 | No independent marketing app, required routes or approved-publication snapshot.                                                 |
| AT-18 usability/recovery          | **BLOCKED**      | Full browser regression has 25 executed passes and 3 intentional device-specific skips. Milestone 1–3 surfaces reflow at 1440/768/390/320 and 200%; mobile navigation and typed forms are keyboard operable.                                                                                                                              | Full product-wide state/WCAG/failure matrix, hermetic CI and database-plus-object restore remain absent.                        |

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

### AT-22 — Dashboard, Portfolio and Ideas: PASS (local)

Evidence: `tests/control-plane.test.ts`, `tests/control-plane-http.test.ts`, `tests/e2e/control-plane.spec.ts`, migrations `0022`–`0025` and the control-plane server/UI modules.

- Dashboard section totals are calculated over complete authoritative sets, independent of preview limits, and every preview links to the producing project, record, approval, account event or Work Log row.
- Portfolio returns all five ventures with allowlisted sorting, stable ID tie-breaking, filters and pagination. Actual expenses remain separated by native currency; scores, coverage, finance and recommendations without reviewed evidence render null/Unknown/Not Assessed.
- Typed Ideas preserve every frozen field, exact record/Idea versions and exact evidence versions. SQL and HTTP reject generic writes, stale updates, invalid transitions and post-archive changes.
- Owner group-wide visibility, partner submitter visibility, explicit share grant/removal, project-membership revocation, cross-project denial and no hidden aggregate leakage pass at SQL and HTTP layers.
- Rendered owner and partner journeys pass on desktop/mobile. The 320px gate-identifier overflow and successful-form event-target bug found during browser inspection were corrected and retested.

### AT-23 — Project-specific workspaces: PASS (local)

Evidence: `tests/project-workspaces.test.ts`, `tests/project-workspaces-http.test.ts`, `tests/e2e/project-workspaces.spec.ts`, migrations `0026`–`0028` and the project workspace server/UI modules.

- Every project exposes the exact 18 common modules. Specialist counts are 8 for Project 001, 12 each for Projects 002 and 003, 13 for Project 004 and 16 for Project 005. Direct URLs resolve only registered modules in an authorized project.
- SQL and HTTP tests cover typed payload validation, versions, review, current evidence, unauthenticated/revoked access, crafted nested IDs, direct API calls and cross-project denial. Owner-only finance, approvals and full activity return denied states for partners without querying protected rows.
- Project 001 requires five distinct current evidence records for revisit recommendations and gate packets. Project 002 cannot verify fitment or safety without exact accepted evidence. Project 003 keeps real inputs distinct from generated/inferred assets and separately tracks rights/geometry review.
- Project 004 accepts only paper research/reports, keeps live execution false and has no broker/live function. Project 005 stops at exact demand-gated local prototype authority; gated planning modules expose no mutation controls and product-creation/publication routes return not found.
- Desktop and mobile tests cover each project, direct specialist URLs, partner Project 002 access, Project 003 cross-project denial, a forced rendered mutation-failure state and 1440/768/390/320 plus 200% reflow.

### AT-24 — Approvals, Work Log and Admin: PASS (local)

Evidence: complete envelope/state tests in `tests/control-plane.test.ts`, owner-route/redaction/audit tests in `tests/control-plane-http.test.ts` and rendered tests in `tests/e2e/control-plane.spec.ts`.

- `record.accept`, `membership.change`, `account.lifecycle`, `project.gate`, `idea.share` and `project.governance` all generate version-2 envelopes containing action summary, before/after, recipient, cost fields and risk; their immutable digest also binds organisation, project, requester, environment and precise expiry.
- Recent-AAL2 denial, exact-hash decision, stale target rejection, one-use execution, concurrency regression and `RECONCILIATION_REQUIRED` state support pass. Schema-only external actions have no executor and cannot be reported complete.
- Work Log uses the six frozen types and receives uniquely sourced projections from actual audit/security rows. Owner filters by project, actor, department, type, status and date; rows link to real artifacts. No partner access or free-form completion claim is permitted.
- Admin logs every owner view, rejects partner/direct mutation access, returns bounded system counts and boolean connection presence, and exposes no credential-bearing fields or generic role/secret editor.

| Completion test                      | Status           | Current evidence boundary                                                                                                                                                                                                                                                                              |
| ------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AT-22 Dashboard, Portfolio and Ideas | **PASS (local)** | Exact full counts with linked previews, stable allowlisted Portfolio sort/filter/page behavior, truthful null values and typed Idea fields/states/history pass at SQL, HTTP and browser layers. Partner assignment alone reveals no Idea; only own submissions and active explicit shares are visible. |
| AT-23 project-specific workspaces    | **PASS (local)** | Exact module registry, typed/empty/denied/gated states, nested-resource isolation, all five specialist boundaries and desktop/mobile direct URLs pass at SQL, HTTP and browser layers.                                                                                                                 |
| AT-24 approvals, Work Log and Admin  | **PASS (local)** | All six currently enabled consequential actions have comprehensible hash-bound envelopes. Recent-AAL2, stale and one-use behavior passes. Work Log rows are real, linked and filterable; Admin is owner-only, redacted and audited. External executors remain disabled.                                |
| AT-25 transactional email            | **BLOCKED**      | Local subset passes all nine versioned renderers, safe invitation link, idempotent outbox and sent/failed/cancelled/bounced states. Authorized Resend acceptance/delivery/failure remains absent.                                                                                                      |
| AT-26 marketing forms/publication    | **NOT RUN**      | Independent marketing app, forms and approved-publication snapshots are absent.                                                                                                                                                                                                                        |
| AT-27 telemetry/security controls    | **NOT RUN**      | Production providers and complete cross-cutting security matrix are not configured.                                                                                                                                                                                                                    |
| AT-28 hermetic CI                    | **NOT RUN**      | No GitHub workflow creates disposable services and runs the full contract.                                                                                                                                                                                                                             |
| AT-29 backup/restore drill           | **NOT RUN**      | No database-plus-object empty-target restore evidence.                                                                                                                                                                                                                                                 |
| AT-30 hosted/staging contract        | **BLOCKED**      | Requires preceding milestones, owner inputs and separately authorized staging/provider credentials.                                                                                                                                                                                                    |

## Security and accessibility review notes

The [account threat model](../security/account-identity-threat-model.md) and [access-control model](../security/access-control.md) record assets, trust boundaries, attacks, controls and hosted gaps. Owner partner administration, the control plane and all project workspaces collapse before tablet width; mobile navigation uses a keyboard-operable disclosure model. Automated inspection found no document-level overflow at the required Milestone 3 widths or 200% reflow.

Legal text remains unapproved. Local fake proofs, files and screen captures are ignored and absent from production output. All external providers remain disconnected.

## Next evidence gate

Final Milestone 4 must implement the secure file and knowledge lifecycle and pass AT-04/AT-10 without regressing AT-01 through AT-09 or AT-19 through AT-24. No provider connection, production deploy or publication is authorized.
