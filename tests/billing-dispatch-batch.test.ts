import assert from "node:assert/strict";
import test from "node:test";
import { rootCertificates } from "node:tls";
import {
  runBillingDispatchBatchOnce,
  parseBillingBatchArguments,
  type DispatchBatchPorts,
} from "../packages/integrations/billing-dispatch-batch";
import { modernBillingFixture } from "./support/modern-billing-scope";
import { LIVE_STRIPE_API_VERSION } from "../packages/integrations/live-catalogue-stripe";
const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
];
function fixture(mode: "LIVE" | "STAGING_SANDBOX" = "STAGING_SANDBOX") {
  const { execution, runtimeIdentity } = modernBillingFixture(mode),
    tag = execution.execution_scope;
  const environment = {
    KXRA_MODERN_BILLING_DISPATCH_ENABLED: "true",
    NODE_ENV: "production",
    KXRA_ENVIRONMENT: runtimeIdentity.environment,
    NEXT_PUBLIC_SUPABASE_URL: runtimeIdentity.supabase_url,
    KXRA_ORIGIN:
      mode === "LIVE"
        ? "https://app.kxra-group.com"
        : "https://kxra-os-staging.vercel.app",
    STRIPE_SECRET_KEY: `sk_${tag.livemode ? "live" : "test"}_SYNTHETIC_NOT_A_CREDENTIAL_00000`,
    KXRA_BILLING_WORKER_DATABASE_URL: `postgresql://kxra_billing_runner.${tag.project_ref}:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`,
    KXRA_DATABASE_CA_CERT_BASE64: Buffer.from(rootCertificates[0]).toString(
      "base64",
    ),
  };
  let candidates: unknown = ids.map((request_id, i) => ({
    request_id,
    action: i ? "CHECKOUT" : "CUSTOMER",
    execution_scope: tag,
  }));
  let time = 0;
  const calls: string[] = [],
    dispatches: string[] = [];
  const execute: NonNullable<DispatchBatchPorts["execute"]> = async (c) => {
    calls.push(c.text);
    if (c.text.includes("attestation")) return execution;
    if (c.text.includes("discover_billing_dispatch")) {
      assert.deepEqual(c.values, [2, environment.KXRA_ORIGIN]);
      return candidates;
    }
    throw Error("Unexpected SQL");
  };
  const customer: NonNullable<DispatchBatchPorts["customer"]> = async (
    id,
    p,
  ) => {
    assert.equal(p.environment.KXRA_ENVIRONMENT, runtimeIdentity.environment);
    dispatches.push(id);
    return {
      state: "RECORDED",
      intent_id: id,
      outcome: "BOUND",
      entitlement_authority: false,
    };
  };
  const checkout: NonNullable<DispatchBatchPorts["checkout"]> = async (id) => {
    dispatches.push(id);
    return { state: "READY", request_id: id, entitlement_authority: false };
  };
  const ports: DispatchBatchPorts = {
    environment,
    execute,
    customer,
    checkout,
    fetch: async () => Response.json({}),
    nowMs: () => time,
  };
  return {
    ports,
    calls,
    dispatches,
    tag,
    environment,
    setCandidates: (v: unknown) => {
      candidates = v;
    },
    advance: () => {
      time = 100;
    },
    run: () => runBillingDispatchBatchOnce({ limit: 2 }, ports),
  };
}
test("batch disabled performs no configuration, SQL or HTTP", async () => {
  const r = await runBillingDispatchBatchOnce(
    {},
    {
      environment: {},
      execute: async () => {
        assert.fail();
      },
      fetch: async () => {
        assert.fail();
      },
    },
  );
  assert.equal(r.state, "DISABLED");
  assert.equal(r.attempted, 0);
});
for (const mode of ["LIVE", "STAGING_SANDBOX"] as const)
  test(`batch ${mode} selects only fixed scoped discovery and calls both drivers`, async () => {
    const f = fixture(mode),
      r = await f.run();
    assert.deepEqual(f.dispatches, ids);
    assert.equal(r.results[1].state, "READY");
    assert.equal(r.entitlement_authority, false);
    assert.ok(
      f.calls[1].includes(
        mode === "LIVE"
          ? ".discover_billing_dispatch"
          : ".staging_sandbox_discover_billing_dispatch",
      ),
    );
    assert.equal("url" in r.results[1], false);
  });
