import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import {
  createStripeBillingCustomer,
  createStripeCheckoutSession,
  createStripePortalSession,
  type BillingCustomerIntent,
  type BillingSessionIntent,
} from "../packages/integrations/stripe-hosted";
import { runtimeFile } from "./support/runtime";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
process.env.KXRA_BILLING_ENABLED = "true";
process.env.STRIPE_SECRET_KEY = `sk_test_${crypto.randomBytes(24).toString("hex")}`;
process.env.STRIPE_PORTAL_CONFIGURATION_ID = "bpc_synthetic123";
process.env.KXRA_ORIGIN = "http://127.0.0.1:3210";

after(() => admin.end());

async function as(db: pg.PoolClient, account: string | null, org = "") {
  await db.query("reset role");
  await db.query(`set local role ${account ? "authenticated" : "anon"}`);
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [account || "", JSON.stringify({ sub: account, aal: "aal2" }), org],
  );
}

async function tx(work: (db: pg.PoolClient) => Promise<void>) {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await work(db);
  } finally {
    await db.query("rollback");
    db.release();
  }
}

async function fixture(
  db: pg.PoolClient,
  role: "ORG_ADMIN" | "ORG_MEMBER" = "ORG_ADMIN",
  createCustomer = true,
) {
  const org = crypto.randomUUID();
  const account = crypto.randomUUID();
  const plan = crypto.randomUUID();
  const version = crypto.randomUUID();
  const customer = `cus_${crypto.randomBytes(8).toString("hex")}`;
  const price = `price_${crypto.randomBytes(8).toString("hex")}`;
  await db.query(
    `insert into kxra.organisations(id,name,slug,organisation_kind,relationship_type)
     values($1,'Hosted billing fixture',$2,'CUSTOMER','CUSTOMER')`,
    [org, `hosted-${crypto.randomUUID().slice(0, 8)}`],
  );
  await db.query(
    `insert into kxra.account_identities(account_id,auth_subject,state,email_verified_at)
     values($1::uuid,$1::uuid::text,'ACTIVE',now())`,
    [account],
  );
  await db.query(
    `insert into kxra.organisation_memberships(
      org_id,account_id,security_role,relationship_type,state,display_name,grant_source
     ) values($1,$2,$3,'CUSTOMER','ACTIVE','Billing fixture','AT_FIXTURE')`,
    [org, account, role],
  );
  await db.query(
    "insert into kxra.plans(id,plan_key,name,state) values($1,$2,'Hosted plan','ACTIVE')",
    [plan, `hosted-${crypto.randomUUID().slice(0, 8)}`],
  );
  await db.query(
    `insert into kxra.plan_versions(
      id,plan_id,version,state,currency,amount_minor,billing_interval,tax_behavior,
      provider_price_reference,effective_at
     ) values($1,$2,1,'ACTIVE','GBP',3000,'MONTH','EXCLUSIVE',$3,now())`,
    [version, plan, price],
  );
  await db.query(
    `insert into kxra.price_references(
      plan_version_id,provider,provider_price_id,environment,state
     ) values($1,'STRIPE',$2,'TEST','ACTIVE')`,
    [version, price],
  );
  if (createCustomer)
    await db.query(
      "insert into kxra.billing_customers(org_id,provider_customer_id) values($1,$2)",
      [org, customer],
    );
  return { org, account, version, customer, price };
}

test("billing customer bootstrap derives organization and records one test customer", () =>
  tx(async (db) => {
    const value = await fixture(db, "ORG_ADMIN", false);
    await as(db, value.account, value.org);
    const first = (
      await db.query("select * from kxra.request_billing_customer($1)", [
        crypto.randomUUID(),
      ])
    ).rows[0];
    const duplicateAttempt = (
      await db.query("select * from kxra.request_billing_customer($1)", [
        crypto.randomUUID(),
      ])
    ).rows[0];
    assert.equal(first.organisation_name, "Hosted billing fixture");
    assert.equal(first.intent_state, "REQUESTED");
    assert.equal(duplicateAttempt.intent_id, first.intent_id);

    await db.query("reset role");
    await db.query("set local role kxra_billing_worker");
    const createdAt = new Date(Date.now() + 1000).toISOString();
    assert.equal(
      (
        await db.query(
          "select kxra_private.record_stripe_billing_customer($1,$2,$3,false) state",
          [first.intent_id, value.customer, createdAt],
        )
      ).rows[0].state,
      "READY",
    );
    await db.query("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from kxra.billing_customers where org_id=$1 and provider_customer_id=$2",
          [value.org, value.customer],
        )
      ).rows[0].n,
      1,
    );
    await as(db, value.account, value.org);
    const completedReplay = (
      await db.query("select * from kxra.request_billing_customer($1)", [
        crypto.randomUUID(),
      ])
    ).rows[0];
    assert.equal(completedReplay.intent_id, first.intent_id);
    assert.equal(completedReplay.intent_state, "READY");
    await db.query("reset role");
    await db.query("set local role kxra_billing_worker");
    await assert.rejects(() =>
      db.query(
        "select kxra_private.record_stripe_billing_customer($1,$2,$3,false)",
        [first.intent_id, "cus_changed123", createdAt],
      ),
    );
  }));

