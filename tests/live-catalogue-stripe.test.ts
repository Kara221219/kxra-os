import { modernBillingFixture } from "./support/modern-billing-scope";
import {
  modernScopeMetadata,
  type ModernExecutionMode,
} from "../packages/integrations/modern-billing-scope";
import assert from "node:assert/strict";
import { checkoutTermsPresentationDigest } from "../packages/integrations/live-checkout-consent";
import test from "node:test";
import { createHmac } from "node:crypto";
import {
  createLiveCatalogueSession,
  createStagingSandboxCatalogueSession,
  verifyStagingSandboxCatalogueEvent,
  reconcileLiveCatalogue,
  verifyLiveCatalogueEvent,
  liveReceiptDecision,
  LIVE_STRIPE_API_VERSION,
  type LiveBillingDependencies,
} from "../packages/integrations/live-catalogue-stripe";

// Synthetic transport only. These placeholders are not credentials and never leave this process.
const now = 1_800_000_000;
const principal = {
  actor_id: "11111111-1111-4111-8111-111111111111",
  org_id: "22222222-2222-4222-8222-222222222222",
};
const intentId = "33333333-3333-4333-8333-333333333333";
const hash = "a".repeat(64);
const plans = [
  [
    "KXRA_STARTER_V1",
    "price_1UTbq7C84VkhhIRzkBHEHivV",
    "prod_VUb2kv7rUiTeiu",
    2900,
    1,
  ],
  [
    "KXRA_TEAM_V1",
    "price_1UTbrLC84VkhhIRzMN225zAr",
    "prod_VUb3rh9e9eNw5a",
    7900,
    5,
  ],
  [
    "KXRA_BUSINESS_V1",
    "price_1UTlt5C84VkhhIRzGztXl6ey",
    "prod_VUlPLWhBBf7lmP",
    19900,
    15,
  ],
] as const;
function fixture(
  plan = plans[0] as (typeof plans)[number],
  mode: ModernExecutionMode = "LIVE",
) {
  const scoped = modernBillingFixture(mode),
    scope = scoped.execution.execution_scope,
    row = scoped.execution.catalogue.find((r) => r.offer_key === plan[0])!;
  const mapping = {
    version: 1,
    mode: scope.livemode ? "live" : "staging_sandbox",
    enabled: true,
    account_id: scope.account_id,
    offer_key: plan[0],
    revision: 1,
    price_id: row.price_id,
    product_id: row.product_id,
    portal_configuration_id: "bpc_synthetic123",
    activation_review_sha256: hash,
    terms_review_sha256: hash,
    tax_review_sha256: hash,
    tax_behavior: "inclusive",
    automatic_tax: false,
    payment_method: "card",
  };
  const intent = {
    id: intentId,
    ...principal,
    kind: "CHECKOUT",
    state: "REQUESTED",
    customer_id: "cus_synthetic123",
    subscription_id: null as string | null,
    offer_key: plan[0],
    mapping_revision: 1,
    terms_review_sha256: hash,
    created_at: now - 20,
    expires_at: now + 1000,
  };
  const price = {
    id: row.price_id,
    object: "price",
    livemode: scope.livemode,
    active: true,
    currency: "gbp",
    unit_amount: Number(plan[3]),
    type: "recurring",
    billing_scheme: "per_unit",
    tax_behavior: "inclusive",
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    transform_quantity: null,
    custom_unit_amount: null,
    product: {
      id: row.product_id,
      object: "product",
      livemode: scope.livemode,
      active: true,
    },
  };
  const subscription = {
    id: "sub_synthetic123",
    object: "subscription",
    livemode: scope.livemode,
    customer: intent.customer_id,
    status: "active",
    cancel_at_period_end: false,
    metadata: {
      ...modernScopeMetadata(scope),
      kxra_live_intent_id: intentId,
      kxra_catalogue_offer: plan[0],
      kxra_mapping_revision: "1",
    },
    items: {
      data: [
        {
          id: "si_synthetic123",
          quantity: 1,
          current_period_start: now - 60,
          current_period_end: now + 3000,
          price,
        },
      ],
    },
  };
  const account = {
    id: mapping.account_id,
    object: "account",
    charges_enabled: true,
  };
  const customer = {
    id: intent.customer_id,
    object: "customer",
    livemode: scope.livemode,
  };
  const portalConfig = {
    id: mapping.portal_configuration_id,
    object: "billing_portal.configuration",
    active: true,
    livemode: scope.livemode,
    features: {
      subscription_update: { enabled: false },
      subscription_cancel: { enabled: true },
    },
  };
  const session: Record<string, unknown> = {
    id: scope.livemode ? "cs_live_synthetic123" : "cs_test_synthetic123",
    object: "checkout.session",
    livemode: scope.livemode,
    customer: intent.customer_id,
    url: "https://checkout.stripe.com/c/pay/synthetic",
    created: now,
    expires_at: now + 1800,
    mode: "subscription",
    status: "open",
    client_reference_id: intentId,
  };
  const calls: { url: string; init: RequestInit }[] = [];
  let providerStatus = 200;
  let rawResponse: string | null = null;
  const terms = {
    terms_review_sha256: hash,
    terms_url: `https://kxra.example/legal/terms?sha256=${hash}`,
    message: `Synthetic reviewed fixture [terms](https://kxra.example/legal/terms?sha256=${hash})`,
  };
  const deps: LiveBillingDependencies = {
    ...scoped,
    stillCurrent: async () => true,
    checkoutTerms: {
      ...terms,
      presentation_sha256: checkoutTermsPresentationDigest(terms),
    },
    runtime: {
      enabled: true,
      nodeEnv: "production",
      secretKey: scope.livemode
        ? "sk_live_SYNTHETIC_NOT_A_CREDENTIAL_000000"
        : "sk_test_SYNTHETIC_NOT_A_CREDENTIAL_000000",
      origin: "https://kxra.example",
    },
    nowSeconds: () => now,
    resolveIntent: async () => ({ intent, mapping, execution_scope: scope }),
    transport: async (url, init) => {
      calls.push({ url, init });
      let result: unknown;
      if (url.endsWith("/account")) result = account;
      else if (url.includes("/prices/")) result = price;
      else if (url.includes("/customers/")) result = customer;
      else if (url.includes("/subscriptions/")) result = subscription;
      else if (url.includes("/configurations/")) result = portalConfig;
      else result = session;
      return new Response(rawResponse ?? JSON.stringify(result), {
        status: providerStatus,
      });
    },
  };
  Object.assign(session, {
    consent_collection: { terms_of_service: "required" },
    custom_text: {
      terms_of_service_acceptance: { message: deps.checkoutTerms!.message },
    },
    metadata: {
      ...modernScopeMetadata(scope),
      kxra_live_intent_id: intentId,
      kxra_catalogue_offer: mapping.offer_key,
      kxra_mapping_revision: String(mapping.revision),
      kxra_terms_sha256: hash,
      kxra_consent_presentation_sha256: deps.checkoutTerms!.presentation_sha256,
    },
  });
  const binding = {
    customer_id: intent.customer_id,
    subscription_id: subscription.id,
    checkout_intent_id: intentId,
  };
  function event(overrides: Record<string, unknown> = {}) {
    return {
      id: "evt_synthetic123",
      object: "event",
      api_version: LIVE_STRIPE_API_VERSION,
      created: now - 10,
      type: "customer.subscription.updated",
      livemode: scope.livemode,
      data: { object: subscription },
      ...overrides,
    };
  }
  const endpoint = {
    ...scoped,
    enabled: true,
    mode: scope.livemode ? "live" : "staging_sandbox",
    account_id: mapping.account_id,
    api_version: LIVE_STRIPE_API_VERSION,
    signing_secret: "SYNTHETIC_ENDPOINT_SECRET_NOT_REAL_00000",
  };
  function signed(value = event()) {
    const raw = Buffer.from(JSON.stringify(value));
    const signature = `t=${now},v1=${createHmac("sha256", endpoint.signing_secret).update(`${now}.`).update(raw).digest("hex")}`;
    return { raw, signature };
  }
  return {
    mode,
    mapping,
    intent,
    price,
    subscription,
    account,
    customer,
    portalConfig,
    session,
    calls,
    deps,
    binding,
    endpoint,
    event,
    signed,
    status: (value: number) => (providerStatus = value),
    response: (value: string) => (rawResponse = value),
  };
}
const input = { intent_id: intentId };
const run = (f: ReturnType<typeof fixture>, data: unknown = input) =>
  (f.mode === "LIVE"
    ? createLiveCatalogueSession
    : createStagingSandboxCatalogueSession)(f.deps, data, principal);

