# Engineering handover

Updated: 15 September 2026.

## Current checkpoint

Work from `/Users/kara/Desktop/P1/The KXRA Group` on branch `codex/phase-2-completion`. The requirements-freeze baseline is `4e597ea2039f8758a254cf42637baff26e7067a2`; the reviewed Genesis implementation ancestor is `0c20de47fe1f6cb38646db51c4a90650679aacd7`; Final Milestone 1 evidence is `08ac3d25f1f4127f617d91a41fa7dd353565e98b`.

The branch has not been merged to `main` and nothing has been deployed. GitHub destination is the public `Kara221219/kxra-os` repository. Preserve the private `KXRA-GENESIS` package, original source documents and unrelated parent-repository applications.

Read [acceptance evidence](acceptance-evidence.md), [progress](progress.md), [architecture](../architecture/system.md), [security](../security/access-control.md), [ADR 0005](../decisions/0005-owner-control-plane.md), the [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md) and the root [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md). Direct user instructions remain controlling.

## Delivered milestone

Final Milestone 2 is complete in the deterministic local environment. AT-22 and AT-24 pass locally; AT-01, AT-02, AT-04 through AT-09 and AT-19 through AT-21 remain passing. AT-03 and AT-18 remain blocked overall because their hosted/product-wide portions have not run. No local result is hosted or production proof.

Migrations `0022_owner_control_plane.sql` through `0025_record_returning_policy.sql` are additive and applied. They expand the private RLS schema from 30 to 36 tables and the audited exposed-function set from 42 to 52. Never rewrite an applied migration; add a later migration for any correction.

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

Latest pre-commit evidence: 59/59 database/domain/HTTP tests; optimized production build and 16-marker artifact scan; controlled restart retained 29 completed tasks and 44 accepted supersessions; full browser suite 17 passed with 3 intentional skips; responsive checks passed at 1440/768/390/320 and 200% reflow. Results are recorded in [acceptance evidence](acceptance-evidence.md).

HTTP/browser tests require the local preview. PostgreSQL adversarial tests roll back. HTTP/browser tests retain labelled synthetic rows for inspection. Never point fixture tests at a hosted database.

## Implementation map

- `supabase/migrations/0022_owner_control_plane.sql`: project governance versions, typed Ideas, explicit Idea shares/evidence, approval envelopes/states, Work Log projection, RLS and typed executors.
- `0023_admin_view_audit.sql`: owner-only Admin view audit RPC.
- `0024_control_plane_compatibility.sql`: safe helper grant, pre-membership actor provenance and corrected gate summary expression.
- `0025_record_returning_policy.sql`: row-local ordinary-record read rule required by typed `INSERT … RETURNING` while Ideas retain strict access checks.
- `apps/os/lib/control-plane.ts`: authoritative Dashboard, Portfolio, Idea, Work Log and Admin queries.
- `apps/os/app/api/[...path]/route.ts`: strict typed control-plane APIs and approval dispatch.
- `apps/os/components/ControlPlaneForms.tsx` and `ControlPlaneViews.tsx`: owner/partner control-plane UI.
- `apps/os/app/os/[[...segments]]/page.tsx`: owner Dashboard and dedicated Portfolio, Idea Inbox, Work Log and Admin routes.
- `tests/control-plane.test.ts` and `control-plane-http.test.ts`: AT-22/AT-24 SQL and HTTP contracts.
- `tests/e2e/control-plane.spec.ts`: rendered owner/partner, redaction and responsive evidence.
- Existing access/security/HTTP/workspace tests: expanded 36-table/52-function regression boundary.

## Security invariants

PostgreSQL is authoritative. Never accept subject, verified email, role, organisation, project list, account state, onboarding completion, Idea access or approval from a browser body or model. Every retrieval uses the verified principal under RLS.

An active project membership is necessary but insufficient to read another person's Idea. A partner reads only their own submission or a currently active explicit share for the same project. Revoking the share, project membership or account removes access immediately. Generic record creation/update cannot create or mutate Ideas.

Consequential workflows use a comprehensible version-2 approval envelope and bind exact action, organisation, project, payload, requester, environment and expiry. Execution rechecks current target versions under a row lock, requires recent AAL2 and consumes once. `publish`, external messaging, `spend`, `deploy` and high-cost AI have no executor.

Work Log entries are projections from persisted audit/security rows. Do not add free-form success claims. Admin is owner-only, audited and returns only redacted connection presence. Preserve session/access versions, immutable history, source hashes, project composite foreign keys, private upload defaults, quarantine and P004/P005 hard stops.

## Known boundaries

Real Supabase MFA/email/session and pooler behavior, owner bootstrap, Resend, Storage/scanning, Trigger.dev, AI providers, WhatsApp, telemetry, backup/restore and deployment remain unverified. Legal documents are unapproved placeholders. Numeric Venture/Confidence scoring policies remain unresolved, so scores must stay null/Not Assessed.

Production, public publication, real credentials, real partner messages, paid calls, spending and trading remain unauthorized.

## Next engineering action

Implement Final Milestone 3 in the frozen order: useful project-specific workspaces for all five ventures, including common tabs, specialist modules, typed workflows and truthful score/gate state. Preserve all Milestone 1 and 2 security tests, add AT-23 at SQL/HTTP/browser layers, and keep Projects 004 and 005 behind their current hard stops.
