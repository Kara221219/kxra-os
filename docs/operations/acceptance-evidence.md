# Phase acceptance evidence

Review date: 25 September 2026. Branch: `codex/phase-2-completion`. Slice 8 parent baseline: `4d7c1679ecb3296247e2f637cccf8e61d9c77649`. Requirements-freeze baseline: `4e597ea2039f8758a254cf42637baff26e7067a2`. Final Milestone 1 evidence: `08ac3d25f1f4127f617d91a41fa7dd353565e98b`.

This ledger records executable evidence against the cumulative Genesis, Phase Completion and Final Completion contracts. The environment used Node.js 22.22.3, synthetic identities, deterministic local Auth/email/billing/model/Brand Studio doubles, a Unix-socket-only PostgreSQL 14 cluster and a local Next.js preview. No real credentials, hosted mutation, external send, paid call, product publication, trading or deployment occurred.

**PASS (local)** means the complete acceptance scenario ran in the named deterministic environment. It does not imply hosted or production acceptance. **BLOCKED** means the complete test requires missing implementation, owner input or separately authorized provider/staging access. A passing subset is recorded without changing a blocked overall test.

## Recorded command results

| Command or scenario                    | Result                                                                                                                                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:ci`                      | **PASS** — 118-package dependency policy; 130/130 database/domain/HTTP/security tests; 57-migration/153-table audit; 38 applicable private-OS browser passes with 4 intentional skips plus 12/12 public-site passes; restart and empty-target restore; both production builds and compressed page-asset budgets; snapshot/source/artifact and 295-file publication scans |
| `npm run test:migrations`              | **PASS** — 57 contiguous migrations, 153 RLS tables with explicit policies, and non-superuser/non-bypass application/worker roles                                                                                                                      |
| `npm run test:artifact`                | **PASS** — 21 fixture, private-source, customer, state and secret markers absent from both `.next` artifacts                                                                                                                                                                |
| `npm run test:restart`                 | **PASS** — tasks, supersessions, file/chunk/job manifests and all registered private-object hashes identical after controlled restart                                                                                                                 |
| `npm run test:secrets`                 | **PASS** — 279 tracked or untracked nonignored publication candidates checked against private paths and six credential patterns                                                                                                                     |
| Public snapshot/source boundary        | **PASS** — exact SHA-256 review manifest matches; marketing source has no private OS/package/fixture/Genesis import or marker                                                                                                                          |
| `npm run lint`                         | **PASS** — TypeScript and formatting checks                                                                                                                                                                                                           |
| `npm audit --omit=dev` and `npm audit` | **PASS** — zero reported production or development dependency vulnerabilities                                                                                                                                                                         |
| Markdown/JSON integrity                | **PASS** — local links resolved across repository Markdown and all public Genesis register JSON parsed                                                                                                                                                |
| `git diff --check`                     | **PASS**                                                                                                                                                                                                                                              |
| Private document package/visual checks | **PASS** — discovery DOCX/XLSX and solicitor DOCX structurally valid and visually reviewed; files remain ignored                                                                                                                                      |

Browser screenshots, traces and reports remain local/ignored under the repository publication rule.

## Preserved Phase acceptance tests

| Test                              | Status                      | Exact current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                      | Remaining boundary                                                                                                                      |
| --------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| AT-01 full access matrix          | **PASS (local)**            | A clean disposable run covers owner, contributor, viewer, revoked, onboarding, suspended, anonymous, other-organization, customer-admin and dual-membership cases across all 153 RLS tables. All tables have explicit policies; security tests enumerate all 122 exposed functions. HTTP tests cover current private and public route families, crafted tenant/project/resource IDs, cross-project Brand Studio/YouTube/repository/files/chunks/search/Ask/Ideas/workspaces/routines/WhatsApp, public ingress and owner-only routes. | Every future table/function/route must extend the matrix. Hosted pooler/grants remain untested.                                         |
| AT-02 current approval authority  | **PASS (local)**            | Existing stale/replay/concurrency coverage remains. All currently enabled actions produce complete version-2 envelopes; Idea share and project governance add current-version binding, recent AAL2, one-use execution and audit tests.                                                                                                                                                                                                                      | Publish/message/spend/deploy/high-cost-AI executors remain absent and require separate exact-state tests when implemented.              |
| AT-03 identity contract           | **BLOCKED**                 | Expanded local subset passes invitation binding/replay/expiry, local AAL1/AAL2, self-password, verification/reset, MFA/recovery and session-version behavior. Fixture combinations and production artifact exclusion fail closed.                                                                                                                                                                                                                           | Hosted Supabase enrollment/challenge/recovery, confirmed-email, refresh/revocation and owner bootstrap need authorized staging.         |
| AT-04 private uploads             | **PASS (local)**            | Owner-private default, explicit project sharing, generated opaque keys, immutable-property idempotent retry, direct key/state forgery denial, cross-project hiding and suspended/revoked denial pass at SQL/HTTP/browser layers.                                                                                                                                                                                                                            | Hosted Storage policy and ambiguous provider-response behavior remain staging checks.                                                   |
| AT-05 safe seed/provenance        | **PASS (local)**            | Fresh/repeat/reorder/rollback tests prove seven exact projects, stable IDs, null scores, source envelopes, governance defaults/snapshots, Projects 006/007 specialist modules and gate policies, reference-only pinned repository metadata, 13 agents, 12 skills and nine disabled routines. Migration `0029` removes the former migration-before-seed dependency. Local account fixtures add two visibly unapproved legal placeholders and no real partner data. | Private foundational sources remain intentionally outside public Git.                                                                   |
| AT-06 classification/history      | **PASS (local)**            | Exact FACT evidence/reviewer/method, complete versions, immutable accepted records and decision supersession remain passing.                                                                                                                                                                                                                                                                                                                                | Rich diff presentation remains later UX work.                                                                                           |
| AT-07 full financial totals       | **PASS (local)**            | Exact decimal, 201-row uncapped totals, currency separation, unknown/zero and SQL null/type rejection remain passing.                                                                                                                                                                                                                                                                                                                                       | No ledger reconciliation, bank balance or FX engine.                                                                                    |
| AT-08 complete operating loop     | **PASS (local)**            | Typed P002 loop and five-principal isolation pass from a clean seed. Controlled restart preserves the disposable run's completed task and accepted supersession records exactly.                                                                                                                                                                                                                                                                            | Broader portfolio/committee/score workflows remain later milestones.                                                                    |
| AT-09 project gates               | **PASS (local)**            | P001 revisit, P002 fitment/safety, P003 rights/geometry, P004 paper-readiness, P005 reviewed demand, P006 publication-package and P007 adoption gates are exact-version/local-only. P004 live, P005 product, P006 provider-delivery and P007 execution flags remain unavailable.                                                                                                                                                                             | No approved numeric thresholds, live provider delivery, publication, candidate execution, merge or deploy adapter.                     |
| AT-10 document lifecycle          | **PASS (local adapters)**   | Clean text reaches upload → quarantine → scan → extraction → versioned chunks → index. EICAR, executable, macro, active PDF, archive, MIME/magic mismatch and extraction failure never enter retrieval. Chunk ACL inheritance, delivery-time revocation, hash-verified proxy download, orphan recovery/quarantine and restart hashes pass.                                                                                                                  | Production malware engine, signature feed, isolated extractor, hosted Storage and empty-target restore remain blocked.                  |
| AT-11 evidence envelope           | **PASS (local adapter)**    | Exactly one authorized project is required. Exact record/chunk versions enter an immutable one-project envelope. Missing evidence returns the frozen phrase without dispatch. Structured synthesis requires claim citations; query and run delivery reauthorize atomically. Pre-claim and post-model revocation withhold output. SQL/HTTP/desktop/mobile tests pass.                                                                                           | External model data controls and distributed delivery remain staging gates.                                                             |
| AT-12 run/skill lifecycle         | **PARTIAL / local PASS**    | Versioned agent/skill manifests, exact tool bindings, worker-only claims, append-only attempts/steps/tool/usage/QA/failure evidence, bounded retry and typed owner views pass. Only the approved Ask capability executes; Genesis definitions remain drafts.                                                                                                                                                                                                 | Handoff mutation/execution and general consequential-action approval/execution remain absent.                                           |
| AT-13 budgets/model boundary      | **PARTIAL / local PASS**    | Row-locked run/cost/token reservation, exact reconciliation, zero-cost fake policy, per-attempt tool limits, unknown-model rejection, timeout/provider failure and concurrent cap tests pass. Sol is the default label; Astra requires policy plus capability and has no seed.                                                                                                                                                                                 | External paid-provider usage/invoice reconciliation, approved budgets and staging rate/retention controls remain absent.                 |
| AT-14 routines/recovery           | **PASS (local)**            | All nine imported routines are typed, draft and disabled until exact approval. Fake-clock tests prove one logical run per event/slot, Europe/London DST and explicit XNYS open days. Worker lease expiry preserves checkpoints and supports reclaim; disabling before retry cancels protected work. Unchanged completion is quiet and actionable terminal failure creates one disabled notification intent. | No always-on scheduler, Trigger.dev task, hosted worker or notification delivery adapter.                                               |
| AT-15 paired identity/ingress     | **PASS (local)**            | Exact account/membership-version/phone-digest/WABA-number challenge, expiry, wrong binding, attempt/replay, worker-only completion, project selection and immediate revocation pass. Raw phone/code are not stored.                                                                                                                                                                                                                                          | Meta webhook challenge/signature callback and token custody remain staging work.                                                        |
| AT-16 scoped delivery/idempotency | **PARTIAL / local PASS**    | Three copies of one event/message produce one ingress/message. Explicit P002 scope cannot retrieve P003; media starts quarantined, voice consent gates transcription, and revoke/takeover cancels protected delivery. Outbound intent is idempotent and fixed disabled/not-sent.                                                                                                                                                                               | No Meta media fetch, production scan/transcription, model call, sender or ambiguous provider reconciliation.                            |
| AT-17 public build                | **PASS (local)**            | `apps/marketing` builds independently; all required and preserved routes use one exact hash-bound `REVIEW_REQUIRED` snapshot. Source and both build artifacts exclude planted private/fixture/customer/Genesis markers. `/login` targets the configured private app. Publication and indexing remain disabled. | Hosted Vercel output, RSC/prefetch/cache/error inspection and owner-approved public snapshot remain release checks. |
| AT-18 usability/recovery          | **PARTIAL / local PASS**    | Disposable CI targets 38 applicable desktop/mobile scenarios with 4 intentional device-specific skips. Existing surfaces reflow at 1440/768/390/320 and 200%; restart and empty-target database/object recovery are automated. | Full product-wide state/WCAG/failure matrix and hosted recovery evidence remain absent. |

## Added completion tests

### AT-19 — Invitation, self-password and return flow: PASS (local)

Evidence: `tests/account-contracts.test.ts`, `tests/account-http.test.ts`, `tests/e2e/accounts.spec.ts`, migrations `0014`–`0021` and the optimized artifact scan.

- Owner creates one invitation with two exact projects/roles, note and expiry; fake branded mail contains no password.
- `/join#token=…` strips the fragment before network navigation, exchanges once and preserves a sealed, expiring server-only return intent through reload/verification.
- Email is locked; partner creates/confirms a policy-valid password; verified identity redeems atomically once and receives exactly the approved grants.
- Weak/mismatched password, mismatched identity, old token after resend/replacement, expiry, revocation, replay and rate exhaustion fail.
- Tests assert the raw invitation token is absent from request URLs after exchange, console, local/session storage, cookies, API responses and Auth state.

