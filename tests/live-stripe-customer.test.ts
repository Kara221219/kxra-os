import assert from "node:assert/strict";
import test from "node:test";
import {
  createLiveStripeCustomer,
  requestLiveCustomerCommand,
  claimLiveCustomerCommand,
  finishLiveCustomerCommand,
  currentLiveCustomerCommand,
  type LiveCustomerDependencies,
} from "../packages/integrations/live-stripe-customer";
import { LIVE_STRIPE_API_VERSION } from "../packages/integrations/live-catalogue-stripe";
const now = 1_800_000_000,
  hash = "a".repeat(64);
const principal = {
  actor_id: "11111111-1111-4111-8111-111111111111",
  org_id: "22222222-2222-4222-8222-222222222222",
};
const intentId = "33333333-3333-4333-8333-333333333333";
const plans = [
  [
    "KXRA_STARTER_V1",
    "price_1UTbq7C84VkhhIRzkBHEHivV",
    "prod_VUb2kv7rUiTeiu",
    2900,
  ],
  [
    "KXRA_TEAM_V1",
    "price_1UTbrLC84VkhhIRzMN225zAr",
    "prod_VUb3rh9e9eNw5a",
    7900,
  ],
  [
    "KXRA_BUSINESS_V1",
    "price_1UTlt5C84VkhhIRzGztXl6ey",
    "prod_VUlPLWhBBf7lmP",
    19900,
  ],
] as const;
function fixture(p = plans[0] as (typeof plans)[number]) {
  const intent = {
    id: intentId,
    ...principal,
    offer_key: String(p[0]),
    mapping_revision: 1,
    version: 1,
    state: "REQUESTED",
    terms_review_sha256: hash,
    auth_time: now - 30,
    created_at: now - 20,
    expires_at: now + 200,
  };
  const mapping = {
    version: 1,
    mode: "live",
    enabled: true,
    account_id: "acct_1Rv3KdC84VkhhIRz",
    offer_key: String(p[0]),
    revision: 1,
    price_id: String(p[1]),
    product_id: String(p[2]),
    portal_configuration_id: "bpc_synthetic123",
    activation_review_sha256: hash,
    terms_review_sha256: hash,
    tax_review_sha256: hash,
    tax_behavior: "inclusive",
    automatic_tax: false,
    payment_method: "card",
  };
  const account = {
    id: mapping.account_id,
    object: "account",
    charges_enabled: true,
  };
  const price = {
    id: mapping.price_id,
    object: "price",
    active: true,
    livemode: true,
    currency: "gbp",
    unit_amount: Number(p[3]),
    type: "recurring",
    billing_scheme: "per_unit",
    tax_behavior: "inclusive",
    transform_quantity: null,
    custom_unit_amount: null,
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    product: {
      id: mapping.product_id,
      object: "product",
      active: true,
      livemode: true,
    },
  };
  const metadata = {
    kxra_customer_intent: intent.id,
    kxra_org: intent.org_id,
    kxra_actor: intent.actor_id,
    kxra_offer: intent.offer_key,
    kxra_mapping_revision: "1",
    kxra_intent_version: "1",
    kxra_terms_sha256: hash,
  };
  const customer = {
    id: "cus_synthetic123",
    object: "customer",
    livemode: true,
    created: now,
    balance: 0,
    currency: null,
    default_source: null,
    invoice_settings: { default_payment_method: null },
    test_clock: null,
    metadata,
    email: "PRIVATE_FIXTURE_EMAIL_MUST_NOT_LEAVE_RESULT",
  };
  const calls: { url: string; init: RequestInit }[] = [];
  let hook:
    | ((url: string, init: RequestInit, result: unknown) => Response | unknown)
    | undefined;
  const deps: LiveCustomerDependencies = {
    runtime: {
      enabled: true,
      mode: "live",
      nodeEnv: "production",
      secretKey: "sk_live_SYNTHETIC_NOT_A_CREDENTIAL_000000",
    },
    nowSeconds: () => now,
    resolveIntent: async () => ({ intent, mapping }),
    stillCurrent: async () => true,
    transport: async (url, init) => {
      calls.push({ url, init });
      const value = url.endsWith("/account")
        ? account
        : url.includes("/prices/")
          ? price
          : customer;
      const transformed = hook
        ? hook(url, init, structuredClone(value))
        : value;
      return transformed instanceof Response
        ? transformed
        : new Response(JSON.stringify(transformed));
    },
  };
  return {
    intent,
    mapping,
    account,
    price,
    customer,
    calls,
    deps,
    hook: (value: typeof hook) => (hook = value),
  };
}
const input = { intent_id: intentId };
const run = (f: ReturnType<typeof fixture>, data: unknown = input) =>
  createLiveStripeCustomer(f.deps, data, principal);
