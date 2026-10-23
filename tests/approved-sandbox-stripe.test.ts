import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { runtimeFile, testOrigin } from "./support/runtime";
import { approvedCatalogue } from "../packages/workspace/approved-catalogue";
import {
  createPilotSession,
  validatePilotProvider,
  normalizePilotEvent,
  recordPilotEvent,
  reconcilePilot,
  type PilotConfig,
  type PilotIntent,
  type StripeTransport,
  catalogueOfferKey,
} from "../packages/integrations/pilot-stripe";
import {
  signFakeBillingWebhook,
  verifyBillingWebhook,
} from "../packages/integrations/billing";
import { POST as webhook } from "../apps/os/app/api/webhooks/workspace-pilot/route";
import { knowledgeLogin, knowledgeRequest } from "./support/team-knowledge";

assert.ok(
  localModeConfiguration(process.env),
  "Sandbox tests require a guarded local fixture runtime",
);
const dbConfig = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const worker = { ...dbConfig, user: os.userInfo().username };
assert.equal(
  dbConfig.host,
  runtimeFile("socket"),
  "Sandbox tests require the private fixture Unix socket",
);
const admin = new pg.Pool(worker),
  app = new pg.Pool(dbConfig);
const owner = "20000000-0000-4000-8000-000000000001",
  partner = "20000000-0000-4000-8000-000000000002";
const uuid = () => crypto.randomUUID(),
  sid = (prefix: string) =>
    prefix + "_" + crypto.randomBytes(10).toString("hex");
