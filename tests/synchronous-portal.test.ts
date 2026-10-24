import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  portalDeliveryConfiguration,
  authorizePortalDelivery,
} from "../packages/authz/portal-delivery";
import {
  synchronousPortalDelivery,
  type PortalWorkerPort,
} from "../packages/integrations/synchronous-portal";
import { modernBillingFixture } from "./support/modern-billing-scope";
import { boundedPortalTransport } from "../packages/integrations/portal-delivery-transport";
import {
  createLiveCatalogueSession,
  createStagingSandboxCatalogueSession,
} from "../packages/integrations/live-catalogue-stripe";
const uuid = (n: number) =>
    `${String(n).padStart(8, "0")}-0000-4000-8000-000000000001`,
  now = 1_800_000_000;
const request = { request_id: uuid(3), offer_key: "KXRA_STARTER_V1" as const },
  principal = { actor_id: uuid(1), org_id: uuid(2) };
function harness() {
  const scope = modernBillingFixture("LIVE").execution.execution_scope,
    events: string[] = [],
    finishes: unknown[] = [];
  let state = "REQUESTED",
    creates = 0,
    claims = 0,
    loads = 0,
    generation = 7,
    current = true,
    authority = true,
    failFinish = false;
  const canonical = {
    intent: {
      id: request.request_id,
      ...principal,
      kind: "PORTAL",
      state: "REQUESTED",
      offer_key: request.offer_key,
      customer_id: "cus_synthetic123",
      subscription_id: "sub_synthetic123",
      mapping_revision: 1,
      terms_review_sha256: "a".repeat(64),
      created_at: now - 5,
      expires_at: now + 600,
    },
    mapping: {},
    observed_version: 7,
    execution_scope: scope,
    entitlement_authority: false,
  };
  const result = {
    execution_scope: scope,
    id: "bps_synthetic123",
    url: "https://billing.stripe.com/p/session/SYNTHETICtoken",
    expires_at: now + 1800,
    entitlement_authority: false,
  };
  const worker: PortalWorkerPort = {
    scope,
    claim: async () => {
      events.push("claim");
      claims++;
      if (state !== "REQUESTED") throw Error("Already claimed");
      state = "INFLIGHT";
      return structuredClone(canonical);
    },
    current: async () => {
      events.push("current");
      return current;
    },
    create: async (_c, fence) => {
      events.push("create");
      creates++;
      assert.equal(await fence(), true);
      return structuredClone(result);
    },
    finish: async (r) => {
      events.push("finish");
      finishes.push(r);
      if (failFinish) throw Error("COMMIT outcome uncertain");
      state = current ? r.outcome : "UNCERTAIN";
      return state;
    },
  };
  const ports = {
    enabled: true,
    reserve: async () => {
      events.push("reserve");
      if (state === "CONSUMED" && generation !== canonical.observed_version)
        throw Error(
          "Consumed portal delivery no longer current: generation changed",
        );
      return {
        id: request.request_id,
        state,
        entitlement_authority: false,
        execution_scope: scope,
      };
    },
    loadWorker: async () => {
      loads++;
      events.push("load");
      return worker;
    },
    authorityCurrent: async () => authority,
    nowSeconds: () => now,
  };
  return {
    scope,
    events,
    finishes,
    canonical,
    result,
    worker,
    ports,
    get creates() {
      return creates;
    },
    get claims() {
      return claims;
    },
    get loads() {
      return loads;
    },
    get state() {
      return state;
    },
    set state(v: string) {
      state = v;
    },
    set generation(v: number) {
      generation = v;
    },
    set current(v: boolean) {
      current = v;
    },
    set authority(v: boolean) {
      authority = v;
    },
    set failFinish(v: boolean) {
      failFinish = v;
    },
  };
}
test("public availability defaults off before credentials and binds existing environment/origin", () => {
  const guarded = new Proxy({} as Record<string, string | undefined>, {
    get(_t, k) {
      if (k === "KXRA_PORTAL_DELIVERY_ENABLED") return "false";
      throw Error("Credentials must not be read");
    },
  });
  assert.equal(portalDeliveryConfiguration(guarded), null);
  const env = {
    KXRA_PORTAL_DELIVERY_ENABLED: "true",
    KXRA_MODERN_BILLING_DISPATCH_ENABLED: "true",
    NODE_ENV: "production",
    KXRA_ENVIRONMENT: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://lhbgeucifxxcdoyrnesf.supabase.co",
    KXRA_ORIGIN: "https://app.kxra-group.com",
  };
  assert.equal(portalDeliveryConfiguration(env)!.mode, "LIVE");
  for (const changed of [
    { NODE_ENV: "development" },
    { KXRA_MODERN_BILLING_DISPATCH_ENABLED: "false" },
    { KXRA_ORIGIN: "https://evil.invalid" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://jlebgsxcvhvpueuibekd.supabase.co" },
  ])
    assert.equal(portalDeliveryConfiguration({ ...env, ...changed }), null);
  assert.equal(
    portalDeliveryConfiguration({
      ...env,
      KXRA_ENVIRONMENT: "staging",
      NEXT_PUBLIC_SUPABASE_URL: "https://jlebgsxcvhvpueuibekd.supabase.co",
      KXRA_ORIGIN: "https://kxra-os-staging-synthetic.vercel.app",
    })!.mode,
    "STAGING_SANDBOX",
  );
});
test("authenticated reservation precedes worker load/claim; one durable completion precedes ephemeral READY", async () => {
  const h = harness(),
    result = await synchronousPortalDelivery(request, principal, h.ports);
  assert.deepEqual(h.events.slice(0, 3), ["reserve", "load", "claim"]);
  assert.equal(h.events.at(-1), "reserve");
  assert.equal(h.creates, 1);
  assert.equal(result.state, "READY");
  assert.equal(result.url, h.result.url);
  assert.equal(result.delivery_ready, true);
  assert.equal(result.dispatch_ready, false);
  assert.equal(result.entitlement_authority, false);
  assert.equal(h.finishes.length, 1);
  const persisted = JSON.stringify(h.finishes);
  assert.ok(!persisted.includes(result.url));
  assert.ok(!persisted.includes("expires_at"));
  assert.ok(!("provider_session_id" in result));
});
test("claimed/uncertain/consumed replay never reloads credentials, claims or creates", async () => {
  for (const state of ["INFLIGHT", "UNCERTAIN", "CONSUMED"]) {
    const h = harness();
    h.state = state;
    await assert.rejects(
      synchronousPortalDelivery(request, principal, h.ports),
      /cannot be recovered automatically/,
    );
    assert.equal(h.loads, 0);
    assert.equal(h.claims, 0);
    assert.equal(h.creates, 0);
  }
  const h = harness();
  await synchronousPortalDelivery(request, principal, h.ports);
  await assert.rejects(synchronousPortalDelivery(request, principal, h.ports));
  assert.equal(h.creates, 1);
});
test("foreign actor/tenant/UUID race after authenticated reservation cannot bootstrap worker provider access", async () => {
  for (const change of [
    { actor_id: uuid(8) },
    { org_id: uuid(8) },
    { id: uuid(8) },
    { kind: "CHECKOUT" },
  ]) {
    const h = harness();
    Object.assign(h.canonical.intent, change);
    await assert.rejects(
      synchronousPortalDelivery(request, principal, h.ports),
    );
    assert.equal(h.creates, 0);
    assert.equal(h.finishes.length, 0);
  }
});
test("strict input and disabled flag reject before authenticated reservation or credentials", async () => {
  const h = harness();
  h.ports.enabled = false;
  await assert.rejects(synchronousPortalDelivery(request, principal, h.ports));
  assert.equal(h.events.length, 0);
  for (const added of [
    { actor_id: uuid(9) },
    { org_id: uuid(9) },
    { mode: "LIVE" },
    { kind: "PORTAL" },
    { url: "https://evil.invalid" },
  ]) {
    const p = harness();
    await assert.rejects(
      synchronousPortalDelivery({ ...request, ...added }, principal, p.ports),
    );
    assert.equal(p.events.length, 0);
  }
});
test("lost provider result or invalid portal URL records UNCERTAIN, never exposes redirect/retries", async () => {
  for (const mode of ["throw", "badurl", "expired"]) {
    const h = harness();
    if (mode === "throw")
      h.worker.create = async () => {
        throw Error("POST result lost");
      };
    if (mode === "badurl")
      h.result.url = "https://evil.invalid/p/session/token";
    if (mode === "expired") h.result.expires_at = now;
    await assert.rejects(
      synchronousPortalDelivery(request, principal, h.ports),
    );
    assert.equal(h.state, "UNCERTAIN");
    assert.equal(h.finishes.length, 1);
    await assert.rejects(
      synchronousPortalDelivery(request, principal, h.ports),
    );
  }
});
test("late worker or HTTP authority loss suppresses URL and retains safe uncertain completion", async () => {
  const h = harness();
  h.worker.create = async () => {
    h.current = false;
    return h.result;
  };
  await assert.rejects(synchronousPortalDelivery(request, principal, h.ports));
  assert.equal(h.state, "UNCERTAIN");
  assert.equal(h.finishes.length, 1);
  const lost = harness();
  lost.worker.create = async () => {
    lost.authority = false;
    return lost.result;
  };
  await assert.rejects(
    synchronousPortalDelivery(request, principal, lost.ports),
  );
  assert.equal(lost.state, "UNCERTAIN");
  const commit = harness();
  commit.failFinish = true;
  await assert.rejects(
    synchronousPortalDelivery(request, principal, commit.ports),
  );
  assert.equal(commit.finishes.length, 1);
  assert.equal(commit.state, "INFLIGHT");
});
test("wrong attested claim scope rejects before any provider operation", async () => {
  const h = harness();
  h.canonical.execution_scope = { ...h.scope, scope_sha256: "f".repeat(64) };
  await assert.rejects(synchronousPortalDelivery(request, principal, h.ports));
  assert.equal(h.creates, 0);
});
for (const mode of ["LIVE", "STAGING_SANDBOX"] as const)
  test(`${mode}: actual shared PORTAL adapter validates cancellation config and exact five-call transport`, async () => {
    const scoped = modernBillingFixture(mode),
      scope = scoped.execution.execution_scope,
      row = scoped.execution.catalogue[0];
    const mapping = {
      version: 1,
      mode: scope.livemode ? "live" : "staging_sandbox",
      enabled: true,
      account_id: scope.account_id,
      offer_key: row.offer_key,
      revision: 1,
      price_id: row.price_id,
      product_id: row.product_id,
      portal_configuration_id: "bpc_synthetic123",
      activation_review_sha256: "a".repeat(64),
      terms_review_sha256: "a".repeat(64),
      tax_review_sha256: "a".repeat(64),
      tax_behavior: "inclusive",
      automatic_tax: false,
      payment_method: "card",
    };
    const canonical = {
      intent: {
        id: request.request_id,
        ...principal,
        kind: "PORTAL",
        state: "REQUESTED",
        customer_id: "cus_synthetic123",
        subscription_id: "sub_synthetic123",
        offer_key: row.offer_key,
        mapping_revision: 1,
        terms_review_sha256: "a".repeat(64),
        created_at: now - 20,
        expires_at: now + 600,
      },
      mapping,
      execution_scope: scope,
    };
    const price = {
      id: row.price_id,
      object: "price",
      livemode: scope.livemode,
      active: true,
      currency: "gbp",
      unit_amount: row.monthly_amount_minor,
      type: "recurring",
      billing_scheme: "per_unit",
      tax_behavior: "inclusive",
      recurring: {
        interval: "month",
        interval_count: 1,
        usage_type: "licensed",
      },
      product: {
        id: row.product_id,
        object: "product",
        livemode: scope.livemode,
        active: true,
      },
    };
    const calls: string[] = [];
    let posts = 0,
      allowUpdates = false;
    const key = `sk_${scope.livemode ? "live" : "test"}_SYNTHETIC_NOT_A_CREDENTIAL_000000`;
    const fetcher = (async (url, init) => {
      const target = String(url);
      calls.push(target);
      let body: unknown;
      if (target.endsWith("/account"))
        body = {
          id: scope.account_id,
          object: "account",
          charges_enabled: true,
        };
      else if (target.includes("/prices/")) body = price;
      else if (target.includes("/customers/"))
        body = {
          id: canonical.intent.customer_id,
          object: "customer",
          livemode: scope.livemode,
        };
      else if (target.includes("/configurations/"))
        body = {
          id: mapping.portal_configuration_id,
          object: "billing_portal.configuration",
          active: true,
          livemode: scope.livemode,
          features: {
            subscription_update: { enabled: allowUpdates },
            subscription_cancel: { enabled: true },
          },
        };
      else {
        posts++;
        assert.equal(init!.method, "POST");
        body = {
          id: "bps_synthetic123",
          object: "billing_portal.session",
          livemode: scope.livemode,
          customer: canonical.intent.customer_id,
          url: "https://billing.stripe.com/p/session/SYNTHETICtoken",
          created: now,
          configuration: mapping.portal_configuration_id,
        };
      }
      return new Response(JSON.stringify(body));
    }) as typeof fetch;
    const transport = boundedPortalTransport(fetcher, key, {
      customer_id: canonical.intent.customer_id,
      price_id: row.price_id,
      portal_configuration_id: mapping.portal_configuration_id,
      origin: "https://kxra.example",
    });
    const create = scope.livemode
      ? createLiveCatalogueSession
      : createStagingSandboxCatalogueSession;
    const result = await create(
      {
        ...scoped,
        runtime: {
          enabled: true,
          nodeEnv: "production",
          secretKey: key,
          origin: "https://kxra.example",
        },
        transport,
        resolveIntent: async () => canonical,
        stillCurrent: async () => true,
        nowSeconds: () => now,
      },
      { intent_id: request.request_id },
      principal,
    );
    assert.equal(posts, 1);
    assert.equal(calls.length, 5);
    assert.equal(result.expires_at, now + 1800);
    assert.equal(result.entitlement_authority, false);
    allowUpdates = true;
    await assert.rejects(
      create(
        {
          ...scoped,
          runtime: {
            enabled: true,
            nodeEnv: "production",
            secretKey: key,
            origin: "https://kxra.example",
          },
          transport: boundedPortalTransport(fetcher, key, {
            customer_id: canonical.intent.customer_id,
            price_id: row.price_id,
            portal_configuration_id: mapping.portal_configuration_id,
            origin: "https://kxra.example",
          }),
          resolveIntent: async () => canonical,
          stillCurrent: async () => true,
          nowSeconds: () => now,
        },
        { intent_id: request.request_id },
        principal,
      ),
    );
    assert.equal(
      posts,
      1,
      "Updates-enabled configuration must fail before another POST",
    );

    await assert.rejects(async () =>
      transport("https://api.stripe.com/v1/billing_portal/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Stripe-Version": "2025-07-30.basil",
        },
      }),
    );
    assert.equal(posts, 1);
  });
