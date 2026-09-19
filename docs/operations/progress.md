# KXRA OS implementation progress

Updated: 19 September 2026. Status: **Final Milestones 1–3 work locally; repository audit found one broken Ask KXRA boundary and major launch capabilities remain unbuilt. Nothing is hosted or production ready.**

Current branch: `codex/phase-2-completion`. Audited implementation baseline: `9e8733bebdb967760835b3a82087b45a7f5a6197`. Requirements-freeze baseline: `4e597ea2039f8758a254cf42637baff26e7067a2`. Reviewed Genesis implementation ancestor: `0c20de47fe1f6cb38646db51c4a90650679aacd7`.

The self-contained [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md) records the actual repository audit, current external research, approved customer-platform direction, Projects 006/007, architecture, owner connection steps and AT-01 through AT-47. It supplements rather than silently deletes the private Genesis brief, the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md) and the [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md). Executable status is tracked in [acceptance evidence](acceptance-evidence.md).

## Verified implementation

- Next.js 15 / React 19 / TypeScript application with PostgreSQL migrations, domain/auth/database/integration packages and structured documentation.
- All 44 current private tables use RLS; private requests use a verified principal, transaction-local nonprivileged role and server-derived claims. The local application role is `NOINHERIT` and `NOBYPASSRLS`.
- Owner-only control plane, invitations, account lifecycle, nine-step onboarding, local AAL2 checks, Portfolio, Ideas, six approval executors, exact finance and real Work Log projections.
- Current partner isolation at SQL/HTTP/browser layers, including revoked/suspended access, crafted IDs, cross-project files/search and viewer write denial.
- Exactly Projects 001–005 with 18 common modules, approved specialist modules and local hard stops. Project 004 remains research/paper only; Project 005 remains demand gated.
- Typed idea → experiment → task → result/evidence → decision → approval → supersession loop.
- RLS-scoped evidence search, private-by-default quarantine metadata, HMAC/challenge foundations, and agent/skill/disabled-routine definitions.

Definitions, disabled controls and local provider doubles are not counted as connected capabilities.

## Audit verdict

### Partial

- Hosted Supabase Auth/MFA/session, files/knowledge, approvals, email, AI definitions, skills/routines, legal acceptance infrastructure and public preview all have foundations but not complete provider-backed workflows.

### Broken

- Ask KXRA allows a partner to select `All projects I can access` or omit `project_id`; a multi-project partner can combine assigned projects in one retrieval. RLS prevents unassigned-project leakage, but the frozen one-project context requirement is broken.
- Ask returns `Insufficient KXRA evidence.` rather than exactly `INSUFFICIENT KXRA EVIDENCE.`
- GitHub's default branch is still `codex/genesis-foundation` at `e9e317a`; only `origin/codex/phase-2-completion` contains the audited implementation.
- Local HTTP/browser tests retain labelled synthetic records, so restart counts drift and the suite is not a disposable CI run.

### Missing

- Secure scan/extract/chunk/index/delivery, AI run/tool/budget substrate, executable skills/routines, complete approvals, WhatsApp gateway, connected providers, independent marketing application, hermetic CI and backup/object restore.
- Many-to-many customer organizations, first-private-access NDA gate, plans/subscriptions/entitlements/usage, owner free grants and custom-project commercial workflow.
- KXRA Brand Studio, Projects 006/007 and the original layered industry marketing experience.

## Approved direction added on 19 September

KXRA OS now has two explicit surfaces: the internal venture operating system and a secure multi-tenant customer platform. Brand Studio is the first subscription tool. Pricing near £30/month remains a hypothesis. Custom projects are scoped and billed separately. The owner can grant free partner entitlements with auditable scope and revocation.

Add:

- `PROJECT-006` Finance Unfolded YouTube Content Engine, with source/claim/rights/compliance/QA/approval gates and private/unlisted upload before public publication;
- `PROJECT-007` GitHub Repository Intelligence & Secure Reuse, with pinned provenance, licence, quarantine, static scanning, no-secret/no-network sandbox and reviewed adoption branch; no automatic merge;
- mandatory first-private-access agreement infrastructure, activated only with solicitor-approved exact legal text;
- original KXRA Brand Studio and independent layered marketing site with reduced-motion/mobile treatment.

## Verification rerun

| Check                                  | Result                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `npm run check`                        | PASS — typecheck, 71/71 tests, optimized build and artifact scan        |
| `npm run test:e2e`                     | PASS — 25 executed scenarios, 3 intentional device-specific skips       |
| `npm run test:restart`                 | PASS — current accumulated store retained 33 tasks and 52 supersessions |
| `npm run format:check`                 | PASS                                                                    |
| `npm audit --omit=dev` and `npm audit` | PASS — zero reported vulnerabilities                                    |
| tracked secret scan                    | PASS                                                                    |
| tracked JSON/Markdown integrity        | PASS — 16 JSON parsed; 27 Markdown files had resolvable local links     |
| `git diff --check`                     | PASS before the documentation update; rerun before commit               |

These are local results. They do not prove hosted Supabase, Storage, MFA, Resend, Stripe, OpenAI, YouTube, Meta, Trigger.dev, PostHog, Sentry, Cloudflare, Vercel, backup recovery or production behavior.

## Security status

The existing PostgreSQL/RLS boundary is strong for the current single-organization model. It is not yet sufficient for customer SaaS because one account cannot safely hold memberships in multiple organizations and the public/private apps share one deployable application. Before model activation, fix Ask's one-project boundary and add durable run/budget/tool logs. Keep quarantined bytes locked until scanning and delivery reauthorization pass. Keep legal placeholders, WhatsApp, routines and every provider disabled.

## Project status

- Projects 001–005: implemented as local records/workspaces with hard stops; scores remain truthfully null/Not Assessed.
- Project 006: specified in the new brief; no seed, workspace or workflow exists yet.
- Project 007: specified in the new brief; no seed, workspace or workflow exists yet.

## Active blockers and owner inputs

- Qualified UK legal approval for NDA, Terms, Privacy, cookies, AI/data processing and custom-project terms.
- Initial customer segment, launch plan/limits/price policy, free-partner policy and custom-project commercial policy.
- Final app subdomain, support/privacy mailboxes, public copy/brand assets and data retention/recovery targets.
- Staging/provider account connections and budgets at the documented later gates.
- Finance Unfolded OAuth/channel proof and editorial/publication policy.

These do not block safe local engineering with synthetic fixtures and fake providers.

## Next safe action

Execute Slice 0 from Phase Completion Brief 02: fix Ask's exact project/phrase contract, add negative tests, establish pinned disposable CI/lint/security checks and make repeated fixture runs deterministic. Then implement additive multi-tenant identity, legal gate and commercial foundations before resuming Final Milestone 4.

## Publication boundary

Only application code, engineering documentation and minimum classified seed records required by the platform may enter the public repository. Original Word/text sources, private Genesis research, archives, `.runtime`, credentials, screenshots, traces, database/object backups and generated test artifacts remain excluded.