for (const plan of plans)
  test(`${plan[0]}: canonical monthly workspace checkout, no access granted`, async () => {
    const f = fixture(plan);
    const result = await run(f);
    assert.equal(result.people, plan[4]);
    assert.equal(result.entitlement_authority, false);
    assert.equal(f.calls.length, 4);
    for (const { url, init } of f.calls) {
      assert.equal(new URL(url).origin, "https://api.stripe.com");
      assert.equal(init.redirect, "error");
      assert.ok(init.signal);
      assert.equal(
        (init.headers as Record<string, string>)["Stripe-Version"],
        LIVE_STRIPE_API_VERSION,
      );
    }
    const post = f.calls.at(-1)!;
    const body = new URLSearchParams(post.init.body as string);
    assert.equal(body.get("line_items[0][price]"), plan[1]);
    assert.equal(body.get("line_items[0][quantity]"), "1");
    assert.equal(
      body.get("success_url"),
      "https://kxra.example/os/start?billing=returned",
    );
    assert.equal(body.get("subscription_data[trial_period_days]"), null);
    assert.equal(body.get("allow_promotion_codes"), "false");
    assert.equal(body.get("consent_collection[terms_of_service]"), "required");
    assert.equal(body.get("metadata[kxra_terms_sha256]"), hash);
    assert.equal(
      body.get("metadata[kxra_consent_presentation_sha256]"),
      f.deps.checkoutTerms!.presentation_sha256,
    );
    assert.equal(body.get("payment_method_types[0]"), "card");
    await run(f);
    assert.equal(
      (f.calls.at(-1)!.init.headers as Record<string, string>)[
        "Idempotency-Key"
      ],
      (post.init.headers as Record<string, string>)["Idempotency-Key"],
    );
  });

