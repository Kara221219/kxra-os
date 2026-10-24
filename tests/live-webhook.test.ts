import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  createLiveWebhookHandler,
  createStagingSandboxWebhookHandler,
  stagingSandboxWebhookConfiguration,
  normalizeStagingSandboxWebhook,
  liveWebhookConfiguration,
  normalizeLiveWebhook,
  LIVE_WEBHOOK_TYPES,
  LIVE_WEBHOOK_API_VERSION,
  LIVE_WEBHOOK_ACCOUNT,
  type LiveWakeup,
} from "../packages/integrations/live-webhook";
import { modernBillingFixture } from "./support/modern-billing-scope";
const scoped = modernBillingFixture();
const now = 1_790_000_000;
const secret = "whsec_" + "synthetic".repeat(8);
const endpoint = {
  ...scoped,
  project: "lhbgeucifxxcdoyrnesf" as const,
  origin: "https://production.example.test",
  secret,
  account_id: LIVE_WEBHOOK_ACCOUNT,
};
const env = {
  NODE_ENV: "production",
  KXRA_ENVIRONMENT: "production",
  KXRA_LIVE_WEBHOOK_ENABLED: "true",
  KXRA_LIVE_WEBHOOK_PROJECT_REF: endpoint.project,
  NEXT_PUBLIC_SUPABASE_URL: `https://${endpoint.project}.supabase.co`,
  KXRA_LIVE_WEBHOOK_ACCOUNT_ID: LIVE_WEBHOOK_ACCOUNT,
  KXRA_LIVE_WEBHOOK_MODE: "live",
  KXRA_LIVE_WEBHOOK_API_VERSION: LIVE_WEBHOOK_API_VERSION,
  KXRA_LIVE_WEBHOOK_SECRET: secret,
  KXRA_ORIGIN: endpoint.origin,
};
function fixture(type = "customer.subscription.updated") {
  return {
    id: "evt_syntheticWebhook",
    object: "event",
    type,
    created: now,
    api_version: LIVE_WEBHOOK_API_VERSION,
    livemode: true,
    data: {
      object: {
        id: "sub_syntheticWebhook",
        customer: "cus_syntheticWebhook",
        status: "active",
        paid: true,
        metadata: {
          org_id: "untrusted",
          plan: "untrusted",
          email: "private@example.test",
        },
      },
    },
  };
}
function signed(payload: unknown, timestamp = now) {
  const raw = Buffer.from(JSON.stringify(payload));
  return {
    raw,
    signature: `t=${timestamp},v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest("hex")}`,
  };
}
function request(raw: Buffer, signature: string) {
  return new Request(`${endpoint.origin}/api/webhooks/workspace-live`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: new Uint8Array(raw),
  });
}

test("endpoint configuration is disabled by default and exact live account/project/Basil bound", () => {
  assert.equal(liveWebhookConfiguration({}), null);
  assert.deepEqual(liveWebhookConfiguration(env, scoped.execution), endpoint);
  assert.equal(
    liveWebhookConfiguration(
      { ...env, NODE_ENV: "development", KXRA_AUTH_MODE: "fixture" },
      scoped.execution,
    ),
    null,
  );
  for (const [key, value] of Object.entries({
    KXRA_LIVE_WEBHOOK_ENABLED: "false",
    NODE_ENV: "development",
    KXRA_LIVE_WEBHOOK_PROJECT_REF: "jlebgsxcvhvpueuibekd",
    NEXT_PUBLIC_SUPABASE_URL: "https://foreign.supabase.co",
    KXRA_LIVE_WEBHOOK_ACCOUNT_ID: "acct_foreignAccount",
    KXRA_LIVE_WEBHOOK_MODE: "test",
    KXRA_LIVE_WEBHOOK_API_VERSION: "2024-01-01",
    KXRA_ORIGIN: "http://insecure.test",
    KXRA_LIVE_WEBHOOK_SECRET: "short",
  }))
    assert.equal(liveWebhookConfiguration({ ...env, [key]: value }), null, key);
});

