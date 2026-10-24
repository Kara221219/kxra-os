import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import {
  deliverCheckoutResult,
  type CheckoutResultDependencies,
  type CheckoutResultMode,
  type CheckoutResultConfiguration,
} from "../packages/integrations/checkout-result";
import { checkoutTermsPresentationDigest } from "../packages/integrations/live-checkout-consent";
import {
  authorizedCheckoutResult,
  checkoutResultConfiguration,
} from "../packages/authz/checkout-result-controller";
const now = 1_800_000_000,
  uuid = (n: number) =>
    `${String(n).padStart(8, "0")}-0000-4000-8000-000000000001`;
function fixture(mode: CheckoutResultMode = "LIVE") {
  const live = mode === "LIVE",
    scope = {
      scope_id: uuid(4),
      execution_mode: mode,
      project_ref: live ? "lhbgeucifxxcdoyrnesf" : "jlebgsxcvhvpueuibekd",
      account_id: live ? "acct_1Rv3KdC84VkhhIRz" : "acct_syntheticsandbox",
      api_version: "2025-07-30.basil" as const,
      catalogue_revision: 1,
      scope_sha256: "a".repeat(64),
      livemode: live,
    };
  const origin = live
      ? "https://app.kxra-group.com"
      : "https://kxra-os-staging-synthetic.vercel.app",
    terms = "b".repeat(64),
    tax = "c".repeat(64),
    url = `${origin}/legal/terms?sha256=${terms}`;
  const presentation = {
    terms_review_sha256: terms,
    terms_url: url,
    message: `Accept [Terms](${url})`,
    presentation_sha256: "",
  };
  presentation.presentation_sha256 =
    checkoutTermsPresentationDigest(presentation);
  const catalogue = [
    {
      offer_key: "KXRA_STARTER_V1",
      price_id: live
        ? "price_1UTbq7C84VkhhIRzkBHEHivV"
        : "price_syntheticstarter",
      product_id: live ? "prod_VUb2kv7rUiTeiu" : "prod_syntheticstarter",
      monthly_amount_minor: 2900,
      people: 1,
      currency: "gbp" as const,
      interval: "month" as const,
    },
  ];
  const cfg: CheckoutResultConfiguration = {
    execution_scope: scope,
    enabled: true,
    review_sha256: "d".repeat(64),
    catalogue,
  };
  const sid = `cs_${live ? "live" : "test"}_synthetic123456`,
    customerId = "cus_synthetic123456",
    principal = { actor_id: uuid(1), org_id: uuid(2) },
    request = { request_id: uuid(3) };
  const intent = {
    id: request.request_id,
    ...principal,
    kind: "CHECKOUT",
    state: "CONSUMED",
    customer_id: customerId,
    provider_session_id: sid,
    offer_key: catalogue[0].offer_key,
    mapping_revision: 1,
    terms_review_sha256: terms,
    observed_version: 7,
    created_at: now - 20,
    expires_at: now + 600,
  };
  const snapshot = {
    execution_scope: { ...scope },
    attestation: cfg,
    generation_sha256: "e".repeat(64),
    intent,
    binding_version: 7,
    mapping: {
      account_id: scope.account_id,
      price_id: catalogue[0].price_id,
      product_id: catalogue[0].product_id,
      offer_key: catalogue[0].offer_key,
      revision: 1,
      terms_review_sha256: terms,
      tax_review_sha256: tax,
      tax_behavior: "inclusive",
      automatic_tax: false,
      payment_method: "card",
    },
    presentation,
  };
  const scopeMetadata = {
    kxra_execution_scope: scope.scope_id,
    kxra_execution_mode: scope.execution_mode,
    kxra_execution_sha256: scope.scope_sha256,
    kxra_execution_project: scope.project_ref,
  };
  const price = {
    id: catalogue[0].price_id,
    object: "price",
    livemode: live,
    active: true,
    currency: "gbp",
    unit_amount: 2900,
    type: "recurring",
    billing_scheme: "per_unit",
    tax_behavior: "inclusive",
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    product: {
      id: catalogue[0].product_id,
      object: "product",
      livemode: live,
      active: true,
    },
  };
  const customer = {
    id: customerId,
    object: "customer",
    livemode: live,
    metadata: {
      ...scopeMetadata,
      kxra_org: principal.org_id,
      kxra_offer: intent.offer_key,
      kxra_mapping_revision: "1",
      kxra_terms_sha256: terms,
    },
  };
  const session = {
    id: sid,
    object: "checkout.session",
    livemode: live,
    customer: customerId,
    url: `https://checkout.stripe.com/c/pay/${sid}#synthetic`,
    created: now - 10,
    expires_at: now + 900,
    mode: "subscription",
    status: "open",
    payment_status: "unpaid",
    client_reference_id: intent.id,
    currency: "gbp",
    amount_subtotal: 2900,
    success_url: `${origin}/os/start?billing=returned`,
    cancel_url: `${origin}/os/start?billing=cancelled`,
    total_details: { amount_discount: 0, amount_shipping: 0 },
    payment_method_types: ["card"],
    allow_promotion_codes: false,
    automatic_tax: { enabled: false },
    consent_collection: { terms_of_service: "required" },
    custom_text: {
      terms_of_service_acceptance: { message: presentation.message },
    },
    metadata: {
      ...scopeMetadata,
      kxra_live_intent_id: intent.id,
      kxra_catalogue_offer: intent.offer_key,
      kxra_mapping_revision: "1",
      kxra_terms_sha256: terms,
      kxra_consent_presentation_sha256: presentation.presentation_sha256,
    },
    line_items: {
      object: "list",
      has_more: false,
      data: [{ quantity: 1, price: structuredClone(price) }],
    },
  };
  const responses = {
    account: {
      id: scope.account_id,
      object: "account",
      charges_enabled: true,
      business_profile: { terms_of_service_url: presentation.terms_url },
    },
    price,
    customer,
    session,
  };
  const calls: string[] = [],
    events: string[] = [];
  let transaction = false;
  const deps: CheckoutResultDependencies = {
    enabled: true,
    nodeEnv: "production",
    origin,
    key: `sk_${live ? "live" : "test"}_${"synthetic".repeat(4)}`,
    expectedMode: mode,
    prepare: async (id, p) => {
      events.push("pre");
      assert.equal(id, request.request_id);
      assert.deepEqual(p, principal);
      transaction = true;
      const copy = structuredClone(snapshot);
      transaction = false;
      return copy;
    },
    confirm: async (id, g, p) => {
      events.push("post");
      assert.equal(transaction, false);
      assert.equal(id, request.request_id);
      assert.equal(g, snapshot.generation_sha256);
      assert.deepEqual(p, principal);
      return true;
    },
    validateConfiguration: (a, key, m) => {
      events.push("attest");
      assert.ok(key);
      assert.equal(m, mode);
      assert.deepEqual(a, cfg);
      return cfg;
    },
    transport: async (target, init) => {
      assert.equal(transaction, false);
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "error");
      assert.equal(init.body, undefined);
      assert.ok(!new Headers(init.headers).has("Idempotency-Key"));
      calls.push(target);
      events.push("GET");
      const value = target.endsWith("/account")
        ? responses.account
        : target.includes("/prices/")
          ? responses.price
          : target.includes("/customers/")
            ? responses.customer
            : responses.session;
      return new Response(JSON.stringify(value));
    },
    nowSeconds: () => now,
  };
  return { deps, snapshot, responses, request, principal, calls, events, cfg };
}
for (const mode of ["LIVE", "STAGING_SANDBOX"] as const)
  test(`${mode}: completed canonical checkout URL is delivered only after two fences and four GETs`, async () => {
    const f = fixture(mode),
      value = await deliverCheckoutResult(f.deps, f.request, f.principal);
    assert.equal(value.state, "READY");
    assert.equal(value.delivery_ready, true);
    assert.equal(value.dispatch_ready, false);
    assert.equal(value.entitlement_authority, false);
    assert.equal(f.calls.length, 4);
    assert.equal(f.events[0], "pre");
    assert.equal(f.events.at(-1), "post");
    for (const key of [
      "customer_id",
      "price_id",
      "subscription_id",
      "account_id",
      "provider_session_id",
    ])
      assert.ok(!(key in value));
    assert.equal(value.url, f.responses.session.url);
    assert.deepEqual(f.snapshot.intent.state, "CONSUMED");
  });
