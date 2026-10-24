import assert from "node:assert/strict";
import { rootCertificates } from "node:tls";
import test from "node:test";
import {
  runLiveCustomerWorkerOnce,
  type LiveCustomerExecute,
} from "../packages/integrations/live-customer-worker";
import { boundedLiveCustomerTransport } from "../packages/integrations/live-customer-dispatch-transport";
import { modernBillingFixture } from "./support/modern-billing-scope";
const now = 1_800_000_000,
  id = "33333333-3333-4333-8333-333333333333",
  actor = "11111111-1111-4111-8111-111111111111",
  org = "22222222-2222-4222-8222-222222222222",
  hash = "a".repeat(64);
const project = "jlebgsxcvhvpueuibekd",
  secret = "sk_live_SYNTHETIC_NOT_A_REAL_CREDENTIAL_0000";
const env = {
  KXRA_LIVE_CUSTOMER_DISPATCH_ENABLED: "true",
  NODE_ENV: "production",
  KXRA_ENVIRONMENT: "staging",
  NEXT_PUBLIC_SUPABASE_URL: `https://${project}.supabase.co`,
  STRIPE_SECRET_KEY: secret,
  KXRA_BILLING_WORKER_DATABASE_URL: `postgresql://kxra_billing_runner.${project}:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`,
  KXRA_DATABASE_CA_CERT_BASE64: Buffer.from(rootCertificates[0]).toString(
    "base64",
  ),
};
function fixture() {
  const scope = modernBillingFixture();
  const row = scope.execution.catalogue[0];
  const canonical = {
    intent: {
      id,
      actor_id: actor,
      org_id: org,
      offer_key: row.offer_key,
      mapping_revision: 1,
      version: 1,
      state: "REQUESTED",
      terms_review_sha256: hash,
      auth_time: now - 30,
      created_at: now - 20,
      expires_at: now + 200,
    },
    mapping: {
      version: 1,
      mode: "live",
      enabled: true,
      account_id: scope.execution.execution_scope.account_id,
      offer_key: row.offer_key,
      revision: 1,
      price_id: row.price_id,
      product_id: row.product_id,
      portal_configuration_id: "bpc_syntheticWorker",
      activation_review_sha256: hash,
      terms_review_sha256: hash,
      tax_review_sha256: hash,
      tax_behavior: "inclusive",
      automatic_tax: false,
      payment_method: "card",
    },
    execution_scope: scope.execution.execution_scope,
    entitlement_authority: false,
  };
  let active = false,
    claimCount = 0,
    postCount = 0,
    currentCount = 0,
    finishCount = 0;
  let receipt: Record<string, unknown> | undefined;
  let customer: Record<string, unknown> | undefined;
  let current: (call: number) => boolean = () => true;
  let account = scope.execution.execution_scope.account_id,
    amount = 2900;
  let postThrows = false,
    finishThrows = false;
  const order: string[] = [];
  let attestation: unknown = scope.execution;
  const execute: LiveCustomerExecute = async (command) => {
    assert.equal(active, false);
    active = true;
    order.push("BEGIN");
    try {
      if (command.text.includes("modern_billing_scope_attestation"))
        return structuredClone(attestation);
      if (command.text.includes("claim_live_customer_intent")) {
        claimCount++;
        if (claimCount > 1) throw Error("Claim already consumed or uncertain");
        assert.equal(command.values[0], id);
        return structuredClone(canonical);
      }
      if (command.text.includes("live_customer_intent_current")) {
        assert.equal(command.values[0], id);
        currentCount++;
        return current(currentCount);
      }
      if (command.text.includes("finish_live_customer_intent")) {
        finishCount++;
        receipt = JSON.parse(command.values[1] as string);
        if (finishThrows) throw Error("synthetic-private-commit-error");
        return receipt?.outcome;
      }
      assert.fail("Unexpected SQL command");
    } finally {
      active = false;
      order.push("COMMIT");
    }
  };
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(
      active,
      false,
      "No provider HTTP is allowed inside an open DB transaction",
    );
    const url = String(input);
    order.push(`HTTP:${init?.method}`);
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      `Bearer ${secret}`,
    );
    if (url.endsWith("/account"))
      return Response.json({
        id: account,
        object: "account",
        charges_enabled: true,
      });
    if (url.includes("/prices/"))
      return Response.json({
        id: row.price_id,
        object: "price",
        active: true,
        livemode: true,
        currency: "gbp",
        unit_amount: amount,
        type: "recurring",
        billing_scheme: "per_unit",
        tax_behavior: "inclusive",
        transform_quantity: null,
        custom_unit_amount: null,
        recurring: {
          interval: "month",
          interval_count: 1,
          usage_type: "licensed",
        },
        product: {
          id: row.product_id,
          object: "product",
          active: true,
          livemode: true,
        },
      });
    if (init?.method === "POST") {
      postCount++;
      if (postThrows) throw Error("synthetic-private-provider-error");
      const body = new URLSearchParams(init.body as string),
        metadata: Record<string, string> = {};
      for (const [key, value] of body) metadata[key.slice(9, -1)] = value;
      customer = {
        id: "cus_syntheticWorker",
        object: "customer",
        livemode: true,
        created: now,
        balance: 0,
        currency: null,
        default_source: null,
        invoice_settings: { default_payment_method: null },
        test_clock: null,
        metadata,
        email: "SYNTHETIC_PRIVATE_EMAIL_MUST_NOT_PERSIST",
      };
    }
    return Response.json(customer);
  };
  return {
    run: () =>
      runLiveCustomerWorkerOnce(id, {
        environment: env,
        execute,
        fetch: fetcher,
        nowSeconds: () => now,
      }),
    canonical,
    order,
    count: () => ({ claimCount, postCount, currentCount, finishCount }),
    receipt: () => receipt,
    current: (value: typeof current) => {
      current = value;
    },
    postThrows: () => {
      postThrows = true;
    },
    finishThrows: () => {
      finishThrows = true;
    },
    badAccount: () => {
      account = "acct_wrongSynthetic";
    },
    badPrice: () => {
      amount = 49900;
    },
    attestation: (value: unknown) => {
      attestation = value;
    },
  };
}

