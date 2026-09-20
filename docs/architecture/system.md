# Implemented architecture

Status: Final Milestone 4 and Phase 2 Slices 0–2 are implemented in the deterministic local environment on `codex/phase-2-completion`. Multi-tenant identity, first-private-access legal gating, deterministic commercial/custom-project foundations and the private file/knowledge lifecycle now exist locally. Hosted providers, model synthesis, the AI execution substrate, Brand Studio, Projects 006/007 and the independent public application remain absent. The target architecture is in [Phase Completion Brief 02](../operations/CODEX-PHASE-COMPLETION-BRIEF-02.md); implemented decisions are in [ADR 0008](../decisions/0008-multi-tenant-legal-commercial-foundation.md) and [ADR 0009](../decisions/0009-secure-file-and-knowledge-lifecycle.md). This document is not hosted or production evidence.

## Trust and request flow

```mermaid
flowchart LR
  Browser[Owner, partner or customer] --> Next[Next.js route or server component]
  Next --> Identity[Verified Auth subject]
  Identity --> Membership[Current account + organization memberships]
  Membership --> Selector[Explicit selected organization]
  Selector --> Tx[PostgreSQL transaction]
  Tx --> Context[Authenticated role + request.kxra.org_id]
  Context --> Legal[Exact legal gate]
  Legal --> RLS[PostgreSQL RLS + typed functions]
  RLS --> Response[Tenant/project-scoped response]
  RLS --> Audit[Audit, context and commercial evidence]
```

Every handler verifies identity independently. Middleware may refresh hosted cookies but never grants access. The application loads current normalized memberships. A single membership is selected deterministically; multiple memberships require explicit selection. The HttpOnly organization cookie is a selector, not a grant. PostgreSQL revalidates it and records the selection. Database work uses one transaction with `SET LOCAL ROLE authenticated`, server-derived identity claims and one server-derived `request.kxra.org_id`; pooled connections reset afterward. Mutations require the configured same-origin header, strict schemas and bounded input.

The application database login is `NOINHERIT`, `NOBYPASSRLS`, is not a superuser or table owner, and belongs only to the `authenticated` and `anon` roles. There is no browser service-role client. Request bodies, headers, paths, unverified cookies, JWT organization metadata and model output never establish identity, email verification, role, organization, project access, legal acceptance, entitlement, approval or lifecycle state.

## Auth and build boundary

`packages/authz/provider.ts` defines provider-neutral registration, sign-in, email verification, password change/reset, MFA state/challenge/recovery and sign-out-all operations. Supabase remains the production target. The deterministic file-backed provider exists only for local acceptance: it uses scrypt password hashes, digest-only one-use verification/reset tokens and provider session versions.

Package import conditions route local Auth/session/UI modules only when Node resolves the `development` condition. The default production build resolves stubs that reject fixture use. `scripts/verify-production-artifact.mjs` scans the optimized `.next` output for 16 fixture identity, selector, state-file and secret markers. Runtime guards require explicit fixture mode, an HTTP `127.0.0.1` origin, no Vercel or production environment, no hosted Supabase/database combination and generated secrets. Random unprivileged loopback ports support isolated test runs; `localhost`, non-loopback and HTTPS fixture origins fail.

## Invitation and join flow

```mermaid
sequenceDiagram
  participant O as Owner
  participant DB as PostgreSQL
  participant Mail as Fake outbox
  participant B as Partner browser
  participant Auth as Auth provider

  O->>DB: Create email + exact project/role grants + note + expiry
  DB->>Mail: Queue versioned invitation intent
  Mail-->>B: /join#token=opaque-token
  B->>B: Remove fragment immediately
  B->>DB: POST token once; rate limit and hash
  DB-->>B: Encrypted HttpOnly join-intent cookie
  B->>Auth: Create and confirm own password for locked email
  Auth-->>B: Verify email / return
  B->>DB: Redeem exact invitation version atomically
  DB-->>B: Exact memberships + mandatory onboarding
```

The raw invitation token is delivered in a URL fragment, removed with `history.replaceState`, exchanged once, hashed before database lookup and never written to browser storage, application logs, analytics, cookies, API responses or Auth state. The encrypted AES-256-GCM join-intent cookie is HttpOnly, same-site, bounded to 30 minutes and never outlives the invitation. Its payload binds invitation ID/version, token digest, normalized locked email and expiry.

