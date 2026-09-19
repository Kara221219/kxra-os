# CODEX PHASE COMPLETION BRIEF 02

## Actual repository audit, SaaS direction and final completion contract

Version 1 · 19 September 2026

This is the current self-contained execution brief for KXRA OS. It records what exists in the connected repository, what remains unbuilt, the approved product-direction additions, the required implementation order, and the acceptance tests that must pass before any production release.

Codex must build from this brief. Do not treat headings, records, routes, seed definitions, disabled controls, plans or earlier progress statements as proof of implementation. A feature is complete only when its database policy, server path, user path, failure states, automated tests and acceptance evidence all work in the required environment.

## 1. Authority, baseline and non-deletion rule

The latest explicit owner instruction governs when requirements conflict. This brief supplements and consolidates, without silently deleting, the following sources:

1. the private `KXRA-GENESIS/CODEX-GENESIS-BUILD-BRIEF.md`;
2. `docs/operations/CODEX-PHASE-COMPLETION-BRIEF.md`;
3. `KXRA-FINAL-COMPLETION-BRIEF.md`;
4. `AGENTS.md`;
5. the current product-direction instruction dated 19 September 2026;
6. current external primary-source research listed in this brief.

Current repository facts:

- Connected repository: <https://github.com/Kara221219/kxra-os>.
- Audited implementation branch: `codex/phase-2-completion`.
- Audited and pushed commit: `9e8733bebdb967760835b3a82087b45a7f5a6197`.
- GitHub's live default branch is still `codex/genesis-foundation` at `e9e317a41b0f7a64f4b652152f7ef7c2a5ef3781`.
- Only `origin/codex/phase-2-completion` contains the audited commit.
- There is no remote `main` branch in the fetched repository.
- The working tree was clean before this audit.
- No production deployment, merge, account connection, credential creation, external send, paid model call, publication or trading action was performed.

Preserve all existing work. Use additive migrations. Do not rewrite applied migrations. Do not merge to a production branch or change the GitHub default branch until the release gate is complete and the owner approves the exact action.

The public-repository boundary remains mandatory. Commit application code, engineering documentation and the minimum classified seed data required to run KXRA OS. Do not commit the original Word/text source files, the private Genesis package, private research, archives, credentials, `.runtime`, database files, screenshots, traces or generated test artifacts.

## 2. Evidence and classification rules

Every material requirement, research claim, project record and recommendation must carry one of the canonical classifications:

- `FACT`: directly verified current state.
- `USER-SUPPLIED INFORMATION`: information supplied by the owner but not independently verified.
- `EXTERNAL RESEARCH`: sourced current external information.
- `ASSUMPTION`: a provisional condition used to proceed.
- `HYPOTHESIS`: a testable proposition, including pricing and demand.
- `ESTIMATE`: a bounded forecast with source, method and date.
- `AI INFERENCE`: a reasoned conclusion that is neither source fact nor owner decision.
- `DECISION`: an explicit approved design or operating choice.
- `UNRESOLVED QUESTION`: information or authority still required.

Do not promote a claim to `FACT` because an AI generated it, because it appears in an old strategy document, or because a route or seed row exists. Keep unknown values null and render them as `Unknown` or `Not Assessed`.

## 3. Audit method and verification actually performed

The audit used the connected remote and the code at commit `9e8733b`, not an unrelated prototype or previous promise. It inspected all tracked paths, the complete migration chain, server identity and transaction code, RLS policies, API handlers, UI routes, seed registers, project definitions, tests, operations documents and ignored publication boundary. It also queried the live Git remote and reviewed the referenced external repositories at pinned revisions.

The following commands were rerun during this audit:

| Verification                 | Actual result                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`              | PASS: typecheck, 71/71 database/domain/HTTP tests, optimized Next.js build and production artifact scan                                            |
| `npm run format:check`       | PASS                                                                                                                                               |
| `git diff --check`           | PASS                                                                                                                                               |
| `npm run test:e2e`           | PASS: 25 executed browser tests, 3 intentional device-specific skips                                                                               |
| `npm run test:restart`       | PASS: state survived a controlled PostgreSQL restart; the current accumulated local fixture store reported 33 completed tasks and 52 supersessions |
| `npm audit --omit=dev`       | PASS: 0 known vulnerabilities reported by the current npm advisory endpoint                                                                        |
| `npm audit`                  | PASS: 0 known vulnerabilities across production and development dependencies                                                                       |
| tracked secret-pattern scan  | PASS: no matching private key or live provider-secret pattern found                                                                                |
| tracked JSON parse           | PASS: 16/16 JSON files parsed                                                                                                                      |
| tracked Markdown local links | PASS: 27/27 Markdown files had resolvable local targets                                                                                            |

These are local results. They do not prove hosted Supabase, pooled connections, Supabase Storage, real MFA, Resend, Stripe, OpenAI, YouTube, Meta, Trigger.dev, PostHog, Sentry, Cloudflare, Vercel, backup recovery or production behavior.

The local HTTP and browser suites intentionally retain labelled synthetic rows. The restart counts therefore increase as the suite is rerun. This proves persistence but is not hermetic CI evidence.

## 4. Actual implementation verdict

### 4.1 IMPLEMENTED

| Area                       | Verified implementation                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository foundation      | One Next.js 15 / React 19 / TypeScript application, PostgreSQL migrations, domain/auth/database/integration packages, local scripts, tests and structured architecture/security/decision/operations/project/playbook documentation.                                                                                                                                  |
| Database authorization     | All 44 current private application tables have RLS. Private requests use a verified server principal, start a transaction, set a transaction-local nonprivileged `authenticated` or `anon` role and derive database claims from the verified identity. The application login is `NOINHERIT` and `NOBYPASSRLS` locally.                                               |
| Owner permissions          | Owner-only server checks and RLS-backed pages/APIs exist for the Dashboard, Portfolio, group Ideas, Finance totals, Partners, Approvals, Work Log and Admin. Recent AAL2 is required for implemented consequential owner actions.                                                                                                                                    |
| Partner isolation          | Active organisation membership, active/unexpired exact project membership and explicit row sharing are enforced at SQL and HTTP layers. Viewer writes, revoked/suspended access, separate-organisation access, crafted project IDs, nested-resource rebinding and cross-project file/search access are tested negatively.                                            |
| Identity foundation        | Invitation-only local account lifecycle, partner-created passwords, locked invitation email, verification return, encrypted join intent, nine-step onboarding, profile/preferences/security/assignment controls and local session revocation exist with deterministic Auth/email doubles. Fixture code is guarded and absent from the optimized production artifact. |
| Owner control plane        | Dashboard, stable Portfolio, typed Idea Inbox, six implemented approval action types, authoritative counts, exact decimal finance projections, Admin summary and Work Log projections are database backed.                                                                                                                                                           |
| Five venture workspaces    | Exactly `PROJECT-001` through `PROJECT-005` are seeded with stable IDs, null scores and no real partners. Each has 18 common modules plus its project-specific modules and local hard-stop enforcement.                                                                                                                                                              |
| Project safeguards         | Project 001 requires five distinct current evidence records; Project 002 fitment/safety remain unknown without exact accepted evidence; Project 003 separates real/generated/inferred provenance; Project 004 is paper/research only with no live path; Project 005 stops at exact demand-gated local prototype authority and has no publication route.              |
| Operating loop             | A typed idea → experiment → task → result/evidence → decision → approval → supersession path exists and persists.                                                                                                                                                                                                                                                    |
| Deterministic finance      | Four-decimal arithmetic, native-currency separation, actual/paper/estimate separation, null/unknown handling and large-row totals are implemented without model arithmetic.                                                                                                                                                                                          |
| Internal approvals         | `record.accept`, `membership.change`, `account.lifecycle`, `project.gate`, `idea.share` and `project.governance` use a versioned hash-bound envelope, recent AAL2, current-state recheck, row locks and one-use execution.                                                                                                                                           |
| Evidence-only retrieval    | Ask KXRA and search retrieve records under the current principal's RLS context and return versioned record citations. No model is called.                                                                                                                                                                                                                            |
| File quarantine foundation | Upload size is bounded, storage keys are server generated, hashes and metadata are stored, bytes enter ignored local quarantine, and all byte delivery returns HTTP 423.                                                                                                                                                                                             |
| Definitions                | Thirteen agent definitions, twelve skill definitions and nine disabled routine definitions are imported and visible as classified owner-only records.                                                                                                                                                                                                                |
| Static public preview      | A truthful static homepage and `info@kxra-group.com` contact link exist. It reads no private database content.                                                                                                                                                                                                                                                       |

### 4.2 PARTIAL

| Area                  | What exists                                                                                                | What prevents completion                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted authentication | Supabase SSR/client adapters and a manual owner bootstrap script exist.                                    | Real owner bootstrap, verified-email behavior, MFA enrollment/challenge/recovery, refresh/session revocation and pooled RLS behavior have not run in authorised staging.                 |
| Ask KXRA              | RLS-scoped full-text evidence retrieval and excerpts work.                                                 | There is no secure document chunk index, model synthesis, citation validator, delivery-time reauthorization, durable AI run log or cost/budget enforcement.                              |
| Files and knowledge   | Quarantine metadata, local bytes and access tests exist.                                                   | There is no MIME magic validation, malware/macro/archive-bomb scan, clean/extract/index lifecycle, child ACL propagation, storage RLS, download proxy, object reconciliation or restore. |
| Approvals             | Six internal database executors work.                                                                      | Publish, external message, spend, deployment and high-cost AI are vocabulary only and have no executor/reconciliation adapter.                                                           |
| Transactional email   | Nine versioned templates, idempotent fake outbox and synthetic sent/failed/bounced/cancelled states exist. | No Resend acceptance, domain verification, real bounce/retry or delivery-time access cancellation has been tested.                                                                       |
| Agreement acceptance  | Versioned legal-document and exact acceptance infrastructure exists in onboarding.                         | Only `Terms` and `Privacy` local placeholders exist; both are marked `UNAPPROVED_PLACEHOLDER`. There is no approved NDA and acceptance is not the first private-access gate.             |
| AI organisation       | The hierarchy and descriptive fields exist in seed records.                                                | The rows are not executable manifests, cannot reserve budgets or use tools, and do not create run/step/handoff evidence.                                                                 |
| Skills and routines   | Definitions render and all routines are disabled.                                                          | There is no capability broker, typed skill runner, scheduler, event trigger, DST/calendar logic, checkpoint, retry or recovery execution.                                                |
| Public presence       | One local static route exists in `apps/os`.                                                                | It is not an independent marketing application, has no required routes/forms/publication snapshot and has not been published.                                                            |

### 4.3 MISSING

- A production-shaped AI execution substrate: model adapter, capability broker, agent runs, steps, tool calls, budgets, usage, retries, handoffs, output validation and delivery recheck.
- Trigger.dev jobs and every executable routine.
- The Meta WhatsApp Business Cloud API gateway, identity-pair completion, signed ingress route, deduplication, project selection, media/voice workflow, scoped retrieval, outbound intents, retries, reconciliation and human takeover.
- Supabase Storage and the secure file/knowledge lifecycle.
- A separate `apps/marketing` build and a separate public/private deployment boundary.
- GitHub Actions or another hermetic CI system, branch-required checks, full linting, automated dependency/security gates, backup/restore drill and production-like test environment.
- Connected PostHog, Sentry, Cloudflare, Resend, Trigger.dev, OpenAI, Stripe, YouTube, Meta or Vercel provider adapters.
- Customer organisations, many-to-many organisation membership, customer/client relationship types, product/tool catalogue, plans, subscriptions, feature entitlements, usage ledger, owner-granted free access and Stripe reconciliation.
- The first-login NDA gate and approved legal text.
- The customer custom-project intake, quote/SOW, separate-cost, milestone and billing workflow.
- The KXRA Brand Studio or any other subscription tool.
- `PROJECT-006` Finance Unfolded YouTube Content Engine.
- `PROJECT-007` GitHub Repository Intelligence & Secure Reuse.

### 4.4 BROKEN

1. **Ask KXRA violates the frozen one-project evidence boundary.** The UI offers `All projects I can access`, the API accepts `project_id` as nullable/optional, and a multi-project partner can retrieve evidence from all assigned projects in one request. RLS still blocks unassigned projects, but the model-context minimisation requirement is broken. Partner Ask must require exactly one currently authorised project before retrieval.
2. **The missing-evidence response is not the required contract.** It returns `Insufficient KXRA evidence.` instead of exactly `INSUFFICIENT KXRA EVIDENCE.`
3. **GitHub's default branch is stale.** Visitors and default clones receive `e9e317a`, while the audited implementation is at `9e8733b` on the phase branch.
4. **Operational handover metadata is stale.** It says Milestone 2 is the last pushed baseline although Milestone 3 is pushed. Progress/restart counts also describe an older accumulated fixture state.
5. **The test environment is not disposable.** HTTP/browser tests leave labelled fixture rows and restart counts drift, so the local results cannot be treated as clean-run CI evidence.

### 4.5 SECURITY RISK

| Risk                                                                            | Severity                                    | Required treatment                                                                                                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ask can combine multiple authorised projects into one future model context      | High before model activation                | Require one project; reject null, missing or inaccessible project IDs before retrieval; validate every citation and recheck access before delivery. |
| Public and private routes share one deployable app                              | High before public launch                   | Create independent marketing and OS builds. Marketing receives no private credential/import path and consumes only approved publication snapshots.  |
| Hosted Supabase grants, pooler role, Auth and Storage are unproved              | High before staging sign-off                | Run the full SQL/HTTP/Storage matrix against a separately authorised staging project with the non-bypass application role.                          |
| Quarantined bytes are not scanned                                               | High if delivery or AI ingestion is enabled | Keep HTTP 423 until scan/extraction/index/reconciliation and current delivery authorization pass.                                                   |
| No durable AI run/budget/tool audit                                             | High before model calls                     | Implement immutable run, step, tool, evidence, usage and outcome records before any paid or consequential dispatch.                                 |
| No WhatsApp ingress/delivery implementation                                     | High if Meta is connected                   | Keep the gateway disabled until raw-signature, pairing, deduplication, project scope and pre-send revocation tests pass.                            |
| No hermetic CI or required remote checks                                        | High for release integrity                  | Add disposable services and required checks; pin third-party Actions to reviewed full commit SHAs.                                                  |
| Single-organisation-per-user membership model                                   | High for customer SaaS                      | Introduce account identities plus many-to-many organisation memberships and tenant-scoped RLS before customer onboarding.                           |
| Legal placeholders                                                              | High for onboarding/release                 | Do not represent placeholders as contracts. Import only solicitor-approved exact versions and retain evidence of acceptance.                        |
| Missing distributed rate limit, telemetry redaction and provider reconciliation | Medium/High                                 | Implement and test before public forms, model/provider calls or customer launch.                                                                    |

### 4.6 UX ISSUE

- `AI Team`, `Skills`, `Routines` and `Run History` are registries, not working capabilities. The UI is reasonably honest in subtitles, but the navigation still implies more operational depth than exists.
- WhatsApp is a dead-end status page.
- Ask permits an ambiguous all-project scope and shows excerpts instead of an answer workflow.
- The current homepage is a short static venture page. It does not explain the subscription product, customer tools, custom-project service, NDA onboarding or layered industry story.
- There is no usable customer home, tool catalogue, subscription status, usage display, billing portal or custom-project intake.
- File links cannot deliver clean files because every byte request is deliberately locked.
- The complete product-wide loading, empty, denied, expired, retry, network and recovery state matrix has not been tested.

### 4.7 DATA ISSUE

- Only five project records exist. Projects 006 and 007 are absent from seeds, project documentation, module registry and database tests.
- All five Venture and Confidence scores remain null. This is truthful, but no approved persisted scoring workflow exists.
- There is no approved NDA document/version.
- There are no customer tenants, product plans, Stripe customers/subscriptions, entitlements, usage events or custom-project commercial records.
- `agent`, `skill`, `routine` and `run` use generic records; there are no typed executable manifests or actual run rows.
- There are no document extraction/chunk/index records.
- There are no real partner/customer records, provider connections or production assets. This is correct for a public seed repository but must not be mistaken for launch data.

### 4.8 TESTING ISSUE

- No remote CI workflow exists.
- No configured lint command exists; formatting and TypeScript checks are not a substitute for lint/security rules.
- The database/HTTP/browser suite is strong locally but does not start from a disposable database for every complete run.
- Hosted Auth, MFA, email, Storage, model, Stripe, YouTube, Meta, Trigger, analytics, error reporting, CDN/WAF and deployment tests are absent.
- Document malware/extraction, AI prompt injection/structured-output, routine recovery, webhook replay, OAuth revocation, billing reconciliation and public/private artifact tests are absent.
- Full WCAG 2.2 AA, screen-reader, performance, load, chaos, backup/object restore and disaster-recovery evidence is absent.
- There is no merge-blocking check for migrations, RLS coverage, generated artifact leakage, secrets or dependencies.

## 5. Research that changes or constrains the build

All external findings below are `EXTERNAL RESEARCH` unless a different classification is stated. Store the retrieval date, URL, publisher, relevant excerpt or structured note and review status in the Research Source Register. Revalidate provider rules immediately before activation because APIs, platform policies, prices and laws change.

### 5.1 OpenAI model and execution boundary

- The current OpenAI model catalogue identifies `gpt-5.6-sol` and `gpt-6-astra`. Use Sol as the configured default for bounded partner work and require an explicit policy, budget reservation and recorded reason before Astra escalation. Model availability must be runtime configuration rather than a database fiction. Sources: [OpenAI model catalogue](https://developers.openai.com/api/docs/models) and [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra).
- The Responses API supports structured output, tool definitions, bounded tool calls and background execution. Use typed schemas, `max_tool_calls`, provider request IDs and deterministic validation. A model response never grants authority or proves a tool action occurred. Source: [Responses create reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create).
- `DECISION`: the database authorizes scope and tools before context retrieval. The capability broker enforces the issued capability. The model sees the minimum project envelope and never sees credentials, raw authorization tables or unrelated-project data.

### 5.2 Supabase and PostgreSQL

- Supabase requires both SQL privileges and RLS policies; policies alone do not replace explicit grants. Every new table, view, function and Storage object path therefore needs an operation-level access test. Source: [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Server authentication must validate current claims/user state. Do not trust a cookie-derived session object as proof of authorization. Source: [Supabase server-side client guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs).
- Supabase Storage access is also policy based, while service credentials bypass normal user RLS. Service credentials must remain inside narrow workers and cannot become a general application data path. Source: [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
- `DECISION`: retain PostgreSQL as the authority. Preserve the current transaction-local, non-bypass role design and prove it against the Supabase pooler in staging.

### 5.3 Market category and the first subscription tool

- Google Pomelli starts with a website, builds a business profile called Business DNA, proposes campaigns and produces editable/downloadable creative assets. Sources: [Google Labs introduction](https://blog.google/innovation-and-ai/models-and-research/google-labs/pomelli/) and [Pomelli help](https://support.google.com/labs/answer/16715058?hl=en).
- Adobe Express combines brand kits with a content scheduler. HubSpot Content Hub combines brand voice and content remix. Sources: [Adobe Express scheduler](https://www.adobe.com/express/feature/content-scheduler), [Adobe brand kits](https://www.adobe.com/express/learn/blog/brand-kits) and [HubSpot Content Hub](https://www.hubspot.com/products/content).
- `DECISION`: build an original **KXRA Brand Studio**, not a Pomelli clone. Its useful wedge is a source-linked, customer-correctable brand profile followed by campaign briefs and channel variants with provenance, rights, claim review, approval and export. Scheduling/publishing stays behind a separate approval and provider gate.
- `HYPOTHESIS`: a plan near £30 per month can attract and retain small businesses. Price, included usage, overage and annual discount remain configuration-backed hypotheses until demand, activation, support load, gross margin and retention experiments support them.
- `AI INFERENCE`: successful platforms in this category make first value visible quickly, keep brand configuration reusable, let customers correct generated assumptions, and connect creation to a repeatable workflow. KXRA should validate one strong tool before accumulating a broad but shallow catalogue.

### 5.4 Billing, subscriptions and free partner access

- Stripe recommends using signed subscription webhook events to keep local access state synchronized, a hosted customer portal for self-service account management and idempotency keys for retried mutations. Sources: [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks), [customer portal](https://docs.stripe.com/customer-management) and [idempotent requests](https://docs.stripe.com/api/idempotent_requests).
- `DECISION`: Stripe event history is evidence; KXRA's normalized subscription and entitlement records control product access. A client return URL is never proof of payment.
- `DECISION`: free partners receive an owner-issued entitlement grant with grantor, reason, scope, start, optional expiry and revocation history. Never create a fake paid subscription to represent free access.
- UK consumer subscription requirements are changing. Government guidance says further Digital Markets, Competition and Consumers Act subscription rules are expected from spring 2027; current cancellation, fair-contract, data protection and consumer duties still apply. Recheck with qualified UK counsel immediately before launch. Source: [GOV.UK fair contracts guidance](https://www.gov.uk/guidance/writing-a-fair-contract-for-customers).

### 5.5 NDA, agreements and privacy

- UK electronic signatures can be legally valid where the required intent and formalities are present, but this does not make an AI-drafted NDA suitable for KXRA's customers or partners. Source: [Law Commission electronic execution project](https://lawcom.gov.uk/project/electronic-execution-of-documents/).
- Data protection by design requires purpose limitation, minimisation, appropriate defaults and accountable processor arrangements. Sources: [ICO data protection by design](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/data-protection-by-design-and-by-default/) and [ICO controller/processor contracts](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/contracts-and-liabilities-between-controllers-and-processors-multi/).
- `DECISION`: the product must support a mandatory, versioned first-private-access agreement gate, including an NDA/confidentiality document when approved. Store exact document hash/version, presentation and acceptance time, account, organisation, IP/user-agent evidence under the approved retention policy, and an immutable rendered copy. A new mandatory version reopens the gate.
- `UNRESOLVED QUESTION`: a qualified UK solicitor must decide the exact NDA, Terms, Privacy Notice, acceptable-use, AI/data-processing and custom-project wording, including whether business, partner and consumer users need different documents. The language must preserve statutory rights and lawful disclosures. Do not publish the current placeholders.

### 5.6 Finance Unfolded and YouTube automation

- Public inspection found the channel name **Finance Unfolded**, handle `@Finance-Unfolded247`, a description centred on global money stories, wealth-building and historic financial events, and no public videos at the audit date. Channel ownership and API authority remain `USER-SUPPLIED INFORMATION` until OAuth proves the channel/account relationship.
- Upload uses YouTube Data API `videos.insert` with an OAuth grant and the `youtube.upload` scope. Uploads by unverified API projects created after 28 July 2020 may be restricted to private until the project passes YouTube's audit. Sources: [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert) and [upload guide](https://developers.google.com/youtube/v3/guides/uploading_a_video).
- Creators must disclose realistic altered or synthetic content where YouTube's rules require it. Repetitive, mass-produced or inauthentic content can fail monetisation requirements. Sources: [altered-content disclosure](https://support.google.com/youtube/answer/14328491?hl=en-GB) and [YouTube channel monetisation policies](https://support.google.com/youtube/answer/1311392?hl=en).
- Financial promotions on social media can fall within FCA rules. Source: [FCA FG24/1](https://www.fca.org.uk/publications/finalised-guidance/fg24-1-finalised-guidance-financial-promotions-social-media).
- `DECISION`: Project 006 may automate research, drafts, asset assembly, rendering, QA, metadata and private/unlisted upload. Initial public publication requires per-video owner approval. A later approved low-risk publication policy may allow scheduling only after measured quality, rights, claims and compliance performance. Regulated promotion, sponsorship, advice-like claims, impersonation/realistic synthetic people and material corrections always require human review.

### 5.7 Repository intelligence and secure reuse

- GitHub provides CodeQL scanning, dependency review and SBOM export. GitHub also recommends pinning third-party Actions to full commit SHAs. Sources: [CodeQL](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/code-scanning), [dependency review](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review), [SBOM export](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/export-dependencies-as-sbom) and [secure use of GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use).
- OSV-Scanner warns that remediation activity can execute package-manager behavior. Untrusted repositories must therefore be inspected in a disposable, no-secret, default-no-network sandbox without executing repository hooks, installers or Actions. Source: [OSV-Scanner usage](https://google.github.io/osv-scanner/usage/).
- No scanner can prove a repository is free of malware. Project 007 must report observed findings, coverage and residual risk, not issue a `safe` guarantee.

The requested repositories were inspected at pinned public revisions:

| Repository                           | Audited revision                           | Useful patterns                                                                                                                                                                                    | Restrictions and decision                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worldflowai/everything-claude-code` | `432485ba6b92c14fb357276a98957f348bcff9ee` | Hooks, command/agent organization and lifecycle ideas. Its README identifies the active upstream as `affaan-m/ECC`; that upstream was also observed at `07756cee15788a54506031462794ad645719b028`. | The mirror advertises MIT in its README but no root licence file was observed. It contains executable hooks/scripts and MCP configuration. Treat it as an untrusted reference; do not install, run or copy it wholesale. Resolve licence/provenance per reused element. |
| `msitarzewski/agency-agents`         | `ad9264e309bd5e5422c04784372d7841b1e5d604` | Large role taxonomy, role briefs, deliverable shapes and quality expectations.                                                                                                                     | MIT at the audited revision. Reuse selected concepts through KXRA's hierarchy and manifest format; do not import 230+ agents or create a swarm.                                                                                                                         |
| `nateherkai/scroll-craft`            | `0b816225945e45380397d6a0487efa3c98916858` | Independent depth planes, paced scroll storytelling, original asset composition and mobile-specific fallback/art direction.                                                                        | MIT at the audited revision. Apply principles to an original KXRA experience; do not copy its visual identity, content or implementation wholesale. Test reduced motion, keyboard flow and mobile performance.                                                          |

