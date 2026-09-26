import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import {
  normalizeStripeSubscriptionEvent,
  signFakeBillingWebhook,
  verifyBillingWebhook,
  type NormalizedStripeSubscriptionEvent,
} from "../packages/integrations/billing";
import { recordStripeSubscriptionEvent } from "../packages/integrations/billing-worker";
import { POST as stripeWebhook } from "../apps/os/app/api/webhooks/stripe/route";
import { runtimeFile } from "./support/runtime";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const workerConfiguration = { ...config, user: os.userInfo().username };
process.env.KXRA_BILLING_ENABLED = "true";
process.env.KXRA_BILLING_WORKER_DATABASE_URL = `postgresql://${encodeURIComponent(os.userInfo().username)}@localhost:${config.port}/${config.database}?host=${encodeURIComponent(config.host)}`;
const webhookSecret = `whsec_${crypto.randomBytes(32).toString("base64url")}`;
process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
const admin = new pg.Pool(workerConfiguration);
const org = "10000000-0000-4000-8000-000000000001";

after(() => admin.end());

async function commercialFixture() {
  const planId = crypto.randomUUID();
  const planVersionId = crypto.randomUUID();
  const customerId = `cus_${crypto.randomBytes(8).toString("hex")}`;
  const priceId = `price_${crypto.randomBytes(8).toString("hex")}`;
  await admin.query(
    "insert into kxra.plans(id,plan_key,name,state) values($1,$2,'Stripe fixture','ACTIVE')",
    [planId, `stripe-${crypto.randomUUID().slice(0, 8)}`],
  );
  await admin.query(
    `insert into kxra.plan_versions(
      id,plan_id,version,state,currency,amount_minor,billing_interval,
      tax_behavior,provider_price_reference,effective_at
     ) values($1,$2,1,'ACTIVE','GBP',3000,'MONTH','EXCLUSIVE',$3,now())`,
    [planVersionId, planId, priceId],
  );
  await admin.query(
    `insert into kxra.plan_features(
      plan_version_id,feature_key,quantity_limit,usage_window
     ) values($1,'brand.access',null,'SUBSCRIPTION_PERIOD'),
             ($1,'brand.generate',30,'SUBSCRIPTION_PERIOD')`,
    [planVersionId],
  );
  await admin.query(
    `insert into kxra.price_references(
      plan_version_id,provider,provider_price_id,environment,state
     ) values($1,'STRIPE',$2,'TEST','ACTIVE')`,
    [planVersionId, priceId],
  );
  await admin.query(
    `insert into kxra.billing_customers(org_id,provider_customer_id)
     values($1,$2)
     on conflict(org_id,provider) do update set
      provider_customer_id=excluded.provider_customer_id,updated_at=now()`,
    [org, customerId],
  );
  return { planVersionId, customerId, priceId };
}

function payload(
  fixture: { customerId: string; priceId: string },
  options: {
    eventId?: string;
    eventType?: string;
    subscriptionId?: string;
    itemId?: string;
    status?: string;
    created?: number;
    livemode?: boolean;
  } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: options.eventId || `evt_${crypto.randomBytes(8).toString("hex")}`,
    object: "event",
    type: options.eventType || "customer.subscription.updated",
    created: options.created || now,
    livemode: options.livemode || false,
    data: {
      object: {
        id:
          options.subscriptionId ||
          `sub_${crypto.randomBytes(8).toString("hex")}`,
        object: "subscription",
        customer: fixture.customerId,
        status: options.status || "active",
        current_period_start: now - 60,
        current_period_end: now + 2_592_000,
        cancel_at_period_end: false,
        items: {
          data: [
            {
              id:
                options.itemId || `si_${crypto.randomBytes(8).toString("hex")}`,
              quantity: 1,
              price: { id: fixture.priceId },
            },
          ],
        },
      },
    },
  };
}

