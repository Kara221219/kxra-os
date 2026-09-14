# CODEX PHASE COMPLETION BRIEF

01 — KXRA Build Review · 13 September 2026

> Historical review baseline. The defect-first AT-01 through AT-09 implementation is recorded at commit `0c20de47fe1f6cb38646db51c4a90650679aacd7`; see [phase acceptance evidence](acceptance-evidence.md) for current results. Statements below describe the reviewed baseline commit `e4dfcb0288ccae67ba44d5b04bbb390e480a70e5` unless explicitly framed as an acceptance requirement.

**Verdict: a working local, database-backed foundation exists. Genesis is not complete. Even the first implementation milestone is incomplete because the linked idea → experiment → decision workflow is absent. Passing existing tests does not close the approval and data defects reproduced in this review.**

This is an implementation audit and completion contract, not a record of promised work. No application fixes, production deployment, real credentials, external messages or trading were performed.

**Repository and evidence boundary**

- Connected repository: [Kara221219/kxra-os](https://github.com/Kara221219/kxra-os).
- Live GitHub HEAD and branch `codex/genesis-foundation` both resolved to `e4dfcb0288ccae67ba44d5b04bbb390e480a70e5`. The initially clean local checkout matched that commit. GitHub verification used `git ls-remote origin`; this is not a review of an unrelated local prototype.
- Baseline: the saved `KXRA-GENESIS/CODEX-GENESIS-BUILD-BRIEF.md`, version 1, 11 September 2026; SHA256 `6432d2b7bb9e0942c8f8de20975beefbcca5a681125b8a748b49086bc2d34a0e`. The full brief is private and absent from the public repository. This is the available Genesis baseline; no later approved revision was supplied. Its proposed thresholds remain proposals, not spending or release authority.
- Evidence: current source, all three SQL migrations, seed importer/registers, domain/API/database/browser tests, an inspected mobile test screenshot, and additional transaction-rollback database probes using the application login and authenticated RLS role. Previous progress claims were not used as proof.
- Newly rerun: typecheck PASS; production build PASS; formatting PASS; 23/23 domain/database/HTTP tests PASS; 4/4 browser cases PASS (two workflows, desktop and mobile). Five diagnostic probes also completed and reproduced the defects below. Existing HTTP/browser tests persist clearly named synthetic records/files; additional diagnostic data changes were rolled back.
- Hosted Supabase/Auth/MFA/Storage, provider accounts, CI execution, real models, messaging, load, full accessibility and restore were not verified. Dependency vulnerability auditing was not rerun. A build pass is not deployment readiness.

**IMPLEMENTED**

| Area | Actual working implementation |
|---|---|
| Database and identity | PostgreSQL storage; every application database query uses a transaction with `SET LOCAL ROLE authenticated/anon` and transaction-local principal claims. Server code derives identity from a signed fixture session or Supabase verification; record creation rejects extra caller identity fields. |
| Owner permissions | Local owner reads all five projects and owner-only records. Owner-only screens/APIs gate finance, partners, approvals, agents, skills, routines and runs. Bootstrap SQL checks a confirmed Supabase user and records an audit event; it was not executed hosted. |
| Partner isolation | Active organisation membership plus active/unexpired project assignment and explicit record sharing. P002 contributor, P003 viewer, revoked assignment and anonymous denial have real SQL/API tests. Reparenting and forged authorship fail; accepted records cannot be edited. Files and history inherit record permission. |
| Records | Create, read and versioned draft edits; classification labels; immutable scope/visibility; automatic record snapshots and audit events; optimistic concurrency on HTTP edits. |
| Approvals | Owner/AAL2 checks, expiry, row locking, one-use execution and stale **record-version** rejection. Only record acceptance and membership changes have executors. |
| Ask KXRA retrieval | PostgreSQL full-text search under the caller’s RLS scope; accessible record IDs, versions, classifications and excerpts returned as citations. Missing evidence is stated. |
| Local files | Bounded upload, server-generated storage key, checksum, filesystem quarantine, scoped metadata and denied byte delivery. This is a quarantine foundation, not usable document ingestion. |
| Finance/scoring helpers | Exact four-decimal arithmetic; currencies and paper/actual types separated; missing venture scores remain null with bounds. Scoring helper has tests but is not connected to saved assessments. |
| Navigation/public preview | All 20 required owner and nine partner navigation labels exist. Responsive owner/partner workspace, sign-in/out and a truthful static public homepage exist. The homepage reads no private database records. |

Primary code evidence: [RLS transaction boundary](../../packages/db/index.ts), [server identity](../../apps/os/lib/auth.ts), [schema and policies](../../supabase/migrations/0001_core.sql), [hardening migration](../../supabase/migrations/0002_hardening.sql), [navigation](../../apps/os/components/Shell.tsx).

**PARTIAL**

| Priority area | What is absent from the working foundation |
|---|---|
| Owner access | Supabase verification adapter exists, but no MFA enrollment/challenge/recovery or recent-step-up flow. Password sign-in alone cannot complete AAL2-protected actions through this UI. Fixtures manufacture AAL2 and therefore do not prove real MFA. |
| Partners | Existing assignment revocation/restoration works locally. No invitation lifecycle, verified partner onboarding, new-assignment UI or editable own profile. |
| Database RLS | Real core protection, not just hidden menus. Hosted role grants/pooler behavior and complete per-table operation matrices remain untested. Storage, chunks and jobs do not yet exist to test. |
| Ask KXRA | Evidence lookup only: `mode: evidence-only`, `model: null`. No Sol/Astra call, scoped model tool broker, conversation memory, final delivery recheck or durable Ask run record. Search indexes title/body only, not structured evidence fields or attachments. |
| AI team, skills, routines | Database inventory contains 13 agent definitions, 12 skill definitions and nine routine definitions. They are JSON-backed registry records, not executing capabilities. No dispatch, manifest validation/evals, scheduler, budget reservations or checkpoints. |
| AI run logging | `kind=run` and an owner-only list exist. There is no automatic run lifecycle or append-only run-step trace. A generic owner-created run record would not prove an agent ran. |
| Work Log | Genuine record-write/approval audit events exist. No complete operational trace of reads, denied access, Ask requests, job outcomes or handoffs; imported work-log records are not the audit feed rendered by the Work Log screen. |
| Approvals | Membership staleness is defective; broader exact configuration, spend, publication, deployment and uncertain-execution lifecycles are absent. Disabled actions are not secretly executed. |
| Project operations | Generic records/forms exist for ideas, experiments, decisions, risks and tasks. No enforced linked lifecycle, task assignment/completion, gate transition, score snapshot or committee review workflow. |
| Public/private separation | Public runtime homepage contains no private portfolio. But public and private UI share one Next.js application, rather than the specified independent public build and approved-content boundary. |

Evidence: [evidence-only adapter](../../packages/ai/index.ts), [Ask return path](../../apps/os/app/api/[...path]/route.ts), [generic register screens](../../apps/os/app/os/[[...segments]]/page.tsx), [jobs directory](../../jobs/README.md).

**Five project records — verified database state**

| Code | Project | Actual state and remaining requirement |
|---|---|---|
| PROJECT-001 | CLPR / Blockchain Interoperability | DISCOVERY / MONITOR. Record and next action exist; route, liquidity, recovery and differentiation validation are not implemented workflows. |
| PROJECT-002 | US Vehicle Seat Covers | VALIDATION. Record and fitment/safety/landed-cost next action exist; no SKU dossier, evidence-linked fitment matrix, listing gate or complete landed-contribution model. |
| PROJECT-003 | AI Property Fly-Through | VALIDATION. Record and rights-cleared property-pack next action exist; no asset pipeline, fidelity/rights checks, render workflow or deliverable QA. |
| PROJECT-004 | AI Trading Research & Monitoring Laboratory | FEASIBILITY / PAPER ONLY. Database CHECK forces live execution false; no broker/live-trading adapter exists. Paper protocol, readiness, simulation and monitoring workflows remain missing. |
| PROJECT-005 | KXRA Digital Products & Content Engine | VALIDATION. Creation flag false; no creation/publishing executor. No evidence-based demand-gate transition exists. Disabled functionality is not proof that a working production pipeline enforces the gate. |

All five have null venture/confidence scores and both execution flags false in the inspected database. “Project brief” records contain only each project’s next action, not the full Genesis project specification. Genesis source/assumption/risk/experiment definitions are partly retained in generic JSON records; no validated evidence graph connects them. No real demand, financial returns or commercial completion were demonstrated.

**MISSING**

The significant omissions are: linked evidence/claims and source-version relationships; complete version/provenance history; task and experiment lifecycle; project creation and controlled stage gates; authoritative financial reporting/scenarios and score persistence; secure document scanning/extraction/private download; invitations and real MFA UI; operational AI runs, skill execution, routines, job capabilities, budgets and recovery; and the full WhatsApp gateway.

WhatsApp currently has two cryptographic helpers, pairing/inbound table definitions and a disabled API response. There is no wired signed ingress, verified identity-pairing challenge redemption, project selection, queue, conversation/media/transcription handling, deduplication executor, outbound authorization check, delivery reconciliation or human takeover. The HMAC unit test proves the helper, not WhatsApp permissions. [Actual integration code](../../packages/integrations/whatsapp.ts).

Trigger.dev, Resend, PostHog, Sentry and Cloudflare have no connected execution/configuration evidence in this repository. Supabase Storage is not implemented. The public `/approach`, `/explorations`, `/partner`, `/contact`, `/privacy` and `/terms` pages are absent; the homepage uses anchors/mailto. Mailbox ownership/delivery and public release approval are unverified. No database-plus-object restore drill exists.

**BROKEN**

**B1 — finance totals silently truncate.** `listRecords` returns at most 200 rows and Finance totals that same list. A rollback probe with 201 GBP 1 actual-income records yielded 201 authoritative entries but only 200 through the display query pattern: expected GBP 201.0000, displayed pattern GBP 200.0000. Dashboard evidence/risk counts also come from that capped list; “Open risks” does not filter lifecycle state. [Query cap](../../apps/os/lib/data.ts), [finance calculation](../../apps/os/app/os/[[...segments]]/page.tsx).

**B2 — canonical accepted decisions become drafts.** DEC-001 through DEC-005 have `data.state=accepted` but database `status=draft`. Import omits status and uses the draft default, leaving already accepted owner constraints editable. This was confirmed against PostgreSQL. [Importer](../../scripts/database.mjs).

**B3 — finance SQL validation accepts JSON null.** An authenticated owner inserted `{amount:"10", currency:"GBP", entry_type:"actual", direction:null}`. SQL CHECK evaluates to unknown and accepts it; `sumFinance` treats any non-expense direction as income. The HTTP validator rejects this input, so this is a database integrity gap, not a demonstrated partner finance-write bypass. [Constraint](../../supabase/migrations/0003_finance_validation.sql), [arithmetic](../../packages/domain/index.ts).

**SECURITY RISK**

**S1 — stale membership approval can undo revocation. High priority; reproduced.** Approve grant G; later approve and execute revocation R; execute older G before expiry. The partner regains P002 access. The executor checks approval state/expiry but not the target membership/access version. Execution still requires the MFA owner; this is stale-authority reuse, not partner self-promotion. It also clears membership expiry on every change without expiry in the approved payload. [Executor](../../supabase/migrations/0001_core.sql).

**S2 — owner uploads automatically expose metadata to the project.** Upload always creates a `project_shared` note titled with the filename. There is no owner-private upload choice. Assigned partners can discover that filename through records/search while bytes remain quarantined. This is unintended-sharing risk; no cross-project byte disclosure was observed. [Upload record creation](../../apps/os/app/api/[...path]/route.ts).

**S3 — database evidence classification can bypass verification. Reproduced.** A P002 contributor changed their draft note from HYPOTHESIS to FACT using authenticated SQL. The guard increments version but requires no verification record; snapshots omit classification, so the earlier classification is not retained there. HTTP PATCH excludes classification, but the database contract is weaker than the API. [Record grants/policy](../../supabase/migrations/0001_core.sql), [current guard](../../supabase/migrations/0002_hardening.sql).

**S4 — activation controls remain incomplete.** No application rate limiting, CSP, recent MFA step-up or verified revocation-during-delivery test. Approval hash is SHA256 of ordinary JSON payload only: action/project/environment are outside that hash, and SQL verifies format/equality rather than recomputing canonical contents. Current approval rows are immutable to authenticated callers, limiting present exploitability; the contract must be strengthened before adding consequential executors.

**S5 — public source boundary requires deliberate maintenance.** The public Git commit includes project names, next actions, risks, assumptions, decisions and source-register summaries. `public_visibility:false` in JSON and runtime RLS cannot conceal committed files. Repository documentation records prior authorization to publish these seed registers; this audit does not label that authorization a breach. Original documents/full brief/archive/runtime are excluded. Future private operational data must never enter those public seed files or build artifacts.

**UX ISSUE**

The screen names overstate operational depth: Skills/Routines/Run History are generic registries; Profile is read-only; Partners only offers existing assignment toggles. Disabled services are generally labelled honestly. Approvals show raw action names/UUID JSON rather than a comprehensible target, before/after state and expiry; history shows version numbers without a view/diff of old contents. Upload has no network-error catch or in-flight submit lock, and links lead to disabled-download JSON. A project-filtered Files page does not preselect that project for upload. Register pagination, reliable total counts and complete save/error/loading states are absent. The inspected mobile dashboard reflows, but this does not establish keyboard/screen-reader/WCAG compliance across workflows.

**DATA ISSUE**

Beyond B1–B3/S3, generic unvalidated JSON permits contradictory business states, missing required experiment/skill/routine fields and unverified evidence IDs. Record snapshots omit classification, lifecycle status and editor identity. The importer assigns project UUIDs by array position, maps unknown scopes to group scope, and is neither a reviewed idempotent import nor atomic with schema initialization: a mid-seed failure can leave a partial database that startup will subsequently skip seeding. Application project rows omit substantial source provenance and gate details. These gaps prevent durable, trustworthy institutional memory even though the basic records persist.

**TESTING ISSUE**

Existing tests are useful and passing, but narrow. Browser coverage is two workflows repeated at two sizes. No CI workflow is committed; HTTP/browser tests depend on an already running fixed-port preview and add retained fixtures. There is no pgTAP suite or complete table/operation matrix, second-organisation coverage, real hosted MFA, SQL JSON-null matrix, stale membership-order test, >200-record aggregation test, provider callback integration, model/tool injection evaluation, mid-run revocation, queue recovery, load or restore evidence. No production-readiness conclusion follows from the 27 passing cases.

**Highest-value remaining work and exact acceptance tests**

Deliver the following in order. Keep PostgreSQL authoritative; preserve existing RLS, accepted history and original Genesis files. Add migrations rather than rewriting applied migrations. Use synthetic fixtures and fake providers locally; no production, real credentials, external sends, paid calls or trading are authorized by this brief. A missing external activation check must remain marked BLOCKED/UNVERIFIED, not PASS.

**1. Close permission and approval defects before expanding capabilities.**

- **AT-01 — full access matrix:** fixture O owns the group; A contributes only to P002; B views only P003; C has revoked P002 access; X belongs to a separate organisation; N is anonymous. Populate every table with shared/private/group/other-org records. Exercise SELECT/INSERT/UPDATE/DELETE and each exposed RPC plus corresponding HTTP routes. N gets 401 at private APIs and zero private SQL rows; A cannot discover P001/P003/P004/P005 or owner-only data; B cannot write; C has no project content; X cannot cross organisations. Forged identity, scope, role, visibility and author changes fail without private error metadata. Include files, versions, search, citations, counts and all new tables.
- **AT-02 — current approval authority:** reproduce G-approved → R-approved/executed → G-execute. G must fail as stale and A must remain unable to read P002. Preserve/hash intended membership expiry. Changed target version, action, project, recipient, cost, environment or contents must invalidate approval; equivalent JSON key order must hash identically. Two concurrent executions produce exactly one transition/audit outcome. Expired, rejected and consumed approvals fail at SQL and HTTP layers.
- **AT-03 — real identity contract without activating real accounts:** add invite/MFA/step-up UI and test adapters. Expired/reused/mismatched invite fails; invited account receives only the approved assignment after verified identity. AAL1 and stale step-up cannot approve; recent valid AAL2 can. Fixture sign-in must be unavailable with production, Vercel, non-loopback origin, hosted auth/database configuration or absent/invalid generated secret. Hosted-provider validation remains a separately authorized gate.
- **AT-04 — private uploads:** owner-private upload is the default; A cannot find its filename, record, hash, search result or file route. Explicit shared upload becomes visible only to currently assigned users. Partner cannot upload to an unassigned project, promote scans or choose storage authority. Changing the selected project must be clear before submission.

**2. Repair authoritative data and complete the first Genesis workflow.**

- **AT-05 — safe seed/provenance:** a fresh import yields exactly PROJECT-001…005, original null scores, no real partner grants and the expected 13 agents/12 skills/9 disabled routines. Approved owner directives retain accepted state/authority and reject overwrite. Repeat and reorder input: IDs/counts do not change. Unknown scope/missing evidence reference fails visibly; simulated mid-import failure leaves no partial committed seed. Preserve source codes, source versions and hashes; do not fabricate an author.
- **AT-06 — classification and history:** direct authenticated SQL and HTTP cannot promote a hypothesis to FACT without the allowed verified transition, reviewer/method and evidence. Old and new snapshots retain classification, status, editor, time and content. Accepted decisions can only be corrected through a linked superseding record, not overwritten.
- **AT-07 — full financial totals:** insert 201 GBP 1 actual-income records; total must be GBP 201.0000 regardless of page size. Add GBP 2 actual expense: GBP 199.0000. USD 5 remains separate; paper GBP 999 and estimates/commitments do not alter actual totals. Reject missing, JSON-null, wrong-type or invalid amount/currency/type/direction at SQL and HTTP. No entries stays Unknown; 0.1 + 0.2 equals 0.3000. Dashboard counts cover all authorized rows and only defined open risk states.
- **AT-08 — one complete operating loop:** A submits a P002 idea; owner links an experiment with hypothesis, evidence, cost cap and success/stop criteria; a permitted assignee records a result; owner records and approves a decision linked to the exact experiment/evidence versions. Task assignment/completion and decision supersession persist after restart. B/C/X cannot access or alter the P002 workflow. This acceptance closes the currently missing first-milestone demonstration.
- **AT-09 — project gates:** P004 live execution remains impossible through SQL/API/UI/job configuration, with no broker adapter or enablement escape. P005 creation/publication requests fail with missing, stale or unreviewed demand evidence; a synthetic owner-approved evidence packet can permit only a local prototype action. Keep proposed demand thresholds configurable and visibly proposed until approved. P002 listing claims require exact SKU fitment/safety evidence; P003 faithful-delivery approval requires rights and geometry QA. Unknown gate state blocks the relevant action.

**3. Make files and retrieval useful without weakening isolation.**

- **AT-10 — document lifecycle:** clean synthetic document travels quarantine → trusted scan → isolated extraction → versioned chunks. Malware, MIME/magic mismatch, oversized/decompression-bomb fixture, macro content and extraction failure never enter retrieval. Every chunk/derived record inherits its source permission. Revoking A after issuance but before download blocks delivery. Recover missing/orphan objects and verify source hashes after restart; never expose raw permanent storage URLs.
- **AT-11 — evidence envelope:** P002 Ask returns only current authorized record/chunk versions. Queries baiting private finance, other projects or group material return no hidden names/counts/excerpts. Invalid/nonexistent/stale citations are rejected. Revoke membership between retrieval and response: no protected answer is delivered. Persist an attributable, redacted request/outcome, including evidence-only attempts and failures.

**4. Build observable execution before claiming AI, skills or routines work.**

- **AT-12 — run/skill lifecycle:** implement typed versioned agent/skill manifests, narrow tools and append-only run steps. A fake provider request creates one initiating-user/scope/model/skill/policy-version run with input/output references, timings, usage, outcome and handoff. Replay creates a linked new attempt. Direct generic record writes cannot forge completed system runs. Partner-originated jobs cannot inherit owner access; malicious source instructions cannot expand tools or scope.
- **AT-13 — budgets and model boundary:** concurrent jobs cannot exceed a locked reservation cap; zero approved budget causes zero paid dispatches. Fake provider exercises success, invalid output, timeout and failure. Sol is the partner route; Astra requires explicit scoped escalation authority and budget. Unknown/unavailable model reports a configuration blocker rather than silently substituting. Usage/cost is reconciled deterministically; no model financial arithmetic is accepted as authoritative.
- **AT-14 — routines and recovery:** all nine imported routines remain disabled until exact approved configuration. In a fake-clock local scheduler, duplicate event/time slot produces one logical run. Test Europe/London daylight-saving boundaries and exchange-calendar schedules. Kill a worker after checkpoint and before completion; recovery resumes without duplicate writes. Revoke access before retry: cancel protected work/delivery. Unchanged state produces no notification; actionable failure produces one recorded notification intent. This is local execution evidence, not proof of a connected Trigger.dev deployment.

**5. Implement WhatsApp with fake transport; retain its activation block.**

- **AT-15 — paired identity and ingress:** valid raw-byte signature is required before durable processing; invalid/altered payload writes nothing. One-use expiring challenge binds authenticated account, intended phone digest and WABA/number; wrong account/phone, expiry, replay and excess attempts fail. Phone number or webhook user ID alone grants no authority. Pair/revoke/unpair and project selection affect retrieval immediately.
- **AT-16 — scoped delivery and idempotency:** deliver one webhook three times: one logical inbound message, one note/task proposal and one outbound intent. P002-only sender cannot obtain P003/private/group context. Revocation or human takeover between enqueue and send cancels the reply. Ambiguous send result enters reconciliation rather than blind resend. WhatsApp cannot approve grants, spending or publication. Policy eligibility, real provider identity and actual delivery remain unverified until separately authorized; no external message is required for this phase’s fixture tests.

**6. Finish the public boundary, usable screens and reproducible evidence.**

- **AT-17 — public build:** separate the approved public content/build from private OS data. Place unique private markers in records, seed fixtures and filenames; build output, HTML, scripts, maps, metadata and public endpoints contain none. Public content comes only from an explicit reviewed snapshot; `public_visibility:false` is not treated as protection for public Git files. Provide the specified public routes or explicit scoped deferrals; verify truthful copy and no private project disclosures. Keep publication disabled.
- **AT-18 — usability and recovery gate:** operate every mandatory owner/partner destination by keyboard at desktop 1440px, tablet 768px and mobile 390px, plus 320px reflow/200% zoom. Exercise empty, denied, loading, success, failed-save and network-loss states. Approval UI names the target and displays before/after/expiry; history opens real previous versions; upload failures recover without duplicates. CI starts a disposable database and preview, runs migrations plus domain/SQL/API/browser regression suites and retains reports. Restore database and object fixtures into an empty local target: counts, hashes, ACLs, source versions and pending-job state must match the manifest.

**Completion decision**

First complete items 1–2: repair the demonstrated defects and prove one useful end-to-end operating loop. Then deliver items 3–6 as separately evidenced slices. Do not mark AI complete from registry rows, WhatsApp complete from HMAC helpers, routines complete from cron text, or project gates complete from disabled buttons.

For each acceptance test record PASS/FAIL/BLOCKED, reviewed commit, exact command/scenario, date and evidence artifact. Update progress and handover with actual results. Local phase completion requires all agreed local acceptance tests to pass; any narrower scope must list its explicit deferrals. Full Genesis readiness remains withheld while hosted identity/storage/provider checks and required release gates are unverified. Production, messaging, spending and publication require their own explicit authority.