for (const p of plans)
  test(`${p[0]}: one canonical metadata-only POST then live read verification`, async () => {
    const f = fixture(p);
    const r = await run(f);
    assert.equal(r.outcome, "BOUND");
    assert.equal(r.entitlement_authority, false);
    assert.equal(r.customer_id, f.customer.id);
    assert.equal(f.calls.length, 4);
    assert.equal(f.calls.filter((c) => c.init.method === "POST").length, 1);
    for (const c of f.calls) {
      assert.equal(new URL(c.url).origin, "https://api.stripe.com");
      assert.equal(c.init.redirect, "error");
      assert.ok(c.init.signal);
      assert.equal(
        (c.init.headers as Record<string, string>)["Stripe-Version"],
        LIVE_STRIPE_API_VERSION,
      );
    }
    const post = f.calls.find((c) => c.init.method === "POST")!;
    const body = new URLSearchParams(post.init.body as string);
    assert.equal(body.get("metadata[kxra_org]"), principal.org_id);
    assert.equal(body.get("metadata[kxra_offer]"), p[0]);
    assert.equal(body.get("email"), null);
    assert.equal(body.get("payment_method"), null);
    assert.ok(!JSON.stringify(r).includes("PRIVATE"));
    const command = finishLiveCustomerCommand(r, {
      enabled: true,
      mode: "live",
    });
    assert.equal(command.role, "BILLING_WORKER");
    assert.equal(command.entitlement_authority, false);
  });
for (const [label, change] of [
  ["absent runtime", (f) => (f.deps.runtime = undefined)],
  ["disabled", (f) => (f.deps.runtime!.enabled = false)],
  [
    "test key",
    (f) =>
      (f.deps.runtime!.secretKey = "sk_test_SYNTHETIC_NOT_A_CREDENTIAL_00000"),
  ],
  ["sandbox mode", (f) => (f.mapping.mode = "sandbox")],
  ["wrong account", (f) => (f.mapping.account_id = "acct_other123")],
  ["unreviewed terms", (f) => (f.mapping.terms_review_sha256 = "")],
  ["unreviewed tax", (f) => (f.mapping.tax_review_sha256 = "")],
  ["unreviewed activation", (f) => (f.mapping.activation_review_sha256 = "")],
  ["tenant", (f) => (f.intent.org_id = "44444444-4444-4444-8444-444444444444")],
  [
    "actor",
    (f) => (f.intent.actor_id = "44444444-4444-4444-8444-444444444444"),
  ],
  ["offer revision", (f) => (f.intent.mapping_revision = 2)],
  ["expiry", (f) => (f.intent.expires_at = now)],
  ["stale MFA", (f) => (f.intent.auth_time = now - 901)],
  ["long expiry", (f) => (f.intent.expires_at = now + 301)],
] as [string, (f: ReturnType<typeof fixture>) => void][])
  test(`canonical ${label} rejected before transport`, async () => {
    const f = fixture();
    change(f);
    await assert.rejects(run(f));
    assert.equal(f.calls.length, 0);
  });
for (const extra of [
  { org_id: principal.org_id },
  { actor_id: principal.actor_id },
  { offer_key: "KXRA_BUSINESS_V1" },
  { price_id: "price_legacy499" },
  { customer_id: "cus_existing123" },
  { email: "not-approved@example.invalid" },
  { role: "OWNER" },
])
  test(`client ${Object.keys(extra)[0]} cannot alter creation`, async () => {
    const f = fixture();
    await assert.rejects(run(f, { ...input, ...extra }));
    assert.equal(f.calls.length, 0);
  });
for (const [label, change] of [
  ["account", (f) => (f.account.id = "acct_other123")],
  ["charges disabled", (f) => (f.account.charges_enabled = false)],
  ["test price", (f) => (f.price.livemode = false)],
  ["currency", (f) => (f.price.currency = "usd")],
  ["amount", (f) => (f.price.unit_amount = 49900)],
  ["year interval", (f) => (f.price.recurring.interval = "year")],
  ["inactive product", (f) => (f.price.product.active = false)],
] as [string, (f: ReturnType<typeof fixture>) => void][])
  test(`provider ${label} quarantines before POST`, async () => {
    const f = fixture();
    change(f);
    const r = await run(f);
    assert.equal(r.outcome, "QUARANTINED");
    assert.equal(f.calls.filter((c) => c.init.method === "POST").length, 0);
  });
