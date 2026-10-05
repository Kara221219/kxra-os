# ADR 0052: Vercel Pro production boundary

Date: 5 October 2026  
Status: Accepted

## Context

KXRA's private staging applications are already isolated as three Vercel Preview projects, but commercial customer use cannot remain on the personal Hobby plan. Production still requires separately scoped projects, credentials, domains, provider configuration and release authority.

The owner completed Vercel billing setup and activated Pro after reviewing the expected platform cost. Plan activation changes hosting capacity only; it does not authorize a Production deployment, copy Preview secrets, enable live billing, publish a domain or onboard customers.

## Decision

Vercel team `husainkara-6439s-projects` uses the Pro plan for KXRA's intended commercial hosting boundary. Dashboard evidence on 5 October 2026 reports the plan active for the 5 October–5 November billing period, $20 monthly included usage credit, no infrastructure usage and an upcoming invoice of $20.

Production services remain isolated from the existing `kxra-os-staging`, `kxra-marketing-staging` and `kxra-email-worker-staging` Preview projects. Production receives only reviewed artifacts and least-privilege Production variables through a guarded launch procedure.

## Cost controls

- The provider-created team spend budget is currently $200 per billing period with alerts at 50%, 75% and 100%; automatic production pausing is off.
- Flat Rate CDN is included at $0 for the current capacity shown by the dashboard.
- Speed Insights Plus, Web Analytics Plus, Flags Explorer, Preview Deployment Suffix, HIPAA BAA and SAML SSO are disabled.
- Observability Plus is enabled and appears as $0 on the current upcoming invoice. It is an optional add-on whose standard Pro price is $10 per month plus usage after any free period; it must be disabled or separately owner-approved before a paid renewal.
- AI Gateway auto-reload and Vercel Agent usage billing are off. Existing AI Gateway credit is not launch authority.

## Consequences

- Expected fixed Vercel cost is currently $20 per month before tax and overages. No optional add-on cost is approved by this decision.
- The $200 default on-demand budget is an alert threshold, not a hard cap. A smaller operating threshold may be adopted after launch load is measured; automatic pausing must be weighed against customer availability.
- Production variables, domains, deployments, live Stripe, external AI, WhatsApp, email campaigns and customer onboarding remain separately gated.
- The exact production artifact, environment manifest, rollback reference and domain cutover still require owner approval.
