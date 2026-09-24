# KXRA OS

KXRA Group's venture and customer operating platform. The repository contains a working local engineering foundation through Phase 2 Slice 6: invitation-only identity, many-to-many organizations, first-private-access legal gating, the owner control plane, seven venture workspaces, deterministic commercial foundations, separately scoped custom-project intake, a permission-safe private file/knowledge and AI lifecycle, the local KXRA Brand Studio workflow, governed YouTube-content and repository-adoption pipelines, and a disabled-by-default governed routine engine.

It is not deployed or production ready. Hosted providers, approved legal terms, live billing, production customer onboarding, external AI generation, WhatsApp and the independent public site remain incomplete. Brand Studio works locally with a deterministic, no-network text adapter. Project 006 ends at a reviewed, disabled YouTube upload intent; Project 007 ends at a reviewed, no-execution implementation intent. Routine definitions require exact owner approval before local planning and retain authoritative slots, leases, checkpoints and outcomes in PostgreSQL; Trigger.dev and notification delivery remain disconnected. Website fetching, provider upload, candidate-code execution, merge, release and deployment are deliberately disabled.

The current [Phase Completion Brief 02](docs/operations/CODEX-PHASE-COMPLETION-BRIEF-02.md) is the self-contained audit and completion contract. Original source documents, full private Genesis research and unrelated parent-repository applications remain outside the public repository. Checked-in Genesis registers contain only classified records required to initialize the platform.

## Run locally

