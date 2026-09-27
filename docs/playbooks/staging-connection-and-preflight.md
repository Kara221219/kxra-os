# Staging connection and preflight

This playbook creates the first hosted acceptance environment without changing production, publishing the public site or enabling an external capability. Use a separate Supabase project and two separate Vercel projects. Never paste credentials into chat, source files, deployment logs or Git.

## 1. Owner connection checkpoint

The owner completes only these account actions:

1. In Supabase, create a new non-production project named clearly as KXRA staging. Record its project reference locally; do not reuse a production project.
2. In Vercel, connect the `Kara221219/kxra-os` repository and create two projects named clearly as KXRA OS staging and KXRA Marketing staging.
3. Keep the repository production branch unchanged and use `codex/phase-2-completion` only as a Preview branch (or a matching custom staging environment). Scope all staging variables to that branch/environment. Do not assign production domains, merge the branch or enable search indexing.
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

Apply all 67 reviewed migrations to the empty staging project in order. Create separate login credentials for `kxra_app` and `kxra_public_ingress`; neither may be `postgres`, `supabase_admin`, `service_role` or a role with `BYPASSRLS`. The public-ingress login may use only the bounded anonymous ingress function and must not read KXRA tables or assume the authenticated role. When a custom login uses Supabase's shared pooler, copy the host and port from **Connect** and use the documented `[ROLE].[PROJECT-REF]` username form rather than constructing a pooler address.

Use the guarded operator workflow from a clean, pushed `codex/phase-2-completion` checkout. Keep these variables only in the operator shell or password manager; never place them in Vercel or a tracked file:

```sh
export KXRA_ENVIRONMENT=staging
export KXRA_STAGING_PROJECT_REF='<20-character-project-ref>'
read -r -s KXRA_STAGING_MIGRATOR_DATABASE_URL
export KXRA_STAGING_MIGRATOR_DATABASE_URL
npm run staging:db:plan
export KXRA_STAGING_MIGRATION_CONFIRMATION="APPLY:${KXRA_STAGING_PROJECT_REF}:codex/phase-2-completion"
npm run staging:db:apply
npm run staging:db:verify
npm run staging:seed:plan
export KXRA_STAGING_SEED_CONFIRMATION="SEED:${KXRA_STAGING_PROJECT_REF}:codex/phase-2-completion"
npm run staging:seed:apply
npm run staging:seed:verify
npm run staging:roles:plan
read -r -s KXRA_STAGING_APP_PASSWORD
export KXRA_STAGING_APP_PASSWORD
read -r -s KXRA_STAGING_PUBLIC_INGRESS_PASSWORD
export KXRA_STAGING_PUBLIC_INGRESS_PASSWORD
export KXRA_STAGING_ROLE_CONFIRMATION="ROLES:${KXRA_STAGING_PROJECT_REF}:codex/phase-2-completion"
npm run staging:roles:apply
npm run staging:roles:verify
unset KXRA_STAGING_MIGRATOR_DATABASE_URL KXRA_STAGING_MIGRATION_CONFIRMATION KXRA_STAGING_SEED_CONFIRMATION KXRA_STAGING_APP_PASSWORD KXRA_STAGING_PUBLIC_INGRESS_PASSWORD KXRA_STAGING_ROLE_CONFIRMATION
```

Use the direct connection or **Session pooler** on port 5432 with `sslmode=verify-full`; the transaction pooler on port 6543 is rejected. The workflow never prints the URL, tracks each migration by exact hash/source commit, resumes a clean pending suffix and rejects an existing unmanaged KXRA schema.

The seed workflow runs only after all migration hashes pass. `KXRA-CANONICAL-SEEDS-V1` binds the checked-in project and operating registers and imports exactly the seven source-backed projects plus classified records. It explicitly excludes local fixture identities, local AI/budget approval, legal placeholders, entitlements, active product entries, billing and provider state. Unknown profiles, changed source hashes, unmanaged existing canonical rows or content/provenance drift fail closed. Owner bootstrap remains a separate reviewed step.

Generate two different 48–128 character base64url passwords in a password manager before the role step. The prompts do not echo them. The operator creates or rotates only `kxra_app` and `kxra_public_ingress`, rejects an existing role with unknown memberships, ownership or direct grants, and records no password or password hash. After verification, build `DATABASE_URL` with `kxra_app` and `KXRA_PUBLIC_DATABASE_URL` with `kxra_public_ingress`. For a copied session-pooler connection, use `kxra_app.PROJECT_REF` or `kxra_public_ingress.PROJECT_REF` as the username. Store each URL only in its matching Vercel staging project.

