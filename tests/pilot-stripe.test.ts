import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import fs from "node:fs";
import os from "node:os";
import { runtimeFile } from "./support/runtime";
import {
  createPilotSession,
  validatePilotProvider,
  normalizePilotEvent,
  recordPilotEvent,
  recordPilotSession,
  reconcilePilot,
  type PilotConfig,
  type PilotIntent,
  type StripeTransport,
} from "../packages/integrations/pilot-stripe";
import {
  signFakeBillingWebhook,
  verifyBillingWebhook,
} from "../packages/integrations/billing";
import { POST as webhook } from "../apps/os/app/api/webhooks/workspace-pilot/route";
import { knowledgeLogin, knowledgeRequest } from "./support/team-knowledge";
const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8")),
  worker = { ...cfg, user: os.userInfo().username },
  admin = new pg.Pool(worker),
  app = new pg.Pool(cfg);
const owner = "20000000-0000-4000-8000-000000000001",
  partner = "20000000-0000-4000-8000-000000000002";
const uuid = () => crypto.randomUUID(),
  sid = (prefix: string) =>
    prefix + "_" + crypto.randomBytes(8).toString("hex");
const fixtureOrgs: string[] = [];
const secret = "whsec_" + crypto.randomBytes(32).toString("hex");
process.env.KXRA_PILOT_STRIPE_ENABLED = "true";
process.env.KXRA_PILOT_STRIPE_WEBHOOK_SECRET = secret;
process.env.KXRA_BILLING_WORKER_DATABASE_URL = `postgresql://${encodeURIComponent(os.userInfo().username)}@localhost:${cfg.port}/${cfg.database}?host=${encodeURIComponent(cfg.host)}`;
const config: PilotConfig = {
  version: 1,
  enabled: true,
  account_id: sid("acct"),
  monthly_price: sid("price"),
  monthly_product: sid("prod"),
  setup_price: sid("price"),
  setup_product: sid("prod"),
  portal_config: sid("bpc"),
  tax_behavior: "exclusive",
  terms_review: "SYNTHETIC_TEST_ONLY_NOT_APPROVED_TERMS",
};
after(async () => {
  for (const org of fixtureOrgs)
    await admin.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where org_id=$1",
      [org],
    );
  await admin.end();
  await app.end();
});
async function as(
  actor: string,
  tenant: string,
  sql: string,
  values: unknown[] = [],
  ageSeconds = 0,
) {
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
      [
        actor,
        JSON.stringify({
          sub: actor,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000) - ageSeconds,
        }),
        tenant,
      ],
    );
    const r = (await db.query(sql, values)).rows;
    await db.query("commit");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