Hosted email/Auth semantics remain part of blocked AT-03/AT-30.

### AT-20 — Mandatory onboarding: PASS (local)

Evidence: SQL/HTTP contracts plus complete desktop and mobile browser journeys.

- All nine steps validate required state. Back, forward, refresh and mobile interruption return to the current server-owned step.
- Project Access shows only assigned projects with read-only role/permission data. WhatsApp skip is optional.
- Missing required profile, preference or agreement data blocks completion. Acceptances store exact document version/timestamp and placeholders are explicitly unapproved.
- Completion stores `onboarding_completed_at`, activates the account and enters the OS. A new required agreement returns the user to step 8 without erasing prior history.

### AT-21 — Partner/owner account controls: PASS (local)

Evidence: provider contract tests, SQL/HTTP adversarial tests and the E2E account journey.

- Partner changes permitted profile/preferences, password, fake MFA/recovery and session state; role, organisation, project, permissions and completion-state forgery fail in UI/API/SQL.
- Owner invitation resend/revoke, lifecycle suspend/reactivate/revoke, assignment add/remove/role change, forced sign-out and WhatsApp unpair bind current state and append audit/security evidence.
- Suspended/revoked users lose UI/API/SQL/file/search/Ask access immediately; stale sessions and old approvals fail.

Real Supabase MFA/session behavior remains blocked under AT-03/AT-30.

