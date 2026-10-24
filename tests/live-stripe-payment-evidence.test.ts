import assert from "node:assert/strict";
import test from "node:test";
import {
  readLiveStripePaymentEvidence,
  type LivePaymentEvidenceDependencies,
} from "../packages/integrations/live-stripe-payment-evidence";
import { LIVE_STRIPE_API_VERSION } from "../packages/integrations/live-catalogue-stripe";
const now = 1_800_000_000;
const principal = {
  actor_id: "11111111-1111-4111-8111-111111111111",
  org_id: "22222222-2222-4222-8222-222222222222",
};
const reconciliationId = "33333333-3333-4333-8333-333333333333";
const checkoutId = "44444444-4444-4444-8444-444444444444";
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
  const binding = {
    reconciliation_id: reconciliationId,
    ...principal,
    binding_version: 7,
    mapping_revision: 1,
    account_id: "acct_1Rv3KdC84VkhhIRz",
    mode: "live",
    offer_key: String(p[0]),
    price_id: String(p[1]),
    product_id: String(p[2]),
    customer_id: "cus_synthetic123",
    subscription_id: "sub_synthetic123",
    subscription_item_id: "si_synthetic123",
    invoice_id: "in_synthetic123",
    checkout_intent_id: checkoutId,
    period_start: now - 60,
    period_end: now + 3000,
    expected_total_minor: Number(p[3]),
    tax_behavior: "inclusive",
    automatic_tax: false,
    activation_review_sha256: "a".repeat(64),
    terms_review_sha256: "a".repeat(64),
    tax_review_sha256: "a".repeat(64),
    created_at: now - 20,
    expires_at: now + 200,
  };
  const account = { id: binding.account_id, object: "account" };
  const price = {
    id: binding.price_id,
    object: "price",
    livemode: true,
    currency: "gbp",
    unit_amount: Number(p[3]),
    billing_scheme: "per_unit",
    type: "recurring",
    tax_behavior: "inclusive",
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    transform_quantity: null,
    custom_unit_amount: null,
    product: { id: binding.product_id, object: "product", livemode: true },
  };
  const subscription = {
    id: binding.subscription_id,
    object: "subscription",
    livemode: true,
    customer: binding.customer_id,
    status: "active",
    latest_invoice: binding.invoice_id,
    metadata: {
      kxra_live_intent_id: checkoutId,
      kxra_catalogue_offer: binding.offer_key,
      kxra_mapping_revision: "1",
    },
    items: {
      object: "list",
      has_more: false,
      data: [
        {
          id: binding.subscription_item_id,
          quantity: 1,
          current_period_start: binding.period_start,
          current_period_end: binding.period_end,
          price: { id: binding.price_id },
        },
      ],
    },
  };
  const line = {
    id: "il_synthetic123",
    object: "line_item",
    invoice: binding.invoice_id,
    livemode: true,
    currency: "gbp",
    amount: Number(p[3]),
    quantity: 1,
    period: { start: binding.period_start, end: binding.period_end },
    pricing: {
      type: "price_details",
      price_details: { price: binding.price_id, product: binding.product_id },
    },
    parent: {
      type: "subscription_item_details",
      subscription_item_details: {
        subscription: binding.subscription_id,
        subscription_item: binding.subscription_item_id,
        proration: false,
      },
    },
    discount_amounts: [],
    pretax_credit_amounts: [],
  };
  const invoice = {
    id: binding.invoice_id,
    object: "invoice",
    livemode: true,
    customer: binding.customer_id,
    currency: "gbp",
    status: "paid",
    billing_reason: "subscription_cycle",
    collection_method: "charge_automatically",
    subtotal: Number(p[3]),
    total: Number(p[3]),
    amount_due: Number(p[3]),
    amount_paid: Number(p[3]),
    amount_remaining: 0,
    amount_overpaid: 0,
    starting_balance: 0,
    pre_payment_credit_notes_amount: 0,
    post_payment_credit_notes_amount: 0,
    total_discount_amounts: [],
    automatic_tax: { enabled: false, status: null as string | null },
    parent: {
      type: "subscription_details",
      subscription_details: { subscription: binding.subscription_id },
    },
    lines: { object: "list", has_more: false, data: [line] },
  };
  const payment = {
    id: "inpay_synthetic123",
    object: "invoice_payment",
    livemode: true,
    invoice: binding.invoice_id,
    currency: "gbp",
    status: "paid",
    amount_requested: Number(p[3]),
    amount_paid: Number(p[3]) as number | null,
    payment: { type: "payment_intent", payment_intent: "pi_synthetic123" },
  };
  const payments = { object: "list", has_more: false, data: [payment] };
  const pi = {
    id: "pi_synthetic123",
    object: "payment_intent",
    livemode: true,
    customer: binding.customer_id,
    currency: "gbp",
    amount: Number(p[3]),
    amount_received: Number(p[3]),
    amount_capturable: 0,
    latest_charge: "ch_synthetic123" as string | null,
    status: "succeeded",
    last_payment_error: null as unknown,
    on_behalf_of: null,
    transfer_data: null,
    client_secret: "SYNTHETIC_PRIVATE_VALUE_MUST_NOT_BE_RETURNED",
  };
  const charge = {
    id: "ch_synthetic123",
    object: "charge",
    livemode: true,
    customer: binding.customer_id,
    currency: "gbp",
    payment_intent: pi.id,
    amount: Number(p[3]),
    amount_captured: Number(p[3]),
    amount_refunded: 0,
    paid: true,
    captured: true,
    refunded: false,
    disputed: false,
    status: "succeeded",
    payment_method_details: { type: "card" },
    on_behalf_of: null,
    transfer_data: null,
    billing_details: {
      name: "PRIVATE_SYNTHETIC_PAYER",
      email: "private@example.invalid",
    },
  };
  const calls: { url: string; init: RequestInit }[] = [];
  const counts = new Map<string, number>();
  let change:
    ((url: string, count: number, value: unknown) => unknown) | undefined;
  const deps: LivePaymentEvidenceDependencies = {
    runtime: {
      enabled: true,
      mode: "live",
      nodeEnv: "production",
      secretKey: "sk_live_SYNTHETIC_NOT_A_CREDENTIAL_000000",
    },
    nowSeconds: () => now,
    resolveBinding: async () => binding,
    stillCurrent: async () => true,
    transport: async (url, init) => {
      calls.push({ url, init });
      const u = new URL(url);
      const path = u.pathname;
      const count = (counts.get(path) || 0) + 1;
      counts.set(path, count);
      const value = path.endsWith("/account")
        ? account
        : path.includes("/prices/")
          ? price
          : path.includes("/subscriptions/")
            ? subscription
            : path.includes("/invoices/")
              ? invoice
              : path.endsWith("/invoice_payments")
                ? payments
                : path.includes("/payment_intents/")
                  ? pi
                  : path.includes("/charges/")
                    ? charge
                    : undefined;
      return new Response(
        JSON.stringify(
          change ? change(url, count, structuredClone(value)) : value,
        ),
      );
    },
  };
  return {
    binding,
    account,
    price,
    subscription,
    line,
    invoice,
    payment,
    payments,
    pi,
    charge,
    calls,
    deps,
    onRead: (fn: typeof change) => (change = fn),
  };
}
const input = { reconciliation_id: reconciliationId };
const read = (f: ReturnType<typeof fixture>, i: unknown = input) =>
  readLiveStripePaymentEvidence(f.deps, i, principal);
