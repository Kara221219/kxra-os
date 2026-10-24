import assert from "node:assert/strict";
import test from "node:test";
import { rootCertificates } from "node:tls";
import {
  createBillingHttpHandler,
  billingHttpSummary,
} from "../packages/integrations/billing-http-controller";
import {
  billingHttpQuery,
  billingHttpReadTransport,
  runBillingHttpInvocation,
} from "../packages/integrations/billing-http-runtime";
import { checkoutDispatchConfiguration } from "../packages/integrations/checkout-dispatch-config";
import { modernBillingFixture } from "./support/modern-billing-scope";
import { LIVE_STRIPE_API_VERSION } from "../packages/integrations/live-catalogue-stripe";
const secret = "SYNTHETIC_BILLING_TRIGGER_" + "x".repeat(64);
const flags = {
  KXRA_BILLING_HTTP_ENABLED: "true",
  KXRA_MODERN_BILLING_DISPATCH_ENABLED: "true",
  KXRA_PAID_PROOF_REFRESH_ENABLED: "true",
  KXRA_BILLING_WORKER_TRIGGER_SECRET: secret,
};
const dispatchResult = {
  state: "COMPLETED",
  discovered: 0,
  attempted: 0,
  skipped: 0,
  provider_requests: 0,
  provider_posts: 0,
  results: [],
  entitlement_authority: false,
};
function request(
  kind = "dispatch",
  method = "POST",
  body?: BodyInit,
  authorization = `Bearer ${secret}`,
  query = "",
) {
  return new Request(
    `https://worker.example.test/api/billing/${kind}${query}`,
    {
      method,
      headers: { authorization },
      ...(body === undefined ? {} : { body }),
    },
  );
}
for (const kind of ["dispatch", "refresh"] as const) {
  test(`${kind}: absent or disabled flags cause no credential read or invocation`, async () => {
    let calls = 0;
    const env = new Proxy(
      {},
      {
        get: (_t, p) => {
          assert.equal(p, "KXRA_BILLING_HTTP_ENABLED");
          return undefined;
        },
      },
    );
    const h = createBillingHttpHandler(kind, {
      environment: () => env,
      invoke: async () => {
        calls++;
        throw Error();
      },
    });
    assert.equal((await h(request(kind))).status, 404);
    assert.equal(calls, 0);
  });
  for (const configured of [undefined, "", "short"])
    test(`${kind}: invalid dedicated billing secret has NO email fallback (${configured ?? "absent"})`, async () => {
      let calls = 0;
      const h = createBillingHttpHandler(kind, {
        environment: () => ({
          ...flags,
          KXRA_BILLING_WORKER_TRIGGER_SECRET: configured,
          KXRA_EMAIL_WORKER_TRIGGER_SECRET: secret,
        }),
        invoke: async () => {
          calls++;
          throw Error();
        },
      });
      assert.equal((await h(request(kind))).status, 401);
      assert.equal(calls, 0);
    });
  test(`${kind}: unauthorized body is never read and provider configuration never touched`, async () => {
    let reads = 0,
      calls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        reads++;
        return new Promise(() => {});
      },
    });
    const req = new Request(`https://worker.example.test/api/billing/${kind}`, {
      method: "POST",
      headers: { authorization: "Bearer " + "y".repeat(64) },
      body: stream,
      duplex: "half",
    } as RequestInit);
    // Web streams may eagerly pull once at construction; handler must never acquire a reader.
    const initial = reads;
    const h = createBillingHttpHandler(kind, {
      environment: () => ({ ...flags }),
      invoke: async () => {
        calls++;
        throw Error();
      },
    });
    assert.equal((await h(req)).status, 401);
    assert.equal(req.bodyUsed, false);
    assert.equal(calls, 0);
    assert.ok(reads <= initial + 1);
  });
  test(`${kind}: HEAD and unsupported methods cannot execute jobs`, async () => {
    let calls = 0;
    const h = createBillingHttpHandler(kind, {
      environment: () => flags,
      invoke: async () => {
        calls++;
        throw Error();
      },
    });
    for (const method of ["HEAD", "PUT", "DELETE", "OPTIONS"])
      assert.equal((await h(request(kind, method))).status, 405);
    assert.equal(calls, 0);
  });
  test(`${kind}: query mode/IDs/options and nonempty bodies are rejected`, async () => {
    let calls = 0;
    const h = createBillingHttpHandler(kind, {
      environment: () => flags,
      invoke: async () => {
        calls++;
        throw Error();
      },
    });
    for (const query of [
      "?mode=LIVE",
      "?org_id=private",
      "?limit=20",
      "?durationMs=90000",
    ])
      assert.equal(
        (await h(request(kind, "POST", undefined, undefined, query))).status,
        400,
      );
    for (const body of [
      " ",
      "{}",
      JSON.stringify({ mode: "LIVE", intent_id: "private" }),
      "x".repeat(1_000_001),
    ])
      assert.equal((await h(request(kind, "POST", body))).status, 400);
    assert.equal(calls, 0);
  });
  test(`${kind}: hung authenticated body terminates within its body budget`, async () => {
    let cancelled = 0,
      calls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise(() => {});
      },
      cancel() {
        cancelled++;
      },
    });
    const req = new Request(`https://worker.example.test/api/billing/${kind}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      body: stream,
      duplex: "half",
    } as RequestInit);
    const h = createBillingHttpHandler(kind, {
      environment: () => flags,
      bodyDeadlineMs: 10,
      invoke: async () => {
        calls++;
        throw Error();
      },
    });
    assert.equal((await h(req)).status, 400);
    assert.equal(calls, 0);
    assert.ok(cancelled > 0);
  });
  test(`${kind}: errors and success results cannot disclose identifiers/URLs/keys`, async () => {
    const environment = () => flags;
    let h = createBillingHttpHandler(kind, {
      environment,
      invoke: async () => {
        throw Error(
          "sk_live_PRIVATE postgres://private cus_private https://checkout.stripe.com/private",
        );
      },
    });
    let r = await h(request(kind));
    assert.equal(r.status, 503);
    assert.doesNotMatch(await r.text(), /sk_live|postgres:|cus_|https:/);
    h = createBillingHttpHandler(kind, {
      environment,
      invoke: async () =>
        kind === "dispatch"
          ? {
              ...dispatchResult,
              discovered: 1,
              attempted: 1,
              results: [
                {
                  request_id: "private",
                  action: "CUSTOMER",
                  state: "RECORDED",
                  outcome: "BOUND",
                  url: "https://private",
                },
              ],
            }
          : {
              processed: 1,
              outcomes: [
                { org_id: "private", outcome: "ELIGIBLE", acknowledged: 1 },
              ],
            },
    });
    r = await h(request(kind, "GET"));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "private, no-store");
    assert.doesNotMatch(await r.text(), /private|https:|request_id|org_id/);
  });
}
function runtimeFixture(mode: "LIVE" | "STAGING_SANDBOX" = "STAGING_SANDBOX") {
  const f = modernBillingFixture(mode),
    project = f.runtimeIdentity.project_ref;
  const env = {
    ...flags,
    NODE_ENV: "production",
    KXRA_ENVIRONMENT: f.runtimeIdentity.environment,
    NEXT_PUBLIC_SUPABASE_URL: f.runtimeIdentity.supabase_url,
    KXRA_ORIGIN:
      mode === "LIVE"
        ? "https://app.kxra-group.com"
        : "https://kxra-os-staging.vercel.app",
    STRIPE_SECRET_KEY: `sk_${mode === "LIVE" ? "live" : "test"}_SYNTHETIC_NOT_A_CREDENTIAL_000000`,
    KXRA_BILLING_WORKER_DATABASE_URL: `postgresql://kxra_billing_runner.${project}:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`,
    KXRA_DATABASE_CA_CERT_BASE64: Buffer.from(rootCertificates[0]).toString(
      "base64",
    ),
  };
  return { ...f, env };
}
for (const mode of ["LIVE", "STAGING_SANDBOX"] as const)
  for (const kind of ["dispatch", "refresh"] as const)
    test(`${mode} ${kind}: packaged actual core uses fixed bounded discovery and genuine runner role; zero jobs never calls provider`, async () => {
      const f = runtimeFixture(mode),
        calls: { text: string; values: unknown[] }[] = [];
      let fetches = 0,
        connections = 0;
      const clientFactory = async () => ({
        connect: async () => {
          connections++;
        },
        end: async () => {},
        query: async (text: string, values: unknown[] = []) => {
          calls.push({ text, values });
          if (text === "select session_user,current_user")
            return {
              rows: [
                {
                  session_user: "kxra_billing_runner",
                  current_user: "kxra_billing_worker",
                },
              ],
            };
          if (text.includes("attestation"))
            return { rows: [{ value: f.execution }] };
          if (text.includes("discover_billing_dispatch"))
            return { rows: [{ value: [] }] };
          return { rows: [] };
        },
      });
      const result = await runBillingHttpInvocation(kind, f.env, {
        clientFactory,
        fetch: async () => {
          fetches++;
          throw Error("No provider needed");
        },
      });
      assert.equal(fetches, 0);
      assert.ok(connections >= 2);
      const discoveries = calls.filter((c) =>
        /discover_billing_dispatch|claim_live_billing_wakeups|claim_live_paid_refresh/.test(
          c.text,
        ),
      );
      assert.ok(discoveries.length > 0);
      for (const c of discoveries) {
        assert.equal(c.values[0], kind === "dispatch" ? 2 : 1);
        assert.equal(
          c.text.includes("staging_sandbox_"),
          mode === "STAGING_SANDBOX",
        );
      }
      assert.ok(
        calls.some((c) => c.text === "set local statement_timeout='2s'"),
      );
      assert.ok(calls.some((c) => c.text === "set local lock_timeout='500ms'"));
      assert.equal(
        (billingHttpSummary(kind, result) as { entitlement_authority: boolean })
          .entitlement_authority,
        false,
      );
    });
