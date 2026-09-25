# Marketing staging and release playbook

This playbook prepares a reviewable staging deployment. It does not authorize public release.

1. Create a separate Vercel project rooted at `apps/marketing`. Do not copy private OS, model, billing, Storage or provider secrets into it.
2. Create a dedicated PostgreSQL login outside Git. Grant it membership only in the anonymous ingress role and verify it cannot assume `authenticated`, read tables or call another KXRA function. Set its URL as `KXRA_PUBLIC_DATABASE_URL` in marketing staging only.
3. Generate a unique 64-plus-character `KXRA_PUBLIC_INGRESS_SECRET` in the provider secret store. Do not reuse the OS session/join secret.
4. Set `KXRA_MARKETING_ORIGIN` to the exact staging origin and `KXRA_PRIVATE_APP_URL` to the exact HTTPS OS staging login.
5. Deploy a preview from the reviewed commit. Keep production DNS, indexing and publication disabled.
6. Run AT-17, AT-26, AT-44 and AT-45 against the deployed output. Inspect HTML, scripts, RSC/prefetch, maps, headers, error responses and caches for every private marker.
7. Submit one synthetic enquiry. Confirm one `UNVERIFIED` owner-only row, one audit event, no anonymous/partner visibility, idempotent replay, a safe duplicate result and the sixth hourly request returning 429.
8. Verify 1440, 768, 390 and 320 widths, 200% text, keyboard order, visible focus, reduced motion, no JavaScript, representative screen readers and recorded Lighthouse/Core Web Vitals.
9. Replace legal placeholders only with solicitor-approved exact documents. Pin hashes and approval dates in the release manifest. Approve final copy, entity details, retention, privacy contact, support route and cookie behavior.
10. Request owner approval for the exact production deploy, DNS switch and indexing change. Record commit, artifact hashes, environment, rollback and approvers.

Rollback removes the marketing deployment/domain assignment and rotates the ingress secret/login if exposure is suspected. Database rows remain private evidence under the approved retention process.