test("authorization gates require verified customer admin, MFA/legal/origin and bounded rate before reserve", async () => {
  const h = harness(),
    who = {
      id: principal.actor_id,
      organisation_id: principal.org_id,
      source: "supabase" as const,
      email_verified: true,
      account_state: "ACTIVE",
      organisation_kind: "CUSTOMER",
      relationship_type: "CUSTOMER",
      security_role: "ORG_ADMIN",
      aal: "aal2" as const,
      auth_time: now,
    };
  let deliveries = 0;
  const ports = {
    configuration: () => ({
      origin: "https://app.kxra-group.com",
      project: "lhbgeucifxxcdoyrnesf",
      mode: "LIVE" as const,
    }),
    sameOrigin: () => {},
    account: async () => who,
    now: () => now * 1000,
    legalAllowed: async () => true,
    rate: async () => true,
    deliver: async () => {
      deliveries++;
      return {};
    },
  };
  await authorizePortalDelivery(ports, request);
  assert.equal(deliveries, 1);
  for (const change of [
    { source: "fixture" as const },
    { aal: "aal1" as const },
    { security_role: "ORG_MEMBER" },
    { email_verified: false },
    { auth_time: now - 901 },
  ])
    await assert.rejects(
      authorizePortalDelivery(
        { ...ports, account: async () => ({ ...who, ...change }) },
        request,
      ),
    );
  await assert.rejects(
    authorizePortalDelivery(
      { ...ports, legalAllowed: async () => false },
      request,
    ),
  );
  await assert.rejects(
    authorizePortalDelivery({ ...ports, rate: async () => false }, request),
  );
  await assert.rejects(
    authorizePortalDelivery(
      {
        ...ports,
        sameOrigin: () => {
          throw Error("Wrong origin");
        },
      },
      request,
    ),
  );
  assert.equal(deliveries, 1);
});
test("universal portal SQL hold applies after exact replay and before fresh insert, with no new helpers or grants", () => {
  const sql = fs.readFileSync(
      "supabase/migrations/0100_reviewed_live_billing_ledger.sql",
      "utf8",
    ),
    start = sql.indexOf(
      "create function kxra_private.modern_core_request_live_billing_intent",
    );
  const body = sql.slice(start, sql.indexOf("-- Worker functions", start));
  assert.ok(
    body.indexOf("Original portal request requires reconciliation") >
      body.indexOf("return jsonb_build_object('id',r.id"),
  );
  assert.ok(
    body.indexOf("Original portal request requires reconciliation") <
      body.indexOf("insert into kxra_private.live_billing_intents"),
  );
  assert.match(
    body,
    /pending\.state in \('REQUESTED','INFLIGHT','UNCERTAIN'\)/,
  );
});