test("hosted billing intent derives customer and TEST price and replays exactly", () =>
  tx(async (db) => {
    const value = await fixture(db);
    const requestId = crypto.randomUUID();
    await as(db, value.account, value.org);
    const first = (
      await db.query("select * from kxra.request_checkout_session($1,$2)", [
        value.version,
        requestId,
      ])
    ).rows[0];
    const replay = (
      await db.query("select * from kxra.request_checkout_session($1,$2)", [
        value.version,
        requestId,
      ])
    ).rows[0];
    const duplicateAttempt = (
      await db.query("select * from kxra.request_checkout_session($1,$2)", [
        value.version,
        crypto.randomUUID(),
      ])
    ).rows[0];
    assert.equal(first.provider_customer_id, value.customer);
    assert.equal(first.provider_price_id, value.price);
    assert.equal(first.intent_state, "REQUESTED");
    assert.deepEqual(replay, first);
    assert.equal(duplicateAttempt.intent_id, first.intent_id);

    await db.query("reset role");
    await db.query("set local role kxra_billing_worker");
    const expires = new Date(Date.now() + 30 * 60_000).toISOString();
    assert.equal(
      (
        await db.query(
          "select kxra_private.record_stripe_billing_session($1,'CHECKOUT',$2,$3,$4,$5,false) state",
          [
            first.intent_id,
            "cs_test_synthetic123",
            value.customer,
            "https://checkout.stripe.com/c/pay/synthetic",
            expires,
          ],
        )
      ).rows[0].state,
      "READY",
    );
    await as(db, value.account, value.org);
    const visible = (
      await db.query(
        "select state,provider_session_id,redirect_url from kxra.billing_session_intents where id=$1",
        [first.intent_id],
      )
    ).rows[0];
    assert.equal(visible.state, "READY");
    assert.equal(visible.provider_session_id, "cs_test_synthetic123");
  }));

test("ordinary member, anonymous caller and forged tenant cannot request billing sessions", () =>
  tx(async (db) => {
    const member = await fixture(db, "ORG_MEMBER");
    await as(db, member.account, member.org);
    await assert.rejects(() =>
      db.query("select * from kxra.request_checkout_session($1,$2)", [
        member.version,
        crypto.randomUUID(),
      ]),
    );
    await db.query("rollback");
    await db.query("begin");
    const unlinkedMember = await fixture(db, "ORG_MEMBER", false);
    await as(db, unlinkedMember.account, unlinkedMember.org);
    await assert.rejects(() =>
      db.query("select * from kxra.request_billing_customer($1)", [
        crypto.randomUUID(),
      ]),
    );
    await db.query("rollback");
    await db.query("begin");
    const adminValue = await fixture(db);
    await as(db, null, adminValue.org);
    await assert.rejects(() =>
      db.query("select * from kxra.request_portal_session($1)", [
        crypto.randomUUID(),
      ]),
    );
  }));