### AT-22 — Dashboard, Portfolio and Ideas: PASS (local)

Evidence: `tests/control-plane.test.ts`, `tests/control-plane-http.test.ts`, `tests/e2e/control-plane.spec.ts`, migrations `0022`–`0025` and the control-plane server/UI modules.

- Dashboard section totals are calculated over complete authoritative sets, independent of preview limits, and every preview links to the producing project, record, approval, account event or Work Log row.
- Portfolio returns all five ventures with allowlisted sorting, stable ID tie-breaking, filters and pagination. Actual expenses remain separated by native currency; scores, coverage, finance and recommendations without reviewed evidence render null/Unknown/Not Assessed.
- Typed Ideas preserve every frozen field, exact record/Idea versions and exact evidence versions. SQL and HTTP reject generic writes, stale updates, invalid transitions and post-archive changes.
- Owner group-wide visibility, partner submitter visibility, explicit share grant/removal, project-membership revocation, cross-project denial and no hidden aggregate leakage pass at SQL and HTTP layers.
- Rendered owner and partner journeys pass on desktop/mobile. The 320px gate-identifier overflow and successful-form event-target bug found during browser inspection were corrected and retested.

### AT-23 — Project-specific workspaces: PASS (local)

Evidence: `tests/project-workspaces.test.ts`, `tests/project-workspaces-http.test.ts`, `tests/e2e/project-workspaces.spec.ts`, migrations `0026`–`0029` and the project workspace server/UI modules.

- Every project exposes the exact 18 common modules. Specialist counts are 8 for Project 001, 12 each for Projects 002 and 003, 13 for Project 004 and 16 for Project 005. Direct URLs resolve only registered modules in an authorized project.
- SQL and HTTP tests cover typed payload validation, versions, review, current evidence, unauthenticated/revoked access, crafted nested IDs, direct API calls and cross-project denial. Owner-only finance, approvals and full activity return denied states for partners without querying protected rows.
- Project 001 requires five distinct current evidence records for revisit recommendations and gate packets. Project 002 cannot verify fitment or safety without exact accepted evidence. Project 003 keeps real inputs distinct from generated/inferred assets and separately tracks rights/geometry review.
- Project 004 accepts only paper research/reports, keeps live execution false and has no broker/live function. Project 005 stops at exact demand-gated local prototype authority; gated planning modules expose no mutation controls and product-creation/publication routes return not found.
- Desktop and mobile tests cover each project, direct specialist URLs, partner Project 002 access, Project 003 cross-project denial, a forced rendered mutation-failure state and 1440/768/390/320 plus 200% reflow.