test("transport denies arbitrary destinations, extra fields, wrong customer/config and credential forwarding before fetch", async () => {
  const key = "sk_live_SYNTHETIC_NOT_A_CREDENTIAL_00000",
    expected = {
      customer_id: "cus_synthetic123",
      price_id: "price_synthetic123",
      portal_configuration_id: "bpc_synthetic123",
      origin: "https://kxra.example",
    };
  let fetched = 0;
  const fetcher = (async () => {
    fetched++;
    return new Response("{}");
  }) as typeof fetch;
  const headers = {
    Authorization: `Bearer ${key}`,
    "Stripe-Version": "2025-07-30.basil",
    "Idempotency-Key": "kxra-live-" + "a".repeat(64),
  };
  for (const body of [
    new URLSearchParams({
      customer: "cus_foreign123",
      configuration: expected.portal_configuration_id,
      return_url: expected.origin + "/os/start?billing=returned",
    }),
    new URLSearchParams({
      customer: expected.customer_id,
      configuration: expected.portal_configuration_id,
      return_url: "https://evil.invalid",
    }),
    new URLSearchParams({
      customer: expected.customer_id,
      configuration: expected.portal_configuration_id,
      return_url: expected.origin + "/os/start?billing=returned",
      flow_data: "unexpected",
    }),
  ]) {
    const transport = boundedPortalTransport(fetcher, key, expected);
    await assert.rejects(async () =>
      transport("https://api.stripe.com/v1/billing_portal/sessions", {
        method: "POST",
        headers,
        body: body.toString(),
      }),
    );
  }
  for (const target of [
    "https://evil.invalid/v1/account",
    "https://api.stripe.com/v1/subscriptions/sub_synthetic123",
    "https://api.stripe.com/v1/billing_portal/configurations/bpc_foreign123",
  ]) {
    const transport = boundedPortalTransport(fetcher, key, expected);
    await assert.rejects(async () =>
      transport(target, { method: "GET", headers }),
    );
  }
  const transport = boundedPortalTransport(fetcher, key, expected);
  await assert.rejects(async () =>
    transport("https://api.stripe.com/v1/account", {
      method: "GET",
      headers: { ...headers, "Stripe-Account": "acct_foreign123" },
    }),
  );
  assert.equal(fetched, 0);
});

