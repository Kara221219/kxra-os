# KXRA OS

KXRA Group's venture and customer operating platform. The repository contains a working local engineering foundation through Phase 2 Slice 32: invitation-only identity, many-to-many organizations, first-private-access legal gating, the owner control plane, seven venture workspaces, deterministic commercial foundations, secure test-mode Stripe hosted billing and subscription reconciliation, a governed custom-project proposal, activation, change, delivery and invoice-adjustment journey, private support/subscription/privacy request handling, a permission-safe private file/knowledge and AI lifecycle, KXRA Brand Studio with governed website-source acquisition and append-only evidence correction, governed YouTube-content and repository-adoption pipelines, a disabled-by-default governed routine engine, a transport-disabled WhatsApp gateway contract, an independently built public marketing application, a fail-closed separated-staging preflight, hash-bound staging migration/canonical-seed operators, exact restricted staging runtime logins and a guarded owner/TOTP bootstrap path.

It is not deployed or production ready. Hosted providers, approved legal terms, live billing, production customer onboarding, external AI generation and Meta transport remain incomplete. The public site builds locally from a hash-bound review snapshot, while publication, indexing and production legal copy remain disabled. Brand Studio works locally with a deterministic text adapter and a disabled-by-default, address-pinned website acquisition worker. Project 006 ends at a reviewed, disabled YouTube upload intent; Project 007 ends at a reviewed, no-execution implementation intent. Routine definitions require exact owner approval before local planning and retain authoritative slots, leases, checkpoints and outcomes in PostgreSQL. WhatsApp pairing, ingress, project scope, media consent and outbound intents are enforced locally, while webhook/media/model/send adapters remain disconnected. Provider upload, candidate-code execution, merge, release and deployment are deliberately disabled.

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

`npm run test:ci` creates a fresh random-port PostgreSQL/two-application runtime with per-run Next.js build directories, rejects a stale decoy service, applies and seeds 67 migrations, then runs formatting/type and 228-package lockfile policy checks, 184 database/domain/HTTP/security tests, a 168-table RLS audit, 46 private-OS browser runs and 14 public-site scenarios in both development and optimized production, database/object restart and empty-target recovery, independent optimized builds, exact-hash/SRI CSP, compressed page-asset budgets, optimized mobile/desktop Lighthouse budgets, public/private source and snapshot verification, fixture/private-marker exclusion and a publication/secret scan. It stops the disposable database even on failure. GitHub Actions runs the same contract and pinned dependency audits; a separate SHA-pinned CodeQL workflow runs security-extended JavaScript/TypeScript analysis.

For the first Supabase staging database, `staging:db:*` provides a production-rejecting, clean-branch, exact-project, hash-bound migration workflow. `staging:seed:*` then applies only canonical project/operating records, excluding all local fixture authority. `staging:roles:*` creates and verifies the exact non-bypass OS and public-ingress logins. `staging:owner:*` binds one confirmed Auth subject, prepares the singleton owner, then verifies the hosted TOTP factor and exact KXRA state. Follow [the staging connection playbook](docs/playbooks/staging-connection-and-preflight.md); operator credentials and owner identity values must never enter Git or Vercel.

## Implemented locally