function verified(value: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(value));
  const signature = signFakeBillingWebhook(body, webhookSecret);
  return normalizeStripeSubscriptionEvent(
    verifyBillingWebhook(body, signature, webhookSecret),
  );
}

test("Stripe subscription normalization binds raw bytes and rejects live or multi-price events", async () => {
  const fixture = await commercialFixture();
  const value = payload(fixture);
  const normalized = verified(value);
  assert.equal(normalized.customerId, fixture.customerId);
  assert.equal(normalized.priceId, fixture.priceId);
  const body = Buffer.from(JSON.stringify(value));
  const signature = signFakeBillingWebhook(body, webhookSecret);
  assert.throws(
    () =>
      verifyBillingWebhook(
        Buffer.concat([body, Buffer.from(" ")]),
        signature,
        webhookSecret,
      ),
    /BILLING_SIGNATURE_INVALID/,
  );
  assert.throws(
    () => verified({ ...value, livemode: true }),
    /BILLING_LIVE_EVENT_PROHIBITED/,
  );
  const multiple = structuredClone(value);
  multiple.data.object.items.data.push({
    id: `si_${crypto.randomBytes(8).toString("hex")}`,
    quantity: 1,
    price: { id: fixture.priceId },
  });
  assert.throws(() => verified(multiple));
});

test("billing worker role is non-login, non-bypass and owns one bounded RPC", async () => {
  const role = (
    await admin.query(
      "select rolcanlogin,rolsuper,rolbypassrls,rolinherit from pg_roles where rolname='kxra_billing_worker'",
    )
  ).rows[0];
  assert.deepEqual(role, {
    rolcanlogin: false,
    rolsuper: false,
    rolbypassrls: false,
    rolinherit: false,
  });
  assert.equal(
    (
      await admin.query(
        `select has_function_privilege('kxra_billing_worker',
          'kxra_private.record_stripe_subscription_event(text,text,timestamptz,boolean,text,text,text,timestamptz,timestamptz,boolean,text,text,bigint,text)',
          'execute') allowed`,
      )
    ).rows[0].allowed,
    true,
  );
  assert.equal(
    (
      await admin.query(
        "select has_table_privilege('kxra_billing_worker','kxra.billing_subscriptions','select') allowed",
      )
    ).rows[0].allowed,
    false,
  );
});

test("signed Stripe webhook creates one test subscription and exact replay is stable", async () => {
  const fixture = await commercialFixture();
  const value = payload(fixture);
  const body = JSON.stringify(value);
  const signature = signFakeBillingWebhook(Buffer.from(body), webhookSecret);
  const request = () =>
    new Request("http://127.0.0.1:3210/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body,
    });
  const first = await stripeWebhook(request());
  assert.equal(first.status, 200);
  assert.equal((await first.json()).state, "PROCESSED");
  const replay = await stripeWebhook(request());
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).state, "PROCESSED");
  const subscription = (
    await admin.query(
      `select state,plan_version_id,provider_event_id
       from kxra.billing_subscriptions where provider_subscription_id=$1`,
      [value.data.object.id],
    )
  ).rows[0];
  assert.deepEqual(subscription, {
    state: "ACTIVE",
    plan_version_id: fixture.planVersionId,
    provider_event_id: value.id,
  });
  assert.equal(
    (
      await admin.query(
        `select count(*)::int n from kxra.entitlement_effective_periods
         where source_type='SUBSCRIPTION' and source_id=(
          select id from kxra.billing_subscriptions where provider_subscription_id=$1
         ) and effective_until>now()`,
        [value.data.object.id],
      )
    ).rows[0].n,
    2,
  );
});

