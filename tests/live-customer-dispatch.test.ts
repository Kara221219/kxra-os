import assert from "node:assert/strict";
import { rootCertificates } from "node:tls";
import test from "node:test";
import {
  dispatchLiveCustomerOnce,
  type LiveCustomerOncePorts,
} from "../packages/integrations/live-customer-dispatch";
import {
  liveCustomerDispatchConfiguration,
  parseLiveCustomerDispatchArguments,
} from "../packages/integrations/live-customer-dispatch-config";
const id = "33333333-3333-4333-8333-333333333333";
const actor = "11111111-1111-4111-8111-111111111111",
  org = "22222222-2222-4222-8222-222222222222";
const endpoint = "jlebgsxcvhvpueuibekd";
const env = {
  KXRA_LIVE_CUSTOMER_DISPATCH_ENABLED: "true",
  NODE_ENV: "production",
  KXRA_ENVIRONMENT: "staging",
  NEXT_PUBLIC_SUPABASE_URL: `https://${endpoint}.supabase.co`,
  STRIPE_SECRET_KEY: "sk_live_SYNTHETIC_NOT_A_REAL_CREDENTIAL_0000",
  KXRA_BILLING_WORKER_DATABASE_URL: `postgresql://kxra_billing_runner.${endpoint}:synthetic-password@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=verify-full`,
  KXRA_DATABASE_CA_CERT_BASE64: Buffer.from(rootCertificates[0]).toString(
    "base64",
  ),
};
function harness() {
  const operations: string[] = [];
  let creates = 0,
    claims = 0,
    finishes = 0;
  const ports: LiveCustomerOncePorts = {
    enabled: true,
    claim: async (intent) => {
      claims++;
      operations.push("claim-BEGIN", "claim-COMMIT");
      return {
        intent: { id: intent, actor_id: actor, org_id: org, version: 1 },
        mapping: {},
        execution_scope: {},
        entitlement_authority: false,
      };
    },
    create: async (canonical) => {
      creates++;
      assert.equal(operations.at(-1), "claim-COMMIT");
      operations.push("HTTP");
      return {
        intent_id: canonical.intent.id,
        outcome: "BOUND",
        entitlement_authority: false,
      };
    },
    finish: async (receipt) => {
      finishes++;
      operations.push("finish-BEGIN", "finish-COMMIT");
      return receipt.outcome;
    },
  };
  return { ports, operations, count: () => ({ creates, claims, finishes }) };
}

