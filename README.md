# KXRA OS

KXRA Group's venture operating workspace. This is a working **local engineering foundation**, not a production-ready service. Original source documents, the prior Genesis specification, and parent-repository applications are preserved.

## Run locally

Requirements: Node 22+, npm, PostgreSQL binaries. This machine uses `/opt/homebrew/opt/postgresql@14/bin`; set `KXRA_PG_BIN` for another installation.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3210. Sign in using a clearly labelled synthetic Owner, Partner, Viewer or Revoked identity. The owner sees all five projects; the partner is assigned only seat covers; the viewer only property. No real credentials are needed. Local PostgreSQL listens on a private Unix socket, never a network port. Runtime data and the generated signing secret are excluded from Git.

```sh
npm run typecheck
npm test
npm run test:restart
npx playwright install chromium --only-shell
npm run test:e2e
npm run build
```

Keep the local preview running for HTTP/browser tests. Database tests roll back; HTTP/browser tests intentionally leave labelled synthetic records for inspection. Run the restart check after `npm test`; it stops and restarts only the isolated local cluster and verifies the retained operating-loop records. Never point tests at a hosted database. `npm run db:stop` stops only this workspace's database. Reset is intentionally disabled. See [local operations](docs/operations/local-development.md).

## What works

- Database-backed owner/partner workspaces, portfolio and five project pages.
- Classified idea, assumption, experiment, decision, risk, source, task, knowledge and finance registers; draft creation, immutable historical snapshots and durable audit history.
- A typed idea → experiment → assigned task → result → exact-version decision → approval loop, including linked decision supersession.
- Current membership checks plus PostgreSQL RLS on every request; owner-only group records, explicit project sharing and tested isolation across all 20 private tables.
- Canonical owner approvals bind action, organisation, project, payload, environment, requester and expiry. Membership changes reject stale authority and preserve approved expiry.
- One-use, email-bound local invitation and redemption flows. Consequential actions require recent AAL2; hosted MFA remains unverified.
- Evidence-linked local project gates for Projects 002, 003 and 005. Project 004 live execution and Project 005 product creation remain disabled.
- Evidence-only Ask KXRA and scoped full-text search. No model receives context.
- Local quarantined file upload and metadata isolation. File delivery intentionally disabled until scanning and hosted storage are implemented.
- Seeded AI role, skill and routine definitions; no autonomous agents or schedules.
- Original public marketing page with `info@kxra-group.com` contact links. Not published.

## Boundaries

Supabase authentication and cookie refresh adapters exist but have **not been exercised against hosted Supabase**. Hosted owner bootstrap is a reviewed manual script; no real owner account has been created. Hosted MFA enrolment/recovery, email delivery, cloud storage, scanning, live AI, WhatsApp delivery, Trigger.dev jobs, Resend, PostHog and Sentry remain unconnected. Unknown financial results and venture scores remain unknown. Trading is research/paper only. Digital product creation remains gated on reviewed demand evidence.

## Repository

| Location | Responsibility |
|---|---|
| `apps/os` | Next.js/TypeScript interface, server authentication and APIs |
| `packages/db` | Verified-principal transactions under RLS roles |
| `packages/domain` | Input schemas, exact money arithmetic, score formulas |
| `packages/authz` | Strictly local signed fixture sessions |
| `packages/ai` | Authorised evidence envelope; synthesis disabled |
| `packages/integrations` | WhatsApp cryptographic foundations |
| `supabase/migrations` | Additive schema, integrity, workflow, identity and project-gate migrations |
| `tests` | Database, HTTP, calculation and browser tests |
| `docs` | Architecture, security, decisions, operations, projects, playbooks |
| `KXRA-GENESIS/registers` | Required classified seed data; full research/source package is private and excluded |

Start with [progress](docs/operations/progress.md), [handover](docs/operations/handover.md), [architecture](docs/architecture/system.md) and [security](docs/security/access-control.md). This public repository includes the application, engineering documentation and required seed registers only. Original documents and the full Genesis research/brief remain private on the owner’s machine; they are not required to install, build or run the platform.