test("real customer adapter is wired through attestation, one claim, pre/post fences and durable finish", async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.state, "RECORDED");
  if (result.state === "RECORDED") assert.equal(result.outcome, "BOUND");
  assert.deepEqual(f.count(), {
    claimCount: 1,
    postCount: 1,
    currentCount: 2,
    finishCount: 1,
  });
  assert.equal(f.receipt()?.entitlement_authority, false);
  assert.equal(f.receipt()?.outcome, "BOUND");
  assert.doesNotMatch(JSON.stringify(f.receipt()), /PRIVATE_EMAIL/);
  assert.ok(f.order.indexOf("HTTP:POST") > f.order.indexOf("COMMIT"));
});
test("scope attestation defaults fail closed and sandbox/test identity never dispatches LIVE", async () => {
  for (const attestation of [
    null,
    modernBillingFixture("STAGING_SANDBOX").execution,
    { ...modernBillingFixture().execution, enabled: false },
  ]) {
    const f = fixture();
    f.attestation(attestation);
    await assert.rejects(f.run(), {
      message: "LIVE_CUSTOMER_DISPATCH_SCOPE_UNAVAILABLE",
    });
    assert.deepEqual(f.count(), {
      claimCount: 0,
      postCount: 0,
      currentCount: 0,
      finishCount: 0,
    });
  }
});
test("canonical scope mismatch is not repaired or converted", async () => {
  const f = fixture();
  f.canonical.execution_scope = {
    ...f.canonical.execution_scope,
    scope_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  };
  await assert.rejects(f.run(), {
    message: "LIVE_CUSTOMER_DISPATCH_RECONCILIATION_REQUIRED",
  });
  assert.equal(f.count().postCount, 0);
});
test("wrong account or current catalogue amount cannot create a customer", async () => {
  for (const change of ["badAccount", "badPrice"] as const) {
    const f = fixture();
    f[change]();
    const r = await f.run();
    assert.equal(r.state, "RECORDED");
    assert.equal(f.receipt()?.outcome, "QUARANTINED");
    assert.equal(f.count().postCount, 0);
  }
});
test("revocation before POST prevents dispatch; revocation after POST persists UNCERTAIN", async () => {
  const before = fixture();
  before.current(() => false);
  await before.run();
  assert.equal(before.count().postCount, 0);
  assert.equal(before.receipt()?.outcome, "QUARANTINED");
  const after = fixture();
  after.current((call) => call === 1);
  await after.run();
  assert.equal(after.count().postCount, 1);
  assert.equal(after.receipt()?.outcome, "UNCERTAIN");
  assert.equal(after.receipt()?.metadata, null);
});
test("lost provider response produces one uncertainty receipt and no second POST", async () => {
  const f = fixture();
  f.postThrows();
  await f.run();
  assert.equal(f.count().postCount, 1);
  assert.equal(f.count().finishCount, 1);
  assert.equal(f.receipt()?.outcome, "UNCERTAIN");
  assert.equal(f.receipt()?.metadata, null);
  assert.doesNotMatch(JSON.stringify(f.receipt()), /private-provider-error/);
});
test("lost SQL completion response never reclaims or repeats provider creation", async () => {
  const f = fixture();
  f.finishThrows();
  await assert.rejects(f.run(), {
    message: "LIVE_CUSTOMER_DISPATCH_COMPLETION_UNCERTAIN",
  });
  assert.equal(f.count().claimCount, 1);
  assert.equal(f.count().postCount, 1);
  assert.equal(f.count().finishCount, 1);
});
test("default-off real facade never opens DB or calls injected provider", async () => {
  const result = await runLiveCustomerWorkerOnce(id, {
    environment: { KXRA_BILLING_ENABLED: "true" },
    execute: async () => assert.fail("No DB"),
    fetch: async () => assert.fail("No HTTP"),
  });
  assert.equal(result.state, "DISABLED");
});