## 6. Approved product direction

KXRA OS becomes one secure platform with two connected purposes:

1. **KXRA's internal venture operating system** manages portfolio work, evidence, decisions, experiments, risks, finances, agents, routines, approvals, assets and the seven defined KXRA projects.
2. **The KXRA customer platform** gives organizations subscription access to useful business tools, starting with KXRA Brand Studio, plus a separately quoted custom-project service where a customer submits an idea, problem or need and KXRA scopes and helps build it.

This direction does not erase the Genesis venture-group requirements or turn every internal record into a customer feature. Shared primitives may be reused, but routes, entitlements, data and deployable boundaries must remain explicit.

### 6.1 Product and commercial principles

- Deliver measurable work rather than autonomous-AI theatre. Every agent has a manager, narrow tools, bounded scope, success criteria, budget and QA/review path.
- Preserve the eight operating lenses: Context, Connections, Capabilities, Cadence, Control, Confidence, Compliance and Continuity.
- Build the Brand Studio as the first subscription wedge. Add another paid tool only after named demand evidence, an owner decision, a measurable activation event and an entitlement/usage contract exist.
- Treat approximately £30/month as a testable price hypothesis. Plans and prices live in configuration synchronized from Stripe; marketing copy must never outrun the active price/product.
- Keep custom-project quotes, statements of work, milestones, deposits/invoices and delivery separate from subscription entitlements.
- Let the owner grant and revoke free partner entitlements without Stripe. Record the reason and scope.
- Customers own or have rights to their inputs. Every generated asset retains source/provenance, policy, prompt/run, rights and approval references.
- Never expose one tenant's profile, prompts, assets, outputs, usage, billing, support or custom projects to another tenant.
- Do not claim that KXRA is useful to every business until segment-by-segment evidence supports that claim. The initial target segment is an `UNRESOLVED QUESTION` and must be validated.

### 6.2 User types

Keep authorization roles small and stable:

- `KXRA_OWNER`: group-wide internal authority, subject to AAL2 and approvals for consequential actions.
- `KXRA_STAFF`: only explicitly granted internal capabilities and projects.
- `ORG_ADMIN`: manages their customer organization, members, approved billing/brand configuration and projects within entitlement.
- `ORG_MEMBER`: uses entitled tools and assigned custom projects within role/capability limits.

`Partner`, `Customer` and `Client` describe the commercial relationship and must not serve as security roles. Project roles remain `viewer` and `contributor` unless a later evidence-backed need adds a narrower role. One account may belong to multiple organizations; every request has one explicitly selected current organization and, where applicable, one project.

## 7. Target KXRA architecture

### 7.1 Deployable and repository units

Keep one TypeScript monorepo and split trust boundaries deliberately:

```text
apps/
  os/                 private owner/staff/customer application
  marketing/          public website and public forms only
packages/
  ai/                 provider-neutral model adapter and evidence envelopes
  authz/              verified identity, tenant/project context and capabilities
  db/                 transaction/RLS boundary and generated database types
  domain/             schemas, states, money/score/entitlement logic
  integrations/       narrow Stripe/Resend/YouTube/Meta/Trigger adapters
  knowledge/          file state, extraction, chunks, retrieval and citations
  observability/      redacted structured telemetry contracts
  ui/                 safe presentational components; no private data fetching
jobs/                  Trigger.dev tasks, schedules and event handlers
supabase/migrations/   additive SQL only
tests/                 unit, SQL/RLS, API, integration, browser, eval and recovery
docs/                  architecture, security, decisions, operations, projects, playbooks
```

Create independent Vercel projects and build artifacts:

- `kxra-group.com`: `apps/marketing`, public content and approved publication snapshots only;
- `app.kxra-group.com` by default: `apps/os`, private authenticated application. The owner may approve a different app subdomain before DNS configuration;
- Trigger.dev workers have narrow provider and database credentials and are not a back door around authorization;
- Supabase hosts PostgreSQL, Auth and private Storage. PostgreSQL remains the source of truth.

The marketing app must not import the private database client, service credentials, fixture seeds, customer records or private runtime packages. Public project/industry content is copied into immutable approved publication snapshots with exact allowed fields.

### 7.2 Tenant and identity data model

Use additive migrations and preserve stable legacy identifiers/history. Introduce or normalize these records:

| Record                     | Minimum contract                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `account_identities`       | verified Auth subject, email digest/display email policy, account state, security timestamps; one row per human/provider identity           |
| `organisations`            | KXRA or customer tenant, stable slug, state, relationship type, jurisdiction/time zone and created provenance                               |
| `organisation_memberships` | account + organization, security role, state, inviter/grant source, start/expiry/revocation and current version; unique active relationship |
| `project_memberships`      | organization membership + project, `viewer`/`contributor`, state, start/expiry and grant/revocation authority                               |
| `active_context_events`    | optional audited organization/project selection event; never an authorization source by itself                                              |
| `capability_grants`        | narrowly typed system/tool/action capability with resource scope, issuer, policy/version, expiry and revocation                             |

Backfill the current single-organization `members` data without changing meaning or accepted history. During transition, one authoritative write path updates the normalized model; remove compatibility reads only after complete regression evidence. Do not copy browser-supplied roles, organization IDs or account IDs into claims.

Each private request must:

1. verify the Supabase identity on the server;
2. resolve a currently active account and organization membership;
3. require one explicit tenant, and one project for project work/Ask;
4. begin a transaction using the non-bypass application login;
5. set only server-derived transaction-local claims;
6. execute queries/functions under RLS;
7. reauthorize immediately before byte, model, message, publication or provider delivery.

RLS must check account state, organization membership state, exact tenant, project membership state/expiry and record visibility. A service-role worker first validates a signed internal job envelope and then assumes only the stored initiating principal/capability; it must not query arbitrary tenant data.

### 7.3 First-private-access agreement gate

Public marketing, login, invitation redemption, account recovery and the agreement presentation endpoint remain reachable before acceptance. Every other private route/API/file/search/Ask/job/provider action must fail with a typed `AGREEMENT_REQUIRED` response until all mandatory documents for the account/relationship are accepted.

Add:

- `legal_documents`: type, audience, jurisdiction, version, SHA-256, rendered immutable object, status, effective/retired dates and legal reviewer reference;
- `legal_document_requirements`: organization/relationship/plan scope and mandatory version;
- `legal_acceptances`: account, membership, exact document/version/hash, presented/accepted time, acceptance wording version, IP/user-agent handling, and immutable audit link;
- `legal_reacknowledgements`: requirement/reason/deadline/state without destroying prior acceptance.

The gate is a server/database condition, not a dismissed browser flag. An invitation cannot silently accept an agreement. Decline must leave the account unable to access private data and provide an owner-approved support/closure path. Do not activate the gate with placeholder legal text.

### 7.4 Products, plans, entitlements and usage

Add versioned commercial records:

- `tool_catalogue` and `tool_versions`;
- `plans`, `plan_versions` and `plan_features`;
- `billing_customers`, `billing_subscriptions`, `billing_subscription_items` and `billing_events`;
- `entitlement_grants` and `entitlement_effective_periods`;
- `usage_events`, `usage_aggregates`, `usage_reservations` and `usage_adjustments`;
- `commercial_offers`, `price_references` and `tax_context` where needed.

Entitlement evaluation is deterministic and returns an allow/deny reason, active source, quantity/window and policy version. It combines active plan features with explicit owner grants; revocation and subscription loss take effect before the next protected action. Signed Stripe webhooks are deduplicated and stored before normalized state changes. Out-of-order/replayed events reconcile by provider object/version/time rules. Unknown billing state fails closed for new paid work while retaining a clear customer recovery path.

Usage reservations use database locks/constraints so concurrent runs cannot exceed plan, organization or owner budgets. Store provider usage and KXRA-calculated amounts separately. Use integer minor currency units or exact fixed decimal under one tested policy; models never calculate authoritative charges.

### 7.5 Custom-project commercial workflow

The subscription's project/intake feature must not imply that custom implementation is included. Add:

1. customer `custom_project_requests` with problem, desired outcome, constraints, attachments and consent;
2. KXRA triage, clarification and evidence records;
3. versioned `project_proposals` with scope, exclusions, milestones, assumptions, price/tax/currency, validity and legal document references;
4. explicit customer acceptance and, where configured, deposit/payment evidence;
5. creation of a tenant project and assignments only after the exact accepted proposal/gate;
6. versioned change requests, milestone acceptance and delivery records;
7. separate invoices/payment state and no automatic access to internal KXRA ventures.

Customer-submitted ideas default private to that organization and assigned KXRA staff. Any right for KXRA to reuse generalized learnings, train systems, publicize work or create a KXRA venture requires the exact approved contract and a separate recorded decision.

