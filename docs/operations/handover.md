# Engineering handover

Updated: 19 September 2026.

## Current checkpoint

Work from `/Users/kara/Desktop/P1/The KXRA Group` on `codex/phase-2-completion`. Slice 0 started from `0109f8f9cb7cbe0947189bd538c0b2b8ba7c3ab7`, which descends from the reviewed Genesis implementation. Use branch HEAD for the current implementation.

The branch is not merged and nothing is deployed. Preserve the private `KXRA-GENESIS` package, original source documents and unrelated parent-repository applications. Direct user instructions remain controlling. PostgreSQL authorization, project/tenant isolation, Project 004's permanent paper-only boundary and the repository publication boundary remain non-negotiable.

Read, in order:

1. [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md) — current self-contained audit and execution contract;
2. [acceptance evidence](acceptance-evidence.md);
3. [progress](progress.md);
4. [architecture](../architecture/system.md) and [security](../security/access-control.md);
5. the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md) and root [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) for preserved history.

## Actual delivered state

Final Milestones 1–3 and Phase 2 Slice 0 work in the deterministic local environment. Migrations `0001`–`0030` are ordered and applied; never rewrite an applied migration. The current schema has 44 RLS tables and 61 audited functions in the exposed `kxra` schema. Account/invitation/onboarding, owner control plane, five venture workspaces, six internal approval executors, exact finance and the typed operating loop are implemented locally.

Slice 0 added:

- mandatory one-project Ask KXRA requests and exact `INSUFFICIENT KXRA EVIDENCE.` behavior;
- missing/null/array/multiple/unauthorized/revoked SQL/API/browser regressions;
- fresh-seed lifecycle provisioning for governance state, 18 common modules, exact P001–P005 specialist modules, all five gates, P002 vehicle rows and governance snapshots;
- explicit deny policies on internal ingress and durable rate-limit tables;
- a disposable random-port PostgreSQL/application test harness, migration/RLS audit, production artifact scan and publication/secret scan;
- a pinned GitHub Actions workflow;
- a private customer-discovery pack/tracker and solicitor instruction brief, all ignored by Git.

Ask is now correctly scoped before retrieval. It still has no document chunk pipeline, model synthesis, citation validator or durable AI run/budget/tool log. Files stop safely at quarantine. AI agents, skills and routines remain definitions, and routines are disabled. WhatsApp remains cryptographic scaffolding. Customer tenancy, subscriptions, Brand Studio, Projects 006/007, provider-backed workflows and an independent marketing application remain absent.

## Reproduce the current evidence

Requirements: Node.js 22, locked npm dependencies, Chromium for Playwright and local PostgreSQL binaries. The canonical local command is:

```sh
npm ci
npx playwright install chromium
npm run test:ci
```

`test:ci` creates and destroys a disposable runtime under `.runtime/ci`; it does not use the preserved developer database. It runs lint/typecheck/format, 73 database/domain/HTTP tests, migration/RLS verification, 30 desktop/mobile browser scenarios, restart persistence, the optimized production build, fixture-artifact exclusion and publication/secret scanning.

Latest result:

- 73/73 database/domain/HTTP tests passed;
- 27 applicable browser tests passed, with 3 intentional device-specific skips;
- 30 migrations and all 44 RLS tables passed the migration/security audit;
- restart persistence, production build, all 16 fixture-marker exclusions and the six-pattern publication scan passed;
- production and complete npm dependency audits reported zero vulnerabilities;
- no real credential, external send, paid API call, trading action or deployment was used.

Run `git diff --check` again at the final commit gate. Local evidence does not prove hosted Auth/MFA/Storage, pooler RLS, Resend, Stripe, OpenAI, YouTube, Meta, Trigger.dev, telemetry, Vercel or backup behavior.

## Next implementation slice

Implement Slice 1 from Phase Completion Brief 02 before Final Milestone 4:

1. normalize identities and many-to-many organization memberships without weakening current single-organization access;
2. require one explicit current organization on private requests and add cross-tenant SQL/API/browser/cache tests;
3. add versioned legal documents and a first-private-access gate that cannot activate an unapproved placeholder;
4. add deterministic plans, entitlements, concurrent usage reservations, owner free grants and fake signed Stripe event state;
5. add private custom-project request, versioned proposal, acceptance/payment gate and change-control records;
6. preserve all current tests and add AT-31–34 plus the AT-46 placeholder/release block.

Use additive migrations. Do not import solicitor text until counsel approves an exact version. Safe synthetic legal fixtures may test workflow state, but must be visibly non-operative and unable to unlock a production release.

## Security invariants

- Verify server identity and active account/organization/project scope before retrieval; use a transaction-local non-bypass RLS role.
- Never accept user, role, tenant, project, entitlement or approval authority from request bodies, unverified cookies or model output.
- Ask, search, files, jobs and provider actions must carry one authorized tenant and one authorized project where applicable. Reauthorize before byte/model/provider delivery.
- A service worker may use only a signed stored initiating scope/capability and cannot become a general service-role data path.
- Keep Project 004 paper only. Preserve P001–P005 hard stops and add P006/P007 gates before any side effect.
- Do not activate an NDA placeholder, external email/message, paid model, Stripe live mode, YouTube publication, candidate-code execution on a trusted host, deployment or public site.
- Financial, entitlement and usage arithmetic is deterministic database/domain logic, never model output.
- Every new table needs RLS and an explicit policy; every route/function must extend the access matrix.

## Private business-readiness artifacts

The ignored private business pack dated 2026-09-19 contains the completed Customer Discovery Pack, Customer Discovery Tracker and Solicitor Brief alongside the previously prepared business plan, decks, financial model and operating playbooks. The DOCX/XLSX packages passed structural and visual review. The solicitor brief is an instruction pack, not legal advice or approved customer-facing terms.

Do not commit these artifacts. Use the discovery pack to recruit and record interviews without selling a feature list. Give the solicitor brief to qualified UK counsel and return only approved versioned documents/metadata to the implementation through the private release process.

## Provider and owner boundaries

Continue local code, fake adapters and tests without requesting credentials. The owner runbook in Phase Completion Brief 02 gives later steps for legal documents, Supabase staging, Stripe, OpenAI, YouTube, a read-only GitHub App, Resend, Trigger.dev, PostHog, Sentry, Cloudflare, Vercel and optional Meta.

When external activation becomes the next dependency, present the exact endpoint, scopes, environment and prepared action for review. Never ask for raw secrets in chat. Default-branch change, production merge/deploy, public publication, live billing, real customer contact and YouTube/WhatsApp sends require owner approval of the concrete action.

## Publication boundary

Commit only platform code, engineering documentation and required classified seeds. Do not commit original Word/text sources, private Genesis research, business-pack artifacts, credentials, `.runtime`, databases, object backups, screenshots, traces or generated test artifacts.