async function fixture(includeSetup = false) {
  const org = uuid(),
    customer = sid("cus");
  await admin.query(
    "insert into kxra.organisations(id,name,slug) values($1,'Stripe pilot fixture',$2)",
    [org, "test-pilot-" + uuid()],
  );
  await admin.query(
    "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Test owner','AT_PILOT_STRIPE')",
    [org, owner],
  );
  await admin.query(
    "insert into kxra.billing_customers(org_id,provider_customer_id) values($1,$2)",
    [org, customer],
  );
  fixtureOrgs.push(org);
  const rows = await as(
    owner,
    org,
    "select kxra.request_pilot_stripe($1,'CHECKOUT',$2) value",
    [uuid(), includeSetup],
  );
  return {
    org,
    customer,
    intent: rows[0].value.intent as PilotIntent,
    sub: sid("sub"),
  };
}
function event(
  f: { customer: string; intent: PilotIntent; sub: string },
  overrides: Record<string, unknown> = {},
) {
  const now = Math.floor(Date.now() / 1000),
    payload = {
      id: sid("evt"),
      created: now,
      type: "customer.subscription.updated",
      livemode: false,
      data: {
        object: {
          id: f.sub,
          object: "subscription",
          livemode: false,
          customer: f.customer,
          status: "active",
          cancel_at_period_end: false,
          metadata: { kxra_pilot_intent_id: f.intent.id },
          items: {
            data: [
              {
                id: sid("si"),
                quantity: 1,
                current_period_start: now - 60,
                current_period_end: now + 86400 * 28,
                price: {
                  id: config.monthly_price,
                  object: "price",
                  livemode: false,
                  product: config.monthly_product,
                  unit_amount: 4900,
                  currency: "gbp",
                  billing_scheme: "per_unit",
                  type: "recurring",
                  tax_behavior: config.tax_behavior,
                  recurring: {
                    interval: "month",
                    interval_count: 1,
                    usage_type: "licensed",
                  },
                },
              },
            ],
          },
        },
      },
    };
  const raw = Buffer.from(JSON.stringify(payload));
  const e = normalizePilotEvent(
    verifyBillingWebhook(raw, signFakeBillingWebhook(raw, secret), secret),
  );
  return { ...e, ...overrides };
}
async function setup() {
  await admin.query(
    "insert into kxra.pilot_stripe_config(version,enabled,account_id,monthly_price,monthly_product,setup_price,setup_product,portal_config,tax_behavior,terms_review) values(1,true,$1,$2,$3,$4,$5,$6,$7,$8)",
    [
      config.account_id,
      config.monthly_price,
      config.monthly_product,
      config.setup_price,
      config.setup_product,
      config.portal_config,
      config.tax_behavior,
      config.terms_review,
    ],
  );
}
function mock(
  intent: PilotIntent,
  options: { badAmount?: boolean; live?: boolean; badCustomer?: boolean } = {},
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const transport: StripeTransport = async (url, init) => {
    calls.push({ url, init });
    let data: unknown;
    if (url.endsWith("/account"))
      data = { id: config.account_id, object: "account" };
    else if (url.includes("/prices/")) {
      const setup = url.includes(config.setup_price);
      data = {
        id: setup ? config.setup_price : config.monthly_price,
        object: "price",
        livemode: options.live || false,
        active: true,
        unit_amount: options.badAmount ? 1 : setup ? 19900 : 4900,
        currency: "gbp",
        type: setup ? "one_time" : "recurring",
        billing_scheme: "per_unit",
        tax_behavior: config.tax_behavior,
        product: {
          id: setup ? config.setup_product : config.monthly_product,
          object: "product",
          livemode: false,
          active: true,
        },
        recurring: setup
          ? null
          : { interval: "month", interval_count: 1, usage_type: "licensed" },
      };
    } else if (url.includes("/customers/"))
      data = { id: intent.customer_id, object: "customer", livemode: false };
    else if (url.includes("/billing_portal/configurations/"))
      data = {
        id: config.portal_config,
        object: "billing_portal.configuration",
        active: true,
        livemode: false,
        features: {
          subscription_update: { enabled: false },
          subscription_cancel: { enabled: true },
        },
      };
    else if (url.endsWith("/checkout/sessions"))
      data = {
        id: "cs_test_" + crypto.randomBytes(8).toString("hex"),
        object: "checkout.session",
        customer: options.badCustomer ? sid("cus") : intent.customer_id,
        mode: "subscription",
        livemode: false,
        status: "open",
        url: "https://checkout.stripe.com/c/pay/test",
        expires_at: Math.floor(Date.now() / 1000) + 1800,
        client_reference_id: intent.id,
      };
    else if (url.endsWith("/billing_portal/sessions"))
      data = {
        id: sid("bps"),
        object: "billing_portal.session",
        customer: intent.customer_id,
        livemode: false,
        url: "https://billing.stripe.com/p/session/test",
        created: Math.floor(Date.now() / 1000),
      };
    else throw Error("Unexpected mock request " + url);
    return Response.json(data);
  };
  return { calls, transport };
}
async function withProvider<T>(work: () => Promise<T>) {
  const prior = {
    key: process.env.STRIPE_SECRET_KEY,
    origin: process.env.KXRA_ORIGIN,
  };
  process.env.STRIPE_SECRET_KEY =
    "sk_test_" + crypto.randomBytes(24).toString("hex");
  process.env.KXRA_ORIGIN = "https://pilot.invalid";
  try {
    return await work();
  } finally {
    if (prior.key === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = prior.key;
    process.env.KXRA_ORIGIN = prior.origin;
  }
}
test("pilot mapping starts absent and requires fresh current tenant owner; fixtures cannot assign browser entitlements", async () => {
  const cookie = await knowledgeLogin("owner");
  assert.equal(
    (
      await knowledgeRequest("/pilot/billing/checkout", cookie, {
        request_id: uuid(),
        org_id: uuid(),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await knowledgeRequest("/pilot/billing/checkout", cookie, {
        request_id: uuid(),
      })
    ).status,
    503,
  );
  await setup();
  const f = await fixture();
  await assert.rejects(
    as(
      partner,
      f.org,
      "select kxra.request_pilot_stripe($1,'CHECKOUT',false)",
      [uuid()],
    ),
    { code: "42501" },
  );
  await assert.rejects(
    as(owner, uuid(), "select kxra.request_pilot_stripe($1,'CHECKOUT',false)", [
      uuid(),
    ]),
    { code: "42501" },
  );
  await assert.rejects(
    as(owner, f.org, "select kxra.request_pilot_stripe($1,'CHECKOUT',true)", [
      f.intent.id,
    ]),
    /replay/,
  );
  await assert.rejects(
    as(owner, f.org, "select kxra.request_pilot_stripe($1,'CHECKOUT',false)", [
      uuid(),
    ]),
    /original request/,
  );
  await assert.rejects(
    as(owner, f.org, "update kxra.pilot_stripe_bindings set version=999"),
    { code: "42501" },
  );
  await assert.rejects(
    as(owner, f.org, "select kxra_private.record_pilot_stripe_event('{}')"),
    { code: "42501" },
  );
  assert.equal(
    (await as(partner, f.org, "select * from kxra.pilot_stripe_intents"))
      .length,
    0,
  );
  assert.equal(
    (await as(owner, uuid(), "select * from kxra.pilot_stripe_bindings"))
      .length,
    0,
  );
});
test("pilot checkout and portal validate test account/customer/product/amount/tax and use exact durable idempotency", async () =>
  withProvider(async () => {
    const f = await fixture(true),
      intent = f.intent,
      m = mock(intent),
      session = await createPilotSession(config, intent, m.transport);
    assert.equal(m.calls.filter((c) => c.init?.method === "POST").length, 1);
    const post = m.calls.at(-1)!;
    const body = post.init!.body as URLSearchParams;
    assert.equal(body.get("line_items[0][price]"), config.monthly_price);
    assert.equal(body.get("line_items[1][price]"), config.setup_price);
    assert.equal(
      body.get("subscription_data[metadata][kxra_pilot_intent_id]"),
      intent.id,
    );
    assert.equal(
      (post.init!.headers as Record<string, string>)["Idempotency-Key"],
      "kxra-pilot-" + intent.id,
    );
    assert.equal(await recordPilotSession(f.intent, session, worker), "READY");
    assert.equal(await recordPilotSession(f.intent, session, worker), "READY");
    await assert.rejects(
      recordPilotSession(
        f.intent,
        { ...session, id: "cs_test_changed1234" },
        worker,
      ),
      /replay/,
    );
    for (const options of [
      { badAmount: true },
      { live: true },
      { badCustomer: true },
    ]) {
      const bad = mock(intent, options);
      await assert.rejects(createPilotSession(config, intent, bad.transport));
      if (!options.badCustomer)
        assert.equal(
          bad.calls.some((c) => c.init?.method === "POST"),
          false,
        );
    }
    const first = event(f);
    await recordPilotEvent(first, worker);
    const portal = (
      await as(
        owner,
        f.org,
        "select kxra.request_pilot_stripe($1,'PORTAL',false) value",
        [uuid()],
      )
    )[0].value.intent;
    const p = mock(portal);
    await createPilotSession(config, portal, p.transport);
    assert.equal(
      (p.calls.at(-1)!.init!.body as URLSearchParams).get("configuration"),
      config.portal_config,
    );
    assert.equal(
      (await as(owner, f.org, "select * from kxra.workspace_pilots"))[0].mode,
      "TEST_STRIPE",
    );
    await assert.rejects(
      as(owner, f.org, "select kxra.workspace_pilot_event($1,1,'CANCEL_NOW')", [
        uuid(),
      ]),
      /Provider pilot|privilege/,
    );
  }));
test("signed pilot events replay exactly, isolate tenant/customer/provenance and fail closed on ambiguous order until reconciliation", async () => {
  const f = await fixture(),
    e = event(f),
    now = Date.parse(e.created_at);
  assert.equal(await recordPilotEvent(e, worker), "APPLIED");
  assert.equal(await recordPilotEvent(e, worker), "APPLIED");
  await assert.rejects(
    recordPilotEvent({ ...e, hash: "a".repeat(64) }, worker),
    /replay/,
  );
  await assert.rejects(
    recordPilotEvent(
      { ...e, event_id: sid("evt"), customer: sid("cus") },
      worker,
    ),
    /Unknown/,
  );
  for (const change of [
    { amount: 1 },
    { currency: "usd" },
    { quantity: 5 },
    { product: sid("prod") },
    { livemode: true },
  ])
    await assert.rejects(
      recordPilotEvent(
        { ...e, event_id: sid("evt"), ...change } as typeof e,
        worker,
      ),
    );
  const stale = {
    ...e,
    event_id: sid("evt"),
    created_at: new Date(now - 1000).toISOString(),
    hash: "b".repeat(64),
    status: "past_due" as const,
  };
  assert.equal(await recordPilotEvent(stale, worker), "STALE");
  const tie = {
    ...e,
    event_id: sid("evt"),
    hash: "c".repeat(64),
    status: "past_due" as const,
  };
  assert.equal(await recordPilotEvent(tie, worker), "RECONCILE_REQUIRED");
  assert.equal(
    (await as(owner, f.org, "select * from kxra.workspace_pilots"))[0].state,
    "PAUSED",
  );
  const r = (
    await as(
      owner,
      f.org,
      "select kxra.request_pilot_stripe($1,'RECONCILE',false) value",
      [uuid()],
    )
  )[0].value.intent;
  assert.equal(
    await recordPilotEvent(
      {
        ...e,
        event_id: sid("evt"),
        hash: "d".repeat(64),
        intent_id: r.id,
        reconcile: true,
      },
      worker,
    ),
    "APPLIED",
  );
  assert.equal(
    (await as(owner, f.org, "select * from kxra.workspace_pilots"))[0].state,
    "ACTIVE",
  );
  const cancelled = {
    ...e,
    event_id: sid("evt"),
    hash: "e".repeat(64),
    created_at: new Date(now + 1000).toISOString(),
    status: "canceled" as const,
  };
  await recordPilotEvent(cancelled, worker);
  const fresh = await as(
    owner,
    f.org,
    "select kxra.request_pilot_stripe($1,'RECONCILE',false) value",
    [uuid()],
  );
  await recordPilotEvent(
    {
      ...e,
      event_id: sid("evt"),
      hash: "f".repeat(64),
      intent_id: fresh[0].value.intent.id,
      reconcile: true,
    },
    worker,
  );
  assert.equal(
    (await as(owner, f.org, "select * from kxra.workspace_pilots"))[0].state,
    "CANCELLED",
  );
  await assert.rejects(
    as(
      owner,
      f.org,
      "select kxra.team_room_create($1,'PRIVATE',null,'Forbidden','')",
      [uuid()],
    ),
  );
  await assert.rejects(
    admin.query(
      "update kxra.pilot_stripe_events set outcome='APPLIED' where event_id=$1",
      [e.event_id],
    ),
    /receipt is immutable/,
  );
});
test("pilot webhook validates raw signatures, ignores unsupported events and retries persistence failures without granting unknown customers", async () => {
  const f = await fixture(),
    now = Math.floor(Date.now() / 1000),
    object = {
      id: f.sub,
      object: "subscription",
      livemode: false,
      customer: f.customer,
      status: "active",
      cancel_at_period_end: false,
      metadata: { kxra_pilot_intent_id: f.intent.id },
      items: {
        data: [
          {
            id: sid("si"),
            quantity: 1,
            current_period_start: now - 10,
            current_period_end: now + 86400,
            price: {
              id: config.monthly_price,
              object: "price",
              livemode: false,
              product: config.monthly_product,
              unit_amount: 4900,
              currency: "gbp",
              billing_scheme: "per_unit",
              type: "recurring",
              tax_behavior: config.tax_behavior,
              recurring: {
                interval: "month",
                interval_count: 1,
                usage_type: "licensed",
              },
            },
          },
        ],
      },
    };
  const body = Buffer.from(
    JSON.stringify({
      id: sid("evt"),
      type: "customer.subscription.updated",
      created: now,
      livemode: false,
      data: { object },
    }),
  );
  const req = (
    signature = signFakeBillingWebhook(body, secret),
    bytes = body,
  ) =>
    new Request("https://pilot.invalid/api/webhooks/workspace-pilot", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: bytes,
    });
  assert.equal((await webhook(req())).status, 200);
  assert.equal((await webhook(req())).status, 200);
  assert.equal((await webhook(req("t=1,v1=" + "a".repeat(64)))).status, 400);
  assert.equal(
    (
      await webhook(
        req(
          signFakeBillingWebhook(body, secret),
          Buffer.concat([body, Buffer.from(" ")]),
        ),
      )
    ).status,
    400,
  );
  const invalid = JSON.parse(body.toString());
  invalid.id = sid("evt");
  invalid.data.object.items.data[0].price.unit_amount = 1;
  const invalidBytes = Buffer.from(JSON.stringify(invalid));
  assert.equal(
    (
      await webhook(
        req(signFakeBillingWebhook(invalidBytes, secret), invalidBytes),
      )
    ).status,
    200,
  );
  assert.equal(
    (await as(owner, f.org, "select * from kxra.workspace_pilots"))[0].state,
    "PAUSED",
  );
  assert.equal(
    (
      await webhook(
        req(signFakeBillingWebhook(invalidBytes, secret), invalidBytes),
      )
    ).status,
    200,
  );
  const unknown = Buffer.from(
    body
      .toString()
      .replace(f.customer, sid("cus"))
      .replaceAll(JSON.parse(body.toString()).id, sid("evt")),
  );
  assert.equal(
    (await webhook(req(signFakeBillingWebhook(unknown, secret), unknown)))
      .status,
    503,
  );
});
test("canonical mocked subscription retrieval is version fenced; failed renewal/expiry/cancel preserve no-grant states and five-seat holds", async () =>
  withProvider(async () => {
    const f = await fixture(),
      e = event(f);
    await recordPilotEvent(e, worker);
    const project = uuid();
    await admin.query(
      "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'PILOT','Test subscription seats','TEST','ACTIVE','Review')",
      [project, f.org],
    );
    for (let n = 0; n < 4; n++)
      await as(
        owner,
        f.org,
        "select * from kxra.create_invitation($1,$2,'contributor',$3,now()+interval '1 day')",
        [
          project,
          `stripe-${n}-${uuid()}@fixture.invalid`,
          crypto.randomBytes(32).toString("hex"),
        ],
      );
    await assert.rejects(
      as(
        owner,
        f.org,
        "select * from kxra.create_invitation($1,$2,'contributor',$3,now()+interval '1 day')",
        [
          project,
          `stripe-overflow-${uuid()}@fixture.invalid`,
          crypto.randomBytes(32).toString("hex"),
        ],
      ),
      /seat admission/,
    );
    const r = (
      await as(
        owner,
        f.org,
        "select kxra.request_pilot_stripe($1,'RECONCILE',false) value",
        [uuid()],
      )
    )[0].value.intent as PilotIntent;
    const object = {
      id: f.sub,
      object: "subscription",
      livemode: false,
      customer: f.customer,
      status: "active",
      cancel_at_period_end: false,
      metadata: { kxra_pilot_intent_id: f.intent.id },
      items: {
        data: [
          {
            id: sid("si"),
            quantity: 1,
            current_period_start: Math.floor(Date.parse(e.period_start) / 1000),
            current_period_end: Math.floor(Date.parse(e.period_end) / 1000),
            price: {
              id: config.monthly_price,
              object: "price",
              livemode: false,
              product: config.monthly_product,
              unit_amount: 4900,
              currency: "gbp",
              billing_scheme: "per_unit",
              type: "recurring",
              tax_behavior: config.tax_behavior,
              recurring: {
                interval: "month",
                interval_count: 1,
                usage_type: "licensed",
              },
            },
          },
        ],
      },
    };
    const m = mock(r),
      transport: StripeTransport = (url, init) =>
        url.includes("/subscriptions/")
          ? Promise.resolve(Response.json(object))
          : m.transport(url, init);
    const snapshot = await reconcilePilot(config, r, transport);
    const failed = {
      ...e,
      event_id: sid("evt"),
      hash: "7".repeat(64),
      status: "past_due" as const,
      created_at: new Date(Date.parse(e.created_at) + 1000).toISOString(),
    };
    await recordPilotEvent(failed, worker);
    await assert.rejects(recordPilotEvent(snapshot, worker), /raced/);
    assert.equal(
      (await as(owner, f.org, "select * from kxra.workspace_pilots"))[0].state,
      "PAST_DUE",
    );
    const fresh = (
      await as(
        owner,
        f.org,
        "select kxra.request_pilot_stripe($1,'RECONCILE',false) value",
        [uuid()],
      )
    )[0].value.intent as PilotIntent;
    const recovered = await reconcilePilot(config, fresh, transport);
    assert.equal(await recordPilotEvent(recovered, worker), "APPLIED");
    const expiry = {
      ...e,
      event_id: sid("evt"),
      hash: "8".repeat(64),
      cancel_at_end: true,
      created_at: new Date(Date.parse(e.created_at) + 2000).toISOString(),
      period_start: new Date(Date.now() - 86400 * 30000).toISOString(),
      period_end: new Date(Date.now() - 1000).toISOString(),
    };
    await recordPilotEvent(expiry, worker);
    assert.equal(
      (await as(owner, f.org, "select * from kxra.workspace_pilots"))[0].state,
      "PAST_DUE",
    );
    await assert.rejects(
      as(
        owner,
        f.org,
        "select * from kxra.create_invitation($1,$2,'contributor',$3,now()+interval '1 day')",
        [
          project,
          `stripe-cancel-${uuid()}@fixture.invalid`,
          crypto.randomBytes(32).toString("hex"),
        ],
      ),
    );
    const different = { ...object, customer: sid("cus") };
    await assert.rejects(
      reconcilePilot(config, fresh, (url, init) =>
        url.includes("/subscriptions/")
          ? Promise.resolve(Response.json(different))
          : m.transport(url, init),
      ),
      /BINDING/,
    );
  }));
test("execution readiness never treats environment keys as hosted worker/provider acceptance", async () => {
  const { workspaceExecutionReadiness } =
    await import("../packages/workspace/execution-readiness");
  const r = workspaceExecutionReadiness({
    NODE_ENV: "production",
    KXRA_AUTH_MODE: "supabase",
    KXRA_MODEL_VAULT_KEY: "synthetic",
    KXRA_PILOT_STRIPE_ENABLED: "true",
  });
  assert.equal(r.hosted_draft_worker.available, false);
  assert.equal(r.hosted_recurring.activated, false);
  assert.equal(r.provider_acceptance.accepted, false);
  assert.equal(r.fixture_draft_worker.available, false);
});
test("pending checkout reserves the five-person boundary before the first provider event; changed billing customer fails closed", async () => {
  const f = await fixture(),
    project = uuid();
  await admin.query(
    "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'PILOT','Pending checkout seats','TEST','ACTIVE','Review')",
    [project, f.org],
  );
  for (let n = 0; n < 3; n++)
    await as(
      owner,
      f.org,
      "select * from kxra.create_invitation($1,$2,'contributor',$3,now()+interval '1 day')",
      [
        project,
        `pre-checkout-${n}-${uuid()}@fixture.invalid`,
        crypto.randomBytes(32).toString("hex"),
      ],
    );
  const race = await Promise.allSettled(
    [0, 1].map((n) =>
      as(
        owner,
        f.org,
        "select * from kxra.create_invitation($1,$2,'contributor',$3,now()+interval '1 day')",
        [
          project,
          `pre-race-${n}-${uuid()}@fixture.invalid`,
          crypto.randomBytes(32).toString("hex"),
        ],
      ),
    ),
  );
  assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(race.filter((x) => x.status === "rejected").length, 1);
  const e = event(f);
  await recordPilotEvent(e, worker);
  assert.equal(
    (await as(owner, f.org, "select kxra_private.pilot_status() s"))[0].s
      .entitled,
    true,
  );
  await admin.query(
    "update kxra.billing_customers set provider_customer_id=$1 where org_id=$2",
    [sid("cus"), f.org],
  );
  assert.equal(
    (await as(owner, f.org, "select kxra_private.pilot_status() s"))[0].s
      .entitled,
    false,
  );
  await assert.rejects(
    recordPilotEvent(
      { ...e, event_id: sid("evt"), hash: "9".repeat(64) },
      worker,
    ),
    /changed pilot customer/,
  );
});

test("stored pilot sessions require the current fresh MFA requester even through direct RLS reads", async () => {
  if (
    !(await admin.query("select count(*)::int n from kxra.pilot_stripe_config"))
      .rows[0].n
  )
    await setup();
  const f = await fixture();
  await admin.query(
    "update kxra.pilot_stripe_intents set state='READY',session_id=$1,redirect_url='https://checkout.stripe.com/c/pay/synthetic-session-policy',expires_at=now()+interval '1 hour' where id=$2",
    ["cs_test_" + crypto.randomBytes(8).toString("hex"), f.intent.id],
  );
  const sql = "select redirect_url from kxra.pilot_stripe_intents where id=$1";
  assert.equal(
    (await as(owner, f.org, sql, [f.intent.id]))[0].redirect_url,
    "https://checkout.stripe.com/c/pay/synthetic-session-policy",
  );
  assert.equal((await as(owner, f.org, sql, [f.intent.id], 901)).length, 0);
  assert.equal((await as(partner, f.org, sql, [f.intent.id])).length, 0);
  assert.equal((await as(owner, uuid(), sql, [f.intent.id])).length, 0);
  const other = uuid();
  await admin.query(
    "insert into kxra.pilot_stripe_intents(id,org_id,actor_id,kind,include_setup,customer_id,observed_version) values($1,$2,$3,'PORTAL',false,$4,0)",
    [other, f.org, partner, f.customer],
  );
  assert.equal((await as(owner, f.org, sql, [other])).length, 0);
  await assert.rejects(
    as(
      owner,
      f.org,
      "select kxra.request_pilot_stripe($1,'PORTAL',false)",
      [uuid()],
      901,
    ),
    { code: "42501" },
  );
  await assert.rejects(
    as(
      owner,
      f.org,
      "update kxra.pilot_stripe_intents set redirect_url=$1 where id=$2",
      ["https://invalid.fixture/", f.intent.id],
    ),
    { code: "42501" },
  );
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query("set local role anon");
    await assert.rejects(db.query(sql, [f.intent.id]), { code: "42501" });
  } finally {
    await db.query("rollback");
    db.release();
  }
});