test("disabled/missing/wrong mode key and forbidden input refuse provider reads", async () => {
  for (const change of [
    { enabled: false },
    { nodeEnv: "development" },
    { key: undefined },
    { key: "sk_test_" + "synthetic".repeat(4) },
  ]) {
    const f = fixture();
    Object.assign(f.deps, change);
    await assert.rejects(deliverCheckoutResult(f.deps, f.request, f.principal));
    assert.equal(f.calls.length, 0);
  }
  for (const extra of [
    { action: "PORTAL" },
    { org_id: uuid(9) },
    { url: "https://evil.invalid" },
    { mode: "STAGING_SANDBOX" },
  ]) {
    const f = fixture();
    await assert.rejects(
      deliverCheckoutResult(f.deps, { ...f.request, ...extra }, f.principal),
    );
    assert.equal(f.calls.length, 0);
  }
});
test("only same actor/tenant durable completed current generation is eligible", async () => {
  for (const patch of [
    { actor_id: uuid(8) },
    { org_id: uuid(8) },
    { state: "INFLIGHT" },
    { kind: "PORTAL" },
    { expires_at: now },
    { observed_version: 8 },
    { provider_session_id: "cs_test_wrongmode123" },
  ]) {
    const f = fixture();
    Object.assign(f.snapshot.intent, patch);
    await assert.rejects(deliverCheckoutResult(f.deps, f.request, f.principal));
    assert.equal(f.calls.length, 0);
  }
});
test("scope drift or missing tax/terms rejects before provider IO", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.snapshot.execution_scope.scope_sha256 = "f".repeat(64);
    },
    (f: ReturnType<typeof fixture>) => {
      f.snapshot.mapping.tax_review_sha256 = "";
    },
    (f: ReturnType<typeof fixture>) => {
      f.snapshot.presentation.message = "Unreviewed";
    },
    (f: ReturnType<typeof fixture>) => {
      f.snapshot.mapping.revision = 2;
    },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(deliverCheckoutResult(f.deps, f.request, f.principal));
    assert.equal(f.calls.length, 0);
  }
});
test("account/current price and customer provenance must match bound canonical scope", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.responses.account.id = "acct_wrongaccount";
    },
    (f: ReturnType<typeof fixture>) => {
      f.responses.price.unit_amount = 4900;
    },
    (f: ReturnType<typeof fixture>) => {
      f.responses.price.active = false;
    },
    (f: ReturnType<typeof fixture>) => {
      f.responses.price.livemode = false;
    },
    (f: ReturnType<typeof fixture>) => {
      f.responses.customer.id = "cus_wrongtenant";
    },
    (f: ReturnType<typeof fixture>) => {
      f.responses.customer.metadata.kxra_org = uuid(9);
    },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(deliverCheckoutResult(f.deps, f.request, f.principal));
    assert.ok(!f.events.includes("post"));
  }
});
test("provider session must be open, current, correctly scoped and exactly priced with consent", async () => {
  for (const patch of [
    { status: "complete" },
    { expires_at: now },
    { livemode: false },
    { customer: "cus_wrongcustomer" },
    { client_reference_id: uuid(9) },
    { amount_subtotal: 4900 },
    { url: "https://evil.invalid/c/pay/something" },
    { url: "https://checkout.stripe.com.attacker.invalid/c/pay/something" },
    { url: "https://checkout.stripe.com/c/pay/cs_live_other1234" },
    { url: "https://user:secret@checkout.stripe.com/c/pay/other" },
  ]) {
    const f = fixture();
    Object.assign(f.responses.session, patch);
    await assert.rejects(deliverCheckoutResult(f.deps, f.request, f.principal));
    assert.ok(!f.events.includes("post"));
  }
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.responses.session.line_items.data[0].quantity = 2;
    },
    (f: ReturnType<typeof fixture>) => {
      f.responses.session.line_items.has_more = true;
    },
    (f: ReturnType<typeof fixture>) => {
      f.responses.session.metadata.kxra_execution_sha256 = "f".repeat(64);
    },
    (f: ReturnType<typeof fixture>) => {
      f.responses.session.custom_text.terms_of_service_acceptance.message =
        "Changed terms";
    },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(deliverCheckoutResult(f.deps, f.request, f.principal));
  }
});
test("late revocation/version fence failure suppresses URL delivery, no provider mutation or URL persistence", async () => {
  const f = fixture();
  f.deps.confirm = async () => false;
  await assert.rejects(
    deliverCheckoutResult(f.deps, f.request, f.principal),
    /FINAL_FENCE/,
  );
  assert.equal(f.calls.length, 4);
  const source = fs.readFileSync(
    "packages/integrations/checkout-result.ts",
    "utf8",
  );
  assert.ok(
    !/method: *["']POST|writeFile|localStorage|sessionStorage/.test(source),
  );
});
test("bounded responses and failed provider reads never return partial URL", async () => {
  const f = fixture();
  f.deps.transport = async () => new Response("x".repeat(100_001));
  await assert.rejects(
    deliverCheckoutResult(f.deps, f.request, f.principal),
    /PROVIDER_READ/,
  );
  const denied = fixture();
  denied.deps.transport = async () => new Response("denied", { status: 403 });
  await assert.rejects(
    deliverCheckoutResult(denied.deps, denied.request, denied.principal),
    /PROVIDER_UNAVAILABLE/,
  );
});
test("route-level controller requires server verified admin, recent MFA/legal then rate", async () => {
  const who = {
    id: uuid(1),
    organisation_id: uuid(2),
    source: "supabase" as const,
    email_verified: true,
    account_state: "ACTIVE",
    organisation_kind: "CUSTOMER",
    relationship_type: "CUSTOMER",
    security_role: "ORG_ADMIN",
    aal: "aal2" as const,
    auth_time: now,
  };
  const config = () =>
    checkoutResultConfiguration({
      KXRA_CHECKOUT_RESULT_ENABLED: "true",
      NODE_ENV: "production",
      KXRA_ENVIRONMENT: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://lhbgeucifxxcdoyrnesf.supabase.co",
      KXRA_ORIGIN: "https://app.kxra-group.com",
    });
  assert.equal(checkoutResultConfiguration({}), null);
  const events: string[] = [];
  const ports = {
    sameOrigin: () => {
      events.push("origin");
    },
    account: async () => who,
    configuration: config,
    legalAllowed: async () => {
      events.push("legal");
      return true;
    },
    consumeReadRate: async () => {
      events.push("rate");
      return true;
    },
    deliver: async () => {
      events.push("deliver");
      return { state: "READY" };
    },
    now: () => now * 1000,
  };
  await authorizedCheckoutResult(ports, { request_id: uuid(3) });
  assert.deepEqual(events, ["origin", "legal", "rate", "deliver"]);
  for (const identity of [
    { ...who, source: "fixture" as const },
    { ...who, aal: "aal1" as const },
    { ...who, security_role: "ORG_MEMBER" },
    { ...who, auth_time: now - 901 },
  ]) {
    events.length = 0;
    await assert.rejects(
      authorizedCheckoutResult(
        { ...ports, account: async () => identity },
        { request_id: uuid(3) },
      ),
    );
    assert.ok(!events.includes("rate"));
  }
  events.length = 0;
  await assert.rejects(
    authorizedCheckoutResult(
      { ...ports, legalAllowed: async () => false },
      { request_id: uuid(3) },
    ),
  );
  assert.ok(!events.includes("rate"));
  events.length = 0;
  await assert.rejects(
    authorizedCheckoutResult(
      { ...ports, consumeReadRate: async () => false },
      { request_id: uuid(3) },
    ),
  );
  assert.ok(!events.includes("deliver"));
});

test("unreviewed account terms, foreign return destinations and discounts cannot be delivered", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.responses.account.business_profile.terms_of_service_url =
        "https://evil.invalid/terms";
    },
    (f: ReturnType<typeof fixture>) => {
      f.responses.session.success_url = "https://evil.invalid/return";
    },
    (f: ReturnType<typeof fixture>) => {
      f.responses.session.total_details.amount_discount = 1;
    },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(deliverCheckoutResult(f.deps, f.request, f.principal));
    assert.ok(!f.events.includes("post"));
  }
});

test("expiry during provider read is rechecked after the final SQL fence", async () => {
  const f = fixture();
  let current = now;
  f.deps.nowSeconds = () => current;
  f.deps.confirm = async () => {
    current = now + 1000;
    return true;
  };
  await assert.rejects(
    deliverCheckoutResult(f.deps, f.request, f.principal),
    /FINAL_FENCE_REJECTED/,
  );
});