test("explicit LIVE gate is off despite legacy flags and absent new flag", () => {
  assert.equal(
    liveCustomerDispatchConfiguration({
      KXRA_BILLING_ENABLED: "true",
      KXRA_PILOT_STRIPE_ENABLED: "true",
    }),
    null,
  );
  assert.equal(
    liveCustomerDispatchConfiguration({
      ...env,
      KXRA_LIVE_CUSTOMER_DISPATCH_ENABLED: "false",
    }),
    null,
  );
});
test("target configuration pins project/runner/session port and verified TLS without adding credentials", () => {
  const config = liveCustomerDispatchConfiguration(env)!;
  assert.equal(config.database.user, `kxra_billing_runner.${endpoint}`);
  assert.equal(config.database.ssl.rejectUnauthorized, true);
  assert.equal(config.database.port, 5432);
  assert.equal(config.runtime.mode, "live");
  assert.equal(config.runtimeIdentity.project_ref, endpoint);
  const direct = liveCustomerDispatchConfiguration({
    ...env,
    KXRA_BILLING_WORKER_DATABASE_URL: `postgresql://kxra_billing_runner:synthetic@db.${endpoint}.supabase.co/postgres`,
  })!;
  assert.equal(direct.database.host, `db.${endpoint}.supabase.co`);
});
test("test keys, fixture auth, wrong project/login/host/port/DSN overrides and missing CA fail before execution", () => {
  for (const patch of [
    { NODE_ENV: "development" },
    { KXRA_AUTH_MODE: "fixture" },
    { STRIPE_SECRET_KEY: "sk_test_SYNTHETIC_NOT_A_REAL_CREDENTIAL_0000" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://lhbgeucifxxcdoyrnesf.supabase.co" },
    { KXRA_DATABASE_CA_CERT_BASE64: "" },
    ...[
      `postgresql://postgres:synthetic@db.${endpoint}.supabase.co/postgres`,
      `postgresql://kxra_billing_worker:synthetic@db.${endpoint}.supabase.co/postgres`,
      `postgresql://kxra_billing_runner.lhbgeucifxxcdoyrnesf:synthetic@aws-0-eu-west-2.pooler.supabase.com/postgres`,
      `postgresql://kxra_billing_runner.${endpoint}:synthetic@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`,
      `postgresql://kxra_billing_runner:synthetic@127.0.0.1/postgres`,
      `postgresql://kxra_billing_runner:synthetic@db.${endpoint}.supabase.co/postgres?host=foreign.test`,
      `postgresql://kxra_billing_runner:synthetic@db.${endpoint}.supabase.co/postgres?sslmode=disable`,
    ].map((url) => ({ KXRA_BILLING_WORKER_DATABASE_URL: url })),
  ])
    assert.throws(
      () => liveCustomerDispatchConfiguration({ ...env, ...patch }),
      { message: "LIVE_CUSTOMER_DISPATCH_CONFIGURATION_INVALID" },
    );
});
test("CLI accepts one explicit UUID, never watch/actor/mode/discovery flags", () => {
  assert.equal(
    parseLiveCustomerDispatchArguments(["--once", "--intent", id]),
    id,
  );
  for (const args of [
    [],
    ["--watch"],
    ["--once"],
    ["--once", "--intent", "bad"],
    ["--once", "--intent", id, "--mode", "test"],
    ["--once", "--intent", id, "--actor", actor],
  ])
    assert.throws(() => parseLiveCustomerDispatchArguments(args));
});
test("default-disabled orchestration performs zero DB/provider work", async () => {
  const f = harness();
  delete f.ports.enabled;
  assert.equal((await dispatchLiveCustomerOnce(id, f.ports)).state, "DISABLED");
  assert.deepEqual(f.count(), { creates: 0, claims: 0, finishes: 0 });
});
test("one canonical claim commits before HTTP and finish commits separately", async () => {
  const f = harness();
  const result = await dispatchLiveCustomerOnce(id, f.ports);
  assert.deepEqual(result, {
    state: "RECORDED",
    intent_id: id,
    outcome: "BOUND",
    entitlement_authority: false,
  });
  assert.deepEqual(f.operations, [
    "claim-BEGIN",
    "claim-COMMIT",
    "HTTP",
    "finish-BEGIN",
    "finish-COMMIT",
  ]);
  assert.deepEqual(f.count(), { creates: 1, claims: 1, finishes: 1 });
});
test("claim refusal never dispatches, and foreign canonical UUID never uses caller authority", async () => {
  const f = harness();
  f.ports.claim = async () => {
    throw Error("PRIVATE_DATABASE_DETAIL");
  };
  await assert.rejects(dispatchLiveCustomerOnce(id, f.ports), {
    message: "LIVE_CUSTOMER_DISPATCH_CLAIM_UNAVAILABLE",
  });
  assert.equal(f.count().creates, 0);
  f.ports.claim = async () => ({
    intent: { id: org, actor_id: actor, org_id: org, version: 1 },
    mapping: {},
    execution_scope: {},
    entitlement_authority: false,
  });
  await assert.rejects(
    dispatchLiveCustomerOnce(id, f.ports),
    /CANONICAL_INVALID/,
  );
  assert.equal(f.count().creates, 0);
});
test("uncertain provider outcome is recorded exactly once and is never retried or replaced", async () => {
  const f = harness();
  f.ports.create = async (canonical) => ({
    intent_id: canonical.intent.id,
    outcome: "UNCERTAIN",
    entitlement_authority: false,
  });
  assert.equal((await dispatchLiveCustomerOnce(id, f.ports)).state, "RECORDED");
  assert.equal(f.count().claims, 1);
  assert.equal(f.count().finishes, 1);
});
test("unclassified creation or uncertain finish leaves original hold and never restarts", async () => {
  const f = harness();
  f.ports.create = async () => {
    throw Error("synthetic-provider-secret");
  };
  await assert.rejects(dispatchLiveCustomerOnce(id, f.ports), {
    message: "LIVE_CUSTOMER_DISPATCH_RECONCILIATION_REQUIRED",
  });
  assert.equal(f.count().claims, 1);
  assert.equal(f.count().finishes, 0);
  const g = harness();
  g.ports.finish = async () => {
    throw Error("COMMIT response lost");
  };
  await assert.rejects(dispatchLiveCustomerOnce(id, g.ports), {
    message: "LIVE_CUSTOMER_DISPATCH_COMPLETION_UNCERTAIN",
  });
  assert.equal(g.count().creates, 1);
  assert.equal(g.count().claims, 1);
});
test("canonical SQL quarantine overrides proposed BOUND and no paid success is emitted", async () => {
  const f = harness();
  f.ports.finish = async () => "QUARANTINED";
  const result = await dispatchLiveCustomerOnce(id, f.ports);
  assert.equal(result.state, "RECORDED");
  if (result.state === "RECORDED") assert.equal(result.outcome, "QUARANTINED");
  assert.equal(result.entitlement_authority, false);
});

test("operator diagnostics expose only approved stage codes, never provider/credential errors", async () => {
  const { liveCustomerDispatchFailureCode } =
    await import("../packages/integrations/live-customer-dispatch-config");
  assert.equal(
    liveCustomerDispatchFailureCode(
      Error("LIVE_CUSTOMER_DISPATCH_COMPLETION_UNCERTAIN"),
    ),
    "LIVE_CUSTOMER_DISPATCH_COMPLETION_UNCERTAIN",
  );
  assert.equal(
    liveCustomerDispatchFailureCode(
      Error("postgresql://synthetic-sensitive-value"),
    ),
    "LIVE_CUSTOMER_DISPATCH_NOT_CONFIRMED",
  );
  assert.equal(
    liveCustomerDispatchFailureCode(
      "LIVE_CUSTOMER_DISPATCH_COMPLETION_UNCERTAIN",
    ),
    "LIVE_CUSTOMER_DISPATCH_NOT_CONFIRMED",
  );
});