- Global account identities with many-to-many organization memberships and roles `KXRA_OWNER`, `KXRA_STAFF`, `ORG_ADMIN` and `ORG_MEMBER`.
- Explicit organization selection for dual-membership users. The browser cookie only proposes context; PostgreSQL verifies the live membership and selected tenant on every request.
- Transaction-scoped PostgreSQL RLS across all 168 tables. Request bodies, headers, JWT organization metadata and model output cannot assign identity, tenant, role, project or approval authority.
- Approved-version legal document, requirement, presentation, acceptance, decline, re-acknowledgement and release-manifest records. An unapproved placeholder cannot become mandatory or unlock release.
- First-private-access agreement UI/API. Private routes fail with typed `AGREEMENT_REQUIRED` until the exact approved version/hash and wording are accepted.
- Owner Dashboard, Portfolio, typed Ideas, Work Log, redacted Admin, invitation/account lifecycle and mandatory onboarding.
- Seven venture workspaces with exact common/specialist modules and hard stops. Project 004 remains paper only; Project 005 remains demand gated.
- Project 006 immutable content packages, exact source/claim/rights/compliance/technical checks, independent review, synthetic channel verification evidence and idempotent disabled upload intents. No upload or schedule executor exists.
- Project 007 pinned repository candidates, no-execution quarantine evidence, bounded security/licence assessment, independently reviewed adoption proposals and no-execution implementation intents. No candidate runner, Git writer, merge, release or deployment path exists.
- One-project Ask KXRA authorization and RLS-scoped record/indexed-chunk evidence. Query attempts and exact source versions are retained without raw questions; authority and citations are rechecked before delivery. Zero evidence returns exactly `INSUFFICIENT KXRA EVIDENCE.`. A deterministic local structured adapter exercises the complete run contract; external model dispatch is disabled.
- Deterministic plans, plan versions/features, normalized billing state, entitlements, usage reservations/events/aggregates and owner free grants.
- Disabled-by-default test-mode Stripe Checkout and Customer Portal sessions plus a raw-body subscription webhook and no-login/no-bypass billing worker. PostgreSQL derives customer/price authority, serializes open sessions, records validated Stripe-hosted redirects before delivery and reconciles exact subscription entitlement state. Live mode and Stripe credentials remain disconnected.
- Private custom-project request, proposal, exact acceptance, payment gate, change and milestone records. Subscription access cannot create custom delivery work.
- Customer custom-project intake plus capability-gated triage, exact proposal and acceptance, controlled payment evidence, delivery-workspace activation, bilateral change control, milestone delivery/acceptance, invoices, immutable voids and bounded credit notes. Invoice adjustments remain separate from provider payment/refund truth.
- Private support, subscription cancellation/withdrawal and personal-data request workflows with exact replay/version controls, customer-visible history and separately protected internal notes. Requests do not mutate provider billing or claim that a legal/data action occurred.
- Private-by-default immutable file versions, idempotent uploads, explicit quarantine/scan/extract/index states, RLS-inheriting chunks, hash-verified private download proxy and object reconciliation. Local scanner/extractor adapters are deterministic test doubles and refuse production use.
- Typed, versioned agents, skills, tools, model policies, run attempts, budget reservations, QA and delivery evidence. Genesis definitions remain non-executable drafts except for the narrowly approved local Ask contract.
- KXRA Brand Studio source snapshots, a project-scoped website-refresh queue, address-pinned public HTTPS acquisition, append-only human evidence corrections, stale-lineage enforcement, correctable/versioned profiles, exact profile and campaign approval, metered deterministic generation, variant lineage, five-part review, and private text/Markdown/JSON export. Current authorization, source lineage and entitlement are rechecked before consequential actions and final delivery; the acquisition worker and publication remain disabled until separately configured.
- Nine typed routine manifests with exact version hashes, schedule/event/business/exchange-calendar triggers, project scopes, service identities, idempotent logical slots, worker leases, checkpoints, bounded retries and disabled notification intents. Every imported routine remains draft and disabled until exact owner approval; no external scheduler or sender is connected.
- One-use WhatsApp pairing challenges bound to the current account, phone digest and exact Meta number identity; explicit current project selection; signed-worker ingress deduplication; bounded intent records; media quarantine and voice consent; takeover/revocation checks; and disabled outbound intents. No webhook, provider media fetch, transcription, model call or Meta send is connected.
- Independent `apps/marketing` public build with the required platform, Brand Studio, custom-project, industry, company, contact and legal-review routes; original layered storytelling; reduced-motion, 320 px, 200% text and no-JavaScript fallbacks; and a private-app login redirect.
- Accessible public forms validate origin and content, deduplicate, rate-limit and bot-check through one bounded write-only RPC. Accepted rows are owner-only, audited and visibly marked unverified in the private Idea Inbox.
- Entitlement-aware Business Tools navigation and a customer journey verified in desktop and mobile browsers.
- Separate OS/marketing staging profiles with a no-value-output preflight that rejects production targets, fixtures, legacy Supabase keys, privileged database users, weak/reused secrets, cross-application credentials and prematurely enabled providers.

## Security boundary

Every private request begins with a verified server identity and a transaction under the non-owner `authenticated` role. The server selects one organization from current database membership and sets `request.kxra.org_id`; RLS and bounded functions enforce tenant, project, legal and commercial state. Revocation is checked on the next request. The LLM never calculates permissions, entitlements, usage or money.

Legal placeholders, local fake events and synthetic accounts are test data only. Hosted Supabase Auth/MFA/session behavior, owner bootstrap, Storage/scanning, Resend, Stripe, OpenAI, Trigger.dev, PostHog, Sentry, Cloudflare, Vercel, YouTube and Meta WhatsApp remain disconnected and unverified.

## Repository map

| Location                 | Responsibility                                                              |
| ------------------------ | --------------------------------------------------------------------------- |
| `apps/os`                | Next.js private OS, tenant/legal/customer UI and server APIs                |
| `apps/marketing`         | Independent public site, reviewed snapshot and bounded public forms         |
| `packages/db`            | Verified-principal, selected-tenant PostgreSQL transactions                 |
| `packages/domain`        | Validation, state contracts, exact money and score formulas                 |
| `packages/authz`         | Provider contract, local fake, join intent and session controls             |
| `packages/ai`            | Authorized evidence envelopes and deterministic local model execution       |
| `packages/brand-studio`  | Typed profile, campaign, creative and deterministic local export contracts  |
| `packages/storage`       | Private object adapters, bounded local processing and reconciliation        |
| `packages/integrations`  | Disabled provider contracts, public-source worker and signature foundations |
| `supabase/migrations`    | Additive schema, RLS, identity, legal, commercial and workflow migrations   |
| `tests`                  | Database, HTTP, contract, persistence and browser acceptance evidence       |
| `docs`                   | Architecture, security, decisions, operations, projects and playbooks       |
| `KXRA-GENESIS/registers` | Minimum classified seed data required by the platform                       |

Start with [progress](docs/operations/progress.md), [handover](docs/operations/handover.md), [acceptance evidence](docs/operations/acceptance-evidence.md), [architecture](docs/architecture/system.md), [security](docs/security/access-control.md) and [ADR 0012](docs/decisions/0012-governed-youtube-and-repository-pipelines.md).