test("signed live payload stores only safe identifiers/hash, never body authority or PII", () => {
  const s = signed(fixture());
  const normalized = normalizeLiveWebhook(s.raw, s.signature, endpoint, now)!;
  assert.deepEqual(
    Object.keys(normalized).sort(),
    [
      "account_id",
      "api_version",
      "customer_id",
      "event_id",
      "execution_scope",
      "event_type",
      "invoice_id",
      "livemode",
      "payload_sha256",
      "project_ref",
      "subscription_id",
    ].sort(),
  );
  assert.equal(normalized.subscription_id, "sub_syntheticWebhook");
  assert.equal(
    normalized.payload_sha256,
    crypto.createHash("sha256").update(s.raw).digest("hex"),
  );
  assert.doesNotMatch(
    JSON.stringify(normalized),
    /private@example|org_id|paid|status|plan|metadata/,
  );
});

test("signed lifecycle families normalize to read wakeups and unlinked events remain identifier-only", () => {
  for (const type of LIVE_WEBHOOK_TYPES) {
    const event = fixture(type);
    const data: Record<string, unknown> = {
      customer: "cus_syntheticWebhook",
      subscription: "sub_syntheticWebhook",
    };
    if (type.startsWith("customer.subscription."))
      data.id = "sub_syntheticWebhook";
    else if (type.startsWith("invoice.")) {
      data.id = "in_syntheticWebhook";
      data.parent = {
        subscription_details: { subscription: "sub_syntheticWebhook" },
      };
    } else data.id = "syntheticObject";
    event.data.object = data as typeof event.data.object;
    const s = signed(event);
    assert.equal(
      normalizeLiveWebhook(s.raw, s.signature, endpoint, now)?.event_type,
      type,
    );
  }
  const event = fixture("refund.updated");
  event.data.object = { id: "re_syntheticWebhook" } as typeof event.data.object;
  const s = signed(event);
  const n = normalizeLiveWebhook(s.raw, s.signature, endpoint, now)!;
  assert.equal(n.customer_id, null);
  assert.equal(n.subscription_id, null);
  assert.equal(n.invoice_id, null);
});

test("signature tampering/expiry and test-mode, wrong account/version, future or malformed refs fail closed", () => {
  const good = signed(fixture());
  assert.throws(() =>
    normalizeLiveWebhook(
      Buffer.concat([good.raw, Buffer.from(" ")]),
      good.signature,
      endpoint,
      now,
    ),
  );
  const old = signed(fixture(), now - 301);
  assert.throws(() =>
    normalizeLiveWebhook(old.raw, old.signature, endpoint, now),
  );
  for (const patch of [
    { livemode: false },
    { account: "acct_foreignAccount" },
    { api_version: "2024-01-01" },
    { created: now + 61 },
    { id: "evt_bad" },
  ]) {
    const s = signed({ ...fixture(), ...patch });
    assert.throws(() =>
      normalizeLiveWebhook(s.raw, s.signature, endpoint, now),
    );
  }
  const bad = fixture();
  bad.data.object.customer = "private@example.test";
  const s = signed(bad);
  assert.throws(() => normalizeLiveWebhook(s.raw, s.signature, endpoint, now));
});

test("handler persists only verified supported events; retries DB failure; disabled/malformed/unsupported never persist", async () => {
  const events: LiveWakeup[] = [];
  const handler = createLiveWebhookHandler({
    configuration: () => endpoint,
    record: async (event) => {
      events.push(event);
    },
    now: () => now,
  });
  const good = signed(fixture());
  assert.equal((await handler(request(good.raw, good.signature))).status, 200);
  assert.equal(events.length, 1);
  const unsupported = signed(fixture("customer.created"));
  assert.deepEqual(
    await (
      await handler(request(unsupported.raw, unsupported.signature))
    ).json(),
    { received: true, ignored: true },
  );
  assert.equal(events.length, 1);
  assert.equal((await handler(request(good.raw, "invalid"))).status, 400);
  assert.equal(events.length, 1);
  const paused = createLiveWebhookHandler({
    configuration: () => null,
    record: async () => assert.fail("No DB"),
  });
  assert.equal((await paused(request(good.raw, good.signature))).status, 404);
  const down = createLiveWebhookHandler({
    configuration: () => endpoint,
    record: async () => {
      throw Error("synthetic-sensitive-database-detail");
    },
    now: () => now,
  });
  const result = await down(request(good.raw, good.signature));
  assert.equal(result.status, 503);
  assert.doesNotMatch(await result.text(), /sensitive/);
});

