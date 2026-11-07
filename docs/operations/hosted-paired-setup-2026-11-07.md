# Hosted request-only paired setup preparation

This isolated branch starts at b763774d86c28b64b5549662feb5a20d3a509fc7. It replaces the permanent production setup placeholder with default-off server composition of the existing request, options, status and cancel operations. No device invitation, bearer, credential, provider access, installation, execution, publication or payment is added or activated.

## Runtime and customer flow

The server requires KXRA_PAIRED_SETUP_ENABLED=true plus the existing production-mode, exact project and HTTPS origin configuration. Neither .env.example nor hosted settings changed. Identity resolves through the existing Supabase actor and authenticated RLS query, never a request-body identity. AAL2 must be recent, the original provider session UUID must be present, and its issued epoch must equal the current account epoch.

Every operation additionally invokes kxra_paired_admission.hosted_setup_session_current() in a SQL CASE before its existing setup RPC. Missing or false guard fails closed. This helper is a mandatory dependency of the separately reviewed paired-setup-session SQL payload, not implemented or installed by this branch. Signed JWT claims alone are not treated as proof that an Auth session still exists. The SQL composition must preserve original session binding and serialize revocation with setup operations, including direct RPCs.

The route pins Host and Origin, rejects forwarded-host overrides, accepts only the strict four commands, limits JSON to 8 KiB and three seconds, handles aborts before query dispatch, and returns bounded nonsecret DTOs. The server retains canonical schema validation. A small client-only projection validator avoids shipping the full schema library; it cannot grant authority. Agents remain disabled and all receipts require activation_allowed=false and credential_issued=false.

The shared form now distinguishes exact pre-write error/status pairs from uncertain outcomes. Definitively rejected REQUEST/CANCEL clears its pending state. A rejected STATUS does not clear an earlier unknown request. Network, malformed, generic/proxy and SQL failures stay held; no automatic resubmission is added. Recent-MFA/session errors give reauthentication guidance.

## Source composition and verification

The new hosted-paired-setup-v1 manifest pins the complete runtime/test overlay and four exact old/new transitions, including the historical paired-composition test. All historical release manifests, SQL proposals, numbered migrations and environment examples remain byte-identical. The verifier refuses unknown edits, wrong prior hashes or enabled/authorized claims. Later combined payment-overlay composition needs an explicitly reviewed transition for the payment test; it must not rewrite the historical paired manifest.

Observed verification on this candidate:

- 35 focused tests passed, including hosted request boundaries, read abort/deadline, no replay on uncertainty, client projection rejection, exact overlay tamper tests and historical paired/apps/session composition regressions.
- Lint, type checks, formatting, dependency policy and secret scan passed.
- OS, marketing and email-worker production builds passed using their preinstalled pinned dependencies. The first marketing build correctly stopped when its workspace dependency link was missing; linking the existing app-specific dependencies resolved this without install or download.
- The first production setup client exceeded the unchanged 200 KiB page budget. Removing unnecessary client schema-library runtime reduced the largest OS page to 199.5 KiB. No budget increase occurred.
- Production artifact scan excluded all 42 fixture/secret markers, and actual built loopback HTTP showed the default-off 503 plus paused page with no setup controls. This does not prove enabled hosted operation.
- Independent source review found the recovery issue and the underlying SQL original-session gap. Recovery is fixed here; the SQL lane owns the session fence prerequisite.

Final exact-commit build/HTTP receipts are recorded separately after committing. Full combined canonical service/restart/restore and enabled desktop/mobile/Auth acceptance must run in the release integration lane. No live credentials, customer records, real provider calls, hosted SQL, grants, deploys or charges were used.

## Remaining production dependencies

1. Reviewed genuine migration cohort and paired setup original-session predicate/fence/helper, including negative and concurrent revocation tests. The old fixture migrations are never promoted.
2. Actual Supabase Auth build, service identity and INSERT/capture-before-hook ordering, hook activation and real session/refresh/logout/MFA verification. A synthetic fixture cannot establish these facts.
3. Real customer device redemption, scoped device authority, accepted CLI containment/authentication, independent execution fence, launch/publication and full customer journey.
4. GitHub installation/broker/custody/worker/rate/receipt wiring and live provider acceptance remain separate. The existing product connector 503s are deliberate unavailable routes, not proven infrastructure outages.

Read-only platform checks on 7 November succeeded: Vercel listed all six KXRA projects; Supabase reported KXRA Staging ACTIVE_HEALTHY on PostgreSQL 17.6.1.166. These facts do not imply application readiness, migrated schema or Auth transaction ordering.

## Combined cancellation overlay

Merged complete reviewed payment tip e646d8a71798fe900f269d8752822c1d2bb60d3f, including runtime guard eb818e889ef0b71735c22a05f3bb655f95c3b914. The paired composition verifier now delegates exactly recognized payment source transitions to its strict old/new hash helper, otherwise uses the hosted setup overlay. Only the new hosted overlay hash for this composed test changed. All historical manifest bytes remain unchanged. Setup-only committed fbddf2f2d9b43dff8d86890c232f08084385d50a passed the exact OS build, budgets, artifact scan and actual default-off production HTTP proof; final combined source requires its own verification.