test("atomic completion downgraded by a late kill switch never delivers the portal URL", async () => {
  const h = harness();
  h.worker.finish = async (r) => {
    assert.equal(r.outcome, "CONSUMED");
    h.finishes.push(r);
    h.state = "UNCERTAIN";
    return "UNCERTAIN";
  };
  await assert.rejects(synchronousPortalDelivery(request, principal, h.ports));
  assert.equal(h.state, "UNCERTAIN");
  assert.equal(h.finishes.length, 1);
});

test("real worker facade binds fixed scope/wrappers and refuses an admin SET ROLE identity", async () => {
  const { rootCertificates } = await import("node:tls"),
    { portalWorker } =
      await import("../packages/integrations/portal-delivery-worker"),
    { customerDispatchConfiguration } =
      await import("../packages/integrations/live-customer-dispatch-config"),
    { liveCustomerDatabaseExecutor } =
      await import("../packages/integrations/live-customer-worker");
  for (const mode of ["LIVE", "STAGING_SANDBOX"] as const) {
    const scoped = modernBillingFixture(mode),
      scope = scoped.execution.execution_scope,
      origin = scope.livemode
        ? "https://app.kxra-group.com"
        : "https://kxra-os-staging.vercel.app";
    const environment = {
      KXRA_MODERN_BILLING_DISPATCH_ENABLED: "true",
      NODE_ENV: "production",
      KXRA_ENVIRONMENT: scoped.runtimeIdentity.environment,
      NEXT_PUBLIC_SUPABASE_URL: scoped.runtimeIdentity.supabase_url,
      STRIPE_SECRET_KEY: `sk_${scope.livemode ? "live" : "test"}_SYNTHETIC_NOT_A_CREDENTIAL_00000`,
      KXRA_BILLING_WORKER_DATABASE_URL: `postgresql://kxra_billing_runner.${scope.project_ref}:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`,
      KXRA_DATABASE_CA_CERT_BASE64: Buffer.from(rootCertificates[0]).toString(
        "base64",
      ),
    };
    const commands: string[] = [];
    const worker = await portalWorker(
      { mode, origin, project: scope.project_ref },
      {
        environment,
        execute: async (command) => {
          commands.push(command.text);
          if (command.text.includes("scope_attestation"))
            return scoped.execution;
          if (command.text.includes("current_live_billing_intent")) return true;
          if (command.text.includes("finish_live_billing_intent"))
            return "CONSUMED";
          return {};
        },
      },
    );
    assert.deepEqual(worker.scope, scope);
    await worker.current(request.request_id);
    await worker.finish({
      intent_id: request.request_id,
      outcome: "CONSUMED",
      provider_session_id: "bps_synthetic123",
      result_sha256: "a".repeat(64),
    });
    assert.ok(
      commands.every((sql) => !sql.includes("claim_live_customer_intent")),
    );
    assert.ok(
      commands.some((sql) =>
        sql.includes(
          scope.livemode
            ? "kxra_private.current_live_billing_intent"
            : "kxra_private.staging_sandbox_current_live_billing_intent",
        ),
      ),
    );
    const profile = customerDispatchConfiguration(environment)!;
    const fake = () =>
      Promise.resolve({
        connect: async () => {},
        end: async () => {},
        query: async (sql: string) => ({
          rows:
            sql === "select session_user,current_user"
              ? [
                  {
                    session_user: "postgres",
                    current_user: "kxra_billing_worker",
                  },
                ]
              : [],
        }),
      });
    await assert.rejects(
      portalWorker(
        { mode, origin, project: scope.project_ref },
        { environment, execute: liveCustomerDatabaseExecutor(profile, fake) },
      ),
      /DATABASE_UNAVAILABLE/,
    );
  }
});