test("Stripe hosted adapter sends fixed test-mode forms and validates returned authority", async () => {
  const intent: BillingSessionIntent = {
    intent_id: crypto.randomUUID(),
    intent_state: "REQUESTED",
    provider_customer_id: "cus_synthetic123",
    provider_price_id: "price_synthetic123",
    idempotency_key: `kxra-checkout-${crypto.randomUUID()}`,
    redirect_url: null,
    expires_at: null,
  };
  let checkoutRequest: { url: string; init?: RequestInit } | undefined;
  const checkout = await createStripeCheckoutSession(
    intent,
    async (input, init) => {
      checkoutRequest = { url: String(input), init };
      return Response.json({
        id: "cs_test_synthetic123",
        object: "checkout.session",
        customer: intent.provider_customer_id,
        mode: "subscription",
        livemode: false,
        status: "open",
        url: "https://checkout.stripe.com/c/pay/synthetic",
        expires_at: Math.floor(Date.now() / 1000) + 1800,
      });
    },
  );
  assert.equal(checkout.sessionKind, "CHECKOUT");
  assert.equal(
    checkoutRequest?.url,
    "https://api.stripe.com/v1/checkout/sessions",
  );
  assert.equal(checkoutRequest?.init?.redirect, "error");
  assert.equal(
    new Headers(checkoutRequest?.init?.headers).get("stripe-version"),
    "2025-06-30.basil",
  );
  const checkoutBody = new URLSearchParams(String(checkoutRequest?.init?.body));
  assert.equal(checkoutBody.get("customer"), intent.provider_customer_id);
  assert.equal(
    checkoutBody.get("line_items[0][price]"),
    intent.provider_price_id,
  );
  assert.equal(checkoutBody.get("client_reference_id"), intent.intent_id);
  assert.equal(
    checkoutBody.get("success_url"),
    "http://127.0.0.1:3210/os/tools?billing=success",
  );
  assert.equal(
    checkoutBody.get("cancel_url"),
    "http://127.0.0.1:3210/os/tools?billing=cancelled",
  );
  assert.equal(checkoutBody.get("metadata[org_id]"), null);

  const portalIntent = {
    ...intent,
    provider_price_id: null,
    idempotency_key: `kxra-portal-${crypto.randomUUID()}`,
  };
  const portal = await createStripePortalSession(
    portalIntent,
    async (input, init) => {
      assert.equal(
        String(input),
        "https://api.stripe.com/v1/billing_portal/sessions",
      );
      const values = new URLSearchParams(String(init?.body));
      assert.equal(values.get("configuration"), "bpc_synthetic123");
      assert.equal(
        values.get("return_url"),
        "http://127.0.0.1:3210/os/tools?billing=returned",
      );
      return Response.json({
        id: "bps_synthetic123",
        object: "billing_portal.session",
        customer: intent.provider_customer_id,
        livemode: false,
        created: Math.floor(Date.now() / 1000),
        url: "https://billing.stripe.com/p/session/test_synthetic",
      });
    },
  );
  assert.equal(portal.sessionKind, "PORTAL");

  await assert.rejects(
    createStripeCheckoutSession(intent, async () =>
      Response.json({
        id: "cs_test_synthetic123",
        object: "checkout.session",
        customer: "cus_othercustomer",
        mode: "subscription",
        livemode: false,
        status: "open",
        url: "https://checkout.stripe.com/c/pay/synthetic",
        expires_at: Math.floor(Date.now() / 1000) + 1800,
      }),
    ),
    /STRIPE_CUSTOMER_MISMATCH/,
  );
  await assert.rejects(
    createStripeCheckoutSession(intent, async () =>
      Response.json({
        id: "cs_test_synthetic123",
        object: "checkout.session",
        customer: intent.provider_customer_id,
        mode: "subscription",
        livemode: false,
        status: "open",
        url: "https://attacker.invalid/checkout",
        expires_at: Math.floor(Date.now() / 1000) + 1800,
      }),
    ),
  );
});

test("Stripe customer adapter sends only derived name and correlation metadata", async () => {
  const intent: BillingCustomerIntent = {
    intent_id: crypto.randomUUID(),
    intent_state: "REQUESTED",
    organisation_name: "KXRA test customer",
    idempotency_key: `kxra-customer-${crypto.randomUUID()}`,
    provider_customer_id: null,
    provider_created_at: null,
  };
  let request: { url: string; init?: RequestInit } | undefined;
  const customer = await createStripeBillingCustomer(
    intent,
    async (input, init) => {
      request = { url: String(input), init };
      return Response.json({
        id: "cus_synthetic123",
        object: "customer",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        name: intent.organisation_name,
        metadata: { kxra_intent_id: intent.intent_id },
      });
    },
  );
  assert.equal(request?.url, "https://api.stripe.com/v1/customers");
  assert.equal(request?.init?.redirect, "error");
  assert.equal(
    new Headers(request?.init?.headers).get("idempotency-key"),
    intent.idempotency_key,
  );
  const values = new URLSearchParams(String(request?.init?.body));
  assert.equal(values.get("name"), intent.organisation_name);
  assert.equal(values.get("metadata[kxra_intent_id]"), intent.intent_id);
  assert.equal(values.get("email"), null);
  assert.equal(customer.providerCustomerId, "cus_synthetic123");

  await assert.rejects(
    createStripeBillingCustomer(intent, async () =>
      Response.json({
        id: "cus_synthetic123",
        object: "customer",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        name: intent.organisation_name,
        metadata: { kxra_intent_id: crypto.randomUUID() },
      }),
    ),
    /STRIPE_CUSTOMER_MISMATCH/,
  );
});
