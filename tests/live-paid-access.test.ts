import assert from "node:assert/strict";
import test from "node:test";
import {
  checkoutTermsPresentationDigest,
  readLiveCheckoutConsent,
  validateCheckoutTermsPresentation,
  type LiveConsentDependencies,
  type LiveCheckoutConsentProof,
} from "../packages/integrations/live-checkout-consent";
import {
  buildLivePaidProof,
  reserveLivePaidReadCommand,
  commitLivePaidProofCommand,
  livePaidAccessStatusCommand,
  currentLivePaidReadCommand,
  type LivePaidPolicy,
} from "../packages/integrations/live-paid-access";
import type { LivePaymentEvidence } from "../packages/integrations/live-stripe-payment-evidence";
const now = 1_800_000_000,
  hash = "a".repeat(64),
  uuid = (digit: string) =>
    `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const principal = { actor_id: uuid("1"), org_id: uuid("2") };
function fixture() {
  const presentationBase = {
    terms_review_sha256: hash,
    terms_url: `https://kxra.example/legal/terms?sha256=${hash}`,
    message: `SYNTHETIC REVIEWED FIXTURE [terms](https://kxra.example/legal/terms?sha256=${hash})`,
  };
  const presentation = {
    ...presentationBase,
    presentation_sha256: checkoutTermsPresentationDigest(presentationBase),
  };
  const context = {
    reconciliation_id: uuid("3"),
    ...principal,
    binding_version: 7,
    offer_key: "KXRA_STARTER_V1",
    mapping_revision: 1,
    policy_id: uuid("5"),
    policy_revision: 1,
    customer_id: "cus_synthetic123",
    subscription_id: "sub_synthetic123",
    invoice_id: "in_current123",
    price_id: "price_1UTbq7C84VkhhIRzkBHEHivV",
    product_id: "prod_VUb2kv7rUiTeiu",
    checkout_intent_id: uuid("4"),
    checkout_session_id: "cs_live_synthetic123",
    period_start: now - 60,
    period_end: now + 3000,
    expected_total_minor: 2900,
    created_at: now - 20,
    expires_at: now + 200,
  };
  const binding = {
    reconciliation_id: context.reconciliation_id,
    ...principal,
    binding_version: 7,
    checkout_intent_id: context.checkout_intent_id,
    checkout_session_id: context.checkout_session_id,
    customer_id: context.customer_id,
    subscription_id: context.subscription_id,
    invoice_id: context.invoice_id,
    subscription_item_id: "si_synthetic123",
    offer_key: "KXRA_STARTER_V1",
    mapping_revision: 1,
    price_id: context.price_id,
    product_id: context.product_id,
    monthly_amount_minor: 2900,
    period_start: context.period_start,
    period_end: context.period_end,
    terms_review_sha256: hash,
    presentation,
    origin: "https://kxra.example",
    created_at: context.created_at,
    expires_at: context.expires_at,
  };
  const metadata = {
    kxra_live_intent_id: context.checkout_intent_id,
    kxra_catalogue_offer: context.offer_key,
    kxra_mapping_revision: "1",
    kxra_terms_sha256: hash,
    kxra_consent_presentation_sha256: presentation.presentation_sha256,
  };
  const session = {
    id: context.checkout_session_id,
    object: "checkout.session",
    livemode: true,
    mode: "subscription",
    status: "complete",
    customer: context.customer_id,
    subscription: context.subscription_id,
    client_reference_id: context.checkout_intent_id,
    consent_collection: { terms_of_service: "required" },
    consent: { terms_of_service: "accepted" },
    custom_text: {
      terms_of_service_acceptance: { message: presentation.message },
    },
    metadata,
    created: now - 100000,
    expires_at: now - 90000,
    invoice: "in_historical123",
    payment_status: "unpaid",
  };
  const lines = {
    object: "list",
    has_more: false,
    data: [
      {
        quantity: 1,
        currency: "gbp",
        price: {
          id: context.price_id,
          product: context.product_id,
          livemode: true,
          currency: "gbp",
          unit_amount: 2900,
          recurring: {
            interval: "month",
            interval_count: 1,
            usage_type: "licensed",
          },
        },
      },
    ],
  };
  const sub = {
    id: context.subscription_id,
    object: "subscription",
    customer: context.customer_id,
    livemode: true,
    status: "active",
    cancel_at_period_end: false,
    latest_invoice: context.invoice_id,
    metadata,
    items: {
      has_more: false,
      data: [
        {
          id: binding.subscription_item_id,
          quantity: 1,
          current_period_start: context.period_start,
          current_period_end: context.period_end,
          price: { id: context.price_id },
        },
      ],
    },
  };
  const calls: { url: string; init: RequestInit }[] = [];
  const deps: LiveConsentDependencies = {
    runtime: {
      enabled: true,
      mode: "live",
      nodeEnv: "production",
      secretKey: "sk_live_SYNTHETIC_NOT_A_CREDENTIAL_000000",
    },
    transport: async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify(
          url.endsWith("/account")
            ? { id: "acct_1Rv3KdC84VkhhIRz", object: "account" }
            : url.includes("/line_items")
              ? lines
              : url.includes("/subscriptions/")
                ? sub
                : session,
        ),
      );
    },
    resolveBinding: async () => binding,
    stillCurrent: async () => true,
    nowSeconds: () => now,
  };
  const policy: LivePaidPolicy = {
    id: context.policy_id,
    revision: 1,
    enabled: true,
    offer_key: "KXRA_STARTER_V1",
    mapping_revision: 1,
    terms_document_id: uuid("6"),
    terms_document_version: 1,
    terms_url: presentation.terms_url,
    message: presentation.message,
    activation_review_sha256: hash,
    terms_review_sha256: hash,
    presentation_sha256: presentation.presentation_sha256,
    tax_review_sha256: hash,
    cancellation_review_sha256: hash,
    grace_review_sha256: hash,
    refund_review_sha256: hash,
    trial_review_sha256: hash,
    ai_review_sha256: hash,
    access_rule: "CURRENT_COLLECTED_ACTIVE_ONLY",
    cancellation_mode: "END_OF_PAID_PERIOD",
    grace_seconds: 0,
    refund_mode: "DENY_ANY_REFUND",
    trial_access: false,
    past_due_access: false,
    proof_ttl_seconds: 120,
  };
  const payment: LivePaymentEvidence = {
    version: 1,
    state: "COLLECTED",
    reason: "MATCHED_CAPTURED_CARD_COLLECTION_NOT_PAYOUT",
    org_id: context.org_id,
    reconciliation_id: context.reconciliation_id,
    binding_version: 7,
    mapping_revision: 1,
    invoice_id: context.invoice_id,
    subscription_id: context.subscription_id,
    customer_id: context.customer_id,
    offer_key: context.offer_key,
    period_start: context.period_start,
    period_end: context.period_end,
    currency: "GBP",
    expected_total_minor: 2900,
    collected_minor: 2900,
    refunded_minor: 0,
    payment_intent_id: "pi_synthetic123",
    charge_id: "ch_synthetic123",
    subscription_status: "active",
    observation_started_at: now - 10,
    observed_at: now,
    source_sha256: hash,
    requires_recheck: true,
    entitlement_authority: false,
    payout_authority: false,
  };
  const consent: LiveCheckoutConsentProof = {
    state: "VERIFIED",
    reason: "STRIPE_REQUIRED_TERMS_ACCEPTED",
    org_id: context.org_id,
    reconciliation_id: context.reconciliation_id,
    binding_version: 7,
    mapping_revision: 1,
    offer_key: context.offer_key,
    checkout_intent_id: context.checkout_intent_id,
    checkout_session_id: context.checkout_session_id,
    customer_id: context.customer_id,
    subscription_id: context.subscription_id,
    invoice_id: context.invoice_id,
    price_id: context.price_id,
    product_id: context.product_id,
    terms_review_sha256: hash,
    presentation_sha256: presentation.presentation_sha256,
    period_start: context.period_start,
    period_end: context.period_end,
    subscription_status: "active",
    cancel_at_period_end: false,
    observed_at: now,
    source_sha256: hash,
    entitlement_authority: false,
  };
  return {
    presentation,
    context,
    binding,
    session,
    lines,
    sub,
    calls,
    deps,
    policy,
    payment,
    consent,
  };
}
const read = (
  f: ReturnType<typeof fixture>,
  input: unknown = { reconciliation_id: uuid("3") },
) => readLiveCheckoutConsent(f.deps, input, principal);
test("historical expired completed checkout proves consent only, independent of renewal payment", async () => {
  const f = fixture();
  const s = await read(f);
  assert.equal(s.state, "VERIFIED");
  assert.equal(s.entitlement_authority, false);
  assert.equal(f.calls.length, 5);
  for (const c of f.calls) {
    assert.equal(c.init.method, "GET");
    assert.equal(c.init.redirect, "error");
    assert.equal(new URL(c.url).origin, "https://api.stripe.com");
    assert.ok(c.init.signal);
  }
  const p = buildLivePaidProof(f.context, f.policy, f.payment, s, now);
  assert.equal(p.eligibility, "ELIGIBLE");
  assert.equal(p.entitlement_authority, false);
});
for (const [label, change] of [
  [
    "missing accepted checkbox",
    (f) => (f.session.consent.terms_of_service = "none"),
  ],
  [
    "not required",
    (f) => (f.session.consent_collection.terms_of_service = "none"),
  ],
  ["uncompleted session", (f) => (f.session.status = "open")],
  ["wrong customer", (f) => (f.session.customer = "cus_other123")],
  ["wrong subscription", (f) => (f.session.subscription = "sub_other123")],
  ["wrong original intent", (f) => (f.session.client_reference_id = uuid("7"))],
  [
    "wrong terms",
    (f) => (f.session.metadata.kxra_terms_sha256 = "b".repeat(64)),
  ],
  [
    "wrong presentation",
    (f) =>
      (f.session.custom_text.terms_of_service_acceptance.message = "different"),
  ],
  ["test session", (f) => (f.session.livemode = false)],
  ["wrong line quantity", (f) => (f.lines.data[0].quantity = 5)],
  ["wrong price", (f) => (f.lines.data[0].price.id = "price_other123")],
  ["wrong period", (f) => (f.sub.items.data[0].current_period_end += 1)],
  ["wrong current invoice", (f) => (f.sub.latest_invoice = "in_old123")],
] as [string, (f: ReturnType<typeof fixture>) => void][])
  test(`consent rejects ${label}`, async () => {
    const f = fixture();
    change(f);
    assert.equal((await read(f)).state, "UNVERIFIED");
  });
