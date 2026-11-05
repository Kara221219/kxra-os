# Local paired setup routes and UI

Isolated branch `codex/paired-setup-ui`, based on accepted request/policy handoff `b2a9715cd6437fa80e1fc6902e4041af8fabb66e`. Story: a synthetic owner opens `/os/paired-setup`, selects an authorized room and own OPENAI model intent, saves a disabled-agent setup request through `/api/paired-setup`, then refreshes/reconciles or cancels it. No account key, pairing invitation, device credential, activation or execution is issued.

## Boundaries

Production conditional imports select a503 route and an unavailable page before identity/pool access. The local runtime requires explicit `KXRA_PAIRED_SETUP_UI_PROOF=1`, development fixture mode, loopback origin, generated session secret, no Vercel/Supabase/DB URL configuration and an owned recognized `/tmp/kxra-pas-*/.runtime/pas` runtime/socket/private config. Ordinary fixtures and hosted identities cannot switch this on. `.env.example` documents the default-off flag.

The harness generates a10-minute purpose-bound test cookie only in its own browser context; no public cookie/sign-in issuance endpoint exists. Signature, purpose, duplicate-cookie, expiry, ownership/configuration and session authority checks are enforced. It returns `source:fixture` and requires an opaque WeakSet-backed fixture boundary; it never relabels synthetic identity as Supabase. The same service still refuses arbitrary fixture principals without that internal boundary. Real identity/session integration remains unwired.

The unnumbered `paired-setup-options-v1.sql` proposal adds one fixed-search-path, scoped selector function after the accepted setup-policy SQL. It exports only authorized room IDs/names, own current-session OPENAI intent IDs/models and own request IDs/labels. It requires current owner MFA/session/membership and explicit authorized room access before any catalog data is returned. It exposes no provider key, account binding, review evidence or policy digest. It is not an activation function; all request mutations still use the accepted current SQL gates.

The UI uses existing KXRA colors/forms/buttons, responsive labels, keyboard focus and live status. Unknown request/cancellation outcomes remain held, disable other mutations and require explicit STATUS reconciliation. Recovered request metadata returns to saved status/cancel controls. Nothing automatically retries a request or inference; no localStorage/sessionStorage or persistent browser profile is used.

## Verification status

Relevant installed Next16.4.3 route/server/client/form documentation was read before app edits. React review and full-flow verification skills are applied. Initial29 focused boundary/setup/admission tests pass; types pass after local fixture-pool fixes. Native browser acceptance, final source review, production build and204800-byte budget checks are pending.

The exact-source `verify-paired-setup-ui.mjs` harness acquires its own shared native lease, uses the existing two owned Unix-socket clusters and26 accepted storage/setup scenarios, then launches only its own Next dev server and Chromium. It records route/DB assertions, desktop1440/mobile390 screenshots and browser runtime errors. It exercises save→SQL disabled agent→reload/status→cancel, lost-ACK hold/recovery without duplicate requests, and HTTP MFA/session/tenant/member denials. UI lifecycle receipts feed the outer cleanup/lease decision; uncertain UI cleanup must retain the lease. No existing browser session, real credentials or hosted service is used.

Independent early review found a UI pending-operation overwrite and missing recovered-list metadata; both were corrected and browser regressions cover the paths. Final executed evidence must replace pending acceptance before integration.

## Remaining gates

This is a standalone local fixture page/API, not a production auth or device flow. UI availability in the main room navigation, real verified server identity/session and CSRF integration, ephemeral customer device pairing, transport/operator review issuance, contained immutable launch, external-burn verification, atomic original-thread publication/status and independently administered restore/quiescence infrastructure remain open. Subscription compatibility and real installed CLI/tool/egress/provider acceptance remain separate. No hosted SQL/configuration, actual access grant, persistent credential, installation, provider call, deployment, publication or spend is authorized or performed here.