### AT-24 — Approvals, Work Log and Admin: PASS (local)

Evidence: complete envelope/state tests in `tests/control-plane.test.ts`, owner-route/redaction/audit tests in `tests/control-plane-http.test.ts` and rendered tests in `tests/e2e/control-plane.spec.ts`.

- `record.accept`, `membership.change`, `account.lifecycle`, `project.gate`, `idea.share` and `project.governance` all generate version-2 envelopes containing action summary, before/after, recipient, cost fields and risk; their immutable digest also binds organisation, project, requester, environment and precise expiry.
- Recent-AAL2 denial, exact-hash decision, stale target rejection, one-use execution, concurrency regression and `RECONCILIATION_REQUIRED` state support pass. Schema-only external actions have no executor and cannot be reported complete.
- Work Log uses the six frozen types and receives uniquely sourced projections from actual audit/security rows. Owner filters by project, actor, department, type, status and date; rows link to real artifacts. No partner access or free-form completion claim is permitted.
- Admin logs every owner view, rejects partner/direct mutation access, returns bounded system counts and boolean connection presence, and exposes no credential-bearing fields or generic role/secret editor.

| Completion test                      | Status                     | Current evidence boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AT-22 Dashboard, Portfolio and Ideas | **PASS (local)**           | Exact full counts with linked previews, stable allowlisted Portfolio sort/filter/page behavior, truthful null values and typed Idea fields/states/history pass at SQL, HTTP and browser layers. Partner assignment alone reveals no Idea; only own submissions and active explicit shares are visible.                                                                                                                                                                              |
| AT-23 project-specific workspaces    | **PASS (local)**           | Exact module registry, typed/empty/denied/gated states, nested-resource isolation, all five specialist boundaries and desktop/mobile direct URLs pass at SQL, HTTP and browser layers.                                                                                                                                                                                                                                                                                              |
| AT-24 approvals, Work Log and Admin  | **PASS (local)**           | All six currently enabled consequential actions have comprehensible hash-bound envelopes. Recent-AAL2, stale and one-use behavior passes. Work Log rows are real, linked and filterable; Admin is owner-only, redacted and audited. External executors remain disabled.                                                                                                                                                                                                             |
| AT-25 transactional email            | **BLOCKED**                | Local subset passes all nine versioned renderers, safe invitation link, idempotent outbox and sent/failed/cancelled/bounced states. Authorized Resend acceptance/delivery/failure remains absent.                                                                                                                                                                                                                                                                                   |
| AT-26 marketing forms/publication    | **PASS (local)**           | Enquiry, custom-project and contact routes validate origin/body/schema/type-path/consent, discard the honeypot, deduplicate idempotency/content and rate-limit transactionally. One accepted request creates one audited owner-only `UNVERIFIED` row visible in the private Idea Inbox; anonymous and partner reads return none. Storage failure has safe 503/email fallback. Publication remains disabled. |
| AT-27 telemetry/security controls    | **PARTIAL / local PASS**   | A closed telemetry envelope permits only bounded opaque operational fields. The dynamic OS has a request-nonce strict script CSP with no script unsafe-inline; full desktop/mobile hydration and mutations pass. A disconnected outbound-source contract revalidates URL/DNS/redirects, requires pinned addresses and caps response type/size/time. Marketing hash CSP, PostHog/Sentry capture, edge/storage/scanner controls and the complete staging matrix remain pending. |
| AT-28 hermetic CI                    | **PARTIAL / remote PASS**  | A pinned GitHub workflow and `scripts/ci.mjs` create random-port disposable PostgreSQL and both application services, reject a stale decoy, enforce lockfile source/integrity/license/install-script policy, then run lint, SQL/domain/HTTP/security tests, migration/RLS audit, 54 browser scenarios, snapshot/source checks, restart/empty-target recovery, both builds, compressed asset budgets and artifact/publication scans. Full CI run 36252532435 and SHA-pinned CodeQL security-extended run 36252532467 passed for Slice 12 commit `ae52e0d`; Slice 13 adds one locally passing concurrency test. Hosted providers and external AI evaluations remain pending. |
| AT-29 backup/restore drill           | **PASS (local)**           | A real custom dump plus private-object manifest restores into an empty isolated database and object directory. The clean run matched 153 tables, 2,461 rows, migration/RLS/policy and critical operational state plus 15 object hashes with zero discrepancies; measured local RTO was 2 seconds. Hosted encrypted backup and provider recovery evidence remain absent. |
| AT-30 hosted/staging contract        | **BLOCKED**                | Requires preceding milestones, owner inputs and separately authorized staging/provider credentials.                                                                                                                                                                                                                                                                                                                                                                                 |