test("consent binding races fail closed and bodies cannot choose session", async () => {
  const f = fixture();
  f.deps.stillCurrent = async () => false;
  assert.equal((await read(f)).state, "UNVERIFIED");
  await assert.rejects(
    read(f, {
      reconciliation_id: uuid("3"),
      session_id: f.context.checkout_session_id,
    }),
  );
  f.binding.org_id = uuid("8");
  await assert.rejects(read(f));
});
test("presentation requires reviewed exact message/versioned same-origin terms", () => {
  const f = fixture();
  assert.equal(
    validateCheckoutTermsPresentation(
      f.presentation,
      hash,
      "https://kxra.example",
    ).presentation_sha256,
    f.presentation.presentation_sha256,
  );
  for (const p of [
    { ...f.presentation, message: "unreviewed" },
    { ...f.presentation, terms_url: "https://evil.example/legal" },
    { ...f.presentation, presentation_sha256: hash },
    { ...f.presentation, terms_review_sha256: "b".repeat(64) },
  ])
    assert.throws(() =>
      validateCheckoutTermsPresentation(p, hash, "https://kxra.example"),
    );
});
for (const state of [
  "PENDING",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "DISPUTED",
  "MISMATCHED",
  "UNVERIFIED",
  "VERSION_RACE",
] as const)
  test(`payment ${state} cannot grant work`, () => {
    const f = fixture();
    assert.equal(
      buildLivePaidProof(
        f.context,
        f.policy,
        { ...f.payment, state },
        f.consent,
        now,
      ).eligibility,
      "DENY",
    );
  });