for (const [label, mutate] of [
  ["absent runtime", (f) => (f.deps.runtime = undefined)],
  ["disabled", (f) => (f.deps.runtime!.enabled = false)],
  ["test environment", (f) => (f.deps.runtime!.nodeEnv = "test")],
  [
    "test key",
    (f) =>
      (f.deps.runtime!.secretKey = "sk_test_SYNTHETIC_NOT_A_CREDENTIAL_00000"),
  ],
  ["insecure origin", (f) => (f.deps.runtime!.origin = "http://kxra.example")],
  ["origin path", (f) => (f.deps.runtime!.origin += "/evil")],
  ["disabled mapping", (f) => (f.mapping.enabled = false)],
  ["sandbox mapping", (f) => (f.mapping.mode = "sandbox")],
  ["wrong mapping account", (f) => (f.mapping.account_id = "acct_other123")],
  ["unreviewed terms", (f) => (f.mapping.terms_review_sha256 = "")],
  ["unreviewed tax", (f) => (f.mapping.tax_review_sha256 = "")],
  ["unreviewed activation", (f) => (f.mapping.activation_review_sha256 = "")],
  ["legacy price", (f) => (f.mapping.price_id = "price_legacy499")],
  ["wrong product", (f) => (f.mapping.product_id = "prod_other123")],
  [
    "different actor",
    (f) => (f.intent.actor_id = "44444444-4444-4444-8444-444444444444"),
  ],
  [
    "different tenant",
    (f) => (f.intent.org_id = "44444444-4444-4444-8444-444444444444"),
  ],
  ["stale mapping revision", (f) => (f.intent.mapping_revision = 2)],
  ["changed terms", (f) => (f.intent.terms_review_sha256 = "b".repeat(64))],
  ["expired intent", (f) => (f.intent.expires_at = now)],
  ["long lived intent", (f) => (f.intent.expires_at = now + 10000)],
  [
    "existing subscription",
    (f) => (f.intent.subscription_id = "sub_synthetic123"),
  ],
] as [string, (f: ReturnType<typeof fixture>) => void][])
  test(`reject ${label} before transport`, async () => {
    const f = fixture();
    mutate(f);
    await assert.rejects(run(f));
    assert.equal(f.calls.length, 0);
  });
