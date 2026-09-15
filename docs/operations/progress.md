# KXRA OS implementation progress

Updated: 16 September 2026. Status: **Final Milestone 3 complete in the deterministic local environment; not hosted or production ready**.

Current branch: `codex/phase-2-completion`. Requirements-freeze baseline: `4e597ea2039f8758a254cf42637baff26e7067a2`. Reviewed Genesis implementation ancestor: `0c20de47fe1f6cb38646db51c4a90650679aacd7`. Final Milestone 2 baseline: `6a2e76a8fc9081707145d8ea10f9e190694918ef`.

The [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) supplements the Genesis and [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md). Requirements omitted from the latest brief were not deleted. Current executable status is recorded in [acceptance evidence](acceptance-evidence.md).

## What was built

Additive migrations `0026`–`0028` establish the project workspace model:

- one database module registry with the exact 18 common tabs on every project;
- 8 specialist modules for Project 001, 12 each for Projects 002 and 003, 13 for Project 004 and 16 for Project 005;
- typed workspace entries, immutable versions and exact record-version evidence links;
- strict payload shapes for narrative, research, evidence, milestone, metric, catalogue, marketplace, paper research, report and asset records;
- owner review and project-scoped contributor creation with RLS and audit evidence;
- Project 002 vehicle compatibility rows for Ford F-150, Ram / Dodge Ram and Toyota Tacoma, initially `UNKNOWN` until exact fitment and safety evidence is accepted;
- Project 003 property assets with separate real/generated/inferred origin, rights and geometry QA state;
- Project 001 revisit recommendations and gate packets requiring five distinct current route, liquidity, recovery, buyer and regulatory evidence records;
- Project 005 buyer-problem opportunities limited to discovery, evidence review and exact local prototype authority;
- explicit P001 revisit and P004 paper-readiness policies so every project now has a gate.

The Next.js application now provides direct project/module routes, grouped common and specialist navigation, typed forms, explicit empty/denied/gated states and a route error boundary. Existing registers, tasks, files, activity, finance, approvals and operating-loop data are presented through their current RLS-backed stores. Venture and Confidence scores remain `Not Assessed` because no numeric policy has been approved.

Project 004 displays and enforces its research/paper-only boundary. Paper research and reports cannot be stored with `paper_only=false`; no broker adapter, credential, live toggle, approval path or trade executor exists. Project 005’s gated planning modules expose no mutation controls, and no product-creation or publication endpoint exists.

## Verification

| Check                         | Result                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `npm run check`               | PASS — typecheck, 71/71 database/domain/HTTP tests, optimized build and artifact scan |
| Production artifact scan      | PASS — all 16 fixture identity, selector, state and secret markers absent             |
| `npm run test:restart`        | PASS — 32 completed tasks and 50 accepted supersessions retained                      |
| `npm run test:e2e`            | PASS — 25 executed desktop/mobile scenarios; 3 intentional device-specific skips      |
| Milestone 3 responsive matrix | PASS — project workspaces at 1440, 768, 390, 320 and 200% reflow                      |
| `npm run format:check`        | PASS                                                                                  |
| `git diff --check`            | PASS                                                                                  |

Browser screenshots, traces and reports remain local and ignored under the repository publication rule.

## Acceptance status

- AT-01 and AT-02 remain **PASS (local)** across 44 RLS tables and 61 exposed functions.
- AT-03 remains **BLOCKED** overall because hosted Supabase identity/MFA/session behavior has not run; its deterministic local subset passes.
- AT-04 through AT-09 remain **PASS (local)**. All five projects now have exact local-only gate policies.
- AT-19 through AT-22 and AT-24 remain **PASS (local)**.
- AT-23 is **PASS (local)** at SQL, HTTP and desktop/mobile browser layers for every common and specialist module, access boundary and project hard stop.
- AT-18 remains **BLOCKED** overall; completed Milestone 1–3 surfaces pass their responsive and keyboard subsets.
- AT-10 through AT-17 and AT-25 through AT-29 retain the statuses in [acceptance evidence](acceptance-evidence.md). AT-30 remains **BLOCKED**.

## Security status

PostgreSQL remains authoritative. Every private request uses a verified server principal and transaction-local nonprivileged RLS role. Partners see only currently assigned projects and shared rows; finance, approval detail and the full activity log return explicit denied states. Nested project resources are re-bound to the authorized project before mutation, so crafted route IDs and cross-project references fail.

The browser and model never calculate permissions. Typed database functions reject malformed payloads, stale versions, cross-project evidence, duplicate Project 001 evidence categories, unsupported fitment verification, non-paper Project 004 records and Project 005 authority without the exact executed demand gate. Financial arithmetic remains deterministic PostgreSQL/domain logic.

No production deployment, hosted mutation, real owner/partner account, real credential, external email, provider message, paid model call, spending, publication or trading occurred.

## Bugs fixed during Milestone 3

- Replaced the generic project page with exact common and specialist module routes while preserving immutable history and operating-loop links.
- Bound nested entry, compatibility, property and opportunity IDs to the project in the route.
- Added the private helper grant required for RLS evaluation without exposing mutation rights.
- Removed an ambiguous property-module query and made missing digital opportunity/authorization lookups fail closed.
- Forced Project 004 report payloads to remain paper-only.
- Prevented one record from satisfying all five Project 001 evidence categories.
- Removed demand-workflow controls from Project 005 gated planning modules.
- Updated the legacy gate/history browser regression to the module architecture.

## Active blockers and owner inputs

- Real Terms, Privacy and any required agreement text need qualified owner approval; local documents remain visibly `UNAPPROVED_PLACEHOLDER`.
- Hosted owner identity, Supabase project, real MFA/recovery and controlled staging authorization are deferred to Milestone 11.
- Resend sender/domain and notification policy remain unapproved and unconnected.
- Storage/scanner, Trigger.dev, OpenAI, Meta, PostHog, Sentry, Cloudflare and Vercel credentials/configuration remain absent by design.
- Numeric Venture/Confidence scoring policies remain unapproved, so scores stay null/Not Assessed.
- Provider delivery, hosted RLS/pooler behavior, telemetry redaction and backup/restore remain unverified.

## Next safe action

Proceed to Final Milestone 4: implement the secure file and knowledge lifecycle from quarantine through clean scan, extraction, chunks, indexing, authorized delivery and reconciliation, then run AT-04 and AT-10. Use local provider doubles first; do not connect hosted Storage or a scanner until the later staging gate.

## Publication boundary

Only application code, engineering documentation and required seed registers may enter the public `Kara221219/kxra-os` repository. Original Word/text sources, full private Genesis research, archives, `.runtime`, credentials, screenshots, traces and test artifacts remain excluded.