test("settlement without consent and consent without settlement are denied", () => {
  const f = fixture();
  assert.equal(
    buildLivePaidProof(
      f.context,
      f.policy,
      f.payment,
      { ...f.consent, state: "UNVERIFIED" },
      now,
    ).eligibility,
    "DENY",
  );
  assert.equal(
    buildLivePaidProof(
      f.context,
      f.policy,
      { ...f.payment, payment_intent_id: null },
      f.consent,
      now,
    ).eligibility,
    "DENY",
  );
});
test("no policy/cancellation/grace/refund/trial/AI terms are inferred", () => {
  const f = fixture();
  for (const key of [
    "cancellation_review_sha256",
    "grace_review_sha256",
    "refund_review_sha256",
    "trial_review_sha256",
    "ai_review_sha256",
    "tax_review_sha256",
  ]) {
    const p = { ...f.policy } as Record<string, unknown>;
    delete p[key];
    assert.throws(() =>
      buildLivePaidProof(f.context, p, f.payment, f.consent, now),
    );
  }
  assert.throws(() =>
    buildLivePaidProof(
      f.context,
      { ...f.policy, enabled: false },
      f.payment,
      f.consent,
      now,
    ),
  );
  assert.throws(() =>
    buildLivePaidProof(
      f.context,
      { ...f.policy, grace_seconds: 86400 },
      f.payment,
      f.consent,
      now,
    ),
  );
});
test("pending/pastdue/cancelled subscriptions and proof/period expiry deny", () => {
  const f = fixture();
  for (const status of [
    "past_due",
    "paused",
    "canceled",
    "trialing",
    "incomplete",
  ]) {
    assert.equal(
      buildLivePaidProof(
        f.context,
        f.policy,
        { ...f.payment, subscription_status: status },
        { ...f.consent, subscription_status: status },
        now,
      ).eligibility,
      "DENY",
    );
  }
  assert.equal(
    buildLivePaidProof(f.context, f.policy, f.payment, f.consent, now + 201)
      .eligibility,
    "DENY",
  );
  assert.equal(
    buildLivePaidProof(
      f.context,
      f.policy,
      f.payment,
      { ...f.consent, observed_at: now - 300 },
      now,
    ).eligibility,
    "DENY",
  );
});
test("scheduled cancellation follows explicit reviewed policy only", () => {
  const f = fixture();
  const s = { ...f.consent, cancel_at_period_end: true };
  assert.equal(
    buildLivePaidProof(f.context, f.policy, f.payment, s, now).eligibility,
    "ELIGIBLE",
  );
  assert.equal(
    buildLivePaidProof(
      f.context,
      { ...f.policy, cancellation_mode: "DENY_WHEN_SCHEDULED" },
      f.payment,
      s,
      now,
    ).eligibility,
    "DENY",
  );
});
test("tenant, generation, invoice, period and terms cannot be mixed", () => {
  const f = fixture();
  for (const p of [
    { ...f.payment, org_id: uuid("8") },
    { ...f.payment, binding_version: 8 },
    { ...f.payment, invoice_id: "in_other123" },
    { ...f.payment, period_end: now + 5000 },
  ])
    assert.throws(() =>
      buildLivePaidProof(f.context, f.policy, p, f.consent, now),
    );
  assert.throws(() =>
    buildLivePaidProof(
      f.context,
      f.policy,
      f.payment,
      { ...f.consent, terms_review_sha256: "b".repeat(64) },
      now,
    ),
  );
});
test("duplicate proposals have stable fingerprints; old generation is never silently promoted", () => {
  const f = fixture();
  const p = buildLivePaidProof(f.context, f.policy, f.payment, f.consent, now);
  assert.equal(
    p.evidence_sha256,
    buildLivePaidProof(f.context, f.policy, f.payment, f.consent, now)
      .evidence_sha256,
  );
  assert.throws(() =>
    buildLivePaidProof(
      { ...f.context, binding_version: 8 },
      f.policy,
      f.payment,
      f.consent,
      now,
    ),
  );
});
test("worker SQL commands are disabled by default and accept no client authority", () => {
  const f = fixture();
  const input = {
    reconciliation_id: uuid("3"),
    org_id: principal.org_id,
    expected_total_minor: 2900,
    invoice_id: f.context.invoice_id,
    subscription_item_id: "si_synthetic123",
    period_start: f.context.period_start,
    period_end: f.context.period_end,
  };
  assert.throws(() => reserveLivePaidReadCommand(input));
  assert.equal(reserveLivePaidReadCommand(input, true).role, "BILLING_WORKER");
  assert.throws(() =>
    reserveLivePaidReadCommand({ ...input, role: "OWNER" }, true),
  );
  const p = buildLivePaidProof(f.context, f.policy, f.payment, f.consent, now);
  assert.throws(() => commitLivePaidProofCommand(p));
  assert.equal(
    commitLivePaidProofCommand(p, true).entitlement_authority,
    false,
  );
});