### 7.6 Files and knowledge

Implement the complete state machine:

```text
UPLOADING → QUARANTINED → SCANNING → CLEAN → EXTRACTING → EXTRACTED → INDEXING → INDEXED
                                  ↘ REJECTED / FAILED / NEEDS_REVIEW
```

Use server-generated object keys partitioned by tenant and opaque object ID. Validate size, extension, MIME magic, archive expansion, encrypted/archive policy, macro policy, hash and duplicate state. A scanner contract must return engine/version/signature time/result. Extraction occurs in a disposable no-network worker with bounded CPU/memory/time. Derived text, pages, thumbnails and chunks inherit the source tenant/project/audience and exact source version. Never expose a permanent raw object URL. Authorized download uses a short-lived server-mediated response after current RLS and state checks.

Chunk records need source/object/version/page/offset, normalized text hash, extraction model/tool version, classification, audience and revocation link. Search and Ask can use only `INDEXED` chunks still authorized at query and delivery time. Prompt-like content inside a document is untrusted evidence, never an instruction to the model or tool broker.

### 7.7 Ask KXRA and AI authorization

Fix the existing defect before any model adapter is enabled:

- a partner/customer request requires exactly one current organization and one current project;
- owner/staff cross-project research requires an explicit separately authorized internal mode and displays every included scope;
- the server creates an `evidence_envelope` containing only current authorized record/chunk versions and minimal metadata;
- the model receives the envelope, question, response schema and no authority-changing tool;
- output is schema validated; every factual claim requiring KXRA evidence maps to accessible citations;
- missing or insufficient evidence returns exactly `INSUFFICIENT KXRA EVIDENCE.`;
- access is rechecked for all cited sources immediately before delivery;
- revocation, stale source, failed citation or invalid output withholds the answer and records a redacted failure.

Search before synthesis. Support evidence-only mode. Do not send customer/KXRA data to a model until provider terms, retention, region and data-control configuration are approved and recorded.

### 7.8 AI organization and executable run model

Retain a hierarchy:

```text
Owner
└── KXRA Chief of Staff
    ├── COO
    │   ├── Operations Analyst
    │   ├── Project Coordinator
    │   └── QA / Evidence Reviewer
    ├── CFO Analyst
    │   ├── Commercial Analyst
    │   └── Finance Data Reviewer
    ├── CMO
    │   ├── Market Researcher
    │   ├── Brand Strategist
    │   └── Content Producer
    └── CTO
        ├── Software Engineer
        ├── Security Reviewer
        ├── Data / Knowledge Engineer
        └── Integration Engineer
```

Create a specialist only where a recurring, materially different tool/QA boundary exists. Every executable agent manifest contains: stable code/version, role, description, objective, accepted input schema, output schema, tools/capabilities, permissions, memory scope, project/tenant scope, manager, approval boundary, QA process, success criteria, model policy, budget/loop/time limits, data classification and status.

Add append-only operational tables:

- `agent_manifests`, `agent_manifest_versions`;
- `skill_manifests`, `skill_manifest_versions`, `skill_tool_bindings`;
- `agent_runs`, `agent_run_attempts`, `agent_run_steps`;
- `agent_tool_calls`, `agent_evidence_links`, `agent_handoffs`;
- `budget_policies`, `budget_reservations`, `provider_usage_events`;
- `run_evaluations`, `run_failures`, `run_reconciliations`.

A run stores initiating identity, effective tenant/project, exact agent/skill/model/policy versions, source references, redacted input/output references, tool requests/results, timings, tokens/provider usage, budget reservation/reconciliation, outcome, QA and handoff. Generic record APIs cannot manufacture a completed run. Retries are linked attempts and side effects use idempotency keys. The Chief of Staff coordinates plans and handoffs but does not gain every subordinate's data or tool privileges.

### 7.9 Skills and routines

A skill is a versioned executable contract, not a paragraph. It declares typed inputs/outputs, required capabilities, side-effect class, validation, retry/idempotency, evidence requirements and tests. A capability broker checks the stored initiating scope and issues a short-lived narrow token or calls the provider itself. Skills cannot retrieve arbitrary secrets.

A routine declares trigger type, time zone/calendar, exact versioned action graph, initiating service identity, tenant/project scope, budget, concurrency key, retry/checkpoint policy, notification policy, approval requirements and enabled state. All existing routines stay disabled until migrated to this format and individually approved. Trigger.dev schedules execution, while PostgreSQL stores authoritative state, deduplication, checkpoints and results.

Every run, routine state change, approval, provider intent, failure and handoff projects a typed event into the Work Log. A run is never inferred from registry text.

### 7.10 Approvals and consequential side effects

Extend the existing version-2 envelope pattern. Implement one typed executor at a time for:

- external email/message;
- public content/video publication or schedule;
- spend and paid-provider budget increase;
- deployment/release;
- high-cost model escalation;
- free-entitlement grant/revocation;
- legal-document activation;
- custom-project proposal acceptance where KXRA action follows.

Each executor locks/rechecks the exact current target, authority, payload, recipients/destination, cost cap, environment, expiry and idempotency key. External ambiguous outcomes enter reconciliation. Approval and provider success are distinct events. Human takeover/revocation before send cancels a queued action.

### 7.11 WhatsApp gateway

Keep Meta disabled until local acceptance and account eligibility are complete. The target flow is:

1. validate the raw request body against Meta's signature before durable processing;
2. deduplicate provider event/message IDs;
3. map the paired phone digest and WABA/number to an active KXRA account, never treating the phone as authority;
4. require one selected currently assigned project for project context;
5. classify only among supported intents: idea, discussion/question, validation request, research request, note, task proposal, status, supported media/voice, or human help;
6. authorize, retrieve and create typed proposals under RLS;
7. scan media before extraction and transcribe voice only under the approved retention/consent policy;
8. create an outbound intent, reauthorize immediately before send, handle takeover/revocation and reconcile ambiguous provider outcomes.

WhatsApp cannot approve access, agreements, spend, publication, deployment, high-cost escalation or trading. The LLM never decides permission or pairs an identity.

### 7.12 Finance, observability and operational security

- Retain exact PostgreSQL/domain arithmetic and currency separation. Add subscription/custom-project ledgers without merging provider estimates, committed amounts and settled actuals.
- PostHog and Sentry use allowlists. Disable private text capture, form values, prompts, files, email/phone, tokens and session replay by default. Store opaque IDs and coarse operational events only.
- Apply CSP, CSRF/origin checks, output encoding, SSRF address/redirect/scheme controls, request/body/file limits, distributed rate limits, idempotency and safe error shapes.
- Use environment-scoped secrets in provider/Vercel stores; keep `.env.example` names and safe descriptions only. Rotate/revoke after incidents and record owner, purpose and last-verified date without storing values.
- Add GitHub CI with disposable PostgreSQL and app processes, migration lint/RLS audit, format/lint/typecheck/tests/build/E2E/evals/accessibility, dependency/secret/SAST scans and marketing private-marker scan. Pin third-party Actions to full reviewed SHAs.
- Back up database and private objects with encrypted retention, manifest/hash verification and tested empty-target restoration. Define and measure RPO/RTO before launch.

## 8. Portfolio records and project workspaces

Preserve the five current records and hard stops. Add Projects 006 and 007 through the same classified, idempotent, provenance-checked seed path. Do not invent scores, market validation, partners, revenue or approval. A fresh seed after the migration contains exactly seven project records; scores remain null until an approved scoring workflow produces evidence.

| Code        | Project                                       | Current or initial status      | Non-negotiable boundary                                                                                                                                           |
| ----------- | --------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PROJECT-001 | CLPR / Blockchain Interoperability            | Discovery / monitor            | No build/launch until route, liquidity, recovery, buyer/commercial and regulatory conditions have current accepted evidence and exact approval.                   |
| PROJECT-002 | US Vehicle Seat Covers                        | Validation                     | No fitment, airbag/safety or listing claim without exact supplier/SKU/model-year/cab/seat-layout evidence, rights and landed economics.                           |
| PROJECT-003 | AI Property Fly-Through                       | Validation                     | Keep real, generated and inferred assets distinct; external delivery needs input rights, geometry/fidelity QA, disclosure and approval.                           |
| PROJECT-004 | AI Trading Research & Monitoring Laboratory   | Feasibility / paper only       | No live broker adapter, credential, live flag, job, trade executor or approval escape.                                                                            |
| PROJECT-005 | KXRA Digital Products & Content Engine        | Demand validation              | No significant creation before demand authority; every publication needs originality/IP/channel QA and exact approval.                                            |
| PROJECT-006 | Finance Unfolded YouTube Content Engine       | Validation / pre-publication   | No public upload or schedule without exact video evidence, rights, disclosure/compliance QA and approval under the active publication policy.                     |
| PROJECT-007 | GitHub Repository Intelligence & Secure Reuse | Research / controlled adoption | Never execute untrusted repository code on a trusted host or merge discovered code automatically. Licence, provenance, security and KXRA-fit gates are mandatory. |

Every project retains the 18 common modules: Overview, Context, Objectives, Assumptions, Research, Experiments, Decisions, Risks, Tasks, Files, Evidence, Metrics, Finance, Partners, Assets, Approvals, Activity and Work Log. Add only the specialist modules below.

### 8.1 PROJECT-006 — Finance Unfolded YouTube Content Engine

Seeded facts and classifications:

- Channel URL and owner intent are `USER-SUPPLIED INFORMATION`.
- Public channel name/handle/description and no observed public video at audit time are dated `EXTERNAL RESEARCH` observations, not permanent facts.
- Channel ownership, OAuth account, target audience, cadence, format, monetisation eligibility and performance are `UNRESOLVED QUESTION` until provider evidence or owner decision exists.
- Automated creation/publication value is a `HYPOTHESIS` until quality, audience, retention and policy experiments support it.

Specialist modules:

1. Channel Strategy;
2. Audience & Demand;
3. Topic Backlog;
4. Source Packs;
5. Claim Ledger;
6. Script Versions;
7. Compliance / Red Team;
8. Storyboards;
9. Asset & Music Rights;
10. Voice / Presenter Provenance;
11. Render Queue;
12. Video QA;
13. Thumbnails & Metadata;
14. Publication Approvals;
15. YouTube Uploads;
16. Schedule;
17. Analytics;
18. Content Experiments.

Pipeline:

```text
topic hypothesis
→ primary-source research pack
→ atomic claim ledger with citation/date/classification
→ script version
→ financial-promotion/misinformation/originality red team
→ storyboard and rights-cleared asset plan
→ narration/visual/render generation
→ automated technical QA plus human editorial/compliance QA
→ thumbnail/title/description/disclosure package
→ exact publication approval
→ idempotent private/unlisted upload
→ final provider-state reconciliation
→ approved public schedule/publish
→ analytics import and experiment decision
```

The Source Pack must prefer primary, current sources. Each quantitative or material factual statement maps to a claim record with source, publication/effective date, quote/paraphrase boundary, confidence, reviewer and script usage. Advice-like language, guaranteed outcomes, undisclosed sponsorship/affiliate relationships, unsupported forecasts, copied scripts/assets, deceptive thumbnails and unlicensed music/footage block publication. Synthetic voice/presenter/realistic event treatment records its provider, consent/rights and required YouTube disclosure.

Use specialized project agents only where the global hierarchy needs a distinct contract: Financial Content Researcher under CMO, Claims & Promotions Reviewer under COO/QA, Video Producer under CMO and YouTube Integration Operator under CTO. No agent can both create and finally approve its own public video. The upload operator receives only the approved immutable render/metadata package and narrow channel OAuth capability.

