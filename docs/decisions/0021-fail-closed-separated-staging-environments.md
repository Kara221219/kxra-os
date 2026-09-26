# ADR 0021: Staging uses separated projects and a fail-closed environment preflight

Status: accepted locally on 26 September 2026. Hosted evidence remains pending.

## Context

The next acceptance step needs hosted Supabase and Vercel behavior, but a copied or mis-scoped environment could expose private credentials to the public application, activate unfinished providers or deploy to production. Current Supabase projects issue publishable and secret API keys; legacy `anon` and `service_role` JWT keys are being replaced. Vercel distinguishes production, preview and custom target environments and supports separate monorepo projects.

Sources: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Supabase breaking changes](https://supabase.com/changelog?types=breaking-change), [Vercel environments](https://vercel.com/docs/deployments/environments) and [Vercel monorepos](https://vercel.com/docs/monorepos).

## Decision

- Use one non-production Supabase project and two Vercel projects rooted at `apps/os` and `apps/marketing`.
- Permit only a Vercel preview deployment whose declared target is `staging` or the branch-specific `preview` fallback. Reject production.
- Run a fail-closed preflight before each Vercel build. Report variable names and findings without emitting values.
- Keep every external capability false in the first private staging profile. Reject its credentials until the corresponding acceptance slice begins.
- Give marketing only its exact origins, a unique ingress secret and a restricted public-ingress database login. Reject all private OS and provider credentials.
- Require current `sb_publishable_...` browser keys and prohibit legacy Supabase `anon` and `service_role` keys.
- Require restricted PostgreSQL users and encrypted connections; reject administrative or RLS-bypass identities.
- Keep production domains, publication, indexing, provider sends and customer onboarding disabled until hosted evidence and owner approval are recorded.

## Consequences

- A wrongly targeted deployment or copied environment fails before compilation.
- OS and marketing compromise have smaller, testable credential boundaries.
- Provider connections proceed one at a time after core hosted authorization is proven.
- The preflight validates configuration shape; it cannot prove provider permissions, RLS, hosted headers, backups or runtime behavior. The staging playbook supplies those acceptance tests.