for (const extra of [
  { amount: 1 },
  { org_id: principal.org_id },
  { price_id: plans[2][1] },
  { people: 999 },
  { success_url: "https://evil.example" },
  { role: "OWNER" },
])
  test(`reject client authority ${Object.keys(extra)[0]}`, async () => {
    const f = fixture();
    await assert.rejects(run(f, { ...input, ...extra }));
    assert.equal(f.calls.length, 0);
  });
test("resolver denial is fail closed", async () => {
  const f = fixture();
  f.deps.resolveIntent = async () => null;
  await assert.rejects(run(f));
  assert.equal(f.calls.length, 0);
});
for (const [label, mutate] of [
  ["provider account", (f) => (f.account.id = "acct_other123")],
  ["charges disabled", (f) => (f.account.charges_enabled = false)],
  ["sandbox price", (f) => (f.price.livemode = false)],
  ["currency", (f) => (f.price.currency = "usd")],
  ["amount", (f) => (f.price.unit_amount = 49900)],
  ["interval", (f) => (f.price.recurring.interval = "year")],
  ["interval count", (f) => (f.price.recurring.interval_count = 2)],
  ["metered price", (f) => (f.price.recurring.usage_type = "metered")],
  ["inactive price", (f) => (f.price.active = false)],
  ["tax mismatch", (f) => (f.price.tax_behavior = "exclusive")],
  ["sandbox product", (f) => (f.price.product.livemode = false)],
  ["provider product", (f) => (f.price.product.id = "prod_other123")],
  ["sandbox customer", (f) => (f.customer.livemode = false)],
  ["customer mismatch", (f) => (f.customer.id = "cus_other123")],
] as [string, (f: ReturnType<typeof fixture>) => void][])
  test(`reject ${label} without a POST`, async () => {
    const f = fixture();
    mutate(f);
    await assert.rejects(run(f));
    assert.ok(f.calls.every((c) => c.init.method === "GET"));
  });
for (const [label, mutate] of [
  ["sandbox result", (f) => (f.session.livemode = false)],
  ["sandbox session", (f) => (f.session.id = "cs_test_synthetic123")],
  [
    "redirect host",
    (f) => (f.session.url = "https://checkout.stripe.com.evil.example/session"),
  ],
  [
    "redirect credentials",
    (f) => (f.session.url = "https://user:pass@checkout.stripe.com/session"),
  ],
  ["session customer", (f) => (f.session.customer = "cus_other123")],
  ["expired session", (f) => (f.session.expires_at = now - 1)],
  ["old session", (f) => (f.session.created = now - 5000)],
  [
    "wrong reference",
    (f) => (f.session.client_reference_id = principal.actor_id),
  ],
] as [string, (f: ReturnType<typeof fixture>) => void][])
  test(`reject ${label} without returning usable session`, async () => {
    const f = fixture();
    mutate(f);
    await assert.rejects(run(f));
  });