### 8.2 PROJECT-007 — GitHub Repository Intelligence & Secure Reuse

Purpose: discover public repositories that may solve a documented KXRA need, assess provenance/licence/security/maintenance/fit, and convert an approved candidate into a small reviewed change. It is not a general autonomous code harvester.

Specialist modules:

1. Need Statements;
2. Repository Discovery;
3. Candidate Intake;
4. Revision & Provenance;
5. Licence Review;
6. Quarantine;
7. Malware / Secret Scan;
8. Dependency & SBOM Review;
9. CodeQL / SAST Findings;
10. Workflow / Hook Review;
11. Maintenance & Community Signals;
12. Architecture Fit;
13. Sandbox Runs;
14. Red Team;
15. Adoption Proposals;
16. Implementation Branches / PRs;
17. Revalidation;
18. Approved Components Register.

Pipeline:

```text
documented KXRA need
→ metadata-only repository discovery
→ pin owner/repository/commit/tree hash
→ licence and provenance review
→ archive into quarantine with cryptographic hash
→ static malware/secret/dependency/SBOM/SAST/workflow analysis
→ disposable no-secret/no-network sandbox when execution is justified
→ maintenance, privacy and architecture-fit review
→ adoption proposal identifying exact files/concepts and obligations
→ owner/security approval
→ isolated KXRA branch with minimal reimplementation or attributed reuse
→ full KXRA tests/security review
→ human-reviewed PR
→ dependency/revision revalidation
```

Discovery uses GitHub's API or archive download under a read-only GitHub App. Do not pass a KXRA token into candidate code. Disable Git hooks, package lifecycle scripts, dev containers, Actions, post-installers and network by default. Never run candidate binaries on the developer host. Record every scanner/tool version and coverage. A clean scan means `no finding in the tested scope`; it never means virus-free.

Hard stops:

- no unresolved or incompatible licence/provenance;
- no secrets or personal/private datasets;
- no critical/high unresolved exploitable finding or suspicious obfuscation/binary;
- no dependency install or code execution outside the sandbox policy;
- no copying an entire agent library or adding a role without a KXRA need;
- no modification of KXRA code without an approved adoption proposal;
- no automatic merge, default-branch write, release or deployment;
- no repository content may instruct KXRA agents or expand their capabilities.

For the two requested references, create dated candidate records using the exact audited revisions in section 5.7. The initial adoption recommendation is concepts only: manifest/command organization and lifecycle patterns from Everything Claude Code, and selected role/deliverable patterns from Agency Agents. Any code reuse requires separate line/file-level licence and security review.

## 9. KXRA Brand Studio and customer platform

### 9.1 First useful customer journey

1. A user accepts an invitation or an approved signup path, verifies identity and accepts the currently required legal documents before private access.
2. They create or join one customer organization and select it explicitly.
3. Entitlement middleware shows only tools included by an active subscription or owner free grant.
4. Brand Studio asks for a website/domain and optional assets. Fetching is consented, SSRF protected, rate limited and limited to public content.
5. The system creates a draft Brand Profile with each inferred field linked to source evidence and labelled `AI INFERENCE`; the customer corrects and approves it.
6. The user creates a Campaign Brief with objective, audience, offer, channel, constraints, evidence/claims and success measure.
7. A bounded generation run creates selected variants. Usage is reserved first and reconciled after the provider result.
8. The user reviews source/rights/claim warnings, edits, approves and exports. Publication remains a separately entitled and approved action.
9. The product records the activation event, outcome/feedback and reusable brand/campaign learning without crossing tenant boundaries.

### 9.2 Brand Studio records

Add typed/versioned records for:

- `brand_profiles`, `brand_profile_versions` and `brand_profile_evidence`;
- `brand_sources`, crawled-source versions and fetch/security results;
- `brand_assets`, rights/provenance, palettes, typography references, tone, audience, offers, prohibited claims and required disclaimers;
- `campaign_briefs`, objectives, audiences, channels and success metrics;
- `creative_requests`, `creative_variants`, generation/run links and parent lineage;
- `creative_reviews`, policy/claims/rights/brand checks and owner/customer decisions;
- `exports`, formats, watermarks/metadata, deliverer and current authorization;
- optional `publication_intents` only after the core generate-review-export loop is proven.

Customers can edit or reject every inferred brand field. A source change does not silently overwrite approved profile versions. Accessibility checks cover contrast, alt text/captions and reduced-motion treatment where relevant. Store only assets the customer is entitled to provide/use; generated output retains model/provider and source lineage.

### 9.3 Demand, success and product limits

Before broadening the catalogue, run documented experiments for a named initial segment. Measure at minimum:

- invitation/signup to legal acceptance;
- accepted organization to first approved Brand Profile;
- time to first export;
- percentage generating and exporting a second campaign;
- four-week retained use;
- support minutes, provider cost and gross contribution by plan;
- customer-rated usefulness and correction rate;
- claim/rights/compliance failure rate.

Do not fabricate target thresholds. The owner approves experiment thresholds after a baseline or explicit commercial decision. A new tool needs a problem/evidence record, named user, activation event, limits/entitlements, threat model, unit-economics estimate, support owner and stop criteria.

## 10. Public marketing website

Build an original premium site for `kxra-group.com`; keep `info@kxra-group.com` as the public address. It must explain the customer platform and custom-project service while presenting KXRA's cross-industry capability without claiming unvalidated outcomes.

Required routes:

- `/` — clear value proposition, Brand Studio preview, industry story, trust/control and calls to action;
- `/platform` — current tools and entitlement-aware truthful availability;
- `/brand-studio` — workflow, outputs, limits and evidence-led differentiation;
- `/custom-projects` — intake/scoping/separate-pricing explanation;
- `/industries` and optional approved industry detail routes;
- `/about`;
- `/contact`;
- `/login` — redirects to the private application;
- `/legal/privacy`, `/legal/terms`, `/legal/cookies` and any counsel-approved public agreement pages;
- accessible enquiry, custom-project and contact forms entering the owner-only unverified inbox.

The homepage's layered scroll sequence should move through original depth planes such as a KXRA operating core, real business contexts, reusable capabilities, controlled AI execution and measurable outcomes. Use original KXRA copy/assets. Treat industries as examples of applicability unless an approved public project snapshot proves work in that industry. Keep text usable without JavaScript and provide a non-parallax reduced-motion mode. On mobile, simplify/recompose the art direction instead of shrinking a desktop effect.

Performance and accessibility budgets:

- target current Core Web Vitals `good` ranges in the production-like build and record actual results;
- no horizontal overflow at 320px or 200% zoom;
- keyboard-visible focus and logical document/order independent of animation;
- `prefers-reduced-motion` removes scroll-linked movement while preserving content;
- responsive optimized assets, bounded animation work and no layout shifts from layers;
- WCAG 2.2 AA automated checks plus keyboard and screen-reader manual evidence;
- no private marker, runtime secret, customer data or unpublished venture record in any public artifact/source map/metadata.

The site may describe capabilities as available only when the entitlement, complete user path and support status are real. Use `Coming soon` or an approved waitlist for unbuilt tools. Do not publish testimonials, customer counts, revenue, security certifications or outcomes without accepted evidence and consent.

## 11. Exact implementation order

Implement → run → test → inspect → fix → retest. Commit reviewable slices only after their local exit tests pass. Add migrations; never edit an applied migration. Later work may define inert types, but must not activate a capability before its prerequisites pass.

The new multi-tenant customer direction creates a necessary prerequisite before the old Final Milestone 4. This is an explicit supplemental decision, not a deletion of earlier milestones.

| Order | Delivery slice                                                     | Required outcome                                                                                                                                                                                                                                                                                                        | Local exit gate                                                                                                                                                             |
| ----: | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     0 | Audit corrections and reproducible baseline                        | Fix one-project Ask input and exact insufficiency phrase; update stale operations docs; add minimal pinned CI that starts disposable PostgreSQL/app services; make fixture cleanup or per-run isolation deterministic; add lint/migration/RLS/artifact checks. Do not change GitHub default branch yet.                 | Current 71 tests/build, full E2E, restart, format, lint, clean repeated run, AT-01/02 regression, AT-11 evidence-only subset and AT-28 baseline.                            |
|     1 | Multi-tenant identity, NDA gate and commercial foundation          | Normalize account identities/many-to-many organizations; add tenant selection, customer roles, legal documents/acceptance gate, plans, entitlements, usage reservation, free owner grants, Stripe fake/webhook model and custom-project intake/proposal states. Preserve current invitations/onboarding/projects.       | AT-01–09 and AT-19–24 regression plus AT-31–34 and AT-46 synthetic/legal-placeholder boundary.                                                                              |
|     2 | Final Milestone 4: secure files and knowledge                      | Private object adapter, scan contract, extraction, chunks, index, authorized download, object reconciliation and restore.                                                                                                                                                                                               | AT-04, AT-10, AT-18 restore subset.                                                                                                                                         |
|     3 | Final Milestone 5: permission-safe Ask KXRA                        | Exact project-scoped evidence envelope, citation validator, redacted attempts, revocation-safe delivery and provider-neutral fake model adapter.                                                                                                                                                                        | AT-11 and AT-35 evidence-scope regression; no paid call.                                                                                                                    |
|     4 | Final Milestone 6: AI execution substrate                          | Typed agents/skills, capability broker, run/step/tool/handoff records, budget reservation/reconciliation, Sol default/Astra escalation policy and eval fixtures.                                                                                                                                                        | AT-12, AT-13, AT-36 and prompt/tool injection suite.                                                                                                                        |
|     5 | KXRA Brand Studio local product                                    | Website/source intake, correctable brand profile, campaign brief, bounded generation doubles, variant review, rights/claims QA, exports, usage/entitlement UX and customer organization home.                                                                                                                           | AT-35, AT-36 plus accessibility/failure states; no external publish.                                                                                                        |
|     6 | Projects 006 and 007                                               | Add seven-project idempotent seed, project docs/modules/gates; local YouTube content pipeline through immutable approved upload intent; safe repository discovery/quarantine/scan/adoption pipeline through reviewed branch proposal.                                                                                   | AT-37–43; no YouTube send, candidate-code host execution, merge or deploy.                                                                                                  |
|     7 | Final Milestone 7: routines, Work Log and notifications            | Versioned routine engine, manual/event/schedule triggers, DST/calendar, checkpoints/retries, notification intents, real run/approval/provider projections into Work Log and Resend fake adapter.                                                                                                                        | AT-14, AT-24/25 regression and quiet-unchanged behavior.                                                                                                                    |
|     8 | Final Milestone 8: external adapters behind gates                  | Signed Stripe adapter/reconciliation, YouTube OAuth/upload adapter, WhatsApp pairing/ingress/media/outbox/takeover, Resend and Trigger.dev adapters. Keep each disabled without environment capability and owner-approved activation.                                                                                   | AT-15/16, AT-33, AT-37–39 with fakes; provider sandbox/staging portions stay BLOCKED until owner connection.                                                                |
|     9 | Final Milestone 9: independent marketing application               | `apps/marketing`, approved snapshots/forms, Brand Studio/custom-project pages and original layered industry scroll with reduced-motion/mobile treatment.                                                                                                                                                                | AT-17, AT-26, AT-44, AT-45. Publication remains disabled.                                                                                                                   |
|    10 | Final Milestone 10: production quality                             | Safe telemetry, full CI, accessibility/failure-state matrix, performance/load/rate limits, dependency/SAST/secret gates, backup/object restore and incident/runbooks.                                                                                                                                                   | AT-18, AT-27–29 and every local AT regression.                                                                                                                              |
|    11 | Controlled staging, legal/commercial sign-off and release decision | Connect owner-authorized staging providers; bootstrap owner/MFA; import solicitor-approved legal versions; configure test Stripe/product, model budgets, YouTube test channel, Resend, Storage/scanner, Trigger, telemetry and optional Meta; rerun full matrix; review public copy and default-branch/production plan. | AT-30 and AT-31–47 in production-like staging. Explicit owner approval is required for default-branch change, production deploy/publication and first real external action. |

