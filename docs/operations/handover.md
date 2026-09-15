# Engineering handover

Updated: 16 September 2026.

## Current checkpoint

Work from `/Users/kara/Desktop/P1/The KXRA Group` on branch `codex/phase-2-completion`. The requirements-freeze baseline is `4e597ea2039f8758a254cf42637baff26e7067a2`; the reviewed Genesis implementation ancestor is `0c20de47fe1f6cb38646db51c4a90650679aacd7`; the last pushed Milestone 2 baseline is `6a2e76a8fc9081707145d8ea10f9e190694918ef`.

The branch has not been merged to `main` and nothing has been deployed. GitHub destination is the public `Kara221219/kxra-os` repository. Preserve the private `KXRA-GENESIS` package, original source documents and unrelated parent-repository applications.

Read [acceptance evidence](acceptance-evidence.md), [progress](progress.md), [architecture](../architecture/system.md), [security](../security/access-control.md), [ADR 0006](../decisions/0006-project-workspaces.md), the [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md) and the root [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md). Direct user instructions remain controlling.

## Delivered milestone

Final Milestone 3 is complete in the deterministic local environment. AT-23 passes locally; AT-01, AT-02, AT-04 through AT-09, AT-19 through AT-22 and AT-24 remain passing. AT-03 and AT-18 remain blocked overall because their hosted or product-wide portions have not run. No local result is hosted or production proof.

Migrations `0026_project_workspaces.sql`, `0027_project_workspace_hardening.sql` and `0028_project_workspace_evidence_hardening.sql` are additive and applied. They expand the private RLS schema from 36 to 44 tables and the audited exposed-function set from 52 to 61. Never rewrite an applied migration; add a later migration for any correction.

## Reproduce

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3210` and use only clearly labelled synthetic identities. In another terminal:

```sh
npm run check
npm run format:check
npm run test:restart
npm run test:e2e
git diff --check
```

Latest pre-commit evidence: 71/71 database/domain/HTTP tests; optimized production build and 16-marker artifact scan; controlled restart retained 32 completed tasks and 50 accepted supersessions; full browser suite 25 passed with 3 intentional device-specific skips; responsive checks passed at 1440/768/390/320 and 200% reflow.

HTTP/browser tests require the local preview. PostgreSQL adversarial tests roll back. HTTP/browser tests retain labelled synthetic rows for inspection. Never point fixture tests at a hosted database.

## Milestone 3 implementation map

- `supabase/migrations/0026_project_workspaces.sql`: exact module registry, typed entry/version/evidence tables, vehicle compatibility, property provenance, CLPR revisit reviews, digital opportunities and P001/P004 gates.
- `0027_project_workspace_hardening.sql`: RLS helper grant, paper-only Project 004 reports, corrected property lookup and fail-closed opportunity authorization.
- `0028_project_workspace_evidence_hardening.sql`: five-distinct-record Project 001 evidence requirement.
- `apps/os/lib/project-workspaces.ts`: authorized project/module loader and typed source projections.
- `apps/os/components/ProjectWorkspaceView.tsx`: common/specialist navigation, hard stops, empty/denied/gated states and typed renderers.
- `apps/os/components/ProjectWorkspaceForms.tsx`: bounded workspace and specialist mutations.
- `apps/os/app/api/[...path]/route.ts`: strict workspace APIs and fixed nested-resource project binding.
- `apps/os/app/os/[[...segments]]/page.tsx`: direct `/os/projects/:id/:module` routes.
- `tests/project-workspaces.test.ts`: SQL/RLS/hard-stop AT-23 contract.
- `tests/project-workspaces-http.test.ts`: identity, crafted-ID, specialist and absent-executor HTTP contract.
- `tests/e2e/project-workspaces.spec.ts`: owner/partner direct URLs, exact module counts, hard stops and responsive evidence.
- Existing access, security, HTTP and browser suites: expanded 44-table/61-function regression boundary.

## Security invariants

PostgreSQL is authoritative. Never accept subject, verified email, role, organisation, project list, account state, onboarding completion, Idea access, workspace scope or approval from a browser body or model. Every retrieval uses the verified principal under RLS.

Authorize the route project first. Resolve nested resource IDs only through fixed queries under the same principal and verify that each row belongs to the route project before calling a mutation function. Partners may create only project-shared typed entries in current contributor projects. Owner-only finance, approval and full activity data must remain unqueried for partners.

Keep Project 001’s five evidence categories distinct and current. Never promote Project 002 fitment or safety without exact accepted evidence. Never collapse Project 003 real, generated and inferred origin. Project 004 remains paper/research only with no broker, credential, live flag or executor. Project 005 stops at exact `LOCAL_PROTOTYPE_AUTHORIZED`; creation and publication routes remain absent.

Consequential workflows use a comprehensible version-2 approval envelope and bind exact action, organisation, project, payload, requester, environment and expiry. Execution rechecks current target versions under a row lock, requires recent AAL2 and consumes once. `publish`, external messaging, `spend`, `deploy` and high-cost AI have no executor.

## Known boundaries

Real Supabase MFA/email/session and pooler behavior, owner bootstrap, Resend, Storage/scanning, Trigger.dev, AI providers, WhatsApp, telemetry, backup/restore and deployment remain unverified. Legal documents are unapproved placeholders. Numeric Venture/Confidence scoring policies remain unresolved, so scores must stay null/Not Assessed.

Production, public publication, real credentials, real partner messages, paid calls, spending and trading remain unauthorized.

## Next engineering action

Implement Final Milestone 4 in the frozen order: secure file and knowledge lifecycle with a local private-object adapter, scanner contract, server-controlled `QUARANTINE → CLEAN → EXTRACTED → INDEXED` transitions, versioned extraction/chunks, delivery-time RLS, failure/retry/reconciliation and AT-04/AT-10 evidence. Preserve every Milestone 1–3 regression and do not connect hosted providers yet.