test("customer transport refuses credential exfiltration/unapproved paths and bounds hung bodies", async () => {
  let calls = 0;
  const headers = {
    Authorization: `Bearer ${secret}`,
    "Stripe-Version": "2025-07-30.basil",
  };
  const transport = boundedLiveCustomerTransport(
    async () => {
      calls++;
      return Response.json({});
    },
    secret,
    [],
  );
  for (const url of [
    "https://evil.test/v1/account",
    "https://api.stripe.com/v1/subscriptions",
    "http://api.stripe.com/v1/account",
    "https://user:password@api.stripe.com/v1/account",
  ])
    await assert.rejects(transport(url, { method: "GET", headers }));
  assert.equal(calls, 0);
  let cancelled = false;
  const hung = boundedLiveCustomerTransport(
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
            return new Promise<void>(() => {});
          },
        }),
      ),
    secret,
    [],
    { deadlineMs: 15 },
  );
  await assert.rejects(
    hung("https://api.stripe.com/v1/account", { method: "GET", headers }),
    { message: "LIVE_CUSTOMER_TRANSPORT_UNAVAILABLE" },
  );
  assert.equal(cancelled, true);
});
test("transport body cap rejects oversized response before adapter JSON and never retries", async () => {
  let calls = 0;
  const transport = boundedLiveCustomerTransport(
    async () => {
      calls++;
      return new Response("synthetic", {
        headers: { "content-length": "100001" },
      });
    },
    secret,
    [],
  );
  await assert.rejects(
    transport("https://api.stripe.com/v1/account", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Stripe-Version": "2025-07-30.basil",
      },
    }),
    { message: "LIVE_CUSTOMER_TRANSPORT_UNAVAILABLE" },
  );
  assert.equal(calls, 1);
});

