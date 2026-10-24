# Local live-billing entry preparation

Base: `ef3fd35a3de916088fe422817fbf2a5e100418d8`. This slice adds files only. It is not live checkout, provider dispatch, hosted migration acceptance or production activation.

## Entry and authority

- `/billing` loads a private status for the server-selected verified customer tenant. `/api/live-billing` GET returns the same safe status; POST accepts only `action`, `request_id` UUID and approved `offer_key`. Bodies are strict and limited to 4 KiB; mutations reuse the existing same-origin guard. Responses are private/no-store.
- Runtime admission requires `KXRA_LIVE_BILLING_ENTRY_ENABLED=true`, `NODE_ENV=production`, the existing environment's exact Supabase project URL and a canonical HTTPS `KXRA_ORIGIN`. Production is fixed to `https://app.kxra-group.com`; staging requires the `kxra-os-staging*.vercel.app` hostname family. The flag is absent/off by default and was not set in this work. It does not enable the database activation row, mappings, Stripe or workers.
- `account()` supplies verified identity and selected active membership. The controller rejects every source except Supabase, unverified email, inactive account, non-customer organisation/relationship and non-ORG_ADMIN membership. Writes additionally require AAL2 authentication within 15 minutes, no more than one minute in the future, and the existing mandatory legal gate with `allowed=true` and `code=ALLOWED`.
- The adapter uses `query()` with that principal and parameterized values. `CUSTOMER` calls `kxra_private.request_live_customer_intent(uuid,text)` from0102. `CHECKOUT`, `PORTAL` and `RECONCILE` call `kxra_private.request_live_billing_intent(uuid,text,text)` from0100. Those SQL functions recheck current authority, mapping/activation, lane fences and replay identity; the HTTP controller does not replace them.
- `QUEUED` means the database reservation remains `REQUESTED`. Replayed later states are reported as `RECORDED`, with their actual request state. Both explicitly return `dispatch_ready=false` and `entitlement_authority=false`, no redirect or payment result. No provider network call exists here.

## New private read capability: migration0105

`kxra_private.own_live_billing_status()` has no tenant/user arguments. It derives `requested_org()` and `auth.uid()`, requires the application session user and verified active Supabase CUSTOMER/ORG_ADMIN membership, and reads only that tenant. Its security-definer search path is empty; PUBLIC/anon/worker execute is revoked and authenticated execute granted explicitly. It grants no table access and creates no tables or exposed-schema RPCs.

Safe output contains only coarse state, approved offer, internal original request UUID/kind/state and permitted request actions. No Stripe account/customer/price/product/session/subscription identifiers, mapping/terms hashes, email addresses or credential values are returned. Legacy/pilot state or quarantine requires review rather than conversion. Reads do not demand recent MFA or legal acceptance; consequential writes do.

The UI renders approved catalogue prices exactly: Starter £29 GBP/month for one user; Team £79 for up to five; Business £199 for up to15. It does not create new commercial terms or claim tax/AI/trial/refund terms are agreed. It keeps uncertain in-page mutations on the same UUID for retries; server status recovers the original durable request after reload. Unresolved requests cannot be advertised as new successful payments or access.

## Local evidence and limits

- `node --import tsx --test tests/live-billing-entry.test.ts`: 16 passing tests. Covers default-disabled/project/origin configuration, strict input rejection of identity/tenant/paid/provider fields, origin-before-work, identity states, recent MFA/legal checks, three plans/four reservation actions, same UUID replay, receipt failure and strict status output. React static rendering verifies prices, disabled state and original-request recovery presentation.
- `node_modules/.bin/tsc --noEmit --incremental false --pretty false`: passes for the complete checkout.
- New TS/TSX files pass Prettier checks; whitespace check passes.
- The initial `tsx` CLI invocation was blocked by its attempt to open an IPC pipe (`EPERM`). Node's direct `--import tsx` test loader runs these pure tests without that CLI listener. No application/browser/database server was started.
- SQL0105 has static contract tests only. No PostgreSQL execution, migration application, DB tenant acceptance, browser interaction, Next production build/artifact check or actual provider acceptance ran in this bounded task.

## Integration still required

1. Merge the billing worker's reserved0104 before0105. This checkout intentionally does not invent0104 or edit shared migration/count manifests. Update integration source migration totals after both slices;0105 adds one private function, no protected table/exposed KXRA function.
2. Apply the exact combined source in an authorized disposable database and test0105 with two tenants, missing/forged selected context, suspended/unverified/revoked membership, legacy lane, quarantine, pending/replayed reservations and no raw private-table grants. Exercise actual API/page and retry/reload behavior in the combined browser harness. Pure ports/static SQL assertions do not prove those runtime results.
3. Verify the combined production build/artifact boundary. Client code imports only the contract module and approved catalogue, never server configuration or a development fixture selector. Existing principal/database modules keep their established production aliases; no shared source file was changed here.
4. Dispatch is deliberately absent. A reviewed worker must claim/check currentness, use scoped real provider configuration, record safe receipts, reconcile authoritative events and enforce final payment/entitlement gates before any success/redirect can be exposed. Real checkout, charge, webhook, keys, settings and activation remain separate exact approvals and acceptance.
5. The new page is directly addressable but no shared navigation/signup flow was edited. Integrator must decide the approved entry link and eventual dispatcher wiring. Keep runtime/database activation disabled until final terms, secure setup and genuine hosted acceptance pass; do not treat this page as a paid launch.

No credentials, provider resources, hosted data/settings, catalogue records, staging holds, public marketing or source publication changed.

## Follow-up before integration

The activation lookup in0105 uses `billing_enabled` and qualified `a.enabled` to avoid PL/pgSQL column/variable ambiguity. No signup admission GUC is used by status or billing admission: existing verified GetUser/GetClaims identity in `account()`, the trusted application SQL session and active verified Supabase membership protect the entry independently of whether NEW signup is paused. The native status test explicitly turns both signup-related GUCs off while exercising existing billing reads.

The real reservation adapter now consumes the existing `kxra.consume_rate_limit` capability under scope `live-billing-entry`, maximum8 per900seconds, keyed by SHA256 of the server-resolved tenant and actor. All plans/actions/retries share this bucket. The controller calls it only after same-origin, strict request parsing, verified active CUSTOMER/ORG_ADMIN, recent MFA and current legal checks. Rejected/missing rate receipts return429 and never reserve an intent. No rate subject comes from request data, no new grant or credential was created, and no rate counter was consumed by this worker.

`tests/live-billing-entry-status.db.test.ts` is automatic test SOURCE, not an opt-in skipped test. It fails closed outside explicit generated native fixture mode, owner-private runtime/socket, local socket configuration, no credentials/connectionString/SSL, and actual PostgreSQL empty listen_addresses/socket match. It creates synthetic tenants inside one transaction and rolls back. Cases include disabled/fresh, customer pending, binding/checkout pending, quarantine review, forged selected tenant, revoked/unverified/member/anonymous/worker denial, own request recovery and strict omission of provider identifiers. It has not been executed by this worker; owner must run it after104/105 integration.