## Phase 2 Slice 1 evidence

### AT-31 — Multi-tenant identity and isolation: PASS (local implemented surfaces)

Evidence: migrations `0031`, `0033`, `0035` and `0036`; `tests/phase2-commercial.test.ts`, `tests/phase2-http.test.ts`, `tests/e2e/phase2-identity-legal.spec.ts` and the complete current 153-table access matrix.

- One account holds different roles in KXRA and a customer organization. It must select a tenant and receives only that tenant's role, organization, projects and commercial records.
- The organization cookie is only a selector. Forged header, body, random UUID and JWT role/organization metadata fail or are ignored. A crafted cross-tenant project URL returns the same unavailable state.
- Selection is recorded by the database. Membership expiry/revocation is rechecked on the next request; removing one membership preserves the other.
- SQL, API and browser tests prove the boundary. No cache, service worker or distributed provider job exists yet, so those future paths must repeat AT-31 before activation.

### AT-32 — First-private-access NDA gate: PASS (local synthetic workflow); production text BLOCKED

Evidence: migrations `0031`, `0034` and `0035`; agreement route/UI plus SQL, HTTP and browser acceptance tests.

- An active approved synthetic requirement blocks private project, file, search and Ask routes with typed `AGREEMENT_REQUIRED` while context/agreement routes remain reachable.
- Presentation shows and stores the exact rendered content, document version/hash and acceptance wording/version/hash. Acceptance binds account, membership, organization and presentation times in immutable evidence.
- Refresh/retry is idempotent; another account remains gated; decline remains closed; a new mandatory version reopens access; retirement preserves history.
- An unapproved placeholder cannot activate. Real NDA/Terms/Privacy and other launch documents remain blocked on qualified UK counsel and owner approval.

### AT-33 — Subscription, entitlement, usage and free grants: PARTIAL / local foundation PASS

Evidence: migration `0032`, `packages/integrations/billing.ts`, commercial APIs and `tests/phase2-commercial.test.ts`.

- Tampered and expired Stripe-style signatures fail. Duplicate and older synthetic events do not corrupt normalized subscription state.
- Plan features and owner grants feed deterministic entitlement decisions. Concurrent reservations cannot exceed allowance; success/failure completion reconciles consumed units and integer minor-unit cost.
- A KXRA owner can issue and revoke a scoped, expiring free entitlement with a reason. No provider subscription is fabricated; revocation blocks the next decision. Cross-tenant billing/usage/grant access fails.
- The complete AT-33 remains partial because no live/test-mode Stripe webhook route, checkout, portal, customer billing UI or approved grace/refund/cancellation/tax policy is connected, and not every provider subscription state has end-to-end UI evidence.

### AT-34 — Custom-project commercial separation: PARTIAL / local foundation PASS

Evidence: migrations `0032`, `0034`, `0037` and `0038`; custom-project UI/APIs and SQL/HTTP tests.

- A customer submits a tenant-private request. Customer admins cannot author price/scope or activate delivery; proposal authors need `custom_project.manage`.
- Proposal versions bind scope, exclusions, assumptions, milestones, price/currency/tax text, payment gate, legal reference/hash and expiry. Wrong or stale hashes fail.
- Subscription entitlement alone cannot create a project. The exact current acceptance plus configured deposit/payment evidence creates one customer project with a server-generated ID.
- Owner triage/proposal/change-control UI, invoices, customer milestone UX, all stale/expired branches and approved SOW/legal text remain incomplete, so the full acceptance test remains partial.

### AT-46 — Legal/commercial release gate: BLOCKED; placeholder boundary PASS

`release_manifest_check` rejects an unapproved legal placeholder or incomplete commercial manifest and accepts only a complete synthetic approved fixture in tests. This proves the fail-closed boundary, not launch readiness. Qualified legal documents, final plan/price/usage/refund/cancellation/tax copy, retention/subprocessor data and support contacts are still missing.

## Phase 2 Slice 2 evidence

Evidence: migrations `0039`–`0044`; `packages/storage`; the file APIs/search/Ask integration; `tests/file-knowledge.test.ts`, `tests/http.test.ts`, `tests/security.test.ts`, the complete access matrix, `tests/e2e/workspace.spec.ts` and restart verification.