test("cancel-only portal uses server configuration and fixed return URL", async () => {
  const f = fixture();
  f.intent.kind = "PORTAL";
  f.intent.subscription_id = f.subscription.id;
  Object.assign(f.session, {
    id: "bps_synthetic123",
    object: "billing_portal.session",
    configuration: f.mapping.portal_configuration_id,
    url: "https://billing.stripe.com/p/session/synthetic",
  });
  const result = await run(f);
  assert.equal(result.entitlement_authority, false);
  const body = new URLSearchParams(f.calls.at(-1)!.init.body as string);
  assert.equal(body.get("configuration"), f.mapping.portal_configuration_id);
  assert.equal(
    body.get("return_url"),
    "https://kxra.example/os/start?billing=returned",
  );
  f.portalConfig.features.subscription_update.enabled = true;
  f.calls.length = 0;
  await assert.rejects(run(f));
  assert.ok(f.calls.every((c) => c.init.method === "GET"));
});
test("provider errors and bounded invalid responses fail closed, without retry", async () => {
  for (const response of ["not-json", "x".repeat(100001)]) {
    const f = fixture();
    f.response(response);
    await assert.rejects(run(f));
    assert.equal(f.calls.length, 1);
  }
  const f = fixture();
  f.status(429);
  await assert.rejects(run(f));
  assert.equal(f.calls.length, 1);
});
test("live signed event is descriptive and always schedules authoritative reconciliation", () => {
  const f = fixture();
  const signed = f.signed();
  const result = verifyLiveCatalogueEvent(
    signed.raw,
    signed.signature,
    f.endpoint,
    f.mapping,
    f.binding,
    now,
  );
  assert.equal(result.requires_reconciliation, true);
  assert.equal(result.snapshot.entitlement_authority, false);
  assert.equal(result.snapshot.period_end, now + 3000);
  assert.equal(
    liveReceiptDecision({
      event_id: result.event_id,
      raw_sha256: result.raw_sha256,
    }),
    "RECONCILE_REQUIRED",
  );
  const receipt = { event_id: result.event_id, raw_sha256: result.raw_sha256 };
  assert.equal(liveReceiptDecision(receipt, receipt), "DUPLICATE");
  assert.equal(
    liveReceiptDecision(receipt, { ...receipt, raw_sha256: hash }),
    "CONFLICT",
  );
  assert.throws(() =>
    liveReceiptDecision(receipt, { ...receipt, event_id: "evt_other123" }),
  );
});
test("distinct same-second and reverse-order events require fresh reconciliation", () => {
  const f = fixture();
  for (const [id, time] of [
    ["evt_newer123", now],
    ["evt_older123", now - 100],
    ["evt_equal123", now],
  ] as const) {
    const s = f.signed(f.event({ id, created: time }));
    const result = verifyLiveCatalogueEvent(
      s.raw,
      s.signature,
      f.endpoint,
      f.mapping,
      f.binding,
      now,
    );
    assert.equal(result.requires_reconciliation, true);
    assert.equal(
      liveReceiptDecision({ event_id: id, raw_sha256: result.raw_sha256 }),
      "RECONCILE_REQUIRED",
    );
  }
});
for (const [label, mutate] of [
  ["event sandbox", (f, e) => (e.livemode = false)],
  ["nested sandbox", (f) => (f.subscription.livemode = false)],
  ["connected account mismatch", (f, e) => (e.account = "acct_other123")],
  ["wrong API version", (f, e) => (e.api_version = "2024-01-01")],
  [
    "unsupported checkout success event",
    (f, e) => (e.type = "checkout.session.completed"),
  ],
  [
    "wrong metadata intent",
    (f) => (f.subscription.metadata.kxra_live_intent_id = principal.actor_id),
  ],
  [
    "changed mapping",
    (f) => (f.subscription.metadata.kxra_mapping_revision = "2"),
  ],
  ["wrong subscription", (f) => (f.subscription.id = "sub_other123")],
  [
    "seat quantity mistaken for workspace",
    (f) => (f.subscription.items.data[0].quantity = 5),
  ],
  [
    "invalid period",
    (f) => (f.subscription.items.data[0].current_period_end = now - 100),
  ],
] as [
  string,
  (f: ReturnType<typeof fixture>, e: Record<string, unknown>) => void,
][])
  test(`signed event rejects ${label}`, () => {
    const f = fixture();
    const event: Record<string, unknown> = f.event();
    mutate(f, event);
    const s = f.signed(event as ReturnType<typeof f.event>);
    assert.throws(() =>
      verifyLiveCatalogueEvent(
        s.raw,
        s.signature,
        f.endpoint,
        f.mapping,
        f.binding,
        now,
      ),
    );
  });
