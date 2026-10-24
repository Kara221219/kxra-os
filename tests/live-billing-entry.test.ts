import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  liveBillingEntryConfiguration,
  liveBillingEntryController,
  LiveEntryError,
  type LiveEntryPorts,
  type LiveEntryIdentity,
} from "../packages/authz/live-billing-entry";
const now = 1_800_000_000_000;
const who: LiveEntryIdentity = {
  id: "10000000-0000-4000-8000-000000000001",
  organisation_id: "20000000-0000-4000-8000-000000000001",
  source: "supabase",
  email_verified: true,
  account_state: "ACTIVE",
  organisation_kind: "CUSTOMER",
  relationship_type: "CUSTOMER",
  security_role: "ORG_ADMIN",
  aal: "aal2",
  auth_time: now / 1000,
};
const request = {
  action: "CUSTOMER" as const,
  request_id: "30000000-0000-4000-8000-000000000001",
  offer_key: "KXRA_STARTER_V1" as const,
};
const status = {
  state: "FRESH",
  offer_key: null,
  request_id: null,
  kind: null,
  request_state: null,
  available_actions: ["CUSTOMER"],
  dispatch_ready: false,
  entitlement_authority: false,
};
function harness(change: Partial<LiveEntryPorts> = {}) {
  const calls: { who: LiveEntryIdentity; request: unknown }[] = [];
  const ports: LiveEntryPorts = {
    configuration: () => ({
      origin: "https://app.kxra-group.com",
      project: "lhbgeucifxxcdoyrnesf",
      mode: "LIVE",
    }),
    account: async () => who,
    sameOrigin: () => {},
    legalAllowed: async () => true,
    status: async () => status,
    reserve: async (a, r) => {
      calls.push({ who: a, request: r });
      return {
        ...(r.action === "CUSTOMER"
          ? { intent_id: r.request_id, version: 1 }
          : { id: r.request_id }),
        state: "REQUESTED",
        entitlement_authority: false,
      };
    },
    now: () => now,
    ...change,
  };
  return { controller: liveBillingEntryController(ports), calls };
}
const enabled = {
  KXRA_LIVE_BILLING_ENTRY_ENABLED: "true",
  NODE_ENV: "production",
  KXRA_ENVIRONMENT: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://lhbgeucifxxcdoyrnesf.supabase.co",
  KXRA_ORIGIN: "https://app.kxra-group.com",
};
test("entry configuration defaults off and binds production project and canonical origin", () => {
  assert.equal(liveBillingEntryConfiguration({}), null);
  assert.ok(liveBillingEntryConfiguration(enabled));
  for (const override of [
    { KXRA_LIVE_BILLING_ENTRY_ENABLED: "false" },
    { NODE_ENV: "development" },
    { KXRA_ENVIRONMENT: "unknown" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://jlebgsxcvhvpueuibekd.supabase.co" },
    { KXRA_ORIGIN: "https://evil.invalid" },
    { KXRA_ORIGIN: "https://app.kxra-group.com/" },
    { KXRA_ORIGIN: "http://app.kxra-group.com" },
  ])
    assert.equal(
      liveBillingEntryConfiguration({ ...enabled, ...override }),
      null,
    );
  assert.ok(
    liveBillingEntryConfiguration({
      ...enabled,
      KXRA_ENVIRONMENT: "staging",
      NEXT_PUBLIC_SUPABASE_URL: "https://jlebgsxcvhvpueuibekd.supabase.co",
      KXRA_ORIGIN: "https://kxra-os-staging-example.vercel.app",
    }),
  );
});
test("default-disabled entry refuses read/write without touching status/reservation", async () => {
  const { controller, calls } = harness({
    configuration: () => null,
    status: async () => {
      throw Error("must not read");
    },
  });
  await assert.rejects(
    controller.read(),
    (e: unknown) => e instanceof LiveEntryError && e.status === 503,
  );
  await assert.rejects(controller.write(request), /not enabled/);
  assert.equal(calls.length, 0);
});
test("request body never accepts client identity, tenant, role, paid state or provider data", async () => {
  for (const key of [
    "actor_id",
    "org_id",
    "role",
    "paid",
    "source",
    "customer_id",
    "price_id",
    "mode",
    "execution_scope",
    "environment",
    "url",
  ]) {
    const { controller, calls } = harness();
    await assert.rejects(controller.write({ ...request, [key]: "forged" }));
    assert.equal(calls.length, 0);
  }
  for (const input of [
    { ...request, action: "ACTIVATE" },
    { ...request, request_id: "wrong" },
    { ...request, offer_key: "WORKSPACE_PILOT_V1" },
  ])
    await assert.rejects(harness().controller.write(input));
});
test("same-origin rejection precedes identity and database work", async () => {
  const { controller, calls } = harness({
    sameOrigin: () => {
      throw Error("origin rejected");
    },
    account: async () => {
      throw Error("must not authenticate");
    },
  });
  await assert.rejects(controller.write(request), /origin rejected/);
  assert.equal(calls.length, 0);
});
test("only verified active Supabase CUSTOMER ORG_ADMIN identities can read or write", async () => {
  for (const change of [
    { source: "fake-provider" },
    { source: "fixture" },
    { email_verified: false },
    { account_state: "SUSPENDED" },
    { organisation_kind: "KXRA" },
    { relationship_type: "PARTNER" },
    { security_role: "ORG_MEMBER" },
    { security_role: "KXRA_OWNER" },
    { organisation_id: "forged" },
  ] as Partial<LiveEntryIdentity>[]) {
    const { controller, calls } = harness({
      account: async () => ({ ...who, ...change }),
    });
    await assert.rejects(controller.read(), /access unavailable/);
    await assert.rejects(controller.write(request), /access unavailable/);
    assert.equal(calls.length, 0);
  }
});
test("writes require recent AAL2 MFA and current legal context", async () => {
  for (const change of [
    { aal: "aal1" },
    { auth_time: now / 1000 - 901 },
    { auth_time: now / 1000 + 61 },
    { auth_time: NaN },
  ] as Partial<LiveEntryIdentity>[]) {
    const { controller, calls } = harness({
      account: async () => ({ ...who, ...change }),
    });
    await assert.rejects(controller.write(request), /MFA/);
    assert.equal(calls.length, 0);
  }
  const { controller, calls } = harness({ legalAllowed: async () => false });
  await assert.rejects(controller.write(request), /agreements/);
  assert.equal(calls.length, 0);
});
test("fresh customer requests queue real intent, preserve UUID for replay and never grant or redirect", async () => {
  const { controller, calls } = harness();
  const one = await controller.write(request),
    two = await controller.write(request);
  assert.equal(one.state, "QUEUED");
  assert.deepEqual(one, two);
  assert.equal(one.entitlement_authority, false);
  assert.equal(one.dispatch_ready, false);
  assert.ok(!("url" in one));
  assert.equal(calls.length, 2);
  assert.strictEqual(calls[0].who, who);
  assert.deepEqual(calls[0].request, request);
});
test("all three approved offers and all reservation actions retain only reviewed input", async () => {
  for (const offer_key of [
    "KXRA_STARTER_V1",
    "KXRA_TEAM_V1",
    "KXRA_BUSINESS_V1",
  ] as const)
    for (const action of [
      "CUSTOMER",
      "CHECKOUT",
      "PORTAL",
      "RECONCILE",
    ] as const) {
      const { controller, calls } = harness();
      await controller.write({ ...request, offer_key, action });
      assert.deepEqual(calls[0].request, { ...request, offer_key, action });
    }
});
test("provider failure or invalid reservation cannot fabricate queued success", async () => {
  await assert.rejects(
    harness({
      reserve: async () => {
        throw Error("SQL denied");
      },
    }).controller.write(request),
    /SQL denied/,
  );
  for (const receipt of [
    {
      intent_id: request.request_id,
      state: "READY",
      url: "https://stripe.invalid",
      entitlement_authority: false,
    },
    {
      intent_id: "40000000-0000-4000-8000-000000000001",
      state: "REQUESTED",
      entitlement_authority: false,
    },
    {
      intent_id: request.request_id,
      state: "REQUESTED",
      entitlement_authority: true,
    },
  ])
    await assert.rejects(
      harness({ reserve: async () => receipt }).controller.write(request),
    );
});
test("status remains own verified context and rejects provider identifiers or access claims", async () => {
  const { controller } = harness({
    status: async (a) => {
      assert.strictEqual(a, who);
      return status;
    },
  });
  assert.deepEqual(await controller.read(), status);
  for (const changed of [
    { ...status, customer_id: "cus_sensitive" },
    { ...status, entitlement_authority: true },
    { ...status, dispatch_ready: true },
  ])
    await assert.rejects(
      harness({ status: async () => changed }).controller.read(),
    );
});
test("private status migration has fixed context, verified membership and explicit execute boundary", () => {
  const sql = fs.readFileSync(
    "supabase/migrations/0105_private_own_live_billing_status.sql",
    "utf8",
  );
  assert.match(sql, /own_live_billing_status\(\)/);
  assert.match(sql, /requested_org\(\)/);
  assert.match(sql, /m\.account_id=auth\.uid\(\)/);
  assert.match(sql, /a\.auth_provider='SUPABASE'/);
  assert.match(sql, /security_role='ORG_ADMIN'/);
  assert.match(sql, /set search_path=''/);
  assert.match(sql, /from public,anon,kxra_billing_worker/);
  const returned = sql.slice(sql.indexOf("return jsonb_build_object"));
  for (const field of [
    "customer_id",
    "subscription_id",
    "price_id",
    "product_id",
    "provider_session_id",
  ])
    assert.ok(!returned.includes(field));
  assert.ok(
    !/insert into|update kxra|delete from|create table|grant .* on .*table/i.test(
      sql,
    ),
  );
});
test("runtime adapter reserves existing SQL functions and UI preserves truthful approved labels", () => {
  const adapter =
    fs.readFileSync("apps/os/lib/live-billing-entry.ts", "utf8") +
    fs.readFileSync("packages/authz/live-billing-reservation.ts", "utf8") +
    fs.readFileSync("packages/authz/modern-billing-entry-scope.ts", "utf8");
  assert.match(adapter, /request_live_customer_intent\(\$1,\$2\)/);
  assert.match(adapter, /request_live_billing_intent\(\$1,\$2,\$3\)/);
  assert.ok(
    !/fetch\(|createPilot|createCheckout|process\.env.*KEY/.test(adapter),
  );
  const ui = fs.readFileSync("apps/os/components/LiveBillingEntry.tsx", "utf8");
  assert.match(ui, /approvedCatalogue/);
  assert.match(ui, /Provider dispatch is\s+unavailable/);
  assert.match(ui, /pending \|\|/);
  assert.ok(
    !/window\.location|router\.push|localStorage|sessionStorage/.test(ui),
  );
});

test("billing renders approved prices and honest disabled/recovery states without browser/provider execution", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Billing } =
    await import("../apps/os/components/LiveBillingEntry");
  const { liveEntryStatus } =
    await import("../packages/authz/live-billing-entry-contract");
  const html = renderToStaticMarkup(
    createElement(Billing, { initial: liveEntryStatus.parse(status) }),
  );
  for (const text of [
    "£29",
    "£79",
    "£199",
    "1 user",
    "up to 5 users",
    "up to 15 users",
    "Provider dispatch is unavailable",
  ]) {
    assert.ok(html.replace(/\s+/g, " ").includes(text));
  }
  const disabled = renderToStaticMarkup(
    createElement(Billing, {
      initial: liveEntryStatus.parse({
        ...status,
        state: "DISABLED",
        available_actions: [],
      }),
    }),
  );
  assert.ok(!disabled.includes("Record customer request"));
  assert.match(disabled, /Live billing remains disabled/);
  const resumed = renderToStaticMarkup(
    createElement(Billing, {
      initial: liveEntryStatus.parse({
        ...status,
        state: "CUSTOMER_PENDING",
        request_id: request.request_id,
        kind: "CUSTOMER",
        request_state: "REQUESTED",
        available_actions: [],
      }),
    }),
  );
  assert.ok(resumed.includes(request.request_id));
  assert.ok(!resumed.includes("Record customer request"));
  assert.match(resumed, /do not create a replacement/);
});