- Upload creation and finalization are separate and idempotent. Retry reuses one opaque key only when every immutable property matches. Direct callers cannot provide a key, create chunks, claim worker jobs or promote state.
- The deterministic scanner rejects the EICAR fixture, executable signatures/extensions, macro/active content, archives, MIME deception and malformed encoding. Failed or rejected sources have zero retrievable chunks.
- Clean text and JSON plus verified image metadata produce bounded chunks with source versions, offsets, hashes, extraction tool version, classification and audience. PDFs remain visibly failed until a production-safe extractor exists.
- Partners see shared chunks only while assigned to that exact project. Owner-private, cross-project, revoked and anonymous reads return no rows/content. Search and Ask use the same RLS path.
- Revocation between authorization and byte delivery returns no bytes. Revocation between retrieval and Ask completion changes the run to `WITHHELD`, stores no evidence references and delivers no answer.
- The private proxy verifies object size/hash, rechecks current authority and returns no permanent object URL. Browser journeys prove upload, worker processing, indexed status, download and chunk citation on desktop and mobile.
- Reconciliation verifies expected objects, restores an exact-hash orphan, quarantines an unknown object and marks missing/hash mismatch failed. Restart evidence rehashes all registered object versions.
- The local scanner/extractor refuses non-fixture/production use. This is local contract evidence, not production scanner, sandbox or Supabase Storage acceptance.

## Phase 2 Slice 3 evidence

Evidence: migrations `0045`–`0046`; `packages/ai`; the Ask API/UI and typed owner AI views; `tests/ai-execution.test.ts`, `tests/http.test.ts`, `tests/security.test.ts`, the complete access matrix and `tests/e2e/workspace.spec.ts`.

- All Genesis agent/skill definitions are versioned typed drafts. Only `AGT-ASK`/`SKL-ASK-001` is approved for the local fake contract; generic record writes cannot forge execution evidence.
- Run authorization binds the current account, membership/version, organization, one project, exact agent/skill/model/budget versions, allowed tools, input hash and exact evidence versions/hashes before dispatch.
- `kxra_ai_worker` alone can claim/finalize. Prompt text that requests deployment cannot expand the stored tool set; only one structured model call is recorded.
- Success records the attempt, authorization/validation/delivery steps, tool call, provider usage, evaluation and exact citations. Run History exposes those redacted facts.
- Invalid schema, provider failure and timeout fail closed. Retry requires a retryable failure, current authority and a new reservation and links the replayed attempt.
- Concurrent budget starts serialize; one capped reservation succeeds and cancellation releases its run and token counters exactly.
- Revocation before claim cancels the run and releases budget. Revocation after synthesis atomically withholds the agent run and linked knowledge query and returns no evidence.
- Unknown model substitution is rejected. The production build contains no fixture identity/secret markers; external model mode is unavailable.

## Phase 2 Slice 4 evidence

Evidence: migrations `0047`–`0048`; `packages/brand-studio`; Brand Studio server/UI modules; `tests/brand-studio.test.ts`, `tests/brand-studio-http.test.ts`, the complete access/security matrices and `tests/e2e/brand-studio.spec.ts`.

### AT-35 — Brand Profile evidence and correction: PARTIAL / local supplied-source path PASS

- A source requires consent, a rights basis, bounded supplied text and an exact content hash. Public HTTPS locator syntax rejects HTTP, credentials, non-443 ports, local/internal hosts and IP literals.
- Remote fetching is deliberately absent. Website records state `PROVIDER_DISABLED`; the customer pastes the public source snapshot. Redirect, DNS rebinding, response/MIME limits and source refresh remain untested, so full AT-35 is not claimed.
- Inferred profile fields link to the exact source version and classification. Customer correction creates a new immutable draft. The prior approved version remains active until an exact replacement version is approved.
- Anonymous and crafted-project writes fail. Contributors see/write only their assigned project; viewers cannot write; snapshots contain no cross-project Brand Studio rows.
- Empty/partial/contradictory remote-source handling and an asset-level correction UI remain incomplete.

### AT-36 — Brand generation, rights, usage and export: PARTIAL / deterministic local path PASS

- Generation binds exact approved profile and campaign versions, allowed channels and count. PostgreSQL reserves `brand.generate` before adapter work and reconciles exact consumed units.
- The bounded local adapter produces deterministic typed text variants with input hash, adapter/version, channel, warning and lineage. It makes no model/network call and cannot schedule or publish.
- Editing creates a child variant and supersedes the parent. Reviewed content is immutable. `APPROVE_EXPORT` requires all five brand, claims, rights, accessibility and compliance checks and the exact current hash.
- Export reserves `brand.export` and renders text, Markdown or JSON. Download rechecks current membership/project authority, current feature entitlement and exact latest review/content; entitlement revocation records a withheld delivery and returns no content.
- HTTP tests cover anonymous, crafted project, viewer, incomplete review, complete export, headers and cross-project snapshots. Desktop and mobile browsers complete the entire customer path and download the reviewed artifact.
- External model run/prompt-policy evidence, provider failure/timeout, image/video generation and staging delivery revocation remain incomplete; full AT-36 is therefore partial.

## Phase 2 Slice 5 evidence

Evidence: migrations `0049`–`0051`; the canonical project register; PROJECT-006/007 server/UI modules; `tests/phase2-projects.test.ts`, `tests/phase2-projects-http.test.ts`, the complete access/security matrices and `tests/e2e/project-workspaces.spec.ts`.

### AT-37 — Channel identity and authority: PARTIAL / local contract PASS

- The exact supplied channel URL/handle is seeded with `UNVERIFIED` authority. A private function records versioned synthetic verification evidence and disconnect invalidates authority.
- The browser cannot call the private verification function and no provider token is stored.
- Real Google OAuth, exact channel ownership/manager-role proof, encrypted refresh-token custody, callback validation and provider revocation remain absent.