At the end of every slice, update `docs/operations/acceptance-evidence.md`, `progress.md`, `handover.md`, the Work Log and relevant architecture/security/decision/project/playbook documents. Record exact commit, migration, environment, commands, fixtures/provider mode, PASS/FAIL/BLOCKED and evidence location. A smaller completed slice must list every deferral explicitly.

## 12. Acceptance contract

### 12.1 Test rules

- Every test begins from a known disposable database/object state unless it is explicitly a persistence/restart/upgrade test.
- Exercise database, server/API and browser/delivery layers where applicable. A disabled button alone is never evidence.
- Use at least: owner O; P002 contributor A; P003 viewer B; revoked P002 user C; other-organization user X; unauthenticated N; customer-org admin D; customer-org member E; second-customer user Y.
- Cover success, denial, expiry, revocation, stale version, concurrency/replay, malformed input, provider timeout/ambiguous result and recovery.
- Capture no secrets or private bodies in logs/screenshots. Keep test artifacts local/controlled and publish only safe summaries.
- Status values are `PASS (local)`, `PASS (staging)`, `FAIL`, `BLOCKED` or `NOT RUN`. Local provider doubles cannot produce a staging/production PASS.

### 12.2 Preserved AT-01 through AT-30

**AT-01 — Full access matrix.** Populate every private table/cache/index/outbox with group, tenant, shared/private, cross-project and other-organization rows. Exercise SELECT/INSERT/UPDATE/DELETE, every exposed function/API, file/search/citation/job and delivery. N receives zero private rows and HTTP 401; A cannot discover projects beyond its grants or owner-only data; B cannot write; C has no project content; X/Y cannot cross organizations. Forged subject, role, tenant, project, author, audience or visibility fails generically. Extend this test with every new table/route. **Audited status: PASS (local) for the current 44-table/61-function surface; new SaaS surfaces NOT RUN.**

**AT-02 — Current approval authority.** Approve grant G, then approve/execute revocation R, then try G: G fails stale and access stays revoked. Changing target version, action, tenant/project, recipient, payload, cost, risk, environment or expiry invalidates the approval; canonical object-key reordering does not. Two concurrent executions yield one state change/audit result. Rejected, expired and consumed envelopes fail at SQL/API. **Audited status: PASS (local) for six implemented executors; every new executor NOT RUN.**

**AT-03 — Real identity contract.** Invitation mismatch/reuse/expiry/revocation fail; verified identity receives only approved grants. No public path self-assigns KXRA membership. AAL1/stale step-up cannot approve and recent AAL2 can. Fixture auth fails closed in production/Vercel/non-loopback/hosted configurations or without a generated secret. Exercise hosted MFA enrollment/challenge/recovery, verification, password reset, owner bootstrap and session revocation in staging. **Audited status: local deterministic subset PASS; hosted contract BLOCKED.**

**AT-04 — Private uploads.** Owner-private is default; A cannot discover a private filename, row, hash, search hit or route. Explicit share is visible only to current assignees. Partner cannot target an unassigned project, choose a storage key/authority or promote scan state. Project/audience is explicit before submit. **Audited status: quarantine metadata PASS (local); byte lifecycle covered by AT-10 is BLOCKED.**

**AT-05 — Safe seed/provenance.** Current baseline import yields exactly Projects 001–005, null scores, no real partner grants and the expected 13 agent/12 skill/9 disabled routine definitions. After the approved addition it must yield exactly Projects 001–007 and the reviewed updated definitions. Repeat/reorder is stable. Accepted directives cannot be overwritten. Unknown scope/reference, changed source or injected mid-import failure commits nothing. Preserve source code/version/hash and never fabricate an author. **Audited status: PASS (local) for the five-project baseline; seven-project extension NOT RUN.**

**AT-06 — Classification/history.** SQL/API cannot promote to FACT without the permitted reviewed transition and evidence. Every version retains classification, status, editor, timestamp, content and provenance. Accepted decisions are corrected only through linked supersession. **Audited status: PASS (local).**

**AT-07 — Authoritative finance/counts.** 201 GBP 1.0000 actual income totals 201.0000; add GBP 2.0000 actual expense and net is 199.0000. USD stays separate; paper/estimate/commitment do not change actuals. Missing/null/wrong data fail SQL/API. Empty is Unknown; 0.1 + 0.2 is 0.3000. Counts include all authorized rows and only defined states. **Audited status: PASS (local).**

**AT-08 — Complete operating loop.** A submits a P002 idea; owner links an evidence-backed preregistered experiment/cost cap; permitted assignee completes exact task/result/evidence; owner links decision, approval and supersession. Graph survives restart. B/C/X cannot see or mutate it. **Audited status: PASS (local).**

**AT-09 — Project hard gates.** P004 live execution fails at SQL/API/UI/job and no adapter exists. P005 creation/publication rejects missing/stale/unreviewed demand; exact synthetic evidence permits only the approved local action. P002 claims require exact SKU/fitment/safety evidence. P003 faithful delivery requires rights/geometry QA. Unknown blocks action. Add P006/P007 gates from AT-43. **Audited status: PASS (local) for Projects 001–005; extensions NOT RUN.**

**AT-10 — Document lifecycle.** Clean fixture reaches quarantine → trusted scan → isolated extraction → versioned chunks → index. Malware, MIME/magic mismatch, macro, size/archive expansion bomb and extraction failure never enter retrieval. Children inherit parent ACL. Revoke between authorization and download: no bytes. Reconcile orphan/missing objects, verify hashes after restart and never expose permanent raw URLs. **Audited status: BLOCKED.**

**AT-11 — Evidence envelope.** Partner must select exactly P002 and receive only current P002 records/chunks with accessible versioned citations. Missing/null/multiple/unauthorized project fails before retrieval. Private finance, group and cross-project bait leaks no names/counts/excerpts. Stale/nonexistent citation fails. Revoke between retrieval and response: withhold delivery. Persist redacted attempt/outcome. Missing evidence returns exactly `INSUFFICIENT KXRA EVIDENCE.` **Audited status: FAIL/BROKEN for one-project input and exact phrase; model/chunk/delivery portions BLOCKED.**

**AT-12 — Run/skill lifecycle.** A fake-provider run records initiator, effective scope, agent/skill/model/policy versions, input/output references, timings, steps/tool calls, usage, outcome, QA and structured handoff. Replay is a linked new attempt. Generic writes cannot forge completion. Partner work cannot inherit owner scope; document prompt injection cannot expand tools/scope. **Audited status: BLOCKED.**

**AT-13 — Budgets/model boundary.** Concurrent reservations cannot exceed cap; zero cap makes zero paid dispatches. Fake success/invalid output/timeout/failure reconcile deterministically. Sol is default; Astra needs exact escalation authority/budget. Missing model is a visible blocker. Model arithmetic never becomes authoritative finance. **Audited status: BLOCKED.**

**AT-14 — Routines/recovery.** Imported routines remain disabled until exact approval. Fake clock proves one logical run per event/time slot, Europe/London DST and applicable exchange calendars. Worker death after checkpoint resumes without duplicate writes. Revocation before retry cancels protected work/delivery. Unchanged state is quiet; actionable failure produces one notification intent. **Audited status: BLOCKED.**

**AT-15 — Paired identity/ingress.** Valid raw-byte signature is required before persistence. One-use challenge binds authenticated account, intended phone digest and WABA/number. Wrong account/phone, expiry, replay and excess attempts fail. Phone/webhook identity grants no authority. Pair/revoke/unpair/project selection acts immediately. **Audited status: BLOCKED beyond HMAC/challenge foundations.**

**AT-16 — Scoped WhatsApp delivery/idempotency.** Three copies of one webhook make one inbound message, proposal and outbound intent. P002 sender cannot retrieve P003/private/group data. Revocation/takeover before send cancels reply. Ambiguous result reconciles rather than blind-resends. WhatsApp cannot approve access, spend, publication, deployment or trading. **Audited status: BLOCKED.**

**AT-17 — Public build boundary.** Put unique private markers in records, fixtures and filenames; marketing HTML/scripts/maps/metadata/assets/endpoints contain none. Required routes work and content comes only from an exact approved snapshot. Revoked publication disappears on next approved build. Public/private apps build independently; publication stays disabled. **Audited status: BLOCKED.**

**AT-18 — Usability/recovery.** Operate every mandatory route/workflow by keyboard at 1440, 768, 390 and 320 pixels and 200% zoom. Verify screen-reader labels/errors plus loading/empty/success/validation/denied/network/retry/expired states. CI starts disposable services. Restore database and objects into empty target and match manifest. **Audited status: completed Milestone 1–3 UI subset PASS (local); complete gate BLOCKED.**

**AT-19 — Invitation/self-password/return.** One invitation with two projects/roles/note/expiry sends a branded no-password link through fake outbox. Reload/sign-in/verification return/create-confirm password/redeem works once with locked email. Token appears in no logs/analytics/persistent browser state. Mismatch, weak/mismatched password, superseded/resend link, expiry, revoke and replay fail; exact grants result. **Audited status: PASS (local).**

**AT-20 — Mandatory onboarding.** Fresh redeemed user returns to the last required step across back/forward/refresh/mobile interruption until all nine steps pass. Project access is exact/read-only; WhatsApp skip is allowed. Missing profile/preferences/agreement blocks. Exact legal version/time persists; placeholder is labelled unapproved. Completion activates once and reopens only for a new mandatory policy. **Audited status: PASS (local) for current onboarding; first-private-access NDA extension NOT RUN.**

**AT-21 — Partner/owner controls.** Partner changes permitted profile/preferences/password/MFA/session fields through doubles; role/tenant/project/permissions changes fail UI/API/SQL. Owner lifecycle, assignment, forced sign-out and unpair actions bind current state and audit. Suspended/revoked access disappears immediately across UI/API/SQL/files/Ask/jobs/delivery. **Audited status: PASS (local) for current partner model; customer/multi-tenant extension NOT RUN.**

**AT-22 — Dashboard/Portfolio/Ideas.** Seed attention/risk/failure/approval/activity/security/idea/gate states. Dashboard counts and links exact source records. Portfolio sort/filter/pagination is stable and null remains Unknown. Owner sees group ideas; A sees only own and explicit shares with no aggregate leakage. Every idea field/transition validates SQL/API. **Audited status: PASS (local).**

**AT-23 — Project workspaces.** Every common/specialist module renders typed records and empty/failure/denied/gated states. Cross-project access fails. Validate P001–P005 specialist hard stops and direct desktop/mobile URLs. Extend identically to P006/P007. **Audited status: PASS (local) for P001–P005; P006/P007 NOT RUN.**

**AT-24 — Approvals/Work Log/Admin.** Every implemented consequential request shows action/requester/project/before-after/recipient/cost/risk/expiry, requires recent AAL2, executes once and handles stale/concurrent/uncertain outcomes. Work Log links real typed artifacts and filters. Admin is owner-only, redacted and audited; no generic role/secret mutation exists. **Audited status: PASS (local) for current actions/events; provider/AI/customer extensions NOT RUN.**