test("past-due fails closed and an older event cannot restore entitlement", async () => {
  const fixture = await commercialFixture();
  const subscriptionId = `sub_${crypto.randomBytes(8).toString("hex")}`;
  const active = verified(payload(fixture, { subscriptionId }));
  assert.equal(
    await recordStripeSubscriptionEvent(active, workerConfiguration),
    "PROCESSED",
  );
  const later = Math.floor(Date.now() / 1000) + 1;
  const pastDue = verified(
    payload(fixture, {
      subscriptionId,
      status: "past_due",
      created: later,
    }),
  );
  assert.equal(
    await recordStripeSubscriptionEvent(pastDue, workerConfiguration),
    "PROCESSED",
  );
  assert.equal(
    (
      await admin.query(
        `select count(*)::int n from kxra.entitlement_effective_periods
         where source_id=(select id from kxra.billing_subscriptions where provider_subscription_id=$1)
          and effective_until is null`,
        [subscriptionId],
      )
    ).rows[0].n,
    0,
  );
  const older = verified(
    payload(fixture, {
      subscriptionId,
      created: later - 10,
      status: "active",
    }),
  );
  assert.equal(
    await recordStripeSubscriptionEvent(older, workerConfiguration),
    "IGNORED",
  );
  assert.equal(
    (
      await admin.query(
        "select state from kxra.billing_subscriptions where provider_subscription_id=$1",
        [subscriptionId],
      )
    ).rows[0].state,
    "PAST_DUE",
  );
});

test("unknown Stripe references fail durably without granting access", async () => {
  const fixture = await commercialFixture();
  const recoveredPriceId = `price_${crypto.randomBytes(8).toString("hex")}`;
  const event = verified(
    payload({
      customerId: fixture.customerId,
      priceId: recoveredPriceId,
    }),
  );
  assert.equal(
    await recordStripeSubscriptionEvent(event, workerConfiguration),
    "FAILED",
  );
  const receipt = (
    await admin.query(
      `select processing_state,processing_reason,org_id
       from kxra.billing_provider_events where provider_event_id=$1`,
      [event.eventId],
    )
  ).rows[0];
  assert.deepEqual(receipt, {
    processing_state: "FAILED",
    processing_reason: "UNKNOWN_OR_INACTIVE_PRICE",
    org_id: org,
  });
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from kxra.billing_subscriptions where provider_subscription_id=$1",
        [event.subscriptionId],
      )
    ).rows[0].n,
    0,
  );
  await admin.query(
    `insert into kxra.price_references(
      plan_version_id,provider,provider_price_id,environment,state
     ) values($1,'STRIPE',$2,'TEST','ACTIVE')`,
    [fixture.planVersionId, recoveredPriceId],
  );
  assert.equal(
    await recordStripeSubscriptionEvent(event, workerConfiguration),
    "PROCESSED",
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from kxra.billing_subscriptions where provider_subscription_id=$1",
        [event.subscriptionId],
      )
    ).rows[0].n,
    1,
  );
});

test("Stripe event replay mismatch and unsigned webhook fail closed", async () => {
  const fixture = await commercialFixture();
  const event = verified(payload(fixture));
  assert.equal(
    await recordStripeSubscriptionEvent(event, workerConfiguration),
    "PROCESSED",
  );
  await assert.rejects(
    recordStripeSubscriptionEvent(
      {
        ...event,
        rawSha256: "f".repeat(64),
      } as NormalizedStripeSubscriptionEvent,
      workerConfiguration,
    ),
    /replay mismatch/,
  );
  const response = await stripeWebhook(
    new Request("http://127.0.0.1:3210/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=invalid" },
      body: JSON.stringify(payload(fixture)),
    }),
  );
  assert.equal(response.status, 400);
  const oversized = await stripeWebhook(
    new Request("http://127.0.0.1:3210/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "content-length": "1000001",
        "stripe-signature": signFakeBillingWebhook(
          Buffer.from("{}"),
          webhookSecret,
        ),
      },
      body: "{}",
    }),
  );
  assert.equal(oversized.status, 400);
  process.env.KXRA_BILLING_ENABLED = "false";
  const disabled = await stripeWebhook(
    new Request("http://127.0.0.1:3210/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    }),
  );
  assert.equal(disabled.status, 404);
  process.env.KXRA_BILLING_ENABLED = "true";
});
