# Completed checkout result recovery — local source only

Prepared from owner source `8ea2465`. Frozen107 dependencies were merged locally through `349d31b` and `a4bc0d1d38c6a1cc8989d9595b61b166ac5936c8` so the facade uses the actual attested-scope factory. The final delivery commit adds only new result/controller/route/0109/test/document files; integrate that commit after107, not the local dependency merge commits. The dependency merge retains108's member paid-proof assertions and uses the worker-frozen webhook files verbatim.

## Request and authority

`POST /api/live-billing/result` accepts only `{request_id: UUID}` with same-origin checking, bounded JSON and private/no-store/no-referrer response. HTTP POST expresses an authenticated read; every provider operation in this slice is GET. There is no HTTP mode, actor, tenant, provider-session ID, URL, offer, paid or entitlement input. PORTAL is unsupported and fails the strict CHECKOUT-only path.

The new `KXRA_CHECKOUT_RESULT_ENABLED` flag is absent/off by default. Configuration also requires production Node mode, exact staging/production project and canonical HTTPS origin. Only server environment selects STAGING_SANDBOX/staging or LIVE/production. Signup admission and entry-enabled flags do not authorize or disable an existing customer's result read. No runtime flag was changed here.

Existing `account()` verifies the Supabase principal and server-selected membership. The controller requires verified active CUSTOMER/ORG_ADMIN, recent AAL2 MFA and current mandatory legal acceptance before consuming an8-per900-second server actor/tenant-derived read budget. Missing/wrong-mode server key fails closed. No credentials were inspected or created by this worker.

## Two short SQL fences

Migration0109 adds fixed-mode authenticated capabilities:

- `live_checkout_result_context(uuid)` / `live_checkout_result_current(uuid,text)`;
- `staging_sandbox_checkout_result_context(uuid)` / `staging_sandbox_checkout_result_current(uuid,text)`.

Their shared private core is not callable by authenticated/anon/worker roles. It requires trusted application session/current active verified customer owner, current MFA/legal state, immutable107 scope, scoped customer binding, original request actor, CHECKOUT/CONSUMED state with durable session ID/result hash, unexpired intent, matching intent/binding generation, current approved mapping/tax/terms/policy/document and enabled activation. No bearer URL or redirect is stored or passed to SQL. A generation digest binds scope, intent, binding, mapping, policy and membership/account versions. Each facade `query()` commits before provider IO. A new independent post-query repeats all authority checks and compares the digest; revocation, expiry, reconfiguration or stale generation prevents delivery.

This is deliberately conservative: recovery is limited to the original request creator and the original intent lifetime, even if Stripe's open session lasts longer. Expired/uncertain requests require reviewed reconciliation; no replacement session is automatically created.

## Provider validation and output

With the actual107 factory bound to private runtime identity/key, the read adapter GETs exactly account, current expanded price/product, customer and the already-bound CheckoutSession. Requests have redirect refusal, no-cache, bounded streams (100KB each),8-second per-read and20-second total provider deadlines. No POST, idempotency retry, mutation or raw provider object reaches the browser.

Checks include account identity/charges capability and its terms URL; reviewed catalogue/mode/current active GBP monthly price/product/tax behavior; customer scope/tenant/offer provenance; exact bound session and client-reference UUID, open/unpaid subscription mode, unexpired time, card-only/no promotions or discounts/shipping, one line/quantity, same current expanded price, tax configuration, required terms consent/custom wording/presentation hash, scope metadata and exact same-origin success/cancel destinations. The URL must be HTTPS `checkout.stripe.com/c/pay/<that bound session>` with no credentials or port. The real Stripe fragment is preserved.

Only after the final SQL fence returns true does the route return `state:READY`, original request UUID, validated URL/expiry, `delivery_ready:true`, `dispatch_ready:false`, `entitlement_authority:false`. The URL exists transiently in the response; it is not an access entitlement or proof of collection. This slice does not make queued requests execute or claim the overall dispatcher is ready.

The provider's required account terms URL must equal the separately reviewed policy URL. No account/legal/tax setting is changed to make that pass. Missing terms/tax/current policy stays unavailable.

## Evidence and remaining gates

- `node --import tsx --test tests/checkout-result.test.ts`:12 passing pure injected-transport tests, including LIVE and STAGING_SANDBOX, negative authority/scope/mode/account/price/customer/session/terms/URL cases, stale fences, bounded reads and expiry during IO. These are synthetic protocol tests, not actual Stripe calls.
- New files pass Prettier/whitespace checks. Full TypeScript currently reports one pre-existing dependency integration error: `tests/live-webhook.db.test.ts:59` still supplies staging project to the newly production-only LIVE webhook endpoint. No new result-file type errors remain. That dependency test was not edited or excluded to manufacture a full pass.
- `tests/checkout-result.db.test.ts` is automatic SOURCE only, not executed here. It hard-requires generated private credential-free Unix-socket/no-TCP fixture; binds a synthetic immutable107 scope; covers unfinished/no-policy rejection, valid completed context, wrong mode/actor/tenant/role, current generation, changed membership/policy/revocation/unverified state and absence of URL columns. All synthetic writes roll back. Owner must run it against the final exact107–109 source in separate fixed-mode fixtures.
- Production build/artifact, API/browser result UI, genuine scoped sandbox provider GETs, concurrency revocation acceptance, approved terms/tax resources, credential handoff and eventual live activation remain separate gates. No real provider account setup, key/webhook creation, hosted SQL, checkout activation, deployment, staging hold change, charge or publication occurred.

The Stripe retrieval/object references consulted were https://docs.stripe.com/api/checkout/sessions/retrieve and https://docs.stripe.com/api/checkout/sessions/object. API remains the repository's reviewed `2025-07-30.basil` scope; genuine pinned-version acceptance still must run.