const secret = "whsec_" + crypto.randomBytes(32).toString("hex");
const original = Object.fromEntries(
  [
    "KXRA_PILOT_STRIPE_ENABLED",
    "KXRA_PILOT_STRIPE_WEBHOOK_SECRET",
    "KXRA_BILLING_WORKER_DATABASE_URL",
    "STRIPE_SECRET_KEY",
    "KXRA_ORIGIN",
  ].map((key) => [key, process.env[key]]),
);
process.env.KXRA_PILOT_STRIPE_ENABLED = "true";
process.env.KXRA_PILOT_STRIPE_WEBHOOK_SECRET = secret;
process.env.KXRA_BILLING_WORKER_DATABASE_URL = `postgresql://${encodeURIComponent(os.userInfo().username)}@localhost:${dbConfig.port}/${dbConfig.database}?host=${encodeURIComponent(dbConfig.host)}`;
const configs = approvedCatalogue.map((plan) => ({
  version: 2 as const,
  mode: "sandbox" as const,
  enabled: true as const,
  offer_key: catalogueOfferKey.parse(plan.offer_key),
  mapping_revision: 1,
  account_id: sid("acct"),
  monthly_price: sid("price"),
  monthly_product: sid("prod"),
  portal_config: sid("bpc"),
  tax_behavior: "exclusive" as const,
  terms_review: "SYNTHETIC_SANDBOX_ONLY_NO_APPROVED_TAX_TERMS",
}));
const tenants: string[] = [];
after(async () => {
  await admin.query(
    "delete from kxra.self_service_workspaces where org_id=any($1::uuid[])",
    [tenants],
  );
  for (const org of tenants)
    await admin.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where org_id=$1",
      [org],
    );
  await admin.query(
    "update kxra.pilot_stripe_catalogue_config set enabled=false",
  );
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await admin.end();
  await app.end();
});
async function as(
  org: string,
  sql: string,
  values: unknown[] = [],
  actor = owner,
  fresh = true,
) {
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.execution_mode','hosted',true)",
      [
        actor,
        JSON.stringify({
          sub: actor,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000) - (fresh ? 0 : 901),
        }),
        org,
      ],
    );
    const result = await db.query(sql, values);
    await db.query("commit");
    return result.rows;
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}
async function tenant() {
  const org = uuid(),
    customer = sid("cus"),
    project = uuid();
  tenants.push(org);
  await admin.query(
    "insert into kxra.organisations(id,name,slug) values($1,'Synthetic catalogue sandbox',$2)",
    [org, "sandbox-" + uuid()],
  );
  await admin.query(
    "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic owner','SANDBOX_TEST')",
    [org, owner],
  );
  await admin.query(
    "insert into kxra.billing_customers(org_id,provider_customer_id) values($1,$2)",
    [org, customer],
  );
  await admin.query(
    "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'SANDBOX','Synthetic acceptance','TEST','ACTIVE','Review')",
    [project, org],
  );
  return { org, customer, project, sub: sid("sub") };
}
async function checkout(
  f: Awaited<ReturnType<typeof tenant>>,
  key: string,
  request: string = uuid(),
) {
  return (
    await as(
      f.org,
      "select kxra.request_catalogue_stripe($1,'CHECKOUT',$2) value",
      [request, key],
    )
  )[0].value as {
    intent: PilotIntent;
    config: Extract<PilotConfig, { version: 2 }>;
  };
}
async function withProvider<T>(work: () => Promise<T>) {
  const prior = {
    key: process.env.STRIPE_SECRET_KEY,
    origin: process.env.KXRA_ORIGIN,
  };
  process.env.STRIPE_SECRET_KEY =
    "sk_test_" + crypto.randomBytes(24).toString("hex");
  process.env.KXRA_ORIGIN = "https://sandbox.invalid";
  try {
    return await work();
  } finally {
    if (prior.key === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = prior.key;
    process.env.KXRA_ORIGIN = prior.origin;
  }
}
function mock(
  config: Extract<PilotConfig, { version: 2 }>,
  intent: PilotIntent,
  modify: (price: Record<string, unknown>) => void = () => {},
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const plan = approvedCatalogue.find((p) => p.offer_key === config.offer_key)!;
  const transport: StripeTransport = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/account"))
      return Response.json({ id: config.account_id, object: "account" });
    if (url.includes("/prices/")) {
      const price: Record<string, unknown> = {
        id: config.monthly_price,
        object: "price",
        livemode: false,
        active: true,
        currency: "gbp",
        unit_amount: plan.monthly_amount_minor,
        type: "recurring",
        billing_scheme: "per_unit",
        tax_behavior: config.tax_behavior,
        product: {
          id: config.monthly_product,
          object: "product",
          livemode: false,
          active: true,
        },
        recurring: {
          interval: "month",
          interval_count: 1,
          usage_type: "licensed",
        },
      };
      modify(price);
      return Response.json(price);
    }
    if (url.includes("/customers/"))
      return Response.json({
        id: intent.customer_id,
        object: "customer",
        livemode: false,
      });
    if (url.endsWith("/checkout/sessions"))
      return Response.json({
        id: "cs_test_" + crypto.randomBytes(10).toString("hex"),
        object: "checkout.session",
        customer: intent.customer_id,
        livemode: false,
        mode: "subscription",
        status: "open",
        url: "https://checkout.stripe.com/c/pay/synthetic",
        expires_at: Math.floor(Date.now() / 1000) + 1800,
        client_reference_id: intent.id,
      });
    throw Error("Unexpected synthetic transport boundary");
  };
  return { calls, transport };
}
function payload(
  f: Awaited<ReturnType<typeof tenant>>,
  intent: PilotIntent,
  config: Extract<PilotConfig, { version: 2 }>,
  status = "active",
  stamp = Math.floor(Date.now() / 1000),
) {
  const now = Math.floor(Date.now() / 1000),
    plan = approvedCatalogue.find((p) => p.offer_key === config.offer_key)!;
  return {
    id: sid("evt"),
    type: "customer.subscription.updated",
    created: stamp,
    livemode: false,
    data: {
      object: {
        id: f.sub,
        object: "subscription",
        livemode: false,
        customer: f.customer,
        status,
        cancel_at_period_end: false,
        metadata: {
          kxra_pilot_intent_id: intent.id,
          kxra_catalogue_offer: config.offer_key,
          kxra_catalogue_revision: String(config.mapping_revision),
        },
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
                currency: "gbp",
                unit_amount: plan.monthly_amount_minor,
                type: "recurring",
                billing_scheme: "per_unit",
                tax_behavior: config.tax_behavior,
                product: config.monthly_product,
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
}
function normalized(value: ReturnType<typeof payload>) {
  const body = Buffer.from(JSON.stringify(value));
  return normalizePilotEvent(
    verifyBillingWebhook(body, signFakeBillingWebhook(body, secret), secret),
  );
}
async function deliver(value: ReturnType<typeof payload>) {
  const body = Buffer.from(JSON.stringify(value));
  return webhook(
    new Request("https://sandbox.invalid/api/webhooks/workspace-pilot", {
      method: "POST",
      headers: { "stripe-signature": signFakeBillingWebhook(body, secret) },
      body: new Uint8Array(body),
    }),
  );
}
const entitled = async (org: string) =>
  (await as(org, "select kxra_private.pilot_status() s"))[0].s.entitled;

async function loginOrg(org: string) {
  const cookie = await knowledgeLogin("owner");
  const response = await fetch(testOrigin + "/api/context", {
    method: "POST",
    headers: { origin: testOrigin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ organisation_id: org }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const jar = new Map(
    cookie.split("; ").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index), part.slice(index + 1)];
    }),
  );
  for (const raw of response.headers.getSetCookie()) {
    const part = raw.split(";", 1)[0],
      index = part.indexOf("=");
    jar.set(part.slice(0, index), part.slice(index + 1));
  }
  return [...jar].map(([key, value]) => key + "=" + value).join("; ");
}

test("sandbox mappings start empty; clients cannot configure plans or manufacture provider access", async () => {
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from kxra.pilot_stripe_catalogue_config",
      )
    ).rows[0].n,
    0,
  );
  const f = await tenant();
  await admin.query(
    "insert into kxra.self_service_workspaces(account_id,org_id,project_id,request_id,requested_name) values($1,$2,$3,$4,'Unbilled synthetic workspace')",
    [owner, f.org, f.project, uuid()],
  );
  assert.equal(await entitled(f.org), false);
  await assert.rejects(
    as(
      f.org,
      "select kxra.team_room_create($1,'Unbilled denied','','PRIVATE')",
      [f.project],
    ),
    /admission/,
  );
  await assert.rejects(checkout(f, "KXRA_STARTER_V1"), /mapping unavailable/);
  assert.equal(await entitled(f.org), false);
  for (const c of configs)
    await admin.query(
      "insert into kxra.pilot_stripe_catalogue_config(offer_key,mapping_revision,account_id,monthly_price,monthly_product,portal_config,tax_behavior,terms_review,enabled) values($1,1,$2,$3,$4,$5,$6,$7,true)",
      [
        c.offer_key,
        c.account_id,
        c.monthly_price,
        c.monthly_product,
        c.portal_config,
        c.tax_behavior,
        c.terms_review,
      ],
    );
  await assert.rejects(
    as(f.org, "update kxra.pilot_stripe_catalogue_config set enabled=true"),
    { code: "42501" },
  );
  await assert.rejects(
    as(f.org, "select kxra.request_pilot_stripe($1,'CHECKOUT',false)", [
      uuid(),
    ]),
    /configuration unavailable|New legacy checkout closed/,
  );
  for (const bad of ["WORKSPACE_PILOT_V1", "__proto__", "KXRA_TEAM_V2"])
    await assert.rejects(checkout(f, bad), /mapping unavailable/);
  const cookie = await loginOrg(f.org);
  for (const body of [
    { request_id: uuid(), offer_key: "KXRA_TEAM_V1", amount: 1 },
    { request_id: uuid(), offer_key: "KXRA_TEAM_V1", people: 15 },
    { request_id: uuid(), offer_key: "KXRA_TEAM_V1", include_setup: true },
  ])
    assert.equal(
      (await knowledgeRequest("/pilot/billing/checkout", cookie, body)).status,
      400,
    );
  assert.equal(
    (
      await knowledgeRequest("/pilot/billing/checkout", cookie, {
        request_id: uuid(),
        offer_key: "KXRA_TEAM_V1",
      })
    ).status,
    503,
  );
});