test("real transaction adapter checks genuine identity before command and commits/closes", async () => {
  const { liveCustomerDatabaseExecutor } =
    await import("../packages/integrations/live-customer-worker");
  const { liveCustomerDispatchConfiguration } =
    await import("../packages/integrations/live-customer-dispatch-config");
  const commands: string[] = [];
  const execute = liveCustomerDatabaseExecutor(
    liveCustomerDispatchConfiguration(env)!,
    async () => ({
      connect: async () => {
        commands.push("CONNECT");
      },
      query: async (text) => {
        commands.push(text);
        return {
          rows:
            text === "select session_user,current_user"
              ? [
                  {
                    session_user: "kxra_billing_runner",
                    current_user: "kxra_billing_worker",
                  },
                ]
              : text === "select canonical"
                ? [{ value: true }]
                : [],
        };
      },
      end: async () => {
        commands.push("CLOSE");
      },
    }),
  );
  assert.equal(await execute({ text: "select canonical", values: [] }), true);
  assert.ok(
    commands.indexOf("select canonical") >
      commands.indexOf("select session_user,current_user"),
  );
  assert.deepEqual(commands.slice(-2), ["commit", "CLOSE"]);
});
test("transaction adapter refuses admin/capability LOGIN despite SET ROLE and rolls back", async () => {
  const { liveCustomerDatabaseExecutor } =
    await import("../packages/integrations/live-customer-worker");
  const { liveCustomerDispatchConfiguration } =
    await import("../packages/integrations/live-customer-dispatch-config");
  for (const session of ["postgres", "owner", "kxra_billing_worker"]) {
    const commands: string[] = [];
    const execute = liveCustomerDatabaseExecutor(
      liveCustomerDispatchConfiguration(env)!,
      async () => ({
        connect: async () => {},
        query: async (text) => {
          commands.push(text);
          return {
            rows:
              text === "select session_user,current_user"
                ? [
                    {
                      session_user: session,
                      current_user: "kxra_billing_worker",
                    },
                  ]
                : [],
          };
        },
        end: async () => {
          commands.push("CLOSE");
        },
      }),
    );
    await assert.rejects(execute({ text: "MUST NOT EXECUTE", values: [] }), {
      message: "LIVE_CUSTOMER_DISPATCH_DATABASE_UNAVAILABLE",
    });
    assert.ok(!commands.includes("MUST NOT EXECUTE"));
    assert.deepEqual(commands.slice(-2), ["rollback", "CLOSE"]);
  }
});

test("explicit rerun of original uncertain request stops at durable claim and never posts again", async () => {
  const f = fixture();
  f.postThrows();
  await f.run();
  assert.equal(f.count().postCount, 1);
  await assert.rejects(f.run(), {
    message: "LIVE_CUSTOMER_DISPATCH_CLAIM_UNAVAILABLE",
  });
  assert.equal(f.count().postCount, 1);
  assert.equal(f.count().finishCount, 1);
});
test("four-request/one-POST transport budget cannot be reused for a second mutation", async () => {
  let posts = 0;
  const transport = boundedLiveCustomerTransport(
    async () => {
      posts++;
      return Response.json({});
    },
    secret,
    [],
  );
  const body = new URLSearchParams();
  for (const key of [
    "kxra_customer_intent",
    "kxra_org",
    "kxra_actor",
    "kxra_offer",
    "kxra_mapping_revision",
    "kxra_intent_version",
    "kxra_terms_sha256",
    "kxra_execution_scope",
    "kxra_execution_mode",
    "kxra_execution_sha256",
    "kxra_execution_project",
  ])
    body.set(`metadata[${key}]`, "synthetic");
  const init = {
    method: "POST",
    body: body.toString(),
    headers: {
      Authorization: `Bearer ${secret}`,
      "Stripe-Version": "2025-07-30.basil",
      "Idempotency-Key": "kxra-customer-synthetic",
    },
  };
  await transport("https://api.stripe.com/v1/customers", init);
  await assert.rejects(transport("https://api.stripe.com/v1/customers", init));
  assert.equal(posts, 1);
});