test("runtime disabled or mixed-mode configuration rejects before any SQL/provider", async () => {
  const f = runtimeFixture();
  let calls = 0;
  const ports = {
    clientFactory: async () => {
      calls++;
      throw Error();
    },
    fetch: async () => {
      calls++;
      throw Error();
    },
  };
  await assert.rejects(
    runBillingHttpInvocation(
      "dispatch",
      { ...f.env, KXRA_BILLING_HTTP_ENABLED: "false" },
      ports,
    ),
  );
  await assert.rejects(
    runBillingHttpInvocation(
      "refresh",
      {
        ...f.env,
        STRIPE_SECRET_KEY: "sk_live_SYNTHETIC_NOT_A_CREDENTIAL_000000",
      },
      ports,
    ),
  );
  assert.equal(calls, 0);
});
test("READ transport shares45s/32GET ceiling and rejects provider mutations", async () => {
  let clock = 0,
    calls = 0;
  const headers = {
    authorization: "Bearer sk_test_SYNTHETIC",
    "stripe-version": LIVE_STRIPE_API_VERSION,
  };
  const make = () =>
    billingHttpReadTransport("sk_test_SYNTHETIC", {
      nowMs: () => clock,
      fetch: async () => {
        calls++;
        return Response.json({});
      },
    });
  const transport = make();
  for (let i = 0; i < 32; i++)
    await transport("https://api.stripe.com/v1/account", { headers });
  await assert.rejects(
    transport("https://api.stripe.com/v1/account", { headers }),
  );
  assert.equal(calls, 32);
  const timed = make();
  clock = 45_000;
  await assert.rejects(timed("https://api.stripe.com/v1/account", { headers }));
  assert.equal(calls, 32);
  clock = 0;
  await assert.rejects(
    make()("https://api.stripe.com/v1/customers", {
      headers,
      method: "POST",
      body: "",
    }),
  );
  assert.equal(calls, 32);
});
test("SQL budget expiration and wrong runner identity fail closed without target command", async () => {
  const config = checkoutDispatchConfiguration(runtimeFixture().env)!;
  let now = 0,
    queries: string[] = [];
  const query = billingHttpQuery(config, 100, {
    nowMs: () => now,
    clientFactory: async () => ({
      connect: async () => {},
      end: async () => {},
      query: async (text) => {
        queries.push(text);
        return {
          rows:
            text === "select session_user,current_user"
              ? [
                  {
                    session_user: "postgres",
                    current_user: "kxra_billing_worker",
                  },
                ]
              : [],
        };
      },
    }),
  });
  await assert.rejects(query("select private_target()"));
  assert.ok(!queries.includes("select private_target()"));
  now = 100;
  const count = queries.length;
  await assert.rejects(query("select private_target()"));
  assert.equal(queries.length, count);
});
test("overlapping requests invoke durable cores independently rather than in-memory admission", async () => {
  let invocations = 0;
  const h = createBillingHttpHandler("dispatch", {
    environment: () => flags,
    invoke: async () => {
      invocations++;
      return dispatchResult;
    },
  });
  const responses = await Promise.all([h(request()), h(request())]);
  assert.ok(responses.every((r) => r.status === 200));
  assert.equal(invocations, 2);
  // Single-use admission remains100/102 SQL responsibility; this is not a native multi-process claim test.
});

