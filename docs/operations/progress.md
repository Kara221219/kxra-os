# KXRA OS implementation progress

Updated: 19 September 2026. Status: **Phase 2 Slice 0 is complete and fully verified in a disposable local environment. Major customer, provider and release capabilities remain unbuilt. Nothing is hosted or production ready.**

Current branch: `codex/phase-2-completion`. Slice 0 started from `0109f8f9cb7cbe0947189bd538c0b2b8ba7c3ab7`, which descends from the reviewed Genesis implementation. This branch is not merged and no default-branch change, production deployment or external activation was performed.

The cumulative implementation contract remains [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md), the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md), the [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) and the private Genesis source. The later brief supplements earlier requirements. Executable status is recorded in [acceptance evidence](acceptance-evidence.md).

## Completed in this slice

- Ask KXRA now requires one UUID project on every request. Missing, null, array, multiple and inaccessible scopes fail before retrieval; revocation is rechecked by the server/database boundary.
- Empty evidence responses use the frozen exact text `INSUFFICIENT KXRA EVIDENCE.` in domain, API and rendered browser behavior.
- Disposable CI now allocates random loopback application/PostgreSQL ports, creates a fresh Unix-socket-only PostgreSQL cluster, migrates and seeds it, runs the full SQL/HTTP/browser suite, verifies restart persistence, builds the production application, scans the artifact and publication candidates, then stops the database.
- GitHub Actions uses pinned checkout and Node setup action commits and runs the disposable suite plus production/all-dependency audits.
- Migrations `0029` and `0030` correct clean seed ordering, provision project governance/workspace/gate/vehicle reference state after project insertion, and make deny-all policies explicit for internal ingress/rate-limit tables. Applied migrations `0001`–`0028` were not rewritten.
- Customer discovery and solicitor-preparation packs were produced in the private ignored business pack. They are not legal terms and are excluded from the public repository.

## Verified implementation

- Next.js 15 / React 19 / TypeScript application with PostgreSQL as the authorization and state authority.
- All 44 KXRA tables have RLS and at least one explicit policy. The application login is `NOINHERIT`, `NOBYPASSRLS` and non-superuser.
- Owner control plane, invitations, account lifecycle, nine-step onboarding, local AAL2 checks, Portfolio, Ideas, six approval executors, exact finance and real Work Log projections.
- SQL/HTTP/browser isolation for owner, contributor, viewer, revoked, suspended, anonymous and separate-organisation principals, including crafted IDs, direct API calls, files, search, Ask and nested workspace resources.
- Exactly Projects 001–005 with 18 common modules, their approved specialist modules and hard stops. Project 004 remains paper/research only; Project 005 remains demand gated.
- Typed idea → experiment → task → result/evidence → decision → approval → supersession loop.
- RLS-scoped evidence search, private-by-default quarantine metadata, HMAC/challenge foundations, and agent/skill/disabled-routine definitions.

Definitions, disabled controls and local provider doubles are not counted as connected capabilities.

## Verification evidence

| Check                    | Result                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:ci`        | **PASS** — 73/73 database/domain/HTTP tests; 27 applicable browser tests passed and 3 device-specific scenarios skipped as designed |
| migration/RLS audit      | **PASS** — 30 contiguous migrations; 44 protected tables; explicit policies; non-bypass application roles                           |
| restart persistence      | **PASS** — disposable-state task and accepted supersession counts survived a controlled database restart                            |
| production build         | **PASS** — optimized Next.js build completed                                                                                        |
| production artifact scan | **PASS** — all 16 fixture identity/state/secret markers absent                                                                      |
| publication/secret scan  | **PASS** — tracked and untracked nonignored publication candidates checked against private paths and six credential patterns        |
| dependency audits        | **PASS** — `npm audit --omit=dev` and `npm audit` reported zero vulnerabilities                                                     |
| documentation integrity  | **PASS** — 28 Markdown files resolved local links and all public Genesis register JSON parsed                                       |
| document integrity       | **PASS** — both private DOCX files and the discovery XLSX passed ZIP/package integrity checks and visual QA                         |
| `git diff --check`       | **PASS**                                                                                                                            |

These results do not prove hosted Supabase, Storage, MFA, Resend, Stripe, OpenAI, YouTube, Meta, Trigger.dev, telemetry, Vercel, backup recovery or production behavior.

## Remaining work

### Partial

- Hosted Supabase Auth/MFA/session, files/knowledge, approvals, email, legal acceptance infrastructure and the public preview have local foundations but no provider-backed acceptance.
- Ask KXRA now has the correct one-project authorization boundary, but secure document extraction/chunking, model synthesis, citation validation, budget/tool controls and durable AI run evidence are absent.
- AI agents, skills and routines remain definitions; routines are disabled and no general autonomous executor exists.

### Missing

- Many-to-many customer organizations, explicit tenant selection, first-private-access NDA gate, plans/subscriptions/entitlements/usage, owner free grants and the separately priced custom-project workflow.
- Clean file scanning, extraction/indexing, authorized byte delivery, AI run/tool/budget substrate, complete provider approvals, WhatsApp gateway and backup/object restore.
- KXRA Brand Studio, Projects 006/007, independent public/private/customer builds and the layered industry marketing site.
- Connected staging providers, telemetry, production release evidence and first-customer rehearsal.

## Project status

- Projects 001–005: implemented as deterministic local records/workspaces with hard stops; scores remain truthfully null/Not Assessed.
- Project 006, Finance Unfolded YouTube Content Engine: specified only; no seed, workflow, OAuth or publication path exists.
- Project 007, GitHub Repository Intelligence & Secure Reuse: specified only; no seed, scanner/sandbox or adoption path exists.

## Active owner and external inputs

- Qualified UK solicitor approval for NDA/confidentiality, Terms, Privacy, cookies, AI/data processing and custom-project terms.
- Initial customer segment, discovery interviews, launch plan/limits/price policy, free-partner policy and custom-project commercial policy.
- Final private app subdomain, support/privacy mailboxes, public copy/brand assets and retention/recovery targets.
- Finance Unfolded channel ownership proof and editorial/publication policy.
- Staging/provider accounts and budgets at the later gates documented in the completion brief.

These inputs do not block continued local implementation with synthetic fixtures and disabled provider adapters.

## Next safe action

Implement Slice 1 from Phase Completion Brief 02: normalized many-to-many account/organization membership, explicit tenant selection, an inactive-until-approved first-private-access agreement gate, deterministic plans/entitlements/usage/free grants and custom-project commercial records. Preserve every current regression and add AT-31–34 plus the legal-placeholder release block before any provider activation.

## Publication boundary

Only application code, engineering documentation and minimum classified seed records required by the platform may enter the public repository. Original Word/text sources, private Genesis research, the private business pack, archives, `.runtime`, credentials, screenshots, traces, databases/object backups and generated test artifacts remain excluded.
