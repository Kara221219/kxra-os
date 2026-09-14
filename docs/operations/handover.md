# Engineering handover

Updated: 14 September 2026.

## Current checkpoint

Work from this repository root on branch `codex/genesis-foundation`. The reviewed implementation checkpoint is `0c20de47fe1f6cb38646db51c4a90650679aacd7`. GitHub destination is the public `Kara221219/kxra-os` repository. Preserve the private KXRA-GENESIS package, original source documents and unrelated parent-repository applications.

Read [phase acceptance evidence](acceptance-evidence.md), [architecture](../architecture/system.md), [security](../security/access-control.md), [progress](progress.md) and the historical [phase completion brief](CODEX-PHASE-COMPLETION-BRIEF.md). Current direct user instructions take precedence.

Read the root [KXRA FINAL COMPLETION BRIEF](../../KXRA-FINAL-COMPLETION-BRIEF.md) before new implementation. It is the current requirements freeze and exact execution order. It preserves all Phase AT-01 through AT-18 scenarios, adds AT-19 through AT-30 and supersedes the older “next slice starts at AT-10” sequencing without changing the recorded implementation evidence.

The first review-remediation milestone is implemented: AT-01, AT-02 and AT-04 through AT-09 pass locally. AT-03's local subset passes, while hosted identity remains blocked. AT-10 through AT-18 are not complete. Added AT-19 through AT-29 have not run, and AT-30 is blocked. None may be presented as working capabilities.

## Reproduce

Run:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3210/login`. Use only the labelled synthetic identities. In another terminal run:

```sh
npm run typecheck
npm test
npm run test:restart
npm run test:e2e
npm run build
npm run format:check
```

The latest results were 45/45 database/domain/HTTP tests, a successful restart comparison, 6/6 desktop/mobile browser cases, and passing type/build/format/diff checks. `npm run test:restart` expects `npm test` to have retained its labelled synthetic AT-08 workflow, stops only this workspace's Unix-socket PostgreSQL cluster, restarts it, and compares exact task/supersession data. It does not reset data.

HTTP and browser tests require the local preview. PostgreSQL adversarial/access tests roll back. HTTP/browser tests retain labelled synthetic records for inspection. Never point fixture tests at a hosted database.

## Implementation map

- `apps/os/app/api/[...path]/route.ts`: authenticated APIs, typed workflows, invitations, project gates, approvals and quarantine.
- `apps/os/app/os/[[...segments]]/page.tsx`: owner/partner workspaces, registers, operating loop, project gates, history and approvals.
- `apps/os/components/Forms.tsx`: typed client forms with pending/error states.
- `apps/os/lib/auth.ts`, `packages/authz/session.ts`: verified hosted identity adapter and strict local signed sessions.
- `packages/db/index.ts`: one transaction per request under `authenticated`/`anon` RLS role and server-set claims.
- `scripts/seed.mjs`, `scripts/database.mjs`: atomic migrations, source-envelope verification and separate synthetic fixtures.
- `scripts/verify-persistence.mjs`: AT-08 controlled restart comparison.
- `supabase/migrations/0004_review_integrity.sql` through `0013_project_gates.sql`: additive review remediation, workflows, identity and gates.
- `tests/access-matrix.test.ts`: all-table, all-principal visibility matrix.
- `tests/security.test.ts`, `tests/http.test.ts`, `tests/seed.test.ts`, `tests/workflow.test.ts`: authoritative local acceptance evidence.
- `tests/e2e/workspace.spec.ts`: desktop/mobile owner and partner workflows.

## Security invariants

PostgreSQL remains authoritative. Never accept caller identity, role, organisation, project authority or approval state from bodies or model output. Every AI retrieval must first use the verified principal and RLS transaction. Future workers must receive narrow scope/capabilities and recheck authorization before delivery.

Do not weaken current fixture guards, approval digests, access-version checks, immutable history, source hashes, project composite foreign keys, private upload default, quarantine, or P004/P005 hard stops. Add new migrations; do not rewrite applied migrations.

Production, real credentials, external sends, paid model calls, spending, publication and trading remain unauthorized.

## Next engineering action

Execute only Final Milestone 1 from the requirements freeze: production-shaped invitation-only identity, multi-project invitation grants, safe invitation return, partner-created password contracts, the nine-step onboarding wizard, account management, owner lifecycle controls and fake transactional email. Extend the full RLS/HTTP matrix and run AT-01, AT-02, the AT-03 local subset and AT-19 through AT-21. Preserve all existing passing tests and hard stops.

Use deterministic local Auth/email doubles. Do not connect real credentials, send invitations, bootstrap a real owner or claim hosted MFA/email/session behavior. After the local milestone is reviewed, follow Milestones 2 through 11 in the exact order stated in the final brief.