for (const [name, mutate] of Object.entries({
  kind: (f: ReturnType<typeof fixture>) => [
    { request_id: ids[0], action: "PORTAL", execution_scope: f.tag },
  ],
  foreign: (f: ReturnType<typeof fixture>) => [
    {
      request_id: ids[0],
      action: "CUSTOMER",
      execution_scope: { ...f.tag, account_id: "acct_other" },
    },
  ],
  duplicate: (f: ReturnType<typeof fixture>) =>
    [0, 1].map(() => ({
      request_id: ids[0],
      action: "CUSTOMER",
      execution_scope: f.tag,
    })),
  excess: (f: ReturnType<typeof fixture>) =>
    ids.concat(ids[0]).map((request_id) => ({
      request_id,
      action: "CUSTOMER",
      execution_scope: f.tag,
    })),
  principal: (f: ReturnType<typeof fixture>) => [
    {
      request_id: ids[0],
      action: "CUSTOMER",
      execution_scope: f.tag,
      actor_id: ids[1],
    },
  ],
}))
  test(`batch refuses ${name} discovery before driver`, async () => {
    const f = fixture();
    f.setCandidates(mutate(f));
    await assert.rejects(f.run());
    assert.equal(f.dispatches.length, 0);
  });
test("batch per-item error is redacted and does not block next eligible item", async () => {
  const f = fixture();
  f.ports.customer = async () => {
    throw Error("secret connection string and raw provider payload");
  };
  const r = await f.run();
  assert.equal(r.results[0].code, "DISPATCH_NOT_CONFIRMED");
  assert.equal(r.results[1].state, "READY");
  assert.ok(!JSON.stringify(r).includes("secret"));
});
test("batch deadline stops new work but permits one durable in-flight completion", async () => {
  const f = fixture();
  f.ports.durationMs = 100;
  f.ports.customer = async (id, p) => {
    f.advance();
    await assert.rejects(p.execute({ text: "select something", values: [] }));
    await p.execute({
      text: "select kxra_private.staging_sandbox_finish_live_customer_intent($1,$2)",
      values: [id, "{}"],
    });
    return {
      state: "RECORDED",
      intent_id: id,
      outcome: "UNCERTAIN",
      entitlement_authority: false,
    };
  };
  const base = f.ports.execute!;
  f.ports.execute = async (c) =>
    c.text.includes("finish_live_customer_intent") ? "UNCERTAIN" : base(c);
  const r = await f.run();
  assert.equal(r.state, "BUDGET_EXHAUSTED");
  assert.equal(r.attempted, 1);
  assert.equal(r.skipped, 1);
});
test("batch shared provider budget rejects foreign destination and excessive requests before network", async () => {
  const f = fixture();
  let http = 0;
  f.ports.fetch = async () => {
    http++;
    return Response.json({});
  };
  f.ports.customer = async (id, p) => {
    const init = {
      method: "GET",
      headers: {
        authorization: `Bearer ${f.environment.STRIPE_SECRET_KEY}`,
        "stripe-version": LIVE_STRIPE_API_VERSION,
      },
    };
    await assert.rejects(p.fetch("https://foreign.example/v1/account", init));
    for (let i = 0; i < 8; i++)
      await p.fetch("https://api.stripe.com/v1/account", init);
    await assert.rejects(p.fetch("https://api.stripe.com/v1/account", init));
    return {
      state: "RECORDED",
      intent_id: id,
      outcome: "UNCERTAIN",
      entitlement_authority: false,
    };
  };
  const r = await f.run();
  assert.equal(http, 8);
  assert.equal(r.provider_requests, 8);
});
test("batch actual default customer driver cannot POST when overlapping claim is unavailable", async () => {
  const f = fixture();
  delete f.ports.customer;
  f.setCandidates([
    { request_id: ids[0], action: "CUSTOMER", execution_scope: f.tag },
  ]);
  const base = f.ports.execute!;
  let claims = 0;
  f.ports.execute = async (c) => {
    if (c.text.includes("claim_live_customer_intent")) {
      claims++;
      throw Error("already consumed");
    }
    return base(c);
  };
  f.ports.fetch = async () => {
    assert.fail("No POST or preflight for unavailable claim");
  };
  const [a, b] = await Promise.all([f.run(), f.run()]);
  assert.equal(claims, 2);
  assert.equal(a.provider_posts + b.provider_posts, 0);
  assert.equal(a.results[0].state, "NOT_CONFIRMED");
});
for (const args of [
  [],
  ["--watch"],
  ["--once", "--mode", "LIVE"],
  ["--once", "--limit", "0"],
  ["--once", "--limit", "21"],
  ["--once", "--limit", "01"],
  ["--once", "--request", ids[0]],
])
  test(`strict batch CLI ${JSON.stringify(args)}`, () => {
    if (args[2] === "01")
      assert.deepEqual(parseBillingBatchArguments(args), { limit: 1 });
    else assert.throws(() => parseBillingBatchArguments(args));
  });