Keep KXRA tables in the `kxra` schema and outside automatic Data API exposure. PostgreSQL grants and RLS are separate controls: retain explicit minimum grants and verify every protected table with non-bypass identities. Use the current `sb_publishable_…` key for the browser. A Supabase `sb_secret_…` key bypasses RLS and is prohibited from both core staging applications; add one only to a separately reviewed server/worker secret store when a later provider slice explicitly requires it.

Disable open signup. Configure only the exact private staging origin and reviewed Auth callback paths. Enable TOTP enrollment and verification. Require the platform's invitation, active-account, selected-organization and agreement gates after Supabase verifies the user.

### First staging owner and TOTP

Perform this only after migrations, canonical seeds and runtime roles verify and the private OS preview is configured. Keep the preview private throughout the short preparation interval.

1. In Supabase Auth, create the intended staging owner with the exact private owner email, confirm that address and copy the generated user UUID into a local password-manager note. Keep public signup disabled.
2. In a clean, pushed `codex/phase-2-completion` checkout, set the operator-only values below. Do not place them in Vercel, a tracked file, terminal history shared with others or chat.
3. Run plan, apply and plan. Apply creates the exact owner records but does not claim MFA if no verified factor exists.
4. Sign in to the private staging OS as that owner. Open **Profile → Security**, begin enrollment, scan the QR code in the owner's authenticator and enter the six-digit code. If the page was refreshed before completion, use **Restart enrollment**.
5. Run verify immediately. A pass requires the verified Auth factor, exact KXRA factor reference, singleton owner and operator event. Until it passes, the staging identity acceptance test remains failed.

```sh
export KXRA_ENVIRONMENT=staging
export KXRA_STAGING_PROJECT_REF='<20-character-project-ref>'
read -r -s KXRA_STAGING_MIGRATOR_DATABASE_URL
export KXRA_STAGING_MIGRATOR_DATABASE_URL
read -r KXRA_STAGING_OWNER_USER_ID
export KXRA_STAGING_OWNER_USER_ID
read -r KXRA_STAGING_OWNER_EMAIL
export KXRA_STAGING_OWNER_EMAIL
export KXRA_STAGING_OWNER_DISPLAY_NAME='<reviewed display name>'
npm run staging:owner:plan
export KXRA_STAGING_OWNER_CONFIRMATION="OWNER:${KXRA_STAGING_PROJECT_REF}:${KXRA_STAGING_OWNER_USER_ID}:codex/phase-2-completion"
npm run staging:owner:apply
npm run staging:owner:plan
# Complete hosted sign-in and TOTP enrollment in the private OS now.
npm run staging:owner:verify
unset KXRA_STAGING_MIGRATOR_DATABASE_URL KXRA_STAGING_OWNER_USER_ID KXRA_STAGING_OWNER_EMAIL KXRA_STAGING_OWNER_DISPLAY_NAME KXRA_STAGING_OWNER_CONFIRMATION
```

Do not remove the owner's factor through ordinary account controls. Supabase does not provide a KXRA-approved recovery-code path in this implementation; a lost factor requires a reviewed support/recovery procedure. Global sign-out is supported, but revoked access tokens can remain valid until their short expiry, so database account/membership revocation remains the immediate authorization control.

### Hosted sign-in and recovery acceptance

Run these checks with synthetic staging identities after owner verification and before enabling any other provider. Retain redacted timestamps and outcomes; never retain passwords, links, codes, cookies or tokens.

1. Sign out globally. Sign in with the enrolled owner's password and confirm the application stops at `/login/mfa` before any private OS page renders.
2. Enter a wrong code and confirm the generic challenge error. Enter the current code and confirm the JWT reaches `aal2` and the application opens only the authorized organization.
3. Establish an `aal1` enrolled session and request `/os`, one private API and one crafted project URL directly. Each must stop at the MFA boundary before project or model context retrieval.
4. Confirm an account without an enrolled factor follows its approved onboarding/enrollment policy. Create an ambiguous-factor condition only in a disposable identity and confirm sign-in fails closed with a support path.
5. Request a password reset. Confirm the provider email returns only to the exact private HTTPS callback and then `/reset-password`; altered, external or query-extended destinations must resolve to `/os` or fail.
6. Confirm a normal signed-in session without the recovery intent cannot submit a new password. Confirm a tampered, expired or different-user intent fails with the generic reset response.
7. Complete one recovery. Confirm the intent is consumed, the old password fails, the new password works, the enrolled account is challenged for TOTP again and prior refresh sessions no longer recover private access.
8. Simulate the local audit write being unavailable after provider success. Confirm the response says the password changed and requires sign-in, the intent cannot be reused and the incident is reconciled before acceptance.

Any private response at AAL1 for an enrolled account, reusable recovery intent, arbitrary callback redirect, factor ID accepted from the browser or stale session that survives database revocation is a hard stop.

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
