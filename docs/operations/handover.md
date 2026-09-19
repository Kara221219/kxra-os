# Engineering handover

Updated: 19 September 2026.

## Current checkpoint

Work from `/Users/kara/Desktop/P1/The KXRA Group` on `codex/phase-2-completion`. The audited pushed implementation baseline is `9e8733bebdb967760835b3a82087b45a7f5a6197`; use branch HEAD for this brief/handover revision. The requirements-freeze baseline is `4e597ea2039f8758a254cf42637baff26e7067a2`, and the reviewed Genesis implementation ancestor is `0c20de47fe1f6cb38646db51c4a90650679aacd7`.

The branch is not merged and nothing is deployed. GitHub's default branch remains the stale `codex/genesis-foundation` revision `e9e317a41b0f7a64f4b652152f7ef7c2a5ef3781`; do not change it until the release gate and owner approval. Preserve the private `KXRA-GENESIS` package, original source documents and unrelated parent-repository applications.

Read, in order:

1. [Phase Completion Brief 02](CODEX-PHASE-COMPLETION-BRIEF-02.md) — current self-contained audit and execution contract;
2. [acceptance evidence](acceptance-evidence.md);
3. [progress](progress.md);
4. [architecture](../architecture/system.md) and [security](../security/access-control.md);
5. the earlier [Phase Completion Brief](CODEX-PHASE-COMPLETION-BRIEF.md) and root [Final Completion Brief](../../KXRA-FINAL-COMPLETION-BRIEF.md) for preserved history.

Direct user instructions remain controlling. PostgreSQL authorization, project/tenant isolation, Project 004's permanent paper-only boundary and the repository publication boundary remain non-negotiable.

## Actual delivered state

Final Milestones 1–3 work in the deterministic local environment. Migrations `0026`–`0028` are the latest applied migrations and must never be rewritten. The current schema has 44 RLS tables and 61 audited exposed functions. Account/invitation/onboarding, owner control plane, five venture workspaces, six internal approval executors, exact finance and the typed operating loop are implemented locally.

The audit found:

- partner isolation is strong for the current single-organization model at database, HTTP and browser layers;
- Ask KXRA is broken against the frozen one-project contract because it permits `All projects I can access`/null `project_id`; the exact insufficient-evidence phrase is also wrong;
- files stop safely at quarantine, AI/skills/routines are definitions, WhatsApp is cryptographic scaffolding, and provider/public/customer workflows are absent;
- the current membership model cannot support one identity in multiple customer organizations safely;
- legal documents are unapproved placeholders;
- no independent marketing app, CI workflow, provider connection, backup restore or production deployment exists.

The approved supplemental direction adds a multi-tenant customer platform, Brand Studio, subscriptions/free partner entitlements, separately priced custom projects, a first-private-access agreement gate, Project 006 YouTube automation, Project 007 secure repository intelligence and an original layered-scroll marketing site. None is implemented yet; the brief provides exact architecture and AT-31–47.

## Reproduce the audited evidence

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3210` using only the labelled synthetic identities. In another terminal run:

```sh
npm run check
npm run format:check
npm run test:restart
npm run test:e2e
npm audit --omit=dev
npm audit
git diff --check
```

Audit results: 71/71 database/domain/HTTP tests and optimized build/artifact scan passed; 25 browser scenarios passed with 3 intentional device-specific skips; restart retained the current accumulated 33 tasks/52 supersessions; formatting and both dependency audits passed with zero reported findings. HTTP/browser suites retain labelled synthetic records, so their counts drift; Slice 0 must make CI disposable/deterministic.

Local results do not prove hosted Auth/MFA/Storage, pooler RLS, Resend, Stripe, OpenAI, YouTube, Meta, Trigger.dev, telemetry, Vercel or backup behavior.

## Required next slice

Execute Slice 0 from the new brief before broadening capabilities:

1. require exactly one currently authorized project for partner Ask;
2. return exactly `INSUFFICIENT KXRA EVIDENCE.` when evidence is insufficient;
3. add SQL/API/browser tests for missing, null, unauthorized and multi-project requests plus revocation;
4. add pinned hermetic CI, lint, migration/RLS, secret/dependency/security and artifact checks;
5. make each complete test run start from or clean up to a known fixture state;
6. rerun every current regression and update acceptance evidence.

Then add the normalized multi-tenant identity, first-access legal gate and commercial/entitlement foundation through additive migrations before Final Milestone 4. This prerequisite is necessary because the newly approved customer model changes identity and scope assumptions used by every later file, Ask, AI and provider path.

## Security invariants

- Verify the server identity and active account/organization/project scope before retrieval; use a transaction-local non-bypass RLS role.
- Never accept user/role/tenant/project/entitlement/approval from request bodies, cookies without verification or model output.
- Partners/customers see only current assigned projects and explicitly shared rows. Reauthorize before bytes, model response, provider send or publication.
- A service worker may use only a signed stored initiating scope/capability and cannot become a general service-role data path.
- Keep Project 004 paper only. Preserve P001–P005 exact hard stops and add the P006/P007 gates before any side effect.
- Do not activate an NDA placeholder, paid model, external email/message, Stripe live mode, YouTube publication, candidate-code execution on a trusted host, deployment or public site.
- Financial and entitlement arithmetic is deterministic database/domain logic, never model output.
- All applied migrations are immutable; corrections use a later migration.

## Provider and owner boundaries

Continue through local code, fake adapters and tests without requesting credentials. The owner runbook in the brief gives exact later steps for legal documents, Supabase staging, Stripe, OpenAI, YouTube, a read-only GitHub App, Resend, Trigger.dev, PostHog, Sentry, Cloudflare, Vercel and optional Meta.

When an external activation becomes the next dependency, present the exact configured endpoint/scopes/environment/action for review. Never ask for raw secrets in chat. Production merge/default-branch change, deployment, public publication, live billing, real customer contact and YouTube/WhatsApp sends require owner approval of the concrete action.

## Publication boundary

Commit only platform code, engineering documentation and required classified seeds. Do not commit the original Word/text sources, private Genesis research, credentials, `.runtime`, databases, object backups, screenshots, traces or generated test artifacts.