### AT-38 — Evidence-complete video package: PASS (local)

- Source pack, claim ledger, script, red-team review, storyboard, rights, voice provenance, render, QA and metadata are immutable and hash-bound.
- A different current actor must review the exact version. All source, claim, originality, rights, disclosure, compliance, technical-QA, caption and metadata checks must pass.
- Creator self-review, wrong project, stale version/hash, direct table writes and incomplete checks fail.

### AT-39 — Upload, schedule and reconciliation: PARTIAL / disabled-intent path PASS

- An exact approved current package plus a current verified binding creates one idempotent intent.
- The only adapter is `DISABLED`; delivery is `NOT_SENT`. Revision or disconnect withdraws stale ready intents.
- No upload/schedule executor, provider retry, quota handling, processing-state reconciliation, analytics ingestion or deletion/correction workflow exists.

### AT-40 — Repository acquisition and quarantine: PARTIAL / contract PASS

- Candidate identity binds exact owner/name URL, branch, commit/tree hashes and fetch time. Hooks, submodules, lifecycle scripts, Actions, network, secrets, traversal, symlink escape, archive bomb and binary controls are explicit.
- Quarantine evidence is owner-only and append-only. The two requested repositories are reference-only seed metadata with no invented tree/scan/licence result.
- No archive downloader, immutable object store, production scanner or signature-feed evidence exists.

### AT-41 — Bounded repository analysis: PARTIAL / record-and-gate path PASS

- Assessment records exact toolchain/signature date, findings and licence/provenance/secret/malware/dependency/SAST/workflow/binary outcomes. Any failed control or high/critical finding blocks a pass.
- Safety claims such as virus-free, malware-free, safe or clean repository are rejected. Passing wording preserves tested scope and residual risk.
- No candidate code runs and no real SBOM/SAST/malware/sandbox result is claimed.

### AT-42 — Controlled adoption: PASS (local no-execution boundary)

- Proposal versions bind exact candidate/assessment, minimum scope, licence obligations, architecture, threat model, tests and rollback.
- A different actor approves the exact current version/hash. The idempotent result is fixed to `NOT_STARTED`; merge, release and deploy remain false.
- Direct intent forgery, self-review, stale evidence and candidate mutation fail. No Git writer or implementation executor exists.

### AT-43 — New project isolation and hard stops: PASS (local)

- Anonymous and unassigned SQL/HTTP access returns no project records. Crafted URL/project/resource combinations fail before data is returned.
- Revocation immediately hides candidate and content records. Browser tests show the exact modules, hard-stop copy, forms and seeded references on desktop/mobile.
- The full current 153-table RLS matrix and 122-function exposure audit include all new objects.

## Phase 2 Slice 6 evidence

Evidence: migrations `0052`–`0053`; typed routine seeds; `tests/routines.test.ts`, `tests/routines-http.test.ts`, the complete access/security matrices and `tests/e2e/control-plane.spec.ts`.

### AT-14 — Governed routines and recovery: PASS (local)

- Exactly nine stable typed routines import as immutable draft versions and disabled manifests with notification delivery disabled.
- Exact expected-hash owner approval precedes enablement. Partner, anonymous, crafted scope, direct table DML and browser worker-function access fail.
- Duplicate time slots produce one logical run. Europe/London 08:00 resolves to 08:00Z before the 2026 spring change and 07:00Z after it. XNYS planning requires an explicit open-day fact for the exact project.
- Worker death after an append-only checkpoint and lease expiry recovers the same run; reclaim increments the attempt and preserves the checkpoint exactly once.
- Disablement before retry cancels protected work. Unchanged success creates no notification; terminal actionable failure creates exactly one `DISABLED` / `NOT_SENT` intent.
- The owner Routine Registry shows exact version/scope/recovery evidence and local controls at desktop/mobile sizes. Trigger.dev and notification delivery are labelled disconnected.

## Phase 2 Slice 7 evidence

Evidence: migrations `0054`–`0055`; `packages/integrations/whatsapp.ts`; authenticated gateway APIs/UI; `tests/whatsapp-gateway.test.ts`, `tests/whatsapp-gateway-http.test.ts`, the complete access/security matrices and `tests/e2e/control-plane.spec.ts`.

### AT-15 — Paired identity and ingress: PASS (local)

- The authenticated account creates a one-use, ten-minute challenge bound to its exact membership version, phone digest, WABA id and phone-number id.
- Wrong digest/phone/provider number increments the bounded attempt counter; expiry, replay and changed authority return no pairing.
- Only `kxra_whatsapp_worker` can complete a pairing or persist ingress. Browser/anonymous direct calls and DML fail.
- Raw phone numbers and challenge codes do not persist; the HTTP response returns the code once and labels provider transport disabled.

### AT-16 — Scoped delivery and idempotency: PARTIAL / local authority PASS