for (const config of configs)
  test(`${config.offer_key}: exact sandbox price, signed entitlement and ${approvedCatalogue.find((p) => p.offer_key === config.offer_key)!.people} seats remain authoritative`, async () =>
    withProvider(async () => {
      const f = await tenant(),
        { intent } = await checkout(f, config.offer_key);
      assert.equal(await entitled(f.org), false);
      assert.equal(
        (await checkout(f, config.offer_key, intent.id)).intent.id,
        intent.id,
      );
      await assert.rejects(checkout(f, config.offer_key), /original request/);
      await assert.rejects(
        checkout(
          f,
          config.offer_key === configs[0].offer_key
            ? configs[1].offer_key
            : configs[0].offer_key,
          intent.id,
        ),
        /binding changed/,
      );
      await assert.rejects(
        as(
          f.org,
          "select kxra.request_catalogue_stripe($1,'CHECKOUT',$2)",
          [uuid(), config.offer_key],
          partner,
        ),
        { code: "42501" },
      );
      await assert.rejects(
        as(
          f.org,
          "select kxra.request_catalogue_stripe($1,'CHECKOUT',$2)",
          [uuid(), config.offer_key],
          owner,
          false,
        ),
        { code: "42501" },
      );
      const m = mock(config, intent);
      await createPilotSession(config, intent, m.transport);
      const values = m.calls.at(-1)!.init!.body as URLSearchParams;
      assert.equal(values.get("line_items[0][price]"), config.monthly_price);
      assert.equal(values.get("line_items[0][quantity]"), "1");
      assert.equal(values.get("line_items[1][price]"), null);
      assert.equal(
        values.get("subscription_data[metadata][kxra_catalogue_offer]"),
        config.offer_key,
      );
      assert.equal(await entitled(f.org), false); // A valid session/return is not an entitlement.
      const e = payload(f, intent, config);
      assert.equal((await deliver(e)).status, 200);
      assert.equal((await deliver(e)).status, 200);
      assert.equal(await entitled(f.org), true);
      const conflicting = structuredClone(e);
      conflicting.data.object.status = "past_due";
      assert.equal((await deliver(conflicting)).status, 503);
      assert.equal(await entitled(f.org), true);
      const row = (await as(f.org, "select * from kxra.workspace_pilots"))[0];
      assert.equal(row.offer_key, config.offer_key);
      assert.equal(row.mode, "TEST_STRIPE");
      const cap = approvedCatalogue.find(
        (p) => p.offer_key === config.offer_key,
      )!.people;
      for (let n = 1; n < cap; n++)
        await as(
          f.org,
          "select * from kxra.create_invitation($1,$2,'contributor',$3,now()+interval '1 day')",
          [
            f.project,
            `seat-${uuid()}@fixture.invalid`,
            crypto.randomBytes(32).toString("hex"),
          ],
        );
      await assert.rejects(
        as(
          f.org,
          "select * from kxra.create_invitation($1,$2,'contributor',$3,now()+interval '1 day')",
          [
            f.project,
            `overflow-${uuid()}@fixture.invalid`,
            crypto.randomBytes(32).toString("hex"),
          ],
        ),
        /seat admission/,
      );
      assert.equal(
        (
          await admin.query(
            "select count(*)::int n from kxra.pilot_stripe_events where event_id=$1",
            [e.id],
          )
        ).rows[0].n,
        1,
      );
      const older = payload(f, intent, config, "past_due", e.created - 1);
      assert.equal((await (await deliver(older)).json()).state, "STALE");
      assert.equal(await entitled(f.org), true);
      const cancelled = payload(f, intent, config, "canceled", e.created + 1);
      await deliver(cancelled);
      assert.equal(await entitled(f.org), false);
      await deliver(payload(f, intent, config, "active", e.created + 2));
      assert.equal(await entitled(f.org), false);
    }));