for (const plan of plans)
  test(`${plan[0]}: captured full card collection is evidence, never entitlement or payout`, async () => {
    const f = fixture(plan);
    const result = await read(f);
    assert.equal(result.state, "COLLECTED");
    assert.equal(result.collected_minor, plan[3]);
    assert.equal(result.entitlement_authority, false);
    assert.equal(result.payout_authority, false);
    assert.equal(result.requires_recheck, true);
    assert.equal(f.calls.length, 11);
    for (const c of f.calls) {
      assert.equal(c.init.method, "GET");
      assert.equal(c.init.redirect, "error");
      assert.equal(new URL(c.url).origin, "https://api.stripe.com");
      assert.ok(c.init.signal);
      assert.equal(
        (c.init.headers as Record<string, string>)["Stripe-Version"],
        LIVE_STRIPE_API_VERSION,
      );
    }
    assert.ok(!JSON.stringify(result).includes("PRIVATE"));
    assert.ok(!JSON.stringify(result).includes("client_secret"));
  });
for (const [label, mutate] of [
  ["mode", (f) => (f.invoice.livemode = false)],
  ["account", (f) => (f.account.id = "acct_other123")],
  ["tenant customer", (f) => (f.invoice.customer = "cus_other123")],
  [
    "subscription",
    (f) =>
      (f.invoice.parent.subscription_details.subscription = "sub_other123"),
  ],
  ["currency", (f) => (f.invoice.currency = "usd")],
  [
    "catalogue price",
    (f) => (f.line.pricing.price_details.price = "price_other123"),
  ],
  ["product", (f) => (f.price.product.id = "prod_other123")],
  ["month interval", (f) => (f.price.recurring.interval = "year")],
  ["workspace quantity", (f) => (f.line.quantity = 5)],
  ["period", (f) => (f.line.period.end += 1)],
  ["old paid invoice", (f) => (f.subscription.latest_invoice = "in_other123")],
  [
    "proration",
    (f) => (f.line.parent.subscription_item_details.proration = true),
  ],
  ["tax", (f) => (f.invoice.automatic_tax.enabled = true)],
  ["gross amount", (f) => (f.invoice.total += 1)],
  [
    "subscription version",
    (f) => (f.subscription.metadata.kxra_mapping_revision = "2"),
  ],
  ["payment allocation", (f) => (f.payment.invoice = "in_other123")],
  ["PI customer", (f) => (f.pi.customer = "cus_other123")],
  ["charge customer", (f) => (f.charge.customer = "cus_other123")],
  ["charge mode", (f) => (f.charge.livemode = false)],
  ["captured amount", (f) => (f.charge.amount_captured -= 1)],
] as [string, (f: ReturnType<typeof fixture>) => void][])
  test(`reject mismatched ${label}`, async () => {
    const f = fixture();
    mutate(f);
    assert.equal((await read(f)).state, "MISMATCHED");
  });
