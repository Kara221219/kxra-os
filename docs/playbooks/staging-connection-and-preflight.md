# Staging connection and preflight

This playbook creates the first hosted acceptance environment without changing production, publishing the public site or enabling an external capability. Use a separate Supabase project and two separate Vercel projects. Never paste credentials into chat, source files, deployment logs or Git.

## 1. Owner connection checkpoint

The owner completes only these account actions:

1. In Supabase, create a new non-production project named clearly as KXRA staging. Record its project reference locally; do not reuse a production project.
2. In Vercel, connect the `Kara221219/kxra-os` repository and create two projects named clearly as KXRA OS staging and KXRA Marketing staging.
3. Restrict both projects to `codex/phase-2-completion`. Do not assign the production domains, change the production branch, merge the branch or enable search indexing.
4. If the Vercel plan supports custom environments, create `staging`. Otherwise use branch-specific Preview variables. The preflight accepts only a target of `staging` or `preview` and always rejects `production`.
5. Enable Vercel system environment variables so `VERCEL`, `VERCEL_ENV` and `VERCEL_TARGET_ENV` reach the build. Add the application variables below as sensitive values where Vercel supports it.

## 2. Vercel project boundary

Configure the private project with Root Directory `apps/os` and the public project with Root Directory `apps/marketing`. Enable **Include source files outside of the Root Directory** for both projects because their reviewed builds use the root lockfile, shared scripts and workspace packages.

Set each project's Build Command to:

```text
npm run preflight:staging && npm run build
```

The private project may contain only this initial profile:

| Variable                               | Required staging value                                                   |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `KXRA_ENVIRONMENT`                     | `staging`                                                                |
| `KXRA_AUTH_MODE`                       | `supabase`                                                               |
| `KXRA_ORIGIN`                          | Exact private HTTPS staging origin                                       |
| `DATABASE_URL`                         | Restricted `kxra_app` connection with `sslmode=require` or `verify-full` |
| `NEXT_PUBLIC_SUPABASE_URL`             | Exact staging project URL                                                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Current `sb_publishable_...` key                                         |
| `KXRA_JOIN_SECRET`                     | Unique generated value of at least 64 characters                         |
| `KXRA_AI_ENABLED`                      | `false`                                                                  |
| `KXRA_STORAGE_ENABLED`                 | `false`                                                                  |
| `KXRA_BILLING_ENABLED`                 | `false`                                                                  |
| `KXRA_WHATSAPP_ENABLED`                | `false`                                                                  |
| `KXRA_TELEMETRY_ENABLED`               | `false`                                                                  |
| `KXRA_PUBLIC_WEB_ENABLED`              | `false`                                                                  |
| `KXRA_EMAIL_ENABLED`                   | `false`                                                                  |

Do not add Storage, worker, Brand-source worker, OpenAI, Stripe, Trigger.dev, Resend, PostHog, Sentry or WhatsApp credentials during core staging. Do not add legacy Supabase `anon` or `service_role` keys.

The public project may contain only:

| Variable                     | Required staging value                                        |
| ---------------------------- | ------------------------------------------------------------- |
| `KXRA_ENVIRONMENT`           | `staging`                                                     |
| `KXRA_MARKETING_ORIGIN`      | Exact public-site HTTPS staging origin                        |
| `KXRA_PRIVATE_APP_URL`       | Exact private staging origin ending `/login`                  |
| `KXRA_PUBLIC_DATABASE_URL`   | Restricted `kxra_public_ingress` connection with TLS required |
| `KXRA_PUBLIC_INGRESS_SECRET` | Unique generated value of at least 64 characters              |

The public project must not receive Supabase Auth, private OS, model, billing, Storage, telemetry, email or other provider credentials. The two generated secrets must differ.

## 3. Supabase database and Auth boundary

Apply all 64 reviewed migrations to the empty staging project in order. Create separate login credentials for `kxra_app` and `kxra_public_ingress`; neither may be `postgres`, `supabase_admin`, `service_role` or a role with `BYPASSRLS`. The public-ingress login may use only the bounded anonymous ingress function and must not read KXRA tables or assume the authenticated role.

Keep KXRA tables in the `kxra` schema and outside automatic Data API exposure. PostgreSQL grants and RLS are separate controls: retain explicit minimum grants and verify every protected table with non-bypass identities. Use the current Supabase publishable key for the browser. Add a component-specific secret key only when a later Storage worker slice is approved.

Disable open signup. Configure only the exact private staging origin and reviewed Auth callback paths. Require the platform's invitation, active-account, selected-organization and agreement gates after Supabase verifies the user. Hosted MFA and owner bootstrap remain failed acceptance gates until exercised with a real staging owner.

## 4. Pre-deployment gate

Before either build, the environment preflight must pass inside the target Vercel environment. It inspects names and formats without printing values. Any production target, fixture variable, legacy Supabase key, placeholder/reused secret, public-named secret, privileged database user, missing TLS mode, enabled capability or cross-application credential fails the build.

After deployment, run the full staging acceptance plan before enabling another provider:

1. Prove hosted Auth, owner bootstrap, invitation-only access and exact callback behavior.
2. Run database and HTTP owner/partner/anonymous/revoked/crafted-ID/cross-project tests against non-bypass roles.
3. Prove the marketing application cannot retrieve private records, project context, files or Ask KXRA evidence.
4. Confirm Vercel's observed forwarded-address behavior, then apply and evidence the exact WAF rate rule.
5. Inspect HTML, RSC, prefetch, scripts, source maps, errors and caches for private markers.
6. Run hosted accessibility, performance, failure and distributed public-ingress tests with synthetic data.
7. Perform the encrypted provider backup/empty-target restore drill and record RPO, RTO and discrepancies.

Failure at any step keeps the environment non-customer and all external capability flags false. Rollback removes the preview deployment and rotates the affected credential; it does not promote another deployment.

## Current authoritative references

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase server-side Auth](https://supabase.com/docs/guides/auth/server-side)
- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Vercel deployment environments](https://vercel.com/docs/deployments/environments)
- [Vercel environment variables](https://vercel.com/docs/environment-variables/manage-across-environments)
- [Vercel WAF rules](https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration)