test("sandbox validation rejects wrong mode, amount, product, currency, interval, quantities and mapping before checkout writes", async () =>
  withProvider(async () => {
    const f = await tenant(),
      config = configs[1],
      { intent } = await checkout(f, config.offer_key);
    for (const mutate of [
      (p: Record<string, unknown>) => {
        p.unit_amount = 4900;
      },
      (p: Record<string, unknown>) => {
        p.unit_amount = 2900;
      },
      (p: Record<string, unknown>) => {
        p.currency = "usd";
      },
      (p: Record<string, unknown>) => {
        p.livemode = true;
      },
      (p: Record<string, unknown>) => {
        p.id = sid("price");
      },
      (p: Record<string, unknown>) => {
        (p.product as Record<string, unknown>).id = sid("prod");
      },
      (p: Record<string, unknown>) => {
        p.recurring = {
          interval: "year",
          interval_count: 1,
          usage_type: "licensed",
        };
      },
      (p: Record<string, unknown>) => {
        p.recurring = {
          interval: "month",
          interval_count: 2,
          usage_type: "licensed",
        };
      },
      (p: Record<string, unknown>) => {
        p.transform_quantity = { divide_by: 2, round: "up" };
      },
    ]) {
      const m = mock(config, intent, mutate);
      await assert.rejects(createPilotSession(config, intent, m.transport));
      assert.equal(
        m.calls.some((c) => c.url.endsWith("/checkout/sessions")),
        false,
      );
    }
    await assert.rejects(
      validatePilotProvider(
        { ...config, mode: "live" } as never,
        intent,
        mock(config, intent).transport,
      ),
    );
    await assert.rejects(
      validatePilotProvider(
        config,
        { ...intent, catalogue_offer_key: "KXRA_STARTER_V1" },
        mock(config, intent).transport,
      ),
      /BINDING/,
    );
    process.env.STRIPE_SECRET_KEY =
      "sk_live_" + crypto.randomBytes(24).toString("hex");
    const m = mock(config, intent);
    await assert.rejects(
      validatePilotProvider(config, intent, m.transport),
      /TEST_KEY/,
    );
    assert.equal(m.calls.length, 0);
    assert.equal(await entitled(f.org), false);
  }));

