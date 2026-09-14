# KXRA OS implementation progress

Updated: 14 September 2026. Status: **reviewed local milestone complete through AT-09; not production ready**.

Reviewed implementation commit: `0c20de47fe1f6cb38646db51c4a90650679aacd7` on `codex/genesis-foundation`. The 13 September review baseline and acceptance contract are preserved in [CODEX PHASE COMPLETION BRIEF](CODEX-PHASE-COMPLETION-BRIEF.md). Current results are recorded in [phase acceptance evidence](acceptance-evidence.md).

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

| Check | Current result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 45/45 |
| `npm run test:restart` | PASS — retained task and supersession graph matched before/after restart |
| `npm run test:e2e` | PASS — 6/6 desktop/mobile |
| `npm run build` | PASS |
| `npm run format:check` | PASS |
| `git diff --check` | PASS |
| Public-boundary secret/source scan | PASS — original documents, private brief, runtime and test artifacts remain ignored |

The database tests cover all current tables and exposed RPCs. HTTP tests cover every current private route family, owner/partner/viewer/revoked behavior, crafted IDs, direct access, files and retrieval. Fresh-seed tests use disposable clusters and prove rollback after an injected mid-import failure.

## Priority delivery status

| Area | Verified current state |
|---|---|
| Repository/database/auth boundary | Next.js/TypeScript, additive PostgreSQL migrations, nonprivileged RLS transactions and strict local fixture isolation |
| Owner and partner access | Local owner plus contributor/viewer/revoked/invitee fixtures; server/database authorization on every context lookup |
| Portfolio/projects/registers | Five canonical projects, scoped workspaces and classified versioned records |
| Assumptions/experiments/decisions/risks/sources | Persistent registers; experiment and decision creation now use exact typed workflows |
| Tasks | Exact context-version assignment/completion with immutable task history |
| Approvals | Current-authority acceptance, membership and local project-gate executors |
| Finance | Authoritative uncapped actual totals by currency; no ledger reconciliation or FX |
| Knowledge/Ask | RLS-scoped evidence search with citations; no model synthesis or attachment chunks |
| Partners | Local invitation/redemption and exact membership changes; no real email/provider activation |
| Files | Private/shared metadata and bounded quarantine; scanning/extraction/download remain disabled |
| AI/skills/routines/runs | 13 agents, 12 skills and nine disabled routines as definitions only; no execution |
| WhatsApp | Cryptographic helper and private schema only; ingress/pairing/delivery remain disabled |
| Public website | Existing static local homepage; separate public build/routes and publication gate remain incomplete |

## Security status

AT-01, AT-02 and AT-04 through AT-09 pass their agreed local scenarios. AT-03's local invitation, fixture and recent-AAL2 subset passes; hosted MFA and confirmed provider identity remain blocked. Storage delivery, document ingestion, AI execution, provider messaging and deployment continue to fail closed.

The implementation has not used real credentials, a hosted account, production data, external messages, paid model calls, live trading, product publication or production deployment.

## Active blockers and deferrals

AT-10 through AT-18 remain separate implementation slices. The immediate missing capabilities are trusted file scanning/extraction/chunks, delivery-time authorization, durable Ask logs, typed AI runs/skills/budgets, scheduler recovery, WhatsApp identity/transport, an independent reviewed public build, CI, accessibility coverage and database/object restore evidence. Hosted Auth/MFA and Storage tests need separately authorized staging credentials.

## Publication boundary

Only application code, engineering documentation and required seed registers are authorized for the public `Kara221219/kxra-os` repository. Original Word/text sources, the full private Genesis brief/research, archives, runtime data, credentials, screenshots and test artifacts remain excluded by `.gitignore`.