- Three copies of one provider event/message id return one durable message. A sender assigned to P002 cannot select or retrieve P003.
- Project context comes from one current explicit selection and is reauthorized with current account/legal/membership/project state.
- Media starts unfetched/quarantined. Voice transcription is blocked without consent and cannot queue before a clean scan.
- Outbound response intent snapshots pairing/access versions, remains `DISABLED` / `NOT_SENT`, and cancels on adapter disablement, pairing revocation or human takeover.
- A registered Meta webhook, provider media fetch, trusted scan/transcription, model call, send and ambiguous-result reconciliation remain absent.

## Phase 2 Slice 8 evidence

Evidence: migrations `0056`–`0057`; `apps/marketing`; owner private-inbox rendering; `tests/public-marketing.test.ts`; `tests/marketing-e2e/marketing.spec.ts`; exact snapshot, source-boundary and production-artifact verifiers; ADR 0015 and the public marketing threat model.

### AT-17 — Public build boundary: PASS (local)

- Marketing and OS compile as independent Next.js applications. Marketing has no import path to OS/private packages and reads only `publication-v1.json`.
- The exact snapshot hash is pinned by a disabled `REVIEW_REQUIRED` manifest. All required current routes and preserved aliases render; legal routes clearly remain review placeholders.
- The two optimized build trees are scanned for 21 planted fixture, private-source, customer, state and secret markers. None are present.
- `/login` redirects only to the server-configured private application. Production rejects a non-HTTPS target.

### AT-26 — Marketing forms and publication: PASS (local)

- Contact, partner enquiry and custom-project forms bind their exact type and route and enforce accessible required fields and consent.
- The server rejects forged origins, malformed/oversized bodies, bad idempotency keys and type/path mismatch. A honeypot is discarded without durable content.
- Request identity is HMAC-digested. PostgreSQL applies a five-request hourly window, one-use idempotency and daily content deduplication under one bounded function.
- A 20-request concurrent HTTP exercise from one digested source accepts exactly five, rejects fifteen with `429` and persists exactly five rows, proving the transactional limit does not oversubscribe under the tested race.
- Accepted submissions create one owner-only `UNVERIFIED` row and audit event. Anonymous and partner reads return no rows. The private Idea Inbox presents untrusted status before any response or project action.
- Publication remains disabled; no real enquiry, email or external action occurred.

### AT-44 — Layered marketing accessibility and build budgets: PASS (local subset)

- Original semantic planes cover business context, reusable capability, controlled AI and measurable outcome; industry wording is explicitly applicability rather than customer/outcome proof.
- Twelve desktop/mobile scenarios cover all routes, form completion, reduced motion, 320 px reflow, 200% text, keyboard-first skip navigation, no-JavaScript content/contact fallback and a Chromium accessibility-tree check of landmarks, heading and labelled form controls.
- The tree check found that the primary navigation was hidden at the mobile breakpoint. The header now preserves an accessible horizontally scrollable navigation row; the focused desktop/mobile retest and complete contract pass.
- Deterministic production-build budgets cover every page. The largest marketing page is 107.3 KiB gzip of JavaScript/CSS against 140 KiB; the largest private OS page is 157.8 KiB against 200 KiB.
- Production-like Lighthouse/Core Web Vitals and human assistive-technology review remain required before release.

### AT-45 — Public/private/customer artifact separation: PARTIAL / local boundary PASS

- Marketing source audit rejects private imports and fixture/Genesis/secret markers. Production scans inspect HTML, scripts, maps, metadata and server output in both `.next` trees.
- The marketing environment requires only public origin, private-login target, a unique ingress HMAC secret and a dedicated restricted database URL. It receives no OS Auth, model, billing, Storage or provider secret.
- Hosted Vercel cache, RSC/prefetch, error and cross-deployment evidence remains blocked until staging exists.

## Security and accessibility review notes

The [account threat model](../security/account-identity-threat-model.md), [file/knowledge threat model](../security/file-knowledge-threat-model.md), [AI execution threat model](../security/ai-execution-threat-model.md), [Brand Studio threat model](../security/brand-studio-threat-model.md), [YouTube/repository threat model](../security/youtube-and-repository-pipelines-threat-model.md), [routine threat model](../security/routine-engine-threat-model.md), [WhatsApp threat model](../security/whatsapp-gateway-threat-model.md), [public marketing threat model](../security/public-marketing-threat-model.md) and [access-control model](../security/access-control.md) record assets, trust boundaries, attacks, controls and hosted gaps. Owner partner administration, the control plane, project workspaces, Brand Studio, Routine Registry and WhatsApp status collapse before tablet width; mobile navigation uses a keyboard-operable disclosure model.

Legal text remains unapproved. Local fake proofs, files and screen captures are ignored and absent from production output. All external providers remain disconnected.

## Next evidence gate

Slice 9's safe telemetry boundary and empty-target local recovery drill are complete within the limits above. The next evidence gate is the rest of Final Milestone 10: CSP/edge/rate hardening, SAST/dependency gates and production-like accessibility/performance evidence. No external send, provider connection, candidate-code execution, merge, production deploy or publication is authorized.
