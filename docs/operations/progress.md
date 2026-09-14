# KXRA OS implementation progress

Updated: 14 September 2026. Status: **reviewed local milestone complete through AT-09; final requirements frozen; not production ready**.

Reviewed implementation commit: `0c20de47fe1f6cb38646db51c4a90650679aacd7` on `codex/genesis-foundation`. The 13 September review baseline and acceptance contract are preserved in [CODEX PHASE COMPLETION BRIEF](CODEX-PHASE-COMPLETION-BRIEF.md). Current results are recorded in [phase acceptance evidence](acceptance-evidence.md).

The owner completion addendum has been consolidated with the Genesis and Phase contracts in [KXRA FINAL COMPLETION BRIEF](../../KXRA-FINAL-COMPLETION-BRIEF.md). It preserves AT-01 through AT-18, adds AT-19 through AT-30, defines eleven ordered implementation milestones and makes production-shaped identity/invitation/onboarding/account management the next milestone. The freeze changes requirements and execution order only; it is not evidence that any added feature has been implemented.

## What was built

The review's approval, finance, seed, classification/history and upload-sharing defects are fixed with additive migrations and regression tests. KXRA OS now has:

- atomic, provenance-checked, stable-ID Genesis seed import;
- 20 RLS-protected private tables and a five-principal cross-organisation access matrix;
- complete approval-envelope hashing, current target/access versions, recent-AAL2 checks, expiry and single-use concurrency;
- one-use email-bound local invitations and assignment redemption;
- owner-private upload defaults with explicit project sharing and quarantine;
- complete record snapshots plus evidence-controlled FACT verification;
- uncapped RLS finance/dashboard aggregates with exact decimal arithmetic;
- a typed P002 idea → experiment → task → result → accepted decision → superseding decision loop;
- evidence-linked local-only gates for P002 fitment/safety, P003 rights/geometry QA and P005 reviewed demand;
- owner and partner UI controls for the operating loop, gate evidence, invitations, real history and assigned tasks.

Project 004 remains paper/research only. The database rejects live execution and no broker path exists. Project 005 remains demand-first; product creation stays false and no creation/publication path exists.

## Verification

| Check                              | Current result                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run typecheck`                | PASS                                                                                |
| `npm test`                         | PASS — 45/45                                                                        |
| `npm run test:restart`             | PASS — retained task and supersession graph matched before/after restart            |
| `npm run test:e2e`                 | PASS — 6/6 desktop/mobile                                                           |
| `npm run build`                    | PASS                                                                                |
| `npm run format:check`             | PASS                                                                                |
| `git diff --check`                 | PASS                                                                                |
| Public-boundary secret/source scan | PASS — original documents, private brief, runtime and test artifacts remain ignored |

The database tests cover all current tables and exposed RPCs. HTTP tests cover every current private route family, owner/partner/viewer/revoked behavior, crafted IDs, direct access, files and retrieval. Fresh-seed tests use disposable clusters and prove rollback after an injected mid-import failure.

## Priority delivery status

| Area                                            | Verified current state                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Repository/database/auth boundary               | Next.js/TypeScript, additive PostgreSQL migrations, nonprivileged RLS transactions and strict local fixture isolation |
| Owner and partner access                        | Local owner plus contributor/viewer/revoked/invitee fixtures; server/database authorization on every context lookup   |
| Portfolio/projects/registers                    | Five canonical projects, scoped workspaces and classified versioned records                                           |
| Assumptions/experiments/decisions/risks/sources | Persistent registers; experiment and decision creation now use exact typed workflows                                  |
| Tasks                                           | Exact context-version assignment/completion with immutable task history                                               |
| Approvals                                       | Current-authority acceptance, membership and local project-gate executors                                             |
| Finance                                         | Authoritative uncapped actual totals by currency; no ledger reconciliation or FX                                      |
| Knowledge/Ask                                   | RLS-scoped evidence search with citations; no model synthesis or attachment chunks                                    |
| Partners                                        | Local invitation/redemption and exact membership changes; no real email/provider activation                           |
| Files                                           | Private/shared metadata and bounded quarantine; scanning/extraction/download remain disabled                          |
| AI/skills/routines/runs                         | 13 agents, 12 skills and nine disabled routines as definitions only; no execution                                     |
| WhatsApp                                        | Cryptographic helper and private schema only; ingress/pairing/delivery remain disabled                                |
| Public website                                  | Existing static local homepage; separate public build/routes and publication gate remain incomplete                   |

## Security status

AT-01, AT-02 and AT-04 through AT-09 pass their agreed local scenarios. AT-03's local invitation, fixture and recent-AAL2 subset passes; hosted MFA and confirmed provider identity remain blocked. Storage delivery, document ingestion, AI execution, provider messaging and deployment continue to fail closed.

The implementation has not used real credentials, a hosted account, production data, external messages, paid model calls, live trading, product publication or production deployment.

## Active blockers and deferrals

AT-10 through AT-18 remain blocked as recorded. AT-19 through AT-29 are newly frozen and have not run; AT-30 is blocked pending implementation, owner inputs and separately authorized staging. The immediate next slice is Final Milestone 1: production-shaped invitation-only identity, multi-project invitations, the nine-step onboarding wizard and partner/owner account management using deterministic local Auth/email doubles. Hosted Auth/MFA/email/session verification remains a later controlled staging gate and needs separately authorized credentials.

## Publication boundary

Only application code, engineering documentation and required seed registers are authorized for the public `Kara221219/kxra-os` repository. Original Word/text sources, the full private Genesis brief/research, archives, runtime data, credentials, screenshots and test artifacts remain excluded by `.gitignore`.