for (const [label, change] of [
  ["test mode", (f) => (f.customer.livemode = false)],
  [
    "wrong tenant metadata",
    (f) =>
      (f.customer.metadata.kxra_org = "44444444-4444-4444-8444-444444444444"),
  ],
  ["wrong offer", (f) => (f.customer.metadata.kxra_offer = "KXRA_BUSINESS_V1")],
  ["old customer", (f) => (f.customer.created = now - 999)],
  ["balance", (f) => (f.customer.balance = 49900)],
] as [string, (f: ReturnType<typeof fixture>) => void][])
  test(`unverified POST ${label} holds original intent, never binds`, async () => {
    const f = fixture();
    change(f);
    const r = await run(f);
    assert.equal(r.outcome, "UNCERTAIN");
    assert.equal(r.metadata, null);
    assert.equal(f.calls.filter((c) => c.init.method === "POST").length, 1);
  });
test("uncertain POST has no automatic retry or replacement", async () => {
  const f = fixture();
  f.hook((_u, init, value) => {
    if (init.method === "POST") throw Error("PRIVATE_TRANSPORT_DIAGNOSTIC");
    return value;
  });
  const r = await run(f);
  assert.equal(r.outcome, "UNCERTAIN");
  assert.equal(f.calls.length, 3);
  assert.equal(r.customer_id, null);
  assert.ok(!JSON.stringify(r).includes("PRIVATE"));
  f.deps.resolveIntent = async () => null;
  await assert.rejects(run(f));
  assert.equal(f.calls.length, 3);
});
test("complete canonical intent changes idempotency hash, exact replay keeps it", async () => {
  const f = fixture();
  await run(f);
  const key = () =>
    (
      f.calls.filter((c) => c.init.method === "POST").at(-1)!.init
        .headers as Record<string, string>
    )["Idempotency-Key"];
  const first = key();
  await run(f);
  assert.equal(key(), first);
  f.intent.version = 2;
  f.customer.metadata.kxra_intent_version = "2";
  await run(f);
  assert.notEqual(key(), first);
});
test("revocation before POST and authority loss after POST cannot bind", async () => {
  const f = fixture();
  f.deps.stillCurrent = async () => false;
  assert.equal((await run(f)).outcome, "QUARANTINED");
  assert.equal(f.calls.length, 2);
  let checks = 0;
  f.deps.stillCurrent = async () => ++checks === 1;
  const r = await run(f);
  assert.equal(r.outcome, "UNCERTAIN");
  assert.equal(r.reason, "INTENT_CHANGED_AFTER_POST");
});
test("GET customer verification detects changed metadata", async () => {
  const f = fixture();
  f.hook((url, init, value) =>
    url.includes("/customers/") && init.method === "GET"
      ? {
          ...(value as object),
          metadata: { ...f.customer.metadata, kxra_mapping_revision: "2" },
        }
      : value,
  );
  const r = await run(f);
  assert.equal(r.outcome, "UNCERTAIN");
  assert.equal(r.customer_id, f.customer.id);
});
test("unreadable/oversized POST response cannot return a binding", async () => {
  for (const body of ["invalid-json", "x".repeat(100001)]) {
    const f = fixture();
    f.hook((_u, init, value) =>
      init.method === "POST" ? new Response(body) : value,
    );
    assert.equal((await run(f)).outcome, "UNCERTAIN");
    assert.equal(f.calls.length, 3);
  }
});
test("parameterized durable commands reject missing activation and foreign authority", () => {
  const enabled = { enabled: true, mode: "live" as const };
  assert.throws(() =>
    requestLiveCustomerCommand({
      intent_id: intentId,
      offer_key: "KXRA_STARTER_V1",
    }),
  );
  assert.equal(
    requestLiveCustomerCommand(
      { intent_id: intentId, offer_key: "KXRA_STARTER_V1" },
      enabled,
    ).role,
    "AUTHENTICATED_SERVER",
  );
  assert.equal(claimLiveCustomerCommand(input, enabled).role, "BILLING_WORKER");
  assert.throws(() =>
    requestLiveCustomerCommand(
      { ...input, offer_key: "KXRA_STARTER_V1", actor_id: principal.actor_id },
      enabled,
    ),
  );
  assert.throws(() =>
    claimLiveCustomerCommand({ ...input, role: "OWNER" }, enabled),
  );
});

test("current intent check is a parameterized read-only worker command", () => {
  const c = currentLiveCustomerCommand(
    { intent_id: intentId, intent_version: 1 },
    { enabled: true, mode: "live" },
  );
  assert.equal(c.role, "BILLING_WORKER");
  assert.deepEqual(c.values, [intentId, 1]);
  assert.equal(c.entitlement_authority, false);
  assert.throws(() =>
    currentLiveCustomerCommand(
      { intent_id: intentId, intent_version: 1, org_id: principal.org_id },
      { enabled: true, mode: "live" },
    ),
  );
});