test("packaged routes explicitly reject HEAD before configuration or work", async () => {
  const dispatch =
    await import("../apps/email-worker/app/api/billing/dispatch/route");
  const refresh =
    await import("../apps/email-worker/app/api/billing/refresh/route");
  for (const route of [dispatch, refresh]) {
    assert.equal(route.maxDuration, 60);
    assert.equal(
      (
        await route.HEAD(
          new Request("https://worker.example.test", { method: "HEAD" }),
        )
      ).status,
      405,
    );
    assert.equal(route.GET, route.POST);
  }
});
test("bounded body rejects endless zero-byte chunks and already aborted requests", async () => {
  let invoked = 0;
  const h = createBillingHttpHandler("dispatch", {
    environment: () => flags,
    invoke: async () => {
      invoked++;
      return dispatchResult;
    },
  });
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      c.enqueue(new Uint8Array());
    },
  });
  const req = new Request("https://worker.example.test/api/billing/dispatch", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    body: stream,
    duplex: "half",
  } as RequestInit);
  assert.equal((await h(req)).status, 400);
  const controller = new AbortController();
  controller.abort();
  assert.equal(
    (
      await h(
        new Request("https://worker.example.test/api/billing/dispatch", {
          method: "POST",
          headers: { authorization: `Bearer ${secret}` },
          signal: controller.signal,
        }),
      )
    ).status,
    400,
  );
  assert.equal(invoked, 0);
});