Resend rotates only the delivery version/token and cancels prior pending delivery. The approved grant version remains stable. Material project, role or expiry changes require a replacement invitation and invalidate old links. Redemption locks current state and grants exactly the current invitation rows; mismatch, expiry, revocation and replay fail atomically.

## Account and onboarding model

Invitation states are `PENDING`, `SENT`, `DELIVERY_FAILED`, `REDEEMED`, `EXPIRED` and `REVOKED`. Account states are `INVITED`, `REGISTERED`, `EMAIL_VERIFIED`, `ONBOARDING`, `ACTIVE`, `SUSPENDED` and `REVOKED`. Server-controlled transitions and account security events preserve attribution. `SUSPENDED` and `REVOKED`, inactive organisation membership and inactive/expired project membership override all earlier state.

The onboarding wizard validates nine steps: Welcome, Personal Profile, Security, Project Access, Working With KXRA, optional WhatsApp, Preferences, Terms/Privacy/required agreements and Complete. Project Access is read-only and derived under RLS. Required profile/preferences/agreement data blocks completion. The two legacy seed agreement records remain explicitly labelled `UNAPPROVED_PLACEHOLDER` for local onboarding evidence.

The Slice 1 first-private-access gate is separate and stricter. Only an approved exact legal document/hash may become an active requirement. It stores an immutable presentation snapshot and exact acceptance or decline. A missing current acceptance prevents actor creation and returns `AGREEMENT_REQUIRED` before private routes. A new mandatory version reopens the gate without deleting old evidence. The placeholders have no active requirement and cannot pass the commercial release manifest.

Partners may edit only permitted profile and preference fields, change/reset their provider password, exercise fake MFA/session controls, inspect assignments and unpair their own WhatsApp account. Owner lifecycle and assignment changes bind current state through recent-AAL2, one-use exact approvals. Forced sign-out increments session version. Suspension/revocation removes UI, API, SQL, file, Ask and delivery access immediately.

## Data architecture

Eighty-nine private application tables have RLS and at least one explicit policy. Migrations `0001`–`0030` implement the original organizations, projects, records, files, approvals, account/invitation/onboarding, operating loop, owner control plane and five workspaces. Migrations `0031`–`0038` add normalized identities/memberships, selected tenant context, capabilities, exact legal gating and commercial/custom-project foundations. Migrations `0039`–`0044` add immutable file versions, processing and delivery/query evidence, RLS chunks, worker-only reconciliation and the complete lifecycle without rewriting prior migrations.

The application exposes 81 bounded functions to authenticated or anonymous roles. Tests enumerate every table and exposed function and fail if either grows without an authorization decision. Composite foreign keys bind organization/project scope. Typed security-definer functions validate context, legal, entitlement, usage, billing reconciliation, custom-project and file/knowledge transitions; ordinary RLS controls reads. Private processing/reconciliation functions are executable only by `kxra_worker`.

Seed import remains advisory-locked, atomic, source-envelope verified and stable-ID based. Project insertion initializes lifecycle/disposition/gate state, the current governance snapshot, 18 common modules, code-specific specialist modules, gate policy and any bounded static reference rows in the same transaction. Canonical seed import has no real partner grants. Local fixture accounts, exact unapproved legal placeholders and fake outbox examples are separate, deterministic development fixtures.

## Tenant, legal and commercial foundation

`account_identities` is the global identity anchor. `organisation_memberships` assigns one role and relationship to that account in one organization. Legacy `members` and `profiles` remain compatibility projections for existing workflows; they do not authorize a new tenant context. `active_context_events` records successful selections. Removing one membership does not remove another.

The legal model separates source documents, active requirements, presentations, responses and re-acknowledgements. Triggers make presented/accepted evidence immutable. Requirements bind organization, optional membership/relationship audience, exact document/version/hash, exact acceptance wording/version/hash and effective dates. Release manifests must reference approved exact legal and commercial items; a placeholder or missing item fails.

Commercial access is deterministic:

```mermaid
flowchart LR
  Event[Verified fake/provider event] --> Reconcile[Idempotent billing reconciliation]
  Plan[Immutable plan version + features] --> Decision[Entitlement decision]
  Grant[Explicit owner free grant] --> Decision
  Reconcile --> Decision
  Decision --> Reserve[Transactional usage reservation]
  Reserve --> Complete[Success, failure or release]
  Complete --> Aggregate[Usage + cost evidence]
```

