# Engineering handover

Updated: 25 September 2026.

## Current checkpoint

Work from `/Users/kara/Desktop/P1/The KXRA Group` on `codex/phase-2-completion`. The pushed, GitHub-green Slice 6 baseline is `7fc2a34d01d42fa078a15d8ef526d428a4dde717`; the working tree contains Slice 7's transport-disabled WhatsApp implementation.

The branch is not merged and nothing is deployed. Preserve the private `KXRA-GENESIS` package, original source documents and unrelated parent-repository applications. PostgreSQL authorization, tenant/project isolation, Project 004's paper-only boundary, Project 005's demand gate, the Projects 006/007 no-side-effect boundaries and the repository publication boundary remain non-negotiable.

Read, in order:

1. [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md);
2. [acceptance evidence](acceptance-evidence.md) and [progress](progress.md);
3. [architecture](../architecture/system.md), [security](../security/access-control.md), [ADR 0014](../decisions/0014-whatsapp-gateway-authority.md) and the [WhatsApp threat model](../security/whatsapp-gateway-threat-model.md);
4. ADRs 0008–0011 and their threat models;
5. the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md) and root [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) for preserved requirements.

## Actual delivered state

Final Milestones 1–4 and Phase 2 Slices 0–6 are committed and green. Slice 7 migrations `0054`–`0055` are additive; after final verification the schema has 151 RLS-protected tables and 121 audited public functions.

Slice 7 adds:

- eight RLS tables for pairing challenges/pairings, project selections, ingress/messages/media, takeovers and outbound intents;
- account/membership-version/phone-digest/WABA-number-bound one-use pairing;
- worker-only idempotent ingress, explicit current project scope and closed intents;
- media quarantine and voice consent before any future transcription;
- delivery-time pairing/project/takeover reauthorization with adapter fixed disabled;
- bounded APIs, redacted UI, SQL/domain/HTTP/browser tests, ADR 0014, threat model and staging playbook.

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

The final Slice 7 clean contract passes 119 database/domain/HTTP tests, the 55-migration/151-table RLS audit and 42 desktop/mobile scenarios (38 applicable plus four intentional device-specific skips), database/private-object restart persistence, optimized build, 16-marker artifact exclusion and the 237-file publication/secret scan.

Local evidence does not prove hosted Supabase, Storage, MFA, Resend, Stripe, OpenAI, YouTube, Meta, Trigger.dev, telemetry, Vercel, Cloudflare, production repository scanners/sandboxing or backup behavior.

## Next implementation slice

Build the independent public application without publishing it:

1. create a separate public build and approved-publication snapshot source;
2. implement original layered industry storytelling with reduced-motion/mobile fallbacks;
3. add required public routes and bounded contact/discovery forms with no private data imports;
4. prove public artifacts exclude fixture/private markers and build independently;
5. keep deployment/publication disabled until copy, legal and owner approval.

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

No credential is needed for the next local public-build slice. Before staging can become customer-ready, the owner will need to complete these bounded steps when requested:

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