test("database rechecks exact mapping; signed mismatches quarantine only the bound tenant and snapshots are version fenced", async () =>
  withProvider(async () => {
    const f = await tenant(),
      config = configs[2],
      { intent } = await checkout(f, config.offer_key),
      e = normalized(payload(f, intent, config));
    for (const changes of [
      { price: sid("price") },
      { product: sid("prod") },
      { amount: 2900 },
      { amount: 4900 },
      { currency: "usd" },
      { interval: "year" },
      { quantity: 15 },
      { livemode: true },
      { catalogue_offer_key: "KXRA_TEAM_V1" },
      { account: sid("acct") },
    ])
      await assert.rejects(
        recordPilotEvent({ ...e, ...changes } as never, worker),
      );
    assert.equal(await entitled(f.org), false);
    await recordPilotEvent(e, worker);
    assert.equal(await entitled(f.org), true);
    const r = (
      await as(
        f.org,
        "select kxra.request_catalogue_stripe($1,'RECONCILE',null) value",
        [uuid()],
      )
    )[0].value.intent as PilotIntent;
    const raw = payload(f, intent, config);
    const m = mock(config, r);
    const snapshot = await reconcilePilot(config, r, (url, init) =>
      url.includes("/subscriptions/")
        ? Promise.resolve(Response.json(raw.data.object))
        : m.transport(url, init),
    );
    const bad = payload(
      f,
      intent,
      config,
      "past_due",
      Math.floor(Date.parse(e.created_at) / 1000) + 1,
    );
    await deliver(bad);
    await assert.rejects(recordPilotEvent(snapshot, worker), /raced/);
    assert.equal(await entitled(f.org), false);
    const fresh = (
      await as(
        f.org,
        "select kxra.request_catalogue_stripe($1,'RECONCILE',null) value",
        [uuid()],
      )
    )[0].value.intent as PilotIntent;
    await recordPilotEvent(
      await reconcilePilot(config, fresh, (url, init) =>
        url.includes("/subscriptions/")
          ? Promise.resolve(Response.json(raw.data.object))
          : m.transport(url, init),
      ),
      worker,
    );
    assert.equal(await entitled(f.org), true);
    const mismatch = payload(
      f,
      intent,
      config,
      "active",
      Math.floor(Date.now() / 1000) + 2,
    );
    // A different *recognised* tier must also quarantine, not retain Business access.
    mismatch.data.object.items.data[0].price.unit_amount = 7900;
    assert.equal((await deliver(mismatch)).status, 200);
    assert.equal((await deliver(mismatch)).status, 200);
    assert.equal(await entitled(f.org), false);
    const outsider = await tenant();
    assert.equal(
      (
        await as(
          outsider.org,
          "select kxra_private.pilot_status() s",
          [],
          partner,
        )
      )[0].s,
      null,
    );
    assert.equal(
      (
        await as(
          outsider.org,
          "select org_id from kxra.workspace_pilots where org_id=$1",
          [f.org],
        )
      ).length,
      0,
    );
  }));