test("replayed consumed request is recorded, never advertised as newly queued", async () => {
  const { controller } = harness({
    reserve: async () => ({
      intent_id: request.request_id,
      state: "BOUND",
      version: 1,
      entitlement_authority: false,
    }),
  });
  const result = await controller.write(request);
  assert.equal(result.state, "RECORDED");
  assert.equal(result.request_state, "BOUND");
  assert.equal(result.entitlement_authority, false);
});

test("real reservation service consumes shared 8/900 server-identity budget before intent", async () => {
  const { reserveLiveBillingEntry } =
    await import("../packages/authz/live-billing-reservation");
  const calls: { sql: string; values: unknown[]; actor: LiveEntryIdentity }[] =
    [];
  const query = async <T>(
    actor: LiveEntryIdentity,
    sql: string,
    values: unknown[],
  ): Promise<T[]> => {
    calls.push({ actor, sql, values });
    return (
      sql.includes("consume_rate_limit")
        ? [{ allowed: true }]
        : [
            {
              value: {
                intent_id: request.request_id,
                state: "REQUESTED",
                entitlement_authority: false,
              },
            },
          ]
    ) as T[];
  };
  await reserveLiveBillingEntry(who, request, query, "LIVE");
  assert.match(
    calls[0].sql,
    /consume_rate_limit\('live-billing-entry',\$1,8,900\)/,
  );
  assert.match(String(calls[0].values[0]), /^[a-f0-9]{64}$/);
  assert.equal(calls[0].actor, who);
  assert.match(calls[1].sql, /request_live_customer_intent/);
  const originalSubject = calls[0].values[0];
  calls.length = 0;
  await reserveLiveBillingEntry(
    who,
    { ...request, action: "PORTAL", offer_key: "KXRA_TEAM_V1" },
    query,
    "LIVE",
  );
  assert.equal(calls[0].values[0], originalSubject);
  assert.match(calls[1].sql, /request_live_billing_intent/);
  calls.length = 0;
  await reserveLiveBillingEntry(
    { ...who, organisation_id: "20000000-0000-4000-8000-000000000002" },
    request,
    query,
    "LIVE",
  );
  assert.notEqual(calls[0].values[0], originalSubject);
  let attempted = 0;
  const denied = async <T>(): Promise<T[]> => {
    attempted++;
    return [{ allowed: false }] as T[];
  };
  await assert.rejects(
    reserveLiveBillingEntry(who, request, denied, "LIVE"),
    (e: unknown) => e instanceof LiveEntryError && e.status === 429,
  );
  assert.equal(attempted, 1);
});