test("overlapping packaged invocations delegate single-use admission to the same canonical SQL claim", async () => {
  const f = runtimeFixture(),
    tag = f.execution.execution_scope,
    row = f.execution.catalogue[0],
    id = "33333333-3333-4333-8333-333333333333",
    now = Math.floor(Date.now() / 1000),
    hash = "a".repeat(64);
  const canonical = {
    execution_scope: tag,
    entitlement_authority: false,
    intent: {
      id,
      org_id: "11111111-1111-4111-8111-111111111111",
      actor_id: "22222222-2222-4222-8222-222222222222",
      offer_key: row.offer_key,
      mapping_revision: 1,
      version: 1,
      state: "REQUESTED",
      terms_review_sha256: hash,
      auth_time: now - 10,
      created_at: now - 10,
      expires_at: now + 200,
    },
    mapping: {
      version: 1,
      mode: "staging_sandbox",
      enabled: true,
      account_id: tag.account_id,
      offer_key: row.offer_key,
      revision: 1,
      price_id: row.price_id,
      product_id: row.product_id,
      portal_configuration_id: "bpc_syntheticHttp",
      activation_review_sha256: hash,
      terms_review_sha256: hash,
      tax_review_sha256: hash,
      tax_behavior: "inclusive",
      automatic_tax: false,
      payment_method: "card",
    },
  };
  let claimed = false,
    claims = 0,
    finishes = 0,
    providerAttempts = 0;
  const clientFactory = async () => ({
    connect: async () => {},
    end: async () => {},
    query: async (text: string, values: unknown[] = []) => {
      if (text === "select session_user,current_user")
        return {
          rows: [
            {
              session_user: "kxra_billing_runner",
              current_user: "kxra_billing_worker",
            },
          ],
        };
      if (text.includes("attestation"))
        return { rows: [{ value: f.execution }] };
      if (text.includes("discover_billing_dispatch"))
        return {
          rows: [
            {
              value: [
                { request_id: id, action: "CUSTOMER", execution_scope: tag },
              ],
            },
          ],
        };
      if (text.includes("claim_live_customer_intent")) {
        claims++;
        assert.equal(values[0], id);
        if (claimed) throw Error("Already claimed");
        claimed = true;
        return { rows: [{ value: canonical }] };
      }
      if (text.includes("live_customer_intent_current"))
        return { rows: [{ value: true }] };
      if (text.includes("finish_live_customer_intent")) {
        finishes++;
        return { rows: [{ value: JSON.parse(String(values[1])).outcome }] };
      }
      return { rows: [] };
    },
  });
  const results = await Promise.all(
    [1, 2].map(() =>
      runBillingHttpInvocation("dispatch", f.env, {
        clientFactory,
        fetch: async () => {
          providerAttempts++;
          throw Error("Synthetic unavailable; no external call");
        },
      }),
    ),
  );
  assert.equal(claims, 2);
  assert.equal(finishes, 1);
  assert.equal(providerAttempts, 1);
  assert.ok(
    results.every(
      (r) =>
        (r as { entitlement_authority?: boolean }).entitlement_authority ===
        false,
    ),
  );
  // This checks delegation through actual cores with a synthetic atomic-claim port.
  // Owner's native multi-process race acceptance remains required; no PostgreSQL ran here.
});