Plans and features are versioned. Billing customers/subscriptions/items/events are normalized. Entitlement decisions return an allow/deny reason and source. Usage reservations lock the effective allowance so concurrent requests cannot exceed it; completion records deterministic units and integer minor-unit cost. Owner free grants carry reason, scope, expiry, issuer and revocation and never fabricate billing subscriptions. The local HMAC verifier and reconciliation function model signed Stripe events, but no public webhook, checkout, customer portal or real price exists.

Custom-project requests are private organization records. Proposal versions bind scope, exclusions, assumptions, milestones, price/currency/tax text, payment gate, legal document hash and expiry. Proposal authors need `custom_project.manage`; customer admins cannot self-price. Acceptance uses the exact current hash. A customer project is created only after the configured payment/deposit gate. Subscription entitlement is never treated as custom delivery authority.

## Existing operating architecture

The typed idea → experiment → assigned task → result → decision → supersession loop remains intact. Owner approvals bind action, organisation, project, complete payload, environment, requester, expiry and current target/access version. Only a current owner with AAL2 issued in the last 15 minutes can approve or execute. `publish`, `spend` and `deploy` have no executor.

All five projects have explicit evidence-gate policies and can produce only `local_only` authority. Project 001 requires distinct current route, liquidity, recovery, buyer and regulatory evidence. Project 002 requires exact SKU, fitment and safety evidence. Project 003 requires rights and geometry evidence. Project 004 readiness remains paper-only and cannot enable live execution. Project 005 requires reviewed buyer-demand evidence and rejects product creation/publication. Numeric gate thresholds remain `proposed_unset` until an approved scoring policy exists.

Search and Ask KXRA retrieve only through the current principal's RLS transaction. Ask requires exactly one project UUID; missing, null, multiple, inaccessible and revoked scopes fail before retrieval, with no all-project fallback. Explicit inaccessible scopes return the same unavailable result as missing resources. Responses are evidence excerpts with exact record or indexed-chunk IDs, parent file/record references, classification and version; zero evidence returns exactly `INSUFFICIENT KXRA EVIDENCE.` and no LLM is called. Each query stores a redacted hash and authorized references, then rechecks current membership, project, parent record, lifecycle and source version before delivery.

## Private file and knowledge lifecycle

```mermaid
flowchart LR
  Intent[Idempotent upload intent] --> Object[Create-only private object]
  Object --> Quarantine[QUARANTINED]
  Quarantine --> Scan[Worker-only SCANNING]
  Scan -->|reject| Rejected[REJECTED / FAILED]
  Scan --> Clean[CLEAN]
  Clean --> Extract[EXTRACTING → EXTRACTED]
  Extract --> Index[INDEXING → INDEXED chunks]
  Index --> Search[RLS search / evidence envelope]
  Index --> Authorize[Download authorization event]
  Authorize --> Verify[Read + hash/size verify]
  Verify --> Recheck[Membership/project/version recheck]
  Recheck --> Stream[Private no-store response]
```

The upload RPC derives an opaque key from the verified tenant, project, file and version. A stable request ID makes ambiguous retries idempotent only when filename, MIME, audience, size and hash remain identical. The object store never grants authority. Processing starts after a second server RPC confirms that the immutable write completed.

`file_versions`, state events, scan runs, extraction runs, processing jobs, chunks, delivery events, knowledge-query runs and reconciliation manifests preserve evidence. Chunks carry file and record versions, offsets, hash, extraction adapter/version, classification and audience. Their RLS follows the current parent record and only the current `INDEXED` version is searchable.

The local static scanner/extractor is an adversarial test double. It is size/type bounded and tests executable signatures/extensions, EICAR, archive/macro/active-PDF policy, MIME magic, encoding and JSON. It cannot execute in production or Vercel. Production requires a trusted scanner/signature feed and disposable no-network extraction worker. PDF semantic extraction is unavailable locally; image chunks state verified metadata only.

Reconciliation compares database expectations with private storage, verifies hashes, recovers a uniquely matching orphan, marks missing/mismatched versions failed and moves unknown objects to reconciliation quarantine. Controlled restart tests rehash all registered objects and compare source/chunk/job state. Empty-target restore remains a later gate.

## Project workspace architecture

Each project receives the same 18 common modules from `project_workspace_modules`: Overview, Problem, Customer, Value Proposition, Market, Research, Assumptions, Experiments, Decisions, Risks, Finance, Roadmap, Tasks, Files, Activity, Metrics, Partners and Approvals. The registry then adds 8 specialist modules for Project 001, 12 each for Projects 002 and 003, 13 for Project 004 and 16 for Project 005. Direct routes resolve only module keys present for the authorized project.

