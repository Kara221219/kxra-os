import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  runPaidRefreshOnce,
  type PaidRefreshQuery,
} from "../packages/integrations/live-paid-refresh-worker";
import { readPaidRefreshPreflight } from "../packages/integrations/live-paid-refresh-preflight";
import { checkoutTermsPresentationDigest } from "../packages/integrations/live-checkout-consent";
import { modernBillingFixture } from "./support/modern-billing-scope";
import {
  modernScopeDigest,
  type ModernExecutionMode,
} from "../packages/integrations/modern-billing-scope";
const now = 1_800_000_000,
  hash = "a".repeat(64),
  uuid = (d: string) =>
    `${d.repeat(8)}-${d.repeat(4)}-4${d.repeat(3)}-8${d.repeat(3)}-${d.repeat(12)}`;
function fixture(mode: ModernExecutionMode = "STAGING_SANDBOX") {
  const modern = modernBillingFixture(mode);
  // Explicit production fixture remains compatible with strict LIVE/project split.
  if (mode === "LIVE") {
    modern.execution.execution_scope.project_ref = "lhbgeucifxxcdoyrnesf";
    const { scope_sha256: _, ...material } = modern.execution.execution_scope;
    modern.execution.execution_scope.scope_sha256 = modernScopeDigest(
      material,
      modern.execution.review_sha256,
      modern.execution.catalogue,
    );
    Object.assign(modern.runtimeIdentity, {
      environment: "production",
      project_ref: material.project_ref,
      supabase_url: `https://${material.project_ref}.supabase.co`,
    });
  }
  const scope = modern.execution.execution_scope,
    row = modern.execution.catalogue[0];
  const presentation = {
    terms_review_sha256: hash,
    terms_url: `https://kxra.example/terms?sha256=${hash}`,
    message: `Synthetic [terms](https://kxra.example/terms?sha256=${hash})`,
  };
  const p = {
    id: uuid("5"),
    revision: 1,
    enabled: true,
    offer_key: row.offer_key,
    mapping_revision: 1,
    terms_document_id: uuid("6"),
    terms_document_version: 1,
    ...presentation,
    presentation_sha256: checkoutTermsPresentationDigest(presentation),
    activation_review_sha256: hash,
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
  const subject = {
    execution_scope: scope,
    org_id: uuid("2"),
    actor_id: uuid("1"),
    claim_token: uuid("8"),
    binding_version: 7,
    customer_id: "cus_synthetic123",
    subscription_id: "sub_synthetic123",
    checkout_intent_id: uuid("4"),
    checkout_session_id: `cs_${scope.livemode ? "live" : "test"}_synthetic123`,
    checkout_actor_id: uuid("9"),
    offer_key: row.offer_key,
    mapping_revision: 1,
    mapping: {
      ...row,
      tax_behavior: "inclusive",
      automatic_tax: false,
      activation_review_sha256: hash,
      terms_review_sha256: hash,
      tax_review_sha256: hash,
    },
    policy: p,
    lease_until: now + 120,
  };
  const metadata = {
    kxra_live_intent_id: subject.checkout_intent_id,
    kxra_catalogue_offer: row.offer_key,
    kxra_mapping_revision: "1",
    kxra_execution_scope: scope.scope_id,
    kxra_execution_mode: scope.execution_mode,
    kxra_execution_sha256: scope.scope_sha256,
    kxra_execution_project: scope.project_ref,
    kxra_terms_sha256: hash,
    kxra_consent_presentation_sha256: p.presentation_sha256,
  };
  const sub = {
    id: subject.subscription_id,
    object: "subscription",
    livemode: scope.livemode,
    customer: subject.customer_id,
    latest_invoice: "in_current123",
    status: "active",
    cancel_at_period_end: false,
    metadata,
    items: {
      object: "list",
      has_more: false,
      data: [
        {
          id: "si_synthetic123",
          quantity: 1,
          current_period_start: now - 60,
          current_period_end: now + 3000,
          price: { id: row.price_id },
        },
      ],
    },
  };
  const line = {
    id: "il_synthetic123",
    object: "line_item",
    invoice: sub.latest_invoice,
    livemode: scope.livemode,
    currency: "gbp",
    amount: 2900,
    quantity: 1,
    period: { start: now - 60, end: now + 3000 },
    pricing: {
      type: "price_details",
      price_details: { price: row.price_id, product: row.product_id },
    },
    parent: {
      type: "subscription_item_details",
      subscription_item_details: {
        subscription: sub.id,
        subscription_item: "si_synthetic123",
        proration: false,
      },
    },
    discount_amounts: [],
    pretax_credit_amounts: [],
  };
  const invoice = {
    id: sub.latest_invoice,
    object: "invoice",
    livemode: scope.livemode,
    customer: subject.customer_id,
    currency: "gbp",
    status: "paid",
    billing_reason: "subscription_cycle",
    collection_method: "charge_automatically",
    subtotal: 2900,
    total: 2900,
    amount_due: 2900,
    amount_paid: 2900,
    amount_remaining: 0,
    amount_overpaid: 0,
    starting_balance: 0,
    pre_payment_credit_notes_amount: 0,
    post_payment_credit_notes_amount: 0,
    total_discount_amounts: [],
    automatic_tax: { enabled: false, status: null },
    parent: {
      type: "subscription_details",
      subscription_details: { subscription: sub.id },
    },
    lines: { object: "list", has_more: false, data: [line] },
  };
  const price = {
    id: row.price_id,
    object: "price",
    livemode: scope.livemode,
    currency: "gbp",
    unit_amount: 2900,
    billing_scheme: "per_unit",
    tax_behavior: "inclusive",
    type: "recurring",
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    transform_quantity: null,
    custom_unit_amount: null,
    product: {
      id: row.product_id,
      object: "product",
      livemode: scope.livemode,
    },
  };
  const payments = {
    object: "list",
    has_more: false,
    data: [
      {
        id: "inpay_synthetic123",
        object: "invoice_payment",
        livemode: scope.livemode,
        invoice: invoice.id,
        currency: "gbp",
        status: "paid",
        amount_requested: 2900,
        amount_paid: 2900,
        payment: { type: "payment_intent", payment_intent: "pi_synthetic123" },
      },
    ],
  };
  const pi = {
    id: "pi_synthetic123",
    object: "payment_intent",
    livemode: scope.livemode,
    customer: subject.customer_id,
    currency: "gbp",
    amount: 2900,
    amount_received: 2900,
    amount_capturable: 0,
    latest_charge: "ch_synthetic123",
    status: "succeeded",
    last_payment_error: null,
    on_behalf_of: null,
    transfer_data: null,
  };
  const charge = {
    id: "ch_synthetic123",
    object: "charge",
    livemode: scope.livemode,
    customer: subject.customer_id,
    currency: "gbp",
    payment_intent: pi.id,
    amount: 2900,
    amount_captured: 2900,
    amount_refunded: 0,
    paid: true,
    captured: true,
    refunded: false,
    disputed: false,
    status: "succeeded",
    payment_method_details: { type: "card" },
    on_behalf_of: null,
    transfer_data: null,
  };
  const session = {
    id: subject.checkout_session_id,
    object: "checkout.session",
    livemode: scope.livemode,
    mode: "subscription",
    status: "complete",
    customer: subject.customer_id,
    subscription: sub.id,
    client_reference_id: subject.checkout_intent_id,
    consent_collection: { terms_of_service: "required" },
    consent: { terms_of_service: "accepted" },
    custom_text: { terms_of_service_acceptance: { message: p.message } },
    metadata,
    invoice: "in_HISTORICAL123",
    payment_status: "unpaid",
    expires_at: now - 100,
  };
  const lines = {
    object: "list",
    has_more: false,
    data: [
      {
        quantity: 1,
        currency: "gbp",
        price: { ...price, product: row.product_id },
      },
    ],
  };
  const calls: string[] = [],
    sql: string[] = [],
    committed: Record<string, unknown>[] = [];
  let current = true,
    reserved = false,
    readsAtReserve = 0,
    wrongWake = false;
  const transport = async (url: string, init: RequestInit) => {
    assert.equal(init.method, "GET");
    assert.ok(init.signal);
    assert.equal(init.redirect, "error");
    calls.push(url);
    const value = url.endsWith("/account")
      ? { id: scope.account_id, object: "account" }
      : url.includes("/prices/")
        ? price
        : url.includes("/subscriptions/")
          ? sub
          : url.includes("/invoice_payments?")
            ? payments
            : url.includes("/invoices/")
              ? invoice
              : url.includes("/payment_intents/")
                ? pi
                : url.includes("/charges/")
                  ? charge
                  : url.includes("/line_items?")
                    ? lines
                    : session;
    return new Response(JSON.stringify(value));
  };
  const query: PaidRefreshQuery = async (text, values = []) => {
    sql.push(text);
    let value: unknown;
    if (text.includes("scope_attestation")) value = modern.execution;
    else if (text.includes("claim_live_billing_wakeups"))
      return {
        rows: [
          {
            value: {
              execution_scope: scope,
              event_id: "evt_synthetic123",
              org_id: subject.org_id,
              binding_version: wrongWake ? 6 : 7,
              claim_token: uuid("7"),
            },
          },
        ],
      };
    else if (text.includes("claim_live_paid_refresh"))
      return { rows: [{ value: subject }] };
    else if (text.includes("refresh_current") || text.includes("read_current"))
      value = current;
    else if (text.includes("reserve_live_paid_refresh")) {
      reserved = true;
      readsAtReserve = calls.length;
      value = {
        execution_scope: scope,
        context: {
          reconciliation_id: values[2],
          org_id: subject.org_id,
          actor_id: subject.actor_id,
          binding_version: 7,
          offer_key: row.offer_key,
          mapping_revision: 1,
          policy_id: p.id,
          policy_revision: 1,
          customer_id: subject.customer_id,
          subscription_id: sub.id,
          invoice_id: values[4],
          price_id: row.price_id,
          product_id: row.product_id,
          checkout_intent_id: subject.checkout_intent_id,
          checkout_session_id: subject.checkout_session_id,
          period_start: values[6],
          period_end: values[7],
          expected_total_minor: values[3],
          created_at: now,
          expires_at: now + 300,
        },
        mapping: subject.mapping,
        policy: p,
        subscription_item_id: values[5],
        checkout_actor_id: subject.checkout_actor_id,
      };
    } else if (text.includes("commit_live_paid_refresh")) {
      const proof = JSON.parse(String(values[3]));
      committed.push(proof);
      value = proof.eligibility === "ELIGIBLE" ? "ELIGIBLE" : "DENIED";
    } else if (text.includes("ack_live_billing_wakeup")) value = "DONE";
    else throw Error(text);
    return { rows: [{ value }] };
  };
  const options = {
    ...modern,
    enabled: true,
    nodeEnv: "production",
    mode,
    secretKey: `sk_${scope.livemode ? "live" : "test"}_SYNTHETIC_NOT_A_CREDENTIAL_000000`,
    origin: "https://kxra.example",
    transport,
    query,
    nowSeconds: () => now,
  };
  return {
    options,
    subject,
    sub,
    invoice,
    charge,
    calls,
    sql,
    committed,
    preflight: {
      ...modern,
      secretKey: options.secretKey,
      mode,
      transport,
      stillCurrent: async () => current,
      nowSeconds: () => now,
    },
    setCurrent: (v: boolean) => {
      current = v;
    },
    wrongWake: () => {
      wrongWake = true;
    },
    reserved: () => reserved,
    readsAtReserve: () => readsAtReserve,
  };
}
for (const mode of ["LIVE", "STAGING_SANDBOX"] as const)
  test(`${mode} actual preflight → payment/consent → proof → fenced commit and exact ACK`, async () => {
    const f = fixture(mode),
      result = await runPaidRefreshOnce(f.options);
    assert.equal(result.outcomes[0].outcome, "ELIGIBLE");
    assert.equal(result.outcomes[0].acknowledged, 1);
    assert.equal(f.readsAtReserve(), 4);
    assert.equal(f.committed.length, 1);
    assert.equal(f.committed[0].entitlement_authority, false);
    assert.equal(
      (f.committed[0].execution_scope as { livemode: boolean }).livemode,
      mode === "LIVE",
    );
    assert.ok(f.calls.length <= 21);
    if (mode === "STAGING_SANDBOX")
      assert.ok(
        f.sql
          .filter((s) => !s.includes("scope_attestation"))
          .every((s) => s.includes("staging_sandbox_")),
      );
  });
test("default-off performs no SQL or provider reads", async () => {
  const f = fixture();
  await assert.rejects(
    runPaidRefreshOnce({ ...f.options, enabled: undefined }),
    /DISABLED/,
  );
  assert.equal(f.sql.length, 0);
  assert.equal(f.calls.length, 0);
});
test("superseded preflight generation stops before reservation", async () => {
  const f = fixture();
  f.setCurrent(false);
  await runPaidRefreshOnce(f.options);
  assert.equal(f.calls.length, 0);
  assert.equal(f.reserved(), false);
  assert.equal(f.committed.length, 0);
});
test("provider mode mismatch remains false and prevents reservation", async () => {
  const f = fixture();
  f.sub.livemode = true;
  await runPaidRefreshOnce(f.options);
  assert.equal(f.reserved(), false);
  assert.equal(f.sub.livemode, true);
});
test("nested wrong provider mode is rejected without rewritten payload", async () => {
  const f = fixture();
  Object.assign(f.sub, { nested: { livemode: true } });
  await assert.rejects(
    readPaidRefreshPreflight(f.preflight, f.subject),
    /MODE_MISMATCH/,
  );
  assert.equal(f.reserved(), false);
});
test("current invoice gross mismatch cannot reserve a read", async () => {
  const f = fixture();
  f.invoice.total = 3000;
  await runPaidRefreshOnce(f.options);
  assert.equal(f.reserved(), false);
});
test("refund evidence denies and never manufactures collected authority", async () => {
  const f = fixture();
  f.charge.refunded = true;
  f.charge.amount_refunded = 2900;
  const r = await runPaidRefreshOnce(f.options);
  assert.equal(r.outcomes[0].outcome, "DENIED");
  assert.equal(f.committed[0].payment_state, "REFUNDED");
  assert.equal(f.committed[0].eligibility, "DENY");
});
test("older wakeup is never ACKed with a newer proof", async () => {
  const f = fixture();
  f.wrongWake();
  const r = await runPaidRefreshOnce(f.options);
  assert.equal(r.outcomes[0].outcome, "ELIGIBLE");
  assert.equal(r.outcomes[0].acknowledged, 0);
  assert.ok(!f.sql.some((s) => s.includes("ack_live")));
});
test("0110 native source pins worker-only bounded due discovery and fences", () => {
  const s = fs.readFileSync(
    "supabase/migrations/0110_bounded_paid_proof_refresh.sql",
    "utf8",
  );
  assert.match(s, /n not between 1 and 20/);
  assert.match(s, /for update of binding skip locked limit n/);
  assert.match(s, /valid_until<=now\(\)\+interval '60 seconds'/);
  assert.match(
    s,
    /l\.claim_token=token and l\.lease_until>now\(\) and l\.binding_version=b\.version/,
  );
  assert.match(s, /session_user<>'kxra_billing_runner'/);
  assert.match(s, /current_setting\('role',true\)<>'kxra_billing_worker'/);
  assert.match(s, /state='SUPERSEDED'/);
  assert.ok(!s.includes("state='DONE'"));
  assert.ok(!/grant .* to (authenticated|anon|public);/i.test(s));
  for (const name of [
    "claim_live_paid_refresh",
    "live_paid_refresh_current",
    "reserve_live_paid_refresh",
    "commit_live_paid_refresh",
  ]) {
    assert.ok(s.includes(`function kxra_private.${name}(`));
    assert.ok(s.includes(`function kxra_private.staging_sandbox_${name}(`));
  }
  assert.ok(
    !/insert into kxra_private\.(live_paid_policies|live_billing_activation|modern_billing_execution_identity)/.test(
      s,
    ),
  );
});

test("provider generation change after preflight reads prevents reservation", async () => {
  const f = fixture();
  let reads = 0;
  const result = await runPaidRefreshOnce({
    ...f.options,
    transport: async (url, init) => {
      const response = await f.options.transport(url, init);
      if (++reads === 3) f.setCurrent(false);
      return response;
    },
  });
  assert.equal(result.outcomes[0].outcome, "UNVERIFIED");
  assert.equal(f.reserved(), false);
  assert.equal(f.calls.length, 4);
});
test("generation change during payment reads prevents proof commit", async () => {
  const f = fixture();
  let currentChecks = 0;
  await runPaidRefreshOnce({
    ...f.options,
    query: async (text, values) => {
      if (text.includes("refresh_current") && ++currentChecks === 4)
        f.setCurrent(false);
      return f.options.query(text, values);
    },
  });
  assert.equal(f.reserved(), true);
  assert.equal(f.committed.length, 0);
  assert.ok(!f.sql.some((s) => s.includes("ack_live")));
});
test("CAS stale outcome never acknowledges a wakeup", async () => {
  const f = fixture();
  const r = await runPaidRefreshOnce({
    ...f.options,
    query: async (text, values) => {
      if (text.includes("commit_live_paid_refresh"))
        return { rows: [{ value: "STALE" }] };
      return f.options.query(text, values);
    },
  });
  assert.equal(r.outcomes[0].outcome, "STALE");
  assert.equal(r.outcomes[0].acknowledged, 0);
});
test("provider failure has no automatic retry or replacement reservation", async () => {
  const f = fixture();
  let calls = 0;
  await runPaidRefreshOnce({
    ...f.options,
    transport: async () => {
      calls++;
      return new Response("", { status: 429 });
    },
  });
  assert.equal(calls, 1);
  assert.equal(f.reserved(), false);
  assert.equal(f.committed.length, 0);
});
test("bounded limit and private runtime guard run before SQL", async () => {
  const f = fixture();
  await assert.rejects(runPaidRefreshOnce({ ...f.options, limit: 21 }));
  await assert.rejects(
    runPaidRefreshOnce({ ...f.options, nodeEnv: "development" }),
    /RUNTIME_REQUIRED/,
  );
  assert.equal(f.sql.length, 0);
  assert.equal(f.calls.length, 0);
});
