# Production eligibility and setup handoff

Read against accepted9e2fe569 and the additive hosted release guard. This is an exact implementation handoff; it does not change hosted configuration, terms, model keys, pricing or customer authority.

## Provider eligibility: next narrow implementation

Owner: admission engineer with room-execution and release review. Reuse migration0115's current declarations/policies/reviews and `business_current_review(org,customer,scope,offer,mapping,terms)`. That predicate currently binds checkout, not the actual model connection. Its declaration provider is free text; it must not be treated as a typed provider/endpoint/model authorization. Do not change the existing billing RPC signatures or invent a browser-owned eligible flag.

Relevant code:

- `apps/os/app/api/team-space/[[...path]]/route.ts`: current actor, same-origin and `/connections`/room run routes.
- `apps/os/lib/team-workspace.ts`: `saveTeamConnection` parses/validates endpoint and encrypts before `team_connection_save`; `prepareTeamAgent` pins context; `executePreparedTeamAgent` obtains connection through run/job dispatch, checks readiness and then calls `generate`.
- `packages/workspace/provider.ts`: `connectionInput`, fixed provider protocols/approved compatible endpoints, `openKey`, `generate`, default-off external-provider gate and finite redacted errors. AI custody is the existing tenant/connection-bound `KXRA_MODEL_VAULT_KEY` path; the fake GitHub custody process is unrelated.
- `supabase/migrations/0083`–`0088`: model connections, run/context/memory readiness and durable jobs;0114 adds hosted worker/grant dispatch.0115 is checkout admission. Review the actual functions before modifying them; preserve RLS/fresh identity/current paid authority/source checks and no-replay behavior.

Deliverable: an additive server-owned provider authorization binding/resolver using the actual connection ID/version, typed provider, approved endpoint/model, current declaration/review/policy and relevant legal/payment state. Define account/tenant authority explicitly; caller input may choose a connection, never supply actor/tenant/review authority. Fence connection creation/re-enable and existing connection execution. Recheck before stored-key decryption/network, at queued claim/dispatch and publication as appropriate. A changed country/provider/endpoint/model or expired/withdrawn review cannot reuse prior authority. Preserve disconnect/cancel/history/support recovery even when new use is denied.

Keep the implementation scoped to the existing on-demand BYOK path first; if shared run/job functions are changed, retain their tests and stop controls. Do not create a new vault/gateway, KXRA-funded fallback, real-key importer or broad scheduler feature. New SQL should be a separately reviewed candidate with release-owned numbering/cohort. The new hosted guard must reject it until its exact production manifest/policy update is reviewed; do not bypass that guard or reuse fixture0118/0119 slots in this feature lane.

Required focused evidence: missing/blocked/review-required/expired/withdrawn authority; provider mismatch after checkout; changed declaration or endpoint/model; wrong tenant/member/session; key/connection revoke during wait; on-demand and any affected queued boundary; zero decryption/provider calls on rejection; no secret in DTO/log/error; no paid fence bypass or automatic regrant; unchanged receipt/history and no uncertain replay. Use injected synthetic key/transport seams and owned disposable SQL fixtures for these exact contracts. No new broad synthetic slice is required. Real provider request/model/account/cost-cap acceptance remains separate.

## Setup guidance: independently actionable UI work

Owner: customer UI engineer; use current server projections and preserve the OS204800-byte limit (accepted9e headroom182 bytes). Add no secret/client entitlement authority.

- `SelfServiceSignup` and `hosted-self-service.ts`: reuse register→verify→provision/recover, same canonical workspace/request receipt. Don't duplicate accounts, emails or owner recovery.
- `app/onboarding/page.tsx` and `OnboardingStepForm`: customer-aware wording instead of unconditional “Partner onboarding”; retain resumption, MFA and legal requirements.
- `/billing`, `BusinessAdmission`, `LiveBillingEntry`, `LiveWorkspaceAccess`: expose current review/terms/payment/pending/reconciliation states with next actions. URL return never grants paid access. Keep portal/cancellation/history available under their current authority.
- `WorkspaceStart`, `workspace-start.ts`, `live-start-presentation.ts`: distinguish account ready, legal/business review current, authoritative payment, configured model, accepted provider capability, and first useful room/run. A saved key, enabled flag or paid proof alone must not mark provider execution accepted.
- `TeamWorkspace` model connection form and existing `/os/workspace` route: direct the user to connect a supported customer-owned account, create/recover a room, select approved context, request one draft, and find the durable result/error. Do not send keys through status props or duplicate saved-secret inputs. Preserve the provider-cost acknowledgement and disclosure that context transits KXRA.
- `execution-readiness.ts` currently hardcodes worker implementation blockers despite0114's default-off hosted implementation. Reconcile configured/implemented/accepted/activated states from reviewed server-owned facts; never set hosted/provider acceptance true merely from configuration. Room scheduling may remain excluded from first release.

Deliverable: one resumable progress projection and minimal navigation/copy over existing routes, with desktop/mobile checks for interrupted signup, unpaid/blocked review, abandoned/delayed checkout, proof expiry, invalid/revoked connection and recoverable first-run error. Keep scope truthful; paired CLI, GitHub actions and schema apps remain separate rollout gates. Prefer server/lazy composition over extra eager client code.

## Required outside inputs; don't ask broad questions again

Existing workspace prices/seats, customer-paid BYOK and worldwide business intent are settled. The commercial/release owner must supply exact current terms/publication bytes and disposition of the older failed-renewal/read-only versus current zero-grace conflict. Actual policy/provider-country/tax evidence is not supplied by a free-text declaration. Read-only target inventory and named secret/workload bindings come from authorized account owners; secret values/passwords/financial records never belong in chat. A specific AI request or payment, hosted schema/role/configuration changes and deployment require their respective concrete target/action approval. None is requested or performed by this handoff.
