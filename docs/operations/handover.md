# Engineering handover

Updated: 24 September 2026.

## Current checkpoint

Work from `/Users/kara/Desktop/P1/The KXRA Group` on `codex/phase-2-completion`. The pushed Slice 5 baseline is `b39f9006183f2c49b27c15408f8ea23edea9cf72`; use branch HEAD for the Slice 6 governed routine implementation.

The branch is not merged and nothing is deployed. Preserve the private `KXRA-GENESIS` package, original source documents and unrelated parent-repository applications. PostgreSQL authorization, tenant/project isolation, Project 004's paper-only boundary, Project 005's demand gate, the Projects 006/007 no-side-effect boundaries and the repository publication boundary remain non-negotiable.

Read, in order:

1. [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md);
2. [acceptance evidence](acceptance-evidence.md) and [progress](progress.md);
3. [architecture](../architecture/system.md), [security](../security/access-control.md), [ADR 0013](../decisions/0013-governed-routine-engine.md) and the [routine threat model](../security/routine-engine-threat-model.md);
4. ADRs 0008–0011 and their threat models;
5. the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md) and root [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) for preserved requirements.

## Actual delivered state

Final Milestones 1–4 and Phase 2 Slices 0–6 work in the deterministic local environment. Migrations `0001`–`0053` are ordered and applied; do not rewrite one after this slice is committed. The schema has 143 RLS-protected tables and 118 audited public functions.

Slice 6 added:

- eight RLS tables for routine service identities, manifests, immutable versions, project scopes, calendar facts, runs, checkpoints and notification intents;
- nine exact typed Genesis manifests, all draft/disabled, with schedule/event/business/exchange-calendar triggers, action graphs, scope, budgets, attempts/backoff and leases;
- owner-only exact-hash approval, enablement, calendar, local-slot and event controls;
- private `kxra_routine_worker` claim/checkpoint/completion/failure/recovery/requeue contracts;
- one logical run per slot/event, Europe/London DST and explicit XNYS calendar behavior, checkpoint-preserving lease recovery and revocation-aware retry;
- quiet unchanged completion and one append-only disabled notification intent for actionable terminal outcomes;
- SQL/domain, HTTP and browser tests, ADR 0013, threat model and approval/recovery playbook.

No Trigger.dev task, always-on scheduler, hosted worker or notification sender exists. No YouTube token, upload/schedule executor, repository archive fetcher, candidate process runner, Git writer, merge/release/deploy route or production scanner exists. Synthetic local evidence proves the contracts only.

Preserved earlier slices include normalized global identity, selected tenant, exact legal gate, commercial/custom-project separation, private file/knowledge lifecycle, permission-safe Ask/AI runs, owner control plane, seven project workspaces and Brand Studio. Local Auth, email, billing, scanner/extractor, model and generation adapters remain guarded test/product scaffolding.

Legal seed records remain `UNAPPROVED_PLACEHOLDER` and inactive. No production legal text, product, price, subscription, customer or credential is seeded.

## Reproduce the evidence

Requirements: Node.js 22, locked npm dependencies, Chromium for Playwright and local PostgreSQL binaries.

```sh
npm ci
npx playwright install chromium --only-shell
npm run test:ci
git diff --check
```

The clean contract creates and destroys a disposable runtime. It runs lint/typecheck/format, 114 database/domain/HTTP tests, the 53-migration/143-table RLS audit, 40 desktop/mobile scenarios (36 passes and four intentional device-specific skips), database/private-object restart persistence, an optimized production build, 16-marker fixture-artifact exclusion and a 230-file publication/secret scan.

Local evidence does not prove hosted Supabase, Storage, MFA, Resend, Stripe, OpenAI, YouTube, Meta, Trigger.dev, telemetry, Vercel, Cloudflare, production repository scanners/sandboxing or backup behavior.

## Next implementation slice

Implement the disabled-provider WhatsApp foundation before external delivery:

1. create cryptographic pairing challenges bound to one verified account and expire/replay them safely;
2. model durable signed ingress, deduplication, explicit project selection and bounded message/media states;
3. authorize current pairing, tenant and project before retrieval and reauthorize before outbound intent;
4. quarantine documents/images/voice notes and require transcription consent before any derived context;
5. create outbound intents with provider transport fixed disabled; no Meta send or model provider call;
6. expose owner/partner pairing and conversation evidence without cross-project disclosure;
7. add SQL, HTTP and browser evidence for signature failure, replay, ambiguous project, revoked pairing/assignment, crafted IDs and cross-project retrieval/delivery.

## Security invariants

- Verify server identity, active account and selected organization before retrieval. The organization cookie is a selector only.
- Set `request.kxra.org_id` from verified membership inside each transaction. Never accept tenant/project authority from request, JWT or model fields.
- Require one authorized project for project-bound retrieval and reauthorize before bytes, model context, export, intent or provider delivery.
- Treat files, website snapshots, repository content and model output as untrusted evidence without instruction or tool authority.
- Require an exact approved legal version before private production access; placeholders cannot activate.
- Calculate entitlement, usage and money in deterministic database/domain code.
- Subscription access never authorizes custom implementation.
- Brand Studio export never authorizes publication.
- PROJECT-006 approval never authorizes upload while the adapter is disabled; creator and final reviewer must differ.
- PROJECT-007 assessment never proves safety; proposal approval never authorizes execution, merge, release or deploy.
- Every new table needs RLS/policy and every function/route needs negative access tests.

## Owner/provider connection order

No credential is needed for the next local WhatsApp-contract slice. Before staging can become customer-ready, the owner will need to complete these bounded steps when requested:

1. obtain solicitor-approved legal documents and release versions;
2. provide a hosted Supabase project and configure Auth redirect/MFA policies through provider secret stores;
3. create the private Storage bucket and production scanning/extraction service identities;
4. configure Stripe products/prices/webhook endpoint after pricing decisions;
5. configure Resend and DNS only after approved sender copy and domains;
6. configure OpenAI project/data controls and explicit budgets;
7. configure YouTube OAuth for the exact Finance Unfolded account only when the disabled local intent contract is accepted;
8. configure Meta WhatsApp, Trigger.dev, PostHog, Sentry, Vercel and Cloudflare in separate staging acceptance slices.

Never paste secret values into chat or Git. Use the provider dashboards and Vercel/Supabase secret stores referenced by the relevant future playbook.

## Private business-readiness artifacts

The ignored private business pack contains the Customer Discovery Pack, tracker and Solicitor Brief alongside the business plan, decks, financial model and playbooks. They are not public-repository content. The solicitor brief is an instruction pack, not legal advice or approved customer-facing terms.
