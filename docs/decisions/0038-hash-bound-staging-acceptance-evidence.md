# ADR 0038 — Hash-bound staging acceptance evidence

Status: accepted locally on 27 September 2026. Hosted execution remains blocked until the separate Supabase and Vercel staging projects exist.

## Decision

Run core hosted boundary checks through a clean, pushed, exact-commit operator. It accepts only distinct HTTPS Vercel Preview or explicitly named staging origins and requires an exact confirmation phrase binding both hosts and the 40-character Git SHA.

The first contract performs 18 anonymous probes across the private login/API boundary, required public pages, the public-to-private login redirect and absence of private APIs on the marketing deployment. It checks response status and type, production CSP, nonce behavior, HSTS, frame/referrer/permissions policy, private no-store behavior, staging no-indexing, absent permissive CORS, absent framework disclosure and known fixture/private markers.

Response bodies, cookies, protection-bypass values and credentials are never retained. Evidence contains only the reviewed commit, staging origins, timestamps, bounded status, byte counts, body/header hashes, outcomes and generic findings. The generated JSON is reviewed before it is committed under `docs/operations/evidence/staging`.

## Consequences

- A local fake-provider pass cannot be presented as hosted evidence.
- A dirty, unpushed, wrong-branch, wrong-SHA, production-looking or unconfirmed target fails before any request.
- Vercel deployment protection can be supplied from the operator environment, but the value is neither printed nor written.
- The harness proves only anonymous HTTP/publication boundaries. Authenticated owner/partner/RLS, MFA/recovery, Storage, WAF rate behavior, provider adapters, backup/restore and human accessibility still require their named staging scenarios.