test("client-safe URL helper accepts documented secret-query and path forms, rejecting redirects/mode drift", async () => {
  const { validatedPortalDeliveryUrl } =
    await import("../packages/workspace/portal-url");
  for (const live of [true, false]) {
    const url = `https://billing.stripe.com/p/session?secret=${live ? "live" : "test"}_SYNTHETIC_NOT_REAL_TOKEN`;
    assert.equal(validatedPortalDeliveryUrl(url, live), url);
    assert.equal(validatedPortalDeliveryUrl(url), url);
    assert.throws(() => validatedPortalDeliveryUrl(url, !live));
  }
  assert.equal(
    validatedPortalDeliveryUrl(
      "https://billing.stripe.com/p/session/SYNTHETICtoken",
    ),
    "https://billing.stripe.com/p/session/SYNTHETICtoken",
  );
  for (const url of [
    "https://billing.stripe.com/p/session?secret=test_SYNTHETIC&next=https://evil.invalid",
    "https://billing.stripe.com/p/session?secret=test_SYNTHETIC&secret=test_SECOND",
    "https://billing.stripe.com/p/session?secret=unscopedTOKEN",
    "https://billing.stripe.com/p/session/test_SYNTHETIC#fragment",
    "https://billing.stripe.com.attacker.invalid/p/session/test_SYNTHETIC",
    "https://user:pass@billing.stripe.com/p/session/test_SYNTHETIC",
  ])
    assert.throws(() => validatedPortalDeliveryUrl(url));
  const h = harness();
  h.result.url =
    "https://billing.stripe.com/p/session?secret=live_SYNTHETIC_NOT_REAL_TOKEN";
  const result = await synchronousPortalDelivery(request, principal, h.ports);
  assert.equal(result.url, h.result.url);
  assert.ok(!JSON.stringify(h.finishes).includes("secret="));
});

test("generation advance after CONSUMED commit but before final reserve withholds the portal URL without changing the receipt", async () => {
  const h = harness(),
    finish = h.worker.finish;
  h.worker.finish = async (r) => {
    const outcome = await finish(r);
    assert.equal(outcome, "CONSUMED");
    h.generation = h.canonical.observed_version + 1;
    return outcome;
  };
  await assert.rejects(
    synchronousPortalDelivery(request, principal, h.ports),
    /Consumed portal delivery no longer current/,
  );
  assert.equal(h.state, "CONSUMED");
  assert.equal(h.creates, 1);
  assert.equal(h.claims, 1);
  assert.equal(h.finishes.length, 1);
  assert.equal((h.finishes[0] as { outcome: string }).outcome, "CONSUMED");
  assert.doesNotMatch(JSON.stringify(h.finishes), /https:|SYNTHETICtoken/);
});