test("batch CLI accepts only one bounded pass", () => {
  assert.deepEqual(parseBillingBatchArguments(["--once"]), { limit: 5 });
  assert.deepEqual(parseBillingBatchArguments(["--once", "--limit", "20"]), {
    limit: 20,
  });
});

test("shared provider POST ceiling is independent of GET budget and never retries", async () => {
  const f = fixture();
  let posts = 0;
  f.ports.fetch = async () => {
    posts++;
    return Response.json({});
  };
  f.ports.customer = async (id, p) => {
    const init = {
      method: "POST",
      headers: {
        authorization: `Bearer ${f.environment.STRIPE_SECRET_KEY}`,
        "stripe-version": LIVE_STRIPE_API_VERSION,
      },
      body: "metadata[x]=SYNTHETIC",
    };
    await p.fetch("https://api.stripe.com/v1/customers", init);
    await p.fetch("https://api.stripe.com/v1/customers", init);
    await assert.rejects(p.fetch("https://api.stripe.com/v1/customers", init));
    return {
      state: "RECORDED",
      intent_id: id,
      outcome: "UNCERTAIN",
      entitlement_authority: false,
    };
  };
  const r = await f.run();
  assert.equal(posts, 2);
  assert.equal(r.provider_posts, 2);
});
test("batch full-response deadline cancels a hung body and does not launch the next item", async () => {
  const f = fixture();
  f.ports.nowMs = Date.now;
  f.ports.durationMs = 20;
  let cancelled = false;
  f.ports.fetch = async () =>
    new Response(
      new ReadableStream({
        pull: () => new Promise(() => {}),
        cancel() {
          cancelled = true;
        },
      }),
    );
  f.ports.customer = async (id, p) => {
    await assert.rejects(
      p.fetch("https://api.stripe.com/v1/account", {
        headers: {
          authorization: `Bearer ${f.environment.STRIPE_SECRET_KEY}`,
          "stripe-version": LIVE_STRIPE_API_VERSION,
        },
      }),
    );
    return {
      state: "RECORDED",
      intent_id: id,
      outcome: "UNCERTAIN",
      entitlement_authority: false,
    };
  };
  const r = await f.run();
  assert.equal(r.state, "BUDGET_EXHAUSTED");
  assert.equal(r.attempted, 1);
  assert.equal(r.provider_requests, 1);
  assert.equal(cancelled, true);
});
for (const value of [0, 21, 1.5, null])
  test(`batch invalid limit ${value}`, async () => {
    await assert.rejects(
      runBillingDispatchBatchOnce({ limit: value }, { environment: {} }),
    );
  });