Requirements: Node 22+, npm and PostgreSQL binaries. This machine uses `/opt/homebrew/opt/postgresql@14/bin`; set `KXRA_PG_BIN` for another installation.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3210`. Development mode exposes clearly labelled synthetic identities and deterministic local Auth/email/billing fixtures. Fixture mode requires loopback, development, no Vercel or hosted Auth configuration and a generated secret. Production builds resolve fail-closed fixture stubs.

Local PostgreSQL uses a private Unix socket. Runtime data, fake provider state, signing secrets and browser artifacts are excluded from Git. Never point local tests at a hosted database.

## Verify

```sh
npx playwright install chromium --only-shell
npm run test:ci
git diff --check
```

`npm run test:ci` creates a fresh random-port PostgreSQL/application runtime, applies and seeds 53 migrations, then runs formatting/type checks, 114 database/domain/HTTP tests, a 143-table RLS audit, 40 desktop/mobile browser scenarios, database/object restart persistence, an optimized clean production build, fixture-artifact exclusion and publication/secret scanning. It stops the disposable database even on failure. GitHub Actions runs the same contract and pinned dependency audits.

## Implemented locally

- Global account identities with many-to-many organization memberships and roles `KXRA_OWNER`, `KXRA_STAFF`, `ORG_ADMIN` and `ORG_MEMBER`.
- Explicit organization selection for dual-membership users. The browser cookie only proposes context; PostgreSQL verifies the live membership and selected tenant on every request.
- Transaction-scoped PostgreSQL RLS across all 143 private tables. Request bodies, headers, JWT organization metadata and model output cannot assign identity, tenant, role, project or approval authority.
- Approved-version legal document, requirement, presentation, acceptance, decline, re-acknowledgement and release-manifest records. An unapproved placeholder cannot become mandatory or unlock release.
- First-private-access agreement UI/API. Private routes fail with typed `AGREEMENT_REQUIRED` until the exact approved version/hash and wording are accepted.
- Owner Dashboard, Portfolio, typed Ideas, Work Log, redacted Admin, invitation/account lifecycle and mandatory onboarding.
- Seven venture workspaces with exact common/specialist modules and hard stops. Project 004 remains paper only; Project 005 remains demand gated.
- Project 006 immutable content packages, exact source/claim/rights/compliance/technical checks, independent review, synthetic channel verification evidence and idempotent disabled upload intents. No upload or schedule executor exists.
- Project 007 pinned repository candidates, no-execution quarantine evidence, bounded security/licence assessment, independently reviewed adoption proposals and no-execution implementation intents. No candidate runner, Git writer, merge, release or deployment path exists.
- One-project Ask KXRA authorization and RLS-scoped record/indexed-chunk evidence. Query attempts and exact source versions are retained without raw questions; authority and citations are rechecked before delivery. Zero evidence returns exactly `INSUFFICIENT KXRA EVIDENCE.`. A deterministic local structured adapter exercises the complete run contract; external model dispatch is disabled.
- Deterministic plans, plan versions/features, normalized billing state, entitlements, usage reservations/events/aggregates and owner free grants.
- Stripe-style local HMAC verification and replay/out-of-order event reconciliation. No live webhook or Stripe credential is configured.
- Private custom-project request, proposal, exact acceptance, payment gate, change and milestone records. Subscription access cannot create custom delivery work.
- Customer custom-project intake UI and bounded APIs for plans, entitlements, usage, grants and custom-project foundations.
- Private-by-default immutable file versions, idempotent uploads, explicit quarantine/scan/extract/index states, RLS-inheriting chunks, hash-verified private download proxy and object reconciliation. Local scanner/extractor adapters are deterministic test doubles and refuse production use.
- Typed, versioned agents, skills, tools, model policies, run attempts, budget reservations, QA and delivery evidence. Genesis definitions remain non-executable drafts except for the narrowly approved local Ask contract.
- KXRA Brand Studio source snapshots, correctable/versioned profiles, exact profile and campaign approval, metered deterministic generation, variant lineage, five-part review, and private text/Markdown/JSON export. Current authorization and entitlement are rechecked before every download; there is no publication executor.
- Nine typed routine manifests with exact version hashes, schedule/event/business/exchange-calendar triggers, project scopes, service identities, idempotent logical slots, worker leases, checkpoints, bounded retries and disabled notification intents. Every imported routine remains draft and disabled until exact owner approval; no external scheduler or sender is connected.
- Entitlement-aware Business Tools navigation and a customer journey verified in desktop and mobile browsers.

## Security boundary

Every private request begins with a verified server identity and a transaction under the non-owner `authenticated` role. The server selects one organization from current database membership and sets `request.kxra.org_id`; RLS and bounded functions enforce tenant, project, legal and commercial state. Revocation is checked on the next request. The LLM never calculates permissions, entitlements, usage or money.

Legal placeholders, local fake events and synthetic accounts are test data only. Hosted Supabase Auth/MFA/session behavior, owner bootstrap, Storage/scanning, Resend, Stripe, OpenAI, Trigger.dev, PostHog, Sentry, Cloudflare, Vercel, YouTube and Meta WhatsApp remain disconnected and unverified.

## Repository map

| Location                 | Responsibility                                                            |
| ------------------------ | ------------------------------------------------------------------------- |
| `apps/os`                | Next.js private OS, tenant/legal/customer UI and server APIs              |
| `packages/db`            | Verified-principal, selected-tenant PostgreSQL transactions               |
| `packages/domain`        | Validation, state contracts, exact money and score formulas               |
| `packages/authz`         | Provider contract, local fake, join intent and session controls           |
| `packages/ai`            | Authorized evidence envelopes and deterministic local model execution      |
| `packages/brand-studio`  | Typed profile, campaign, creative and deterministic local export contracts |
| `packages/storage`       | Private object adapters, bounded local processing and reconciliation      |
| `packages/integrations`  | Fake email, WhatsApp cryptography and Stripe-style signature foundations  |
| `supabase/migrations`    | Additive schema, RLS, identity, legal, commercial and workflow migrations |
| `tests`                  | Database, HTTP, contract, persistence and browser acceptance evidence     |
| `docs`                   | Architecture, security, decisions, operations, projects and playbooks     |
| `KXRA-GENESIS/registers` | Minimum classified seed data required by the platform                     |

Start with [progress](docs/operations/progress.md), [handover](docs/operations/handover.md), [acceptance evidence](docs/operations/acceptance-evidence.md), [architecture](docs/architecture/system.md), [security](docs/security/access-control.md) and [ADR 0012](docs/decisions/0012-governed-youtube-and-repository-pipelines.md).