test("declined card is FAILED rather than treating active subscription as payment", async () => {
  const f = fixture();
  f.invoice.status = "open";
  f.payment.status = "open";
  f.pi.status = "requires_payment_method";
  f.pi.last_payment_error = { code: "card_declined" };
  f.charge.status = "failed";
  f.charge.paid = false;
  f.charge.amount_captured = 0;
  assert.equal((await read(f)).state, "FAILED");
});
test("3DS/action and delayed invoice allocation stay PENDING", async () => {
  const f = fixture();
  f.pi.status = "requires_action";
  f.pi.latest_charge = null;
  f.payment.status = "open";
  f.invoice.status = "open";
  assert.equal((await read(f)).state, "PENDING");
  f.pi.status = "succeeded";
  f.pi.latest_charge = f.charge.id;
  assert.equal((await read(f)).state, "PENDING");
});
test("async card capture is not collected until captured", async () => {
  const f = fixture();
  f.charge.captured = false;
  f.charge.amount_captured = 0;
  assert.equal((await read(f)).state, "PENDING");
});
test("cancelled PI and void invoice are descriptive cancellation evidence", async () => {
  const f = fixture();
  f.pi.status = "canceled";
  f.pi.latest_charge = null;
  assert.equal((await read(f)).state, "CANCELLED");
  f.invoice.status = "void";
  assert.equal((await read(f)).reason, "INVOICE_VOID");
});
test("paid canceled subscription remains collection evidence without inventing access/cancellation policy", async () => {
  const f = fixture();
  f.subscription.status = "canceled";
  const r = await read(f);
  assert.equal(r.state, "COLLECTED");
  assert.equal(r.subscription_status, "canceled");
  assert.equal(r.entitlement_authority, false);
});
test("full and partial refunds stay explicit", async () => {
  const f = fixture();
  f.charge.amount_refunded = 500;
  assert.equal((await read(f)).reason, "CHARGE_PARTIALLY_REFUNDED");
  f.charge.amount_refunded = f.charge.amount_captured;
  f.charge.refunded = true;
  assert.equal((await read(f)).state, "REFUNDED");
});
test("dispute overrides refund/paid presentation", async () => {
  const f = fixture();
  f.charge.disputed = true;
  f.charge.refunded = true;
  f.charge.amount_refunded = f.charge.amount_captured;
  assert.equal((await read(f)).state, "DISPUTED");
});
test("manual/out-of-band paid status and truncated/multiple allocations are UNVERIFIED", async () => {
  const f = fixture();
  f.payments.data = [];
  assert.equal((await read(f)).state, "UNVERIFIED");
  f.payments.data = [f.payment, { ...f.payment, id: "inpay_other123" }];
  assert.equal((await read(f)).reason, "MULTIPLE_ALLOCATIONS_REQUIRE_REVIEW");
  f.payments.data = [f.payment];
  f.payments.has_more = true;
  assert.equal((await read(f)).state, "UNVERIFIED");
});
test("unreviewed credits, discounts and tax completion fail closed", async () => {
  const f = fixture();
  f.invoice.post_payment_credit_notes_amount = 500;
  assert.equal((await read(f)).reason, "CREDIT_NOTE_POLICY_UNREVIEWED");
  f.invoice.post_payment_credit_notes_amount = 0;
  Object.assign(f.invoice, { total_discount_amounts: [{ amount: 1 }] });
  assert.equal((await read(f)).reason, "ADJUSTMENTS_NOT_REVIEWED");
});
test("no event/session/timestamp/client amount can authorize reconciliation", async () => {
  const f = fixture();
  for (const extra of [
    { event_created: 123 },
    { session_id: "cs_live_synthetic123" },
    { amount: 1 },
    { org_id: principal.org_id },
    { binding_version: 999 },
  ])
    await assert.rejects(read(f, { ...input, ...extra }));
  assert.equal(f.calls.length, 0);
});
test("wrong tenant resolver output is rejected before transport", async () => {
  const f = fixture();
  f.binding.org_id = "55555555-5555-4555-8555-555555555555";
  await assert.rejects(read(f));
  assert.equal(f.calls.length, 0);
});
test("configuration and reviewed tax/terms binding fail closed before transport", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => (f.deps.runtime = undefined),
    (f: ReturnType<typeof fixture>) => (f.deps.runtime!.enabled = false),
    (f: ReturnType<typeof fixture>) =>
      (f.deps.runtime!.secretKey = "sk_test_SYNTHETIC_NOT_A_CREDENTIAL_00000"),
    (f: ReturnType<typeof fixture>) => (f.binding.terms_review_sha256 = ""),
    (f: ReturnType<typeof fixture>) => (f.binding.expected_total_minor -= 1),
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(read(f));
    assert.equal(f.calls.length, 0);
  }
});
test("duplicate/reordered triggers repeat current reads without using event time", async () => {
  const f = fixture();
  const first = await read(f),
    second = await read(f);
  assert.equal(first.source_sha256, second.source_sha256);
  assert.equal(first.state, second.state);
  f.charge.disputed = true;
  const later = await read(f);
  assert.equal(later.state, "DISPUTED");
  assert.notEqual(first.source_sha256, later.source_sha256);
});
test("provider changes between reads prevent a collected conclusion", async () => {
  const f = fixture();
  f.onRead((url, count, value) =>
    url.includes("/charges/") && count === 2
      ? { ...(value as object), amount_refunded: 100 }
      : value,
  );
  const r = await read(f);
  assert.equal(r.state, "UNVERIFIED");
  assert.equal(r.reason, "PROVIDER_CHANGED_DURING_READ");
});
test("binding/mapping generation race invalidates positive and negative evidence", async () => {
  const f = fixture();
  f.deps.stillCurrent = async () => false;
  assert.equal((await read(f)).state, "VERSION_RACE");
  f.invoice.status = "void";
  assert.equal((await read(f)).state, "VERSION_RACE");
});
test("provider errors and oversized/malformed responses expose no diagnostics", async () => {
  for (const response of ["invalid-json", "x".repeat(100001)]) {
    const f = fixture();
    f.deps.transport = async () => new Response(response);
    assert.equal((await read(f)).state, "UNVERIFIED");
  }
  const f = fixture();
  f.deps.transport = async () => {
    throw new Error("PRIVATE_TRANSPORT_DIAGNOSTIC");
  };
  const r = await read(f);
  assert.equal(r.state, "UNVERIFIED");
  assert.ok(!JSON.stringify(r).includes("PRIVATE"));
});
test("missing authoritative recheck or expired request never becomes collected", async () => {
  const f = fixture();
  f.deps.stillCurrent = async () => {
    throw new Error("private DB diagnostic");
  };
  assert.equal((await read(f)).reason, "BINDING_RECHECK_UNVERIFIED");
  f.binding.expires_at = now;
  await assert.rejects(read(f));
});