test("real rate reservation is reached only after verified MFA/legal checks", async () => {
  const { reserveLiveBillingEntry } =
    await import("../packages/authz/live-billing-reservation");
  let consumed = 0;
  const events: string[] = [];
  const query = async <T>(
    _actor: LiveEntryIdentity,
    sql: string,
  ): Promise<T[]> => {
    if (sql.includes("consume_rate_limit")) {
      consumed++;
      events.push("rate");
      return [{ allowed: true }] as T[];
    }
    events.push("intent");
    return [
      {
        value: {
          intent_id: request.request_id,
          state: "REQUESTED",
          entitlement_authority: false,
        },
      },
    ] as T[];
  };
  const make = (identity = who, legal = true) =>
    harness({
      account: async () => {
        events.push("account");
        return identity;
      },
      legalAllowed: async () => {
        events.push("legal");
        return legal;
      },
      reserve: (a, r) => reserveLiveBillingEntry(a, r, query, "LIVE"),
    }).controller;
  await assert.rejects(make({ ...who, source: "fixture" }).write(request));
  await assert.rejects(make({ ...who, aal: "aal1" }).write(request));
  await assert.rejects(make(who, false).write(request));
  assert.equal(consumed, 0);
  events.length = 0;
  await make().write(request);
  assert.deepEqual(events, ["account", "legal", "rate", "intent"]);
});
