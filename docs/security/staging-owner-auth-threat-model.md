# Staging owner and hosted Auth threat model

Updated: 27 September 2026.

| Threat | Enforced control | Remaining evidence |
| --- | --- | --- |
| Wrong Auth account becomes owner | Operator requires exact UUID, normalized email, confirmed/non-banned/non-deleted Auth user and exact staging project | Exercise against the authorized Supabase project |
| Existing owner is overwritten | Both normalized and legacy owner sets must contain no other owner; partial or conflicting target state stops | Inspect hosted failure output without exposing PII |
| Unreviewed source mutates staging | Apply requires the exact branch, clean tree, pushed HEAD, seed hash, runtime roles and confirmation phrase | Record actual source SHA during the staging run |
| SQL fabricates MFA | Preparation records `NOT_ENROLLED` unless Auth has a verified factor; final verify reads `auth.mfa_factors` and exact profile state | Confirm managed Auth schema behavior |
| Prepared owner is mistaken for complete | Final verify remains red; playbook requires immediate TOTP completion; consequential owner actions require fresh signed AAL2 | Keep the preview private during the bounded preparation window |
| Interrupted enrollment strands account | Factor listing reconciles the expected verified factor or removes the exact unverified KXRA factor before restart | Exercise refresh, provider timeout and retry in staging |
| Stale login passes recent-MFA gate | Hosted proof time comes from signed `amr.method=totp`, not initial password time; absent/malformed AMR fails | Inspect real JWT shape after challenge and refresh |
| TOTP secret leaks into KXRA data/logs | Only the private no-store response renders QR/manual secret; database and audit events retain only factor reference/state | Inspect Vercel logs, RSC payloads, caches and telemetry |
| Owner removes the only second factor | Ordinary owner remove action is rejected server-side and hidden in UI | Approve and rehearse a separate owner recovery runbook |
| Sign-out is recorded before provider revoke | Supabase global sign-out must succeed first; KXRA records `PROVIDER_CONFIRMED` afterward | Verify revoked refresh-token and access-token expiry behavior |
| Public/client role reads operator tracking | Bootstrap event table revokes `PUBLIC`, browser and both runtime roles | Verify managed grants/Data API exposure |

The owner operator does not activate legal requirements, billing, providers, public publication or production. A prepared owner is not customer-readiness evidence.