**AT-25 — Transactional email.** Fake transport renders/dispatches each versioned template with correct recipient/purpose/safe link/expiry, no confidential body, idempotent intent, retry/bounce/permanent failure and cancellation after revocation. Staging proves sender/domain/provider acceptance and one controlled delivery/failure path. **Audited status: fake foundations PARTIAL; complete test BLOCKED.**

**AT-26 — Marketing forms/publication.** Enquiry, custom-project and contact forms validate, rate-limit and bot-check accessibly. Accepted submission creates one owner-only unverified audited row; spam/duplicate/storage/provider failure has safe state. `/login` targets private app. Approved snapshot changes only approved public fields; revoke removes it. Artifact scan finds no private marker. **Audited status: BLOCKED.**

**AT-27 — Telemetry/security controls.** Captured PostHog/Sentry envelopes contain only allowlisted opaque metadata, no project content/prompts/messages/tokens/identity/file/secrets. Test CSP, CSRF/origin, rate limits, idempotency, safe errors, SSRF redirects/private addresses/schemes, webhook signatures, uploads, Storage RLS, revocation, AAL2, secret scanning, prompt injection and invalid model output. **Audited status: BLOCKED.**

**AT-28 — Hermetic CI.** Clean runner installs lockfile, creates disposable services, migrates/seeds and runs format, lint, typecheck, unit, integration, SQL/RLS, E2E, eval, accessibility/security scans and both builds. Kill/occupy expected ports and prove stale services cannot pass health checks. Required failure blocks merge. **Audited status: BLOCKED; no CI workflow exists.**

**AT-29 — Backup/restore.** Back up known synthetic database/objects plus manifest; restore empty isolated target; verify row counts/object hashes/RLS/source versions/accepted decisions/account/legal/approval/checkpoint/outbox/dedup/search state. Record RPO/RTO/discrepancies/reviewer. **Audited status: BLOCKED.**

**AT-30 — Hosted/staging contract.** In separately authorized staging, bootstrap real owner by Auth subject; exercise MFA/AAL2/recovery; prove fixture artifacts absent; verify pooler RLS and Storage; run controlled invitation/email/reset/verification/onboarding/revocation; verify provider adapters, rate limits, secrets, telemetry and restore. Meta only if eligible/authorized. No production/public/real-partner/paid/campaign action follows automatically. **Audited status: BLOCKED.**

### 12.3 Supplemental AT-31 through AT-47

**AT-31 — Multi-tenant identity and isolation.** D administers Customer One and E is its member; Y belongs only to Customer Two; A remains a KXRA partner on P002; one synthetic account belongs to both a customer and KXRA with different roles. Require explicit organization selection. Across SQL/API/browser/search/files/jobs/caches/counts, D/E cannot detect Customer Two or internal ventures, Y cannot detect Customer One, and the dual member receives only the selected tenant's effective role. Forged tenant header/path/body/JWT metadata fails; removing one membership leaves the other intact; role/expiry/revocation takes effect during an open session and before delivery. A service worker cannot broaden the initiating envelope. **Current status: NOT RUN.**

**AT-32 — First-private-access NDA gate.** With an approved synthetic legal version, a new user can reach login/recovery/agreement presentation but every private HTML/API/file/search/Ask/job/tool path returns `AGREEMENT_REQUIRED` before acceptance. Display exact document and acceptance wording; accepting records account, organization, document/version/hash, presentation/acceptance times and immutable copy. Refresh/concurrency produces one acceptance. Decline leaves no private access. Retiring the document preserves history; marking a new version mandatory reopens the gate. Another account cannot reuse acceptance. Placeholder/unapproved versions cannot activate. **Current status: NOT RUN; real text BLOCKED on legal approval.**

**AT-33 — Subscription, entitlement, usage and free partner grant.** Replay/out-of-order/invalid-signature Stripe fixtures produce one correct normalized subscription state. Client redirect or body cannot grant access. Active paid plan enables only its features and limits; cancelled/past-due/incomplete/unknown states follow the approved grace/fail-closed policy. Concurrent usage reservations never exceed allowance/budget and reconcile success/failure/refund exactly. Owner grants free Brand Studio access to one partner with reason/scope/expiry; no Stripe subscription is fabricated; revoke/expiry blocks the next action. Cross-tenant billing/customer/usage data never leaks. **Current status: NOT RUN.**

**AT-34 — Custom-project commercial separation.** Customer submits a private request; KXRA triages and versions a proposal with scope, exclusions, assumptions, milestones, separate price/currency/tax/legal references and expiry. Subscription entitlement alone cannot create delivery work. Only acceptance of the exact current proposal and configured payment/deposit gate creates a customer project/assignments. Stale/changed/rejected/expired proposals fail. Change requests version scope and price. Customer sees only its request/project/invoices; internal ventures and another customer's work remain invisible. **Current status: NOT RUN.**

**AT-35 — Brand Profile evidence and correction.** Fetch a consented local test site through the SSRF-safe adapter; private/link-local/redirect/unsupported/oversized targets fail. A draft profile links every inferred field to exact source/version and labels it `AI INFERENCE`. Customer corrects/rejects fields and approves an immutable profile version. Source refresh creates a proposed version and never overwrites the approved one. Cross-tenant source/assets/profile access fails. Empty, partial, inaccessible and contradictory source states are usable and truthful. **Current status: NOT RUN.**

**AT-36 — Brand generation, rights, usage and export.** Entitled user selects exact profile, brief, channels and count; database reserves usage/budget before one bounded fake-model run. Valid variants retain run/model/prompt-policy/source/parent lineage; invalid schema, timeout or policy failure produces no export and reconciles usage. Unresolved claim/rights/brand/accessibility finding blocks approval/export. Corrected variant passes independent review and exports expected formats. Revocation between generation and export withholds bytes. Retry is idempotent and no cross-tenant asset appears. **Current status: NOT RUN.**

**AT-37 — YouTube OAuth and channel binding.** In fake/local tests and later Google staging, OAuth uses state/PKCE where supported, exact redirect URI and minimum scope; callback binds the authenticated KXRA account and expected channel ID, storing encrypted provider tokens outside logs/database-readable UI. Wrong account/channel, missing scope, replay, expiry and revoked grant fail. Disconnect revokes KXRA capability and blocks queued uploads. The public Finance Unfolded URL alone does not prove ownership. **Current status: NOT RUN.**

**AT-38 — YouTube evidence, originality, rights and compliance.** Build one synthetic video package from topic through primary-source pack, atomic claim ledger, script, red-team, storyboard, rights records, render and QA. Every material claim maps to a current citation; unsupported/advice-like/regulated-promotion claim, copied/repetitive script, unlicensed asset/music, undisclosed realistic synthetic content, deceptive metadata, missing caption/technical QA or creator-as-final-approver blocks publication. Corrections supersede exact versions. Record a passed immutable approval package. **Current status: NOT RUN.**

**AT-39 — YouTube upload, publish and reconciliation.** Fake adapter receives only an immutable approved package and uploads once with an idempotency key, initially private/unlisted under policy. Three retries do not create duplicates. Ambiguous timeout enters reconciliation using provider ID/state. Approval expiry, package mutation, OAuth/channel revocation or owner hold before send cancels. Public schedule requires a distinct current publication approval/policy; provider failure remains visible. Import analytics without granting model/provider authority or changing historical metrics. Real public publication remains separately authorized. **Current status: NOT RUN.**

**AT-40 — Repository intake, quarantine and provenance.** Metadata discovery stores repository owner/name/default branch, pinned full commit/tree hash, fetch time and source URL without executing content. Archive hash matches quarantine object; changed upstream creates a new candidate version. Disable hooks/submodules/lifecycle/Actions by default. A candidate containing path traversal, symlink escape, oversized archive, nested bomb or binary-policy violation is rejected. No repository token/host secret enters candidate files/processes/logs. **Current status: NOT RUN.**

**AT-41 — Repository security and licence review.** On controlled clean and malicious fixtures, record scanner/tool/signature versions and findings from secrets, malware/signature, dependency/OSV, SBOM, SAST/CodeQL and workflow/hook inspection. A no-finding result uses bounded wording. Missing/ambiguous/incompatible licence, suspicious obfuscation/binary, critical/high exploitable issue or unreviewed executable workflow blocks adoption. Network/process/filesystem escape attempts in the sandbox fail. Store residual risk and reviewer. **Current status: NOT RUN.**

**AT-42 — Safe code adoption.** An approved candidate proposal names the KXRA need, exact pinned source files/concepts, licence/attribution obligations, architecture changes, threat model, tests and rollback. Only this scope is implemented in an isolated branch. Candidate content cannot alter agent instructions or tool permissions. Full KXRA tests/security checks run; owner/security review is required; automation cannot merge, change default branch, publish, deploy or enable provider credentials. Later source revision triggers revalidation rather than silent update. **Current status: NOT RUN.**

**AT-43 — Projects 006/007 seeds, modules and hard stops.** Fresh import contains exactly seven stable project codes, all 18 common modules and exactly the approved specialist modules for P006/P007, null scores and no real grants. Owner and assigned partner workspace routes render typed empty/denied/failure states at required widths. P006 cannot make an upload/publication intent without AT-38 evidence and exact approval. P007 cannot move to sandbox/adoption/implementation without pinned provenance, licence and security gates; no direct host execution or merge path exists. Re-import/reorder is stable and rollback is atomic. **Current status: NOT RUN.**

**AT-44 — Layered marketing accessibility and performance.** At desktop/tablet/390/320 and 200% zoom, layered sequence preserves logical reading/focus order, no horizontal overflow and usable calls to action. `prefers-reduced-motion` has no scroll-linked movement but identical content/function. Keyboard and representative screen readers navigate all content/forms. Test JS failure and low-power/mobile fallback. Production-like Lighthouse/Web Vitals measurements meet the recorded approved budget or block release with evidence. Assets are original/approved and no Scroll Craft visual/content clone exists. **Current status: NOT RUN.**

**AT-45 — Public/private/customer artifact separation.** Plant unique markers in KXRA internal, Customer One, Customer Two, fixtures, filenames, source maps and server errors. Marketing build/deploy artifacts and customer bundles/endpoints contain none outside exact approved snapshots. OS user cannot download server-only modules/secrets. Customer One cannot receive Customer Two/internal prefetch, RSC, cache, search, analytics or error data. Build each app independently with least-privilege environment variables; deleting public snapshot removes it on the next approved build. **Current status: NOT RUN.**

**AT-46 — Legal/commercial release gate.** A release manifest references solicitor-approved exact NDA/Terms/Privacy/cookie/data-processing/custom-project documents, plan/price/usage/refund/cancellation/tax copy, retention/subprocessor list and support/contact channels. Hashes match deployed documents and required acceptances. Test withdrawal/cancellation/data-request/support paths and agreement reissue. Unapproved placeholder, mismatched price, unsupported claim or missing statutory information blocks release. Record legal/commercial owner and review dates. **Current status: BLOCKED on owner/counsel inputs.**

**AT-47 — Launch rehearsal and first-customer readiness.** From a clean production-like staging state, run: public visit → safe form or approved signup/invitation → verified identity → mandatory agreements → organization creation/selection → test subscription or owner free grant → Brand Profile → campaign variant → review/export → custom-project request → support/billing management → revoke/delete/restore scenarios. Run owner dashboard/security/incident/backup/provider outage and cost-limit drills. All AT-01–46 applicable staging tests pass, blockers are zero or explicitly release-excluded, evidence is reviewed and owner signs the exact release manifest. No test itself publishes production or contacts a real customer. **Current status: BLOCKED.**