test("reviewed exclusive gross total is matched without choosing a tax rate", async () => {
  const f = fixture();
  f.binding.tax_behavior = "exclusive";
  f.price.tax_behavior = "exclusive";
  f.binding.expected_total_minor = 3480;
  f.invoice.total = 3480;
  f.invoice.amount_due = 3480;
  f.invoice.amount_paid = 3480;
  f.payment.amount_requested = 3480;
  f.payment.amount_paid = 3480;
  f.pi.amount = 3480;
  f.pi.amount_received = 3480;
  f.charge.amount = 3480;
  f.charge.amount_captured = 3480;
  assert.equal((await read(f)).state, "COLLECTED");
  f.binding.automatic_tax = true;
  f.invoice.automatic_tax.enabled = true;
  f.invoice.automatic_tax.status = "requires_location_inputs";
  assert.equal((await read(f)).reason, "TAX_NOT_COMPLETE");
});
test("legacy paid flag/top-level subscription/price do not substitute for Basil evidence", async () => {
  const f = fixture();
  f.onRead((url, _count, value) => {
    if (!url.includes("/invoices/")) return value;
    const v = value as Record<string, unknown>;
    delete v.parent;
    return { ...v, paid: true, subscription: f.binding.subscription_id };
  });
  assert.equal((await read(f)).state, "UNVERIFIED");
});
test("expiring observation after provider reads fails closed", async () => {
  const f = fixture();
  let clock = now;
  f.deps.nowSeconds = () => clock;
  f.deps.stillCurrent = async () => {
    clock += 300;
    return true;
  };
  assert.equal((await read(f)).reason, "OBSERVATION_EXPIRED");
});
test("unread monetary amounts are unknown rather than invented zero collection", async () => {
  const f = fixture();
  f.invoice.status = "draft";
  const r = await read(f);
  assert.equal(r.state, "PENDING");
  assert.equal(r.collected_minor, null);
  assert.equal(r.refunded_minor, null);
});