```mermaid
flowchart TD
  Route[Project + module route] --> ProjectRLS[Exact project lookup under RLS]
  ProjectRLS --> Registry[Database module registry]
  Registry --> Loader[Typed source loader]
  Loader --> Entries[Workspace entries + versions + evidence]
  Loader --> Existing[Records, loop, files, tasks, finance]
  Loader --> Specialist[Vehicle, property, CLPR or demand tables]
  Specialist --> Policy[Evidence and hard-stop functions]
  Policy --> Audit[Persisted audit event]
```

Typed workspace entries accept only the payload keys defined for their record type. Evidence-bearing review requires exact current accepted record versions. Partners can create only project-shared entries in projects where they are current contributors; owner-only modules return an explicit denied state without querying their protected data. Crafted nested resource IDs are resolved through fixed SQL maps and must belong to the project in the route.

Specialist state is explicit. Project 002 starts each supported vehicle family at `UNKNOWN` for SKU, fitment and safety and can move to `VERIFIED` only with exact current evidence. Project 003 records `REAL_INPUT`, `AI_GENERATED` or `AI_INFERRED` independently from rights and geometry QA. Project 001 requires five distinct current evidence records for a revisit recommendation or gate packet. Project 004 payload checks force paper-only research and reports and expose no broker, credential, live toggle or executor. Project 005 uses only `DISCOVERY`, `EVIDENCE_REVIEW` and `LOCAL_PROTOTYPE_AUTHORIZED`; gated planning modules expose no mutation controls and there are no creation or publication endpoints.

## Owner control plane

```mermaid
flowchart TD
  Event[Persisted task, gate, approval, record or security event] --> DB[(PostgreSQL + RLS)]
  DB --> Dashboard[Owner Dashboard exact counts]
  DB --> Portfolio[Stable Portfolio query]
  Audit[Audit/security insert] --> Projection[Typed Work Log projection]
  Projection --> DB
  Owner[Recent-AAL2 owner] --> Request[Version-2 approval envelope]
  Request --> Review[Hash-bound review]
  Review --> Execute[One-use typed executor]
  Execute --> Audit
```

Dashboard sections query complete authoritative sets and use limits only for linked previews. Portfolio sorting uses an allowlist plus project ID as a stable tie-breaker. Actual capital used is grouped by native currency without FX conversion. Venture and Confidence scores, coverage, finance and recommendations remain null/Unknown until reviewed evidence supplies them.

Ideas use a typed record plus versioned sidecar. Generic record APIs reject Idea creation and mutation. Owners see the group-wide inbox. A partner sees a project Idea only when current project access exists and the partner is either its submitter or the recipient of an active explicit share. Project membership alone is insufficient. State transitions and duplicate merges are database-validated; archived Ideas are terminal.

Every newly generated enabled approval uses the canonical states `DRAFT`, `REQUESTED`, `APPROVED`, `REJECTED`, `EXPIRED`, `EXECUTING`, `EXECUTED`, `FAILED` and `RECONCILIATION_REQUIRED`. Envelope version 2 exposes action summary, before/after state, recipient, estimated cost/currency and risk while the digest also binds organisation, project, requester, environment and expiry. External-message, publication, spend, deploy and high-cost-AI actions remain schema vocabulary only and have no executor.

The Work Log is not a free-form register. Triggers project real audit and account-security rows into typed, uniquely sourced entries linked back to records, projects, tasks, approvals, accounts or invitations. Admin is owner-only, logs every view and returns bounded counts, policy state and boolean integration presence; it never returns secret values or a generic database/role editor.

## Email and external services

The local email adapter renders nine versioned templates: Partner Invitation, Invitation Reminder, Password Reset, Email Verification, Welcome, Security Alert, Project Assignment, Access Removed and Approval Required. The outbox has idempotent operation keys and records pending, sent, failed, cancelled and bounced states. The fake transport sends nothing externally.

Hosted Supabase Auth/MFA/session behavior, owner bootstrap, Resend, Stripe, Supabase Storage/scanning, Trigger.dev, OpenAI, Meta WhatsApp, YouTube, GitHub analysis, PostHog, Sentry, Cloudflare and Vercel remain target services only. The current public homepage is a local static route; the separate marketing application and publication boundary belong to later milestones.