## 13. Owner connection and decision runbook

Codex must continue all local implementation and provider-double work without waiting for credentials. Ask the owner only when an external account, legal/business choice or consequential activation is the next dependency. Never ask for a secret in chat or commit it. Use the relevant provider/Vercel secret store and record only the secret name, owner, purpose and verification date.

### 13.1 Legal and business inputs

1. Engage a qualified UK solicitor experienced in SaaS, confidentiality, consumer/business subscriptions, AI/data processing and custom software services.
2. Give counsel the exact user types, first-access gate, Brand Studio data flows, subprocessors, intended retention, approximately £30 pricing hypothesis, free partners and custom-project workflow.
3. Obtain final versioned NDA/confidentiality terms, Terms of Service, Privacy Notice, Cookie Notice, acceptable-use/AI terms, data-processing terms and custom-project proposal/SOW terms. Request explicit rules for business versus consumer users, withdrawal/cancellation, lawful disclosure and agreement reissue.
4. Provide machine-readable metadata plus immutable PDF/HTML for each approved version. Codex imports and hashes these only after approval; do not paste signatures or private legal correspondence into the public repository.
5. Approve the launch entity name/address/company number/VAT status, governing law, support channel, privacy contact and security contact that may appear publicly.

Recommended use of the two unassigned mailbox aliases is `support@kxra-group.com` and `privacy@kxra-group.com`; choose alternatives before public copy and legal documents are finalized. Keep `info@kxra-group.com` public.

### 13.2 Supabase staging

1. In Supabase, create or designate a **non-production staging** project in the intended UK/EU region and record its project reference; do not reuse a database containing real customer data.
2. In Auth settings, keep open public signup disabled until the signup policy is approved. Configure `https://app-staging.kxra-group.com` and exact callback URLs; enable email verification and MFA factors chosen by policy.
3. Create a private Storage bucket for KXRA objects; do not make it public and do not add broad service-role application access.
4. In Vercel staging, set the documented Supabase URL/anon/publishable/server/database variables from `.env.example`. Put service/database secrets only in server/worker scopes.
5. Give Codex the owner Auth user UUID/project reference through the secure local setup mechanism, not chat. Run the bootstrap script once, inspect the resulting owner row and enroll owner MFA.
6. Authorize the staging migration/RLS/Storage test window. Codex then runs AT-01/03/10/30 and records results. Do not enable production from this step.

### 13.3 Stripe test mode

1. Complete Stripe business/account security and use **test mode** first.
2. Create one test product for the initial KXRA subscription and one monthly test price; the amount near £30 remains a hypothesis until approved. Configure tax behavior and trial/grace/cancellation/refund policy with accountant/legal input.
3. Enable Stripe Customer Portal functions that match the approved policy.
4. Create a webhook endpoint at the staging URL documented by the implementation and select only the event types listed in the integration playbook.
5. Store test secret key, publishable key, price ID and webhook signing secret in Vercel/worker secrets. Never place them in `.env.example` values or Git.
6. Codex runs signed, replay, out-of-order, cancellation and portal-return tests. Approve live-mode product/key/webhook creation only at the final release gate.

### 13.4 OpenAI

1. Create a dedicated OpenAI project for KXRA staging, restrict membership, enable appropriate data controls and set a low hard/soft budget.
2. Create a project-scoped API key and store it only in the staging server/worker secret store.
3. Approve the allowed model list (`gpt-5.6-sol` default and `gpt-6-astra` escalation only), maximum per-run tokens/tool calls/cost and customer-data retention policy.
4. Codex verifies model availability, structured output, timeout/retry, usage reconciliation, prompt-injection and zero-budget behavior with synthetic/nonconfidential data before any customer content.

### 13.5 YouTube / Google Cloud

1. Sign in with the Google account that owns or manages Finance Unfolded and confirm the channel ID/Brand Account permissions in YouTube Studio. Do not send Codex a password.
2. In a dedicated Google Cloud project, enable **YouTube Data API v3**.
3. Configure the OAuth consent screen, app identity, support/privacy links and authorized test users. Request only the minimum upload/channel scopes implemented in the playbook.
4. Create a Web OAuth client with the exact staging redirect URI shown by KXRA OS. Store client ID/secret in staging secrets.
5. Connect the channel through KXRA's authenticated settings screen and verify the returned channel ID. Keep uploads private/unlisted while Google audit/API eligibility and KXRA workflow tests run.
6. Approve content strategy, cadence, voice/presenter policy, synthetic-content disclosure, sponsorship/affiliate policy, financial-content boundaries and who may approve public publication.
7. Codex uploads one synthetic/private test artifact only after explicit staging authorization. A real public video requires the exact approval gate.

### 13.6 GitHub App for repository intelligence

1. Create a dedicated GitHub App for KXRA repository intelligence, initially for the KXRA organization/account only.
2. Grant read-only metadata and contents permissions; add read-only dependency/security permissions only when the implementation names a need. Grant no administration, Actions write, secrets, deployments, pull-request write or contents write.
3. Install it only on selected repositories. Store App ID, installation ID and private key in the worker secret store.
4. Approve network egress allowlists and scanner/sandbox infrastructure. Codex runs all candidate work in disposable no-secret environments and opens no PR/merge without the adoption gate.

### 13.7 Resend, Trigger.dev, observability and Cloudflare

1. **Resend:** add and verify the selected sending subdomain with DNS; choose sender names/addresses and staging recipient allowlist. Store API key in staging and run AT-25 without real customers.
2. **Trigger.dev:** create staging environment, set worker secrets and deploy only versioned tasks whose local routine tests pass. Keep schedules disabled until approved.
3. **PostHog:** create an EU-region project if this matches the approved data policy; disable autocapture/session replay for private routes and use the allowlist contract.
4. **Sentry:** create separate marketing/OS projects; configure release/environment and server/client DSNs with PII scrubbing and no request bodies by default.
5. **Cloudflare:** add the domain without changing production DNS until the deployment plan is approved; prepare WAF/rate-limit/cache rules and ensure authenticated/private responses are never publicly cached.

### 13.8 Vercel, domains and staged release

1. Import the GitHub repository as two Vercel projects with separate root/build settings for `apps/marketing` and `apps/os`.
2. Use preview/staging environments first. Give marketing no private Supabase/service/model/provider secrets.
3. Add `app-staging` and marketing staging domains; verify callbacks, CSP, cookies and no cross-environment credential reuse.
4. Run AT-17/18/27/28/30/44/45/47 and inspect generated artifacts and telemetry.
5. Only after the release manifest is complete, decide the final app subdomain, production environment variables and DNS cutover.
6. Changing GitHub's default branch, merging to the release branch, deploying production, publishing the site, enabling live billing, sending messages or publishing YouTube content each requires review of the exact prepared action and owner approval.

### 13.9 Meta WhatsApp

Meta connection is useful but does not block the initial web-platform launch. When the local gateway passes AT-15/16:

1. create/select the Meta Business portfolio, verified business, app and WhatsApp Business Account;
2. add the approved business number and complete display-name/policy checks;
3. configure the exact HTTPS webhook callback and verify token from the implementation;
4. store App Secret, system-user token, WABA ID and phone-number ID in staging secrets;
5. approve templates, opt-in/help/stop/retention/human-takeover policy;
6. run controlled test-number ingress/delivery only after explicit staging authorization.

## 14. Owner decisions and blockers

Engineering can complete local slices 0–10 with synthetic documents, fake providers and disabled adapters. These inputs are required before staging release, but they are not reasons to stop safe local work:

1. solicitor-approved legal document set and whether different partner/business/consumer versions are required;
2. invitation-only launch, owner-approved signup, waitlist or another exact acquisition policy;
3. initial customer segment and the first demand experiment;
4. launch plan price, currency, included generations/storage/members/projects, overage/trial/grace/refund/cancellation and tax treatment;
5. free-partner grant policy, default duration/limits and who besides the owner may issue one;
6. final private app subdomain and recommended `support@`/`privacy@` mailbox choices;
7. custom-project proposal/deposit/milestone/change-control policy and KXRA rights to generalized learnings;
8. approved AI providers/data controls, run budgets and Astra escalation authority;
9. Finance Unfolded channel ownership verification, audience, editorial identity, formats/cadence, voice/presenter/asset policy and public-approval policy;
10. GitHub App installation scope, scanner/sandbox budget and whether KXRA may contribute upstream fixes;
11. customer retention/deletion/backup RPO/RTO, analytics consent and subprocessors;
12. final public copy, industry claims, brand assets and first release manifest.

Current blockers to production are implementation gaps AT-10–18 and AT-25–47, unapproved legal placeholders, no provider/staging evidence, no public/private build separation, no complete customer commercial model and the stale GitHub default branch. None authorizes shortcuts or unsupported completion claims.

## 15. Definition of complete and final reporting contract

KXRA OS is ready to wait for customer onboarding only when:

- every release-applicable acceptance test is `PASS (staging)` with reviewed evidence;
- zero Critical/High unresolved authorization, tenant-isolation, data exposure, malware/file, payment, publication or provider-side-effect defect remains;
- all customer/private paths require verified identity, active tenant membership, required legal acceptance and deterministic entitlement;
- Brand Studio's complete first-value path works with approved model/provider settings and measured budget limits;
- custom-project intake/quote/acceptance is clearly separate from subscription access;
- owner free partner grants are auditable and revocable;
- P006 and P007 exist with working hard stops, while real public posting and untrusted code execution remain controlled;
- the independent marketing site passes privacy/artifact/accessibility/performance checks;
- owner MFA, recovery, incident, backup/restore and provider outage runbooks have been rehearsed;
- legal/commercial/public copy and release manifest are approved;
- the exact production merge/deploy/DNS/billing/publication actions receive owner approval.

At each completion report, state only verified outcomes under these headings:

1. WHAT WAS BUILT;
2. FILES CHANGED;
3. ARCHITECTURE;
4. TESTS;
5. TEST RESULTS;
6. SECURITY STATUS;
7. BUGS FIXED;
8. BLOCKERS;
9. OWNER ACTIONS REQUIRED;
10. NEXT ACTIONS.

Do not call registry rows agents, disabled schedules routines, HMAC helpers WhatsApp, quarantined bytes a file system, local doubles connected providers, or a successful build production readiness.

## 16. Next 10 actions

1. Commit this audited brief and corrected progress/handover on `codex/phase-2-completion`; do not merge or change the default branch.
2. Fix Ask KXRA to require one project and return the exact insufficiency phrase; add multi-project partner negative tests.
3. Add pinned hermetic CI, lint/security/migration/RLS checks and clean per-run fixtures while preserving all current tests.
4. Write ADRs and additive migrations for account identities, many-to-many organizations, tenant roles/context and legacy membership backfill.
5. Implement the inert legal-document/NDA gate and synthetic AT-32 flow, keeping unapproved documents impossible to activate.
6. Implement plans, entitlements, usage reservations, auditable free grants, Stripe fake event reconciliation and custom-project intake/proposal states.
7. Complete secure file scan/extract/chunk/index/delivery/reconciliation and AT-10.
8. Complete permission-safe Ask, executable agent/skill/run/budget substrate and AT-11–13.
9. Build the local Brand Studio first-value loop, then add Projects 006/007 and their hard-stop tests.
10. Continue through routines, gated provider adapters, independent layered marketing site, hardening and controlled staging; stop only at an external owner/legal activation dependency and provide the exact runbook step required.

This document is the one self-contained **CODEX PHASE COMPLETION BRIEF** for the next build. It supersedes status summaries where the repository evidence has changed, while preserving all compatible Genesis, Phase and Final Completion requirements.
