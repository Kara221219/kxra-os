# Go-live checklist for Husain Kara

11 November 2026. This is the list of things only you can do. The software cannot invent these accounts, and it must not take a live payment until you complete them. Nothing in this list has been marked done from this workspace.

## How you open the owner admin

1. Open the private app at `https://app.kxra-group.com/login` after the current code is the one Vercel is serving.
2. Sign in with the owner email you created in Supabase Authentication.
3. Enter the code from your authenticator app. The admin refuses entry until that second step is less than 15 minutes old.
4. Open `https://app.kxra-group.com/admin`.
5. If you are sent back to the authenticator page, complete it again and return to `/admin`.

The first owner account is created with the production owner command in the repository, after the database is migrated. Do not run that command until someone has checked, read-only, what the production database already contains. The old bootstrap command refuses to run against a database that already has tables.

On a local copy, `npm run dev` shows a labelled practice sign-in. That practice sign-in is not your live owner account.

## What the admin can and cannot do

It shows accounts, organisations, subscription rows already stored from Stripe, website enquiries, support requests, and Decision Review requests. Suspending or reactivating an account creates an approval. It does not charge a card, refund a payment, or change a Stripe setting. Those stay in the Stripe dashboard. The links on the billing screen open Stripe.

## Accounts and keys you must supply

Set these on the Vercel project for the private app (`kxra-os`), not in Git.

| What you want | What to set |
| --- | --- |
| Customers can create an account | `KXRA_HOSTED_SELF_SERVICE_ENABLED=true`, plus `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `DATABASE_URL` for the London Supabase project |
| Verification, invitation and password emails actually send | `KXRA_EMAIL_ENABLED=true`, `RESEND_API_KEY`, `KXRA_EMAIL_FROM` using an address at `kxra-group.com` (the verified sending domain is `mail.kxra-group.com`), `KXRA_EMAIL_SECRET_KEY`, and the separate email-worker project settings `KXRA_EMAIL_WORKER_DATABASE_URL`, `KXRA_EMAIL_WORKER_ORIGIN`, `KXRA_EMAIL_WORKER_TRIGGER_SECRET`, `RESEND_WEBHOOK_SECRET` |
| Test card checkout, not real money | Stripe test secret `sk_test_...`, test publishable key, test webhook secret, and `KXRA_MODERN_BILLING_DISPATCH_ENABLED=true` together with `KXRA_CHECKOUT_RESULT_ENABLED=true` and `KXRA_PORTAL_DELIVERY_ENABLED=true`. Leave every `KXRA_LIVE_*` flag off |
| Real charges | A separate decision. Then `KXRA_LIVE_BILLING_ENTRY_ENABLED=true`, `KXRA_LIVE_WEBHOOK_ENABLED=true`, the live webhook secret, live account id, and a live restricted key. Do not reuse the test secret |
| A maintenance message | `KXRA_MAINTENANCE_BANNER` on the host |

Marketing (`kxra-marketing`) needs `KXRA_MARKETING_ORIGIN`, `KXRA_PRIVATE_APP_URL`, `KXRA_PUBLIC_DATABASE_URL` and `KXRA_PUBLIC_INGRESS_SECRET`. It must not hold Stripe or Resend secrets.

## Still blocked without you

- The live sites still serve an older build until you deploy this branch in Vercel. This workspace cannot sign in to Vercel or GitHub from here.
- Supabase production must be compared read-only before any migration. Do not initialise it as if it were empty.
- DNS for `kxra-group.com`, `www` and `app` must match the current Vercel instructions. Keep the existing email MX records.
- No live payment, refund, or customer email was sent from this work.
