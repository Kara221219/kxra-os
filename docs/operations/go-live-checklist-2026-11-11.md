# Go-live checklist for Husain Kara

11 November 2026. Only you can complete these steps. Nothing here was marked done from this workspace. No live charge, refund or customer email was sent.

## Design

The site and the public app use the cream and stone reference: sage buttons, the headline “Your team. Amplified.”, and the existing team illustration. That reference replaces every earlier dark obsidian or champagne-gold plan. Do not commission a dark moving background. Higgsfield is not part of this release.

## How you open the owner admin

1. After this branch is the one Vercel is serving, open `https://app.kxra-group.com/login`.
2. Sign in with the owner email you created in Supabase Authentication.
3. Enter the code from your authenticator app. Admin refuses you if that second step is more than 15 minutes old.
4. Open `https://app.kxra-group.com/admin`.
5. If you are sent back to the authenticator page, complete it and return to `/admin`.

Do not run the production owner command until someone has checked, read-only, what the production database already contains. The old bootstrap command refuses a database that already has tables.

A local `npm run dev` practice sign-in is not your live owner account.

## What admin can and cannot do

It reads accounts, organisations, subscriptions already stored from Stripe, website enquiries, support requests and Decision Review requests. Suspending or reactivating an account asks you to confirm, then creates an approval. It does not charge a card or issue a refund. Those stay in the Stripe dashboard.

## Prices that checkout must use

- Founding: £29 a month or £290 a year for one organisation. No VAT.
- Team: £79 a month for up to five people.
- Business: £199 a month for up to fifteen people.
- Decision Review: £250. The customer requests it, pays, and tracks it. You scope it and deliver it.
- Business Improvement Sprint: £750.
- Implementation: quoted. There is no buy button.

Reasoning is in ADR 0057. Kylon starts at $50 a month and includes model credits. KXRA does not include those credits, so £29 is the founding software price.

## Accounts and keys you must set

Set these on the Vercel project for the private app (`kxra-os`), not in Git.

| What you want | What to set |
| --- | --- |
| Customers create their own account | `KXRA_HOSTED_SELF_SERVICE_ENABLED=true`, plus `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `DATABASE_URL` |
| Verification, invitation and password emails send | `KXRA_EMAIL_ENABLED=true`, `RESEND_API_KEY`, `KXRA_EMAIL_FROM` at `mail.kxra-group.com`, `KXRA_EMAIL_SECRET_KEY`, and on the email worker: `KXRA_EMAIL_WORKER_DATABASE_URL`, `KXRA_EMAIL_WORKER_ORIGIN`, `KXRA_EMAIL_WORKER_TRIGGER_SECRET`, `RESEND_WEBHOOK_SECRET` |
| Test cards only | Stripe test secret, test publishable key, test webhook secret, `KXRA_MODERN_BILLING_DISPATCH_ENABLED=true`, `KXRA_CHECKOUT_RESULT_ENABLED=true`, `KXRA_PORTAL_DELIVERY_ENABLED=true`. Leave every `KXRA_LIVE_*` flag off |
| Real charges | A separate decision. Then `KXRA_LIVE_BILLING_ENTRY_ENABLED=true`, `KXRA_LIVE_WEBHOOK_ENABLED=true`, the live webhook secret, live account id, and a live restricted key |
| A maintenance message | `KXRA_MAINTENANCE_BANNER` |

Marketing needs `KXRA_MARKETING_ORIGIN`, `KXRA_PRIVATE_APP_URL`, `KXRA_PUBLIC_DATABASE_URL` and `KXRA_PUBLIC_INGRESS_SECRET`. It must not hold Stripe or Resend secrets.

## Still blocked without you

- This workspace cannot log in to GitHub or Vercel, so it cannot attach preview URLs or deploy `app.kxra-group.com`.
- The production database must be inspected read-only before any migration. Do not treat it as empty.
- Keep the existing email MX records when you set the web DNS.
- Homepage and Let’s connect messages record the real page. The database column cannot yet store `/` or `/lets-connect`. The exact lock, and the three files an owner review would have to approve together, are in `docs/operations/enquiry-source-path-lock.md`.
