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
npx playwright install chromium --only-shell
npm run test:e2e
npm run build
```

Keep the local preview running for HTTP/browser tests. Database tests roll back; HTTP/browser tests intentionally leave labelled synthetic records for inspection. Never point tests at a hosted database. `npm run db:stop` stops only this workspace's database. Reset is intentionally disabled. See [local operations](docs/operations/local-development.md).

## What works

- Database-backed owner/partner workspaces, portfolio and five project pages.
- Classified idea, assumption, experiment, decision, risk, source, task, knowledge and finance registers; draft creation, versioned editing and durable audit history.
- Current membership checks plus PostgreSQL RLS on every request; owner-only group records and private shared-project boundaries.
- Exact owner approval, acceptance and membership revocation/restoration functions with MFA level checks, expiry, version and single-use protection.
- Evidence-only Ask KXRA and scoped full-text search. No model receives context.
- Local quarantined file upload and metadata isolation. File delivery intentionally disabled until scanning and hosted storage are implemented.
- Seeded AI role, skill and routine definitions; no autonomous agents or schedules.
- Original public marketing page with `info@kxra-group.com` contact links. Not published.

## Boundaries

Supabase authentication and cookie refresh adapters exist but have **not been exercised against hosted Supabase**. Hosted owner bootstrap is a reviewed manual script; no real owner account has been created. Invitations, MFA enrolment UI, cloud storage, scanning, live AI, WhatsApp delivery, Trigger.dev jobs, Resend, PostHog and Sentry remain unconnected. Unknown financial results and venture scores remain unknown. Trading is research/paper only. Digital product creation remains gated on demand research.

## Repository

| Location | Responsibility |
|---|---|
| `apps/os` | Next.js/TypeScript interface, server authentication and APIs |
| `packages/db` | Verified-principal transactions under RLS roles |
| `packages/domain` | Input schemas, exact money arithmetic, score formulas |
| `packages/authz` | Strictly local signed fixture sessions |
| `packages/ai` | Authorised evidence envelope; synthesis disabled |
| `packages/integrations` | WhatsApp cryptographic foundations |
| `supabase/migrations` | Core schema and hardening migrations |
| `tests` | Database, HTTP, calculation and browser tests |
| `docs` | Architecture, security, decisions, operations, projects, playbooks |
| `KXRA-GENESIS` | Preserved foundational source/specification package |

Start with [progress](docs/operations/progress.md), [handover](docs/operations/handover.md), [architecture](docs/architecture/system.md) and [security](docs/security/access-control.md). The source brief is [CODEX-GENESIS-BUILD-BRIEF.md](KXRA-GENESIS/CODEX-GENESIS-BUILD-BRIEF.md).