test("proof command rejects altered packets and raw provider fields", () => {
  const f = fixture();
  const p = buildLivePaidProof(f.context, f.policy, f.payment, f.consent, now);
  assert.throws(() =>
    commitLivePaidProofCommand({ ...p, collected_minor: 1 }, true),
  );
  assert.throws(() =>
    commitLivePaidProofCommand(
      { ...p, client_secret: "private" } as typeof p,
      true,
    ),
  );
});

test("onboarding paid status has no caller-selectable tenant or provider identifiers", () => {
  const c = livePaidAccessStatusCommand();
  assert.equal(c.role, "AUTHENTICATED_SERVER");
  assert.deepEqual(c.values, []);
  assert.equal(c.entitlement_authority, false);
  assert.equal(c.text, "select kxra_private.live_paid_access_status() value");
});

test("read proof fencing is disabled by default and worker-only", () => {
  assert.throws(() =>
    currentLivePaidReadCommand({ reconciliation_id: uuid("3") }),
  );
  assert.equal(
    currentLivePaidReadCommand({ reconciliation_id: uuid("3") }, true).role,
    "BILLING_WORKER",
  );
  assert.throws(() =>
    currentLivePaidReadCommand(
      { reconciliation_id: uuid("3"), actor_id: principal.actor_id },
      true,
    ),
  );
});