test("disabled mappings fail closed, immutable revisions cannot be retargeted, and legacy or fixture offers cannot convert", async () => {
  const f = await tenant(),
    config = configs[0],
    { intent } = await checkout(f, config.offer_key);
  await recordPilotEvent(normalized(payload(f, intent, config)), worker);
  assert.equal(await entitled(f.org), true);
  await assert.rejects(
    admin.query(
      "update kxra.pilot_stripe_catalogue_config set monthly_price=$1 where offer_key=$2",
      [sid("price"), config.offer_key],
    ),
    /immutable/,
  );
  await admin.query(
    "update kxra.pilot_stripe_catalogue_config set enabled=false where offer_key=$1",
    [config.offer_key],
  );
  await assert.rejects(
    checkout(f, config.offer_key, intent.id),
    /mapping unavailable/,
  );
  assert.equal(await entitled(f.org), false);
  await admin.query(
    "update kxra.pilot_stripe_catalogue_config set enabled=true where offer_key=$1",
    [config.offer_key],
  );
  const legacy = await tenant();
  await admin.query(
    "insert into kxra.pilot_stripe_bindings(org_id,customer_id) values($1,$2)",
    [legacy.org, legacy.customer],
  );
  await assert.rejects(
    checkout(legacy, config.offer_key),
    /legacy plan cannot be converted/,
  );
  const orphan = await tenant();
  const oldRequest = uuid();
  await admin.query(
    "insert into kxra.pilot_stripe_intents(id,org_id,actor_id,kind,include_setup,customer_id,observed_version) values($1,$2,$3,'CHECKOUT',false,$4,0)",
    [oldRequest, orphan.org, owner, orphan.customer],
  );
  await assert.rejects(
    checkout(orphan, config.offer_key, oldRequest),
    /legacy request cannot be converted/,
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from kxra.pilot_stripe_bindings where org_id=$1",
        [orphan.org],
      )
    ).rows[0].n,
    0,
  );
  const fixture = await tenant();
  await admin.query(
    "insert into kxra.workspace_pilots(org_id,mode,offer_key,state,period_start,period_end) values($1,'FIXTURE','WORKSPACE_PILOT_V1','ACTIVE',now(),now()+interval '1 month')",
    [fixture.org],
  );
  await assert.rejects(
    checkout(fixture, config.offer_key),
    /cannot be converted/,
  );
});