test("invalid, stale, tampered signatures and endpoint mismatch cannot normalize", () => {
  const f = fixture();
  const s = f.signed();
  assert.throws(() =>
    verifyLiveCatalogueEvent(
      s.raw,
      s.signature,
      { ...f.endpoint, enabled: false },
      f.mapping,
      f.binding,
      now,
    ),
  );
  assert.throws(() =>
    verifyLiveCatalogueEvent(
      s.raw,
      s.signature,
      { ...f.endpoint, mode: "test" },
      f.mapping,
      f.binding,
      now,
    ),
  );
  assert.throws(() =>
    verifyLiveCatalogueEvent(
      s.raw,
      s.signature,
      f.endpoint,
      f.mapping,
      f.binding,
      now + 301,
    ),
  );
  assert.throws(() =>
    verifyLiveCatalogueEvent(
      Buffer.from(s.raw.toString().replace("active", "paused")),
      s.signature,
      f.endpoint,
      f.mapping,
      f.binding,
      now,
    ),
  );
});
test("current reconciliation validates canonical tenant and provider subscription; no entitlement", async () => {
  const f = fixture();
  f.intent.kind = "RECONCILE";
  f.intent.subscription_id = f.subscription.id;
  const result = await reconcileLiveCatalogue(
    f.deps,
    input,
    principal,
    f.binding,
  );
  assert.equal(result.entitlement_authority, false);
  assert.equal(result.status, "active");
  assert.equal(f.calls.length, 4);
  f.subscription.customer = "cus_other123";
  await assert.rejects(
    reconcileLiveCatalogue(f.deps, input, principal, f.binding),
  );
});

test("uncertain transport outcomes are redacted and never automatically retried", async () => {
  const f = fixture();
  const delegate = f.deps.transport;
  f.deps.transport = async (url, init) => {
    if (init.method === "POST")
      throw new Error("transport included sensitive diagnostic material");
    return delegate(url, init);
  };
  await assert.rejects(run(f), {
    message: "LIVE_BILLING_PROVIDER_OUTCOME_UNCERTAIN",
  });
  assert.equal(f.calls.length, 3);
});
test("future signed event and wrong endpoint account fail closed", () => {
  const f = fixture();
  const signed = f.signed(f.event({ created: now + 61 }));
  assert.throws(() =>
    verifyLiveCatalogueEvent(
      signed.raw,
      signed.signature,
      f.endpoint,
      f.mapping,
      f.binding,
      now,
    ),
  );
  const valid = f.signed();
  assert.throws(() =>
    verifyLiveCatalogueEvent(
      valid.raw,
      valid.signature,
      { ...f.endpoint, account_id: "acct_other123" },
      f.mapping,
      f.binding,
      now,
    ),
  );
});
test("quantity transformations and arbitrary price scaling are rejected", async () => {
  const f = fixture();
  Object.assign(f.price, { transform_quantity: { divide_by: 5, round: "up" } });
  await assert.rejects(run(f));
  assert.ok(f.calls.every((c) => c.init.method === "GET"));
});

test("live checkout cannot redirect without reviewed terms configuration and provider checkbox", async () => {
  const f = fixture();
  f.deps.checkoutTerms = undefined;
  await assert.rejects(run(f));
  assert.equal(f.calls.length, 0);
  const g = fixture();
  Object.assign(g.session, {
    consent_collection: { terms_of_service: "none" },
  });
  await assert.rejects(run(g), {
    message: "LIVE_BILLING_SESSION_CONSENT_INVALID",
  });
});

for (const plan of plans)
  test(`${plan[0]} modern sandbox session uses same core with false provider mode`, async () => {
    const f = fixture(plan, "STAGING_SANDBOX");
    const r = await run(f);
    assert.equal(r.execution_scope.livemode, false);
    assert.ok(r.id.startsWith("cs_test_"));
    const signed = f.signed();
    const event = verifyStagingSandboxCatalogueEvent(
      signed.raw,
      signed.signature,
      f.endpoint,
      f.mapping,
      f.binding,
      now,
    );
    assert.equal(event.execution_scope.execution_mode, "STAGING_SANDBOX");
    await assert.rejects(createLiveCatalogueSession(f.deps, input, principal));
    assert.throws(() =>
      verifyLiveCatalogueEvent(
        signed.raw,
        signed.signature,
        f.endpoint,
        f.mapping,
        f.binding,
        now,
      ),
    );
  });
test("session authority loss before POST and after response is fenced", async () => {
  const f = fixture();
  f.deps.stillCurrent = async () => false;
  await assert.rejects(run(f), {
    message: "LIVE_BILLING_INTENT_CHANGED_BEFORE_POST",
  });
  assert.ok(f.calls.every((c) => c.init.method === "GET"));
  let checks = 0;
  const g = fixture();
  g.deps.stillCurrent = async () => ++checks === 1;
  await assert.rejects(run(g), {
    message: "LIVE_BILLING_INTENT_CHANGED_AFTER_POST",
  });
});
