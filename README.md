# KXRA OS

KXRA Group's venture operating workspace. The repository is a working local engineering foundation through Final Milestone 3 and Phase 2 Slice 0: invitation-only identity, account administration, the owner control plane, database-backed workspaces for the five original ventures, one-project Ask KXRA authorization and disposable CI. It is not production ready and is not deployed.

The current [Phase Completion Brief 02](docs/operations/CODEX-PHASE-COMPLETION-BRIEF-02.md) is the self-contained audit and completion contract. It adds the approved customer-platform direction, Brand Studio, subscriptions and separate custom projects, first-private-access agreement gate, Projects 006/007, layered public site, owner connection runbook and AT-01 through AT-47. Those additions are specified, not yet implemented.

Original source documents, the full private Genesis research and unrelated parent-repository applications remain outside the public repository. The checked-in Genesis registers contain only the classified records required to initialize the platform.

## Run locally

Requirements: Node 22+, npm and PostgreSQL binaries. This machine uses `/opt/homebrew/opt/postgresql@14/bin`; set `KXRA_PG_BIN` for another installation.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3210`. Development mode exposes clearly labelled synthetic identities and a deterministic local Auth/email provider. The fixture provider is guarded by loopback, non-production and generated-secret checks and is replaced by fail-closed production modules during `next build`.

Local PostgreSQL listens through this workspace's private Unix socket. Runtime data, fake Auth state, email captures, signing secrets and browser artifacts are excluded from Git. Never point local tests at a hosted database.

## Verify

The canonical verification command creates its own random-port PostgreSQL and application runtime, then removes it without touching the preserved developer database.

```sh
npx playwright install chromium --only-shell
npm run test:ci
git diff --check
```

`npm run test:ci` creates a fresh Unix-socket-only PostgreSQL cluster, migrates and seeds it, starts Next.js on an available loopback port, runs lint/type checks, 73 database/domain/HTTP tests, migration/RLS verification, 30 desktop/mobile browser scenarios, restart persistence, an optimized production build, fixture-artifact exclusion and publication/secret scanning. It stops the database even on failure. GitHub Actions runs the same contract and dependency audits with pinned action revisions.

## Implemented locally

- Owner Dashboard with exact attention/decision/risk/activity counts and linked source records.
- Stable, filterable Portfolio for all five ventures with truthful unknown scores, finance and recommendations.
- Typed owner/partner Idea Inbox with immutable versions, evidence, state transitions, duplicate merge and approval-gated explicit sharing.
- Every project exposes the exact 18 common workspace modules plus its frozen specialist modules through direct, database-backed routes.
- Typed workspace entries use strict payload discriminators, immutable versions, exact evidence references and owner review.
- Project 001 revisit reviews require five distinct current evidence records; Project 002 has an evidence-gated fitment/safety matrix; Project 003 keeps real, generated and inferred property assets distinct.
- Project 004 has paper-only records, reports and readiness gates with no live path. Project 005 stops at evidence-bound local prototype authority and has no product-creation or publication route.
- Owner Work Log projected from real audit/security events and a redacted, audited Admin view.
- Multi-project invitations with per-project roles, note, expiry, one-use hash-only token, resend/revoke states and a fake transactional outbox.
- Branded join flow with locked email, partner-created password, email verification return and an encrypted 30-minute server-only join intent.
- Mandatory nine-step onboarding with exact project access, optional WhatsApp skip, preferences, exact-version agreement acceptance, resume and re-acknowledgement.
- Partner Profile, Security, Preferences, Assignments and WhatsApp controls; owner invitation, assignment, lifecycle, session and unpair controls.
- Account states `INVITED`, `REGISTERED`, `EMAIL_VERIFIED`, `ONBOARDING`, `ACTIVE`, `SUSPENDED` and `REVOKED`, enforced at HTTP and database boundaries.
- Classified operating registers, immutable record history and the typed idea → experiment → task → result → decision → supersession loop.
- Current-authority owner approvals with complete before/after/recipient/cost/risk envelopes, exact decimal finance totals and evidence-linked local gates for all five projects.
- RLS-scoped evidence search and one-project Ask KXRA excerpts with citations. Missing, multiple, inaccessible and revoked scopes fail before retrieval; zero evidence returns exactly `INSUFFICIENT KXRA EVIDENCE.`. No model receives context or produces answers.
- Private-by-default quarantined file metadata and bytes. Download and ingestion remain disabled.
- Seeded AI roles, skills and disabled routines as definitions only.
- A static local marketing homepage using `info@kxra-group.com`. Publication remains disabled.

## Security boundary

All 44 private application tables use Row Level Security and an explicit policy. Every private request starts with a verified server identity and runs through the non-owner application login under transaction-local `authenticated` claims. The browser and model cannot choose a user, role, organisation, project, invitation state, account state, Idea share or approval. A partner's project assignment alone does not expose another person's Ideas, and project-resource paths are re-bound to the authorized project before mutation.

Production defaults to the hosted Supabase adapter and fail-closed local-provider stubs. Hosted Supabase Auth/MFA/session behavior, owner bootstrap, Resend delivery, Storage/scanning, Trigger.dev, PostHog, Sentry, Cloudflare, AI providers and WhatsApp remain unconnected and unverified. Project 004 is research/paper only. Project 005 cannot create or publish a product without reviewed demand authority.

## Repository map

| Location                 | Responsibility                                                            |
| ------------------------ | ------------------------------------------------------------------------- |
| `apps/os`                | Next.js/TypeScript private OS, join/onboarding UI and server APIs         |
| `packages/db`            | Verified-principal transactions under PostgreSQL RLS roles                |
| `packages/domain`        | Input validation, state contracts, exact money and score formulas         |
| `packages/authz`         | Provider contract, local fake, encrypted join intent and session controls |
| `packages/ai`            | Authorized evidence envelopes; model synthesis disabled                   |
| `packages/integrations`  | Fake email rendering and WhatsApp cryptographic foundations               |
| `supabase/migrations`    | Additive schema, policy, workflow, account and gate migrations            |
| `tests`                  | Database, HTTP, contract, persistence and browser evidence                |
| `docs`                   | Architecture, security, decisions, operations, projects and playbooks     |
| `KXRA-GENESIS/registers` | Required classified seed data only                                        |

Start with [Phase Completion Brief 02](docs/operations/CODEX-PHASE-COMPLETION-BRIEF-02.md), [progress](docs/operations/progress.md), [handover](docs/operations/handover.md), [acceptance evidence](docs/operations/acceptance-evidence.md), [architecture](docs/architecture/system.md) and [security](docs/security/access-control.md).