test("raw size/deadline gates run before signature parsing or persistence and cancel streams", async () => {
  let calls = 0,
    cancelled = false;
  const handler = createLiveWebhookHandler({
    configuration: () => endpoint,
    record: async () => {
      calls++;
    },
    bodyDeadlineMs: 15,
  });
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
      return new Promise<void>(() => {});
    },
  });
  const hung = new Request(`${endpoint.origin}/api/webhooks/workspace-live`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
  assert.equal((await handler(hung)).status, 400);
  assert.equal(cancelled, true);
  assert.equal(calls, 0);
  const oversized = request(Buffer.alloc(1_000_001), "invalid");
  assert.equal((await handler(oversized)).status, 400);
  assert.equal(calls, 0);
  const declared = request(Buffer.from("{}"), "invalid");
  declared.headers.set("content-length", "1000001");
  assert.equal((await handler(declared)).status, 400);
});

test("modern sandbox verifies original false mode through the same webhook engine; production rejects it", async () => {
  const f = modernBillingFixture("STAGING_SANDBOX");
  const ep = {
    ...f,
    project: "jlebgsxcvhvpueuibekd" as const,
    origin: "https://sandbox.example.test",
    secret,
    account_id: f.execution.execution_scope.account_id,
  };
  const e = { ...fixture(), livemode: false, account: ep.account_id };
  const s = signed(e);
  const n = normalizeStagingSandboxWebhook(s.raw, s.signature, ep, now)!;
  assert.equal(n.livemode, false);
  assert.equal(n.execution_scope.execution_mode, "STAGING_SANDBOX");
  assert.equal(e.livemode, false);
  assert.throws(() => normalizeLiveWebhook(s.raw, s.signature, endpoint, now));
  let stored = 0;
  const handler = createStagingSandboxWebhookHandler({
    configuration: () => ep,
    now: () => now,
    record: async (w) => {
      assert.equal(w.livemode, false);
      stored++;
      return { outcome: "HELD" };
    },
  });
  const response = await handler(
    new Request(ep.origin + "/api/webhooks/workspace-sandbox", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": s.signature,
      },
      body: new Uint8Array(s.raw),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(stored, 1);
  const stageEnv = {
    NODE_ENV: "production",
    KXRA_ENVIRONMENT: "staging",
    NEXT_PUBLIC_SUPABASE_URL: f.runtimeIdentity.supabase_url,
    KXRA_ORIGIN: ep.origin,
    KXRA_MODERN_SANDBOX_WEBHOOK_ENABLED: "true",
    KXRA_MODERN_SANDBOX_WEBHOOK_PROJECT_REF: ep.project,
    KXRA_MODERN_SANDBOX_WEBHOOK_MODE: "staging_sandbox",
    KXRA_MODERN_SANDBOX_WEBHOOK_ACCOUNT_ID: ep.account_id,
    KXRA_MODERN_SANDBOX_WEBHOOK_API_VERSION: LIVE_WEBHOOK_API_VERSION,
    KXRA_MODERN_SANDBOX_WEBHOOK_SECRET: secret,
  };
  assert.ok(stagingSandboxWebhookConfiguration(stageEnv, f.execution));
  assert.equal(
    stagingSandboxWebhookConfiguration(
      { ...stageEnv, KXRA_ENVIRONMENT: "production" },
      f.execution,
    ),
    null,
  );
});
test("invalid HMAC cannot trigger private scope lookup", async () => {
  let loaded = 0;
  const { execution, ...shell } = endpoint;
  const handler = createLiveWebhookHandler({
    configuration: () => shell,
    loadExecutionScope: async () => {
      loaded++;
      return execution;
    },
    record: async () => ({ outcome: "HELD" }),
    now: () => now,
  });
  const s = signed(fixture());
  const response = await handler(
    request(s.raw, s.signature.replace(/v1=.*/, "v1=" + "0".repeat(64))),
  );
  assert.equal(response.status, 400);
  assert.equal(loaded, 0);
});
