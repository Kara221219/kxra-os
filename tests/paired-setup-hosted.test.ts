import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Principal } from "../packages/db";
import {
  hostedPairedSetupConfiguration,
  hostedPairedSetupRoute,
  hostedPairedSetupPageData,
  type HostedPairedSetupPorts,
} from "../packages/workspace/paired-setup-hosted";
const origin = "https://setup.kxra.invalid";
const env = {
  NODE_ENV: "production",
  KXRA_ENVIRONMENT: "staging",
  KXRA_PAIRED_SETUP_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_URL: "https://jlebgsxcvhvpueuibekd.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public_test_only",
  KXRA_ORIGIN: origin,
};
const identity = (): Principal => ({
  id: crypto.randomUUID(),
  organisation_id: crypto.randomUUID(),
  source: "supabase",
  aal: "aal2",
  auth_time: Math.floor(Date.now() / 1000),
  session_version: 4,
  provider_session_version: 4,
  provider_session_id: crypto.randomUUID(),
});
const options = { rooms: [], ai_intents: [], requests: [] };
const command = () => ({
  action: "REQUEST",
  request_id: crypto.randomUUID(),
  room_id: crypto.randomUUID(),
  ai_intent_id: crypto.randomUUID(),
  auth_route: "CUSTOMER_API_KEY",
  label: "Private agent",
});
const receipt = (c = command()) => ({
  request_id: c.request_id,
  room_id: c.room_id,
  agent_id: crypto.randomUUID(),
  reason: "POLICY_READY_SETUP_HELD",
  expires_at: new Date(Date.now() + 60000).toISOString(),
  activation_allowed: false,
  credential_issued: false,
});
function request(
  value: unknown = { action: "OPTIONS" },
  headers: Record<string, string> = {},
  init: RequestInit = {},
) {
  return new Request("http://localhost:3000/api/paired-setup", {
    method: "POST",
    body: JSON.stringify(value),
    ...init,
    headers: {
      host: new URL(origin).host,
      origin,
      "content-type": "application/json",
      ...headers,
    },
  });
}
function fixture(value: unknown = options, who: Principal | null = identity()) {
  let identities = 0;
  const queries: { actor: Principal; sql: string; values: unknown[] }[] = [];
  const ports: HostedPairedSetupPorts = {
    identity: async () => {
      identities++;
      return who;
    },
    query: async (actor, sql, values) => {
      queries.push({ actor, sql, values });
      return [{ value }];
    },
  };
  return {
    ports,
    queries,
    get identities() {
      return identities;
    },
  };
}
test("production setup defaults off before identity or SQL and rejects wrong hosted configuration", async () => {
  for (const change of [
    { KXRA_PAIRED_SETUP_ENABLED: undefined },
    { KXRA_PAIRED_SETUP_ENABLED: "1" },
    { NODE_ENV: "development" },
    { KXRA_ENVIRONMENT: "preview" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://wrong.supabase.co" },
    { KXRA_ORIGIN: "http://127.0.0.1" },
    { KXRA_ORIGIN: origin + "/path" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
  ]) {
    const f = fixture(),
      e = { ...env, ...change };
    assert.equal(hostedPairedSetupConfiguration(e), null);
    assert.equal(
      (await hostedPairedSetupRoute(request(), f.ports, e)).status,
      503,
    );
    assert.equal(await hostedPairedSetupPageData(f.ports, e), null);
    assert.equal(f.identities, 0);
    assert.equal(f.queries.length, 0);
  }
  assert.equal(
    hostedPairedSetupConfiguration(env)?.project,
    "jlebgsxcvhvpueuibekd",
  );
});
test("Host and Origin both pinned; forwarded headers cannot override them", async () => {
  const rejectedHeaders: Record<string, string>[] = [
    { host: "evil.invalid" },
    { origin: "https://evil.invalid" },
    { host: "" },
    { origin: "" },
    { host: "evil.invalid", "x-forwarded-host": new URL(origin).host },
    { origin: "https://evil.invalid", "x-forwarded-proto": "https" },
  ];
  for (const h of rejectedHeaders) {
    const f = fixture();
    assert.equal(
      (await hostedPairedSetupRoute(request({}, h), f.ports, env)).status,
      403,
    );
    assert.equal(f.identities, 0);
  }
  const f = fixture();
  assert.equal(
    (await hostedPairedSetupRoute(request(), f.ports, env)).status,
    200,
  );
});
test("non-POST and invalid JSON/media are rejected without identity", async () => {
  for (const [req, status] of [
    [request({}, {}, { method: "PUT" }), 405],
    [request({}, { "content-type": "application/jsonp" }), 415],
    [request({}, {}, { body: "{" }), 400],
    [
      request(
        {},
        {},
        { body: new Uint8Array([123, 34, 120, 34, 58, 34, 255, 34, 125]) },
      ),
      400,
    ],
  ] as const) {
    const f = fixture();
    assert.equal(
      (await hostedPairedSetupRoute(req, f.ports, env)).status,
      status,
    );
    assert.equal(f.identities, 0);
  }
});
test("body bound rejects large input and client identity/authority fields", async () => {
  for (const [v, status] of [
    [{ data: "x".repeat(9000) }, 413],
    [{ ...command(), user_id: crypto.randomUUID() }, 400],
    [{ ...command(), activate: true }, 400],
    [{ ...command(), token: "secret" }, 400],
    [{ action: "REDEEM" }, 400],
    [{ action: "OPTIONS", org_id: crypto.randomUUID() }, 400],
  ] as const) {
    const f = fixture();
    assert.equal(
      (await hostedPairedSetupRoute(request(v), f.ports, env)).status,
      status,
    );
    assert.equal(f.identities, 0);
    assert.equal(f.queries.length, 0);
  }
});
test("only verified current original Supabase session with recent MFA reaches SQL", async () => {
  const a = identity();
  for (const bad of [
    null,
    { ...a, source: "fixture" as const },
    { ...a, source: "fake-provider" as const },
    { ...a, source: undefined },
    { ...a, aal: "aal1" as const },
    { ...a, organisation_id: undefined },
    { ...a, provider_session_id: undefined },
    { ...a, provider_session_version: 3 },
    { ...a, session_version: 0 },
    { ...a, auth_time: 0 },
    { ...a, auth_time: Math.floor(Date.now() / 1000) - 901 },
    { ...a, auth_time: Math.floor(Date.now() / 1000) + 62 },
  ]) {
    const f = fixture(options, bad);
    assert.equal(
      (await hostedPairedSetupRoute(request(), f.ports, env)).status,
      401,
    );
    assert.equal(f.queries.length, 0);
    assert.equal(await hostedPairedSetupPageData(f.ports, env), null);
  }
});
test("verified context passes unchanged separately from strict SQL selectors", async () => {
  const c = command(),
    result = receipt(c),
    a = identity(),
    f = fixture(result, a);
  const r = await hostedPairedSetupRoute(request(c), f.ports, env);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), result);
  assert.equal(f.queries.length, 1);
  assert.deepEqual(f.queries[0], {
    actor: a,
    sql: "select case when kxra_paired_admission.hosted_setup_session_current() then kxra_paired_admission.request_setup($1,$2,$3,$4,$5) end value",
    values: [c.request_id, c.room_id, c.ai_intent_id, c.auth_route, c.label],
  });
  assert.equal(Object.isFrozen(f.queries[0].actor), true);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
});
test("options/status/cancel use exact dedicated RLS functions and never issue credentials", async () => {
  const c = command();
  for (const action of ["OPTIONS", "STATUS", "CANCEL"] as const) {
    const result =
      action === "OPTIONS"
        ? options
        : {
            ...receipt(c),
            reason: action === "CANCEL" ? "CANCELLED" : "EXPIRED",
          };
    const f = fixture(result);
    const r = await hostedPairedSetupRoute(
      request(
        action === "OPTIONS"
          ? { action }
          : { action, request_id: c.request_id },
      ),
      f.ports,
      env,
    );
    assert.equal(r.status, 200);
    assert.equal(
      f.queries[0].sql,
      `select case when kxra_paired_admission.hosted_setup_session_current() then kxra_paired_admission.${action === "OPTIONS" ? "setup_options()" : action === "STATUS" ? "setup_status($1)" : "cancel_setup($1)"} end value`,
    );
    assert.deepEqual(
      f.queries[0].values,
      action === "OPTIONS" ? [] : [c.request_id],
    );
  }
});
test("provider-subscription requests remain setup-only selectors, never provider permission", async () => {
  const c = { ...command(), auth_route: "CHATGPT_SUBSCRIPTION" },
    f = fixture({
      ...receipt(c),
      reason: "SUBSCRIPTION_PROVIDER_CONFIRMATION_REQUIRED",
    });
  const r = await hostedPairedSetupRoute(request(c), f.ports, env);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).activation_allowed, false);
});
test("foreign, enabling, secret-bearing or malformed receipts fail closed without disclosure", async () => {
  const c = command();
  for (const result of [
    { ...receipt(c), request_id: crypto.randomUUID() },
    { ...receipt(c), room_id: crypto.randomUUID() },
    { ...receipt(c), activation_allowed: true },
    { ...receipt(c), credential_issued: true },
    { ...receipt(c), token: "secret" },
    {},
  ]) {
    const f = fixture(result);
    const r = await hostedPairedSetupRoute(request(c), f.ports, env);
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { error: "SETUP_UNAVAILABLE" });
  }
  const f = fixture(receipt(c));
  assert.equal(
    (
      await hostedPairedSetupRoute(
        request({ action: "CANCEL", request_id: c.request_id }),
        f.ports,
        env,
      )
    ).status,
    503,
  );
});
test("query failures and lost acknowledgments are redacted and never retried", async () => {
  const c = command(),
    f = fixture();
  let calls = 0;
  f.ports.query = async () => {
    calls++;
    throw Error("private database credential and SQL details");
  };
  const r = await hostedPairedSetupRoute(request(c), f.ports, env);
  assert.equal(calls, 1);
  assert.equal(r.status, 503);
  assert.equal((await r.text()).includes("private database"), false);
});
test("malformed/secret-bearing option projection is not sent to browser", async () => {
  const f = fixture({ ...options, credential: "secret" });
  assert.equal(await hostedPairedSetupPageData(f.ports, env), null);
  assert.equal(
    (await hostedPairedSetupRoute(request(), f.ports, env)).status,
    503,
  );
});
test("page uses same verified actor and bounded options DTO", async () => {
  const f = fixture();
  assert.deepEqual(await hostedPairedSetupPageData(f.ports, env), options);
  assert.equal(f.queries.length, 1);
});
test("aborted body cancels reader and cannot enter identity or SQL", async () => {
  let cancelled = false;
  const controller = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const req = request({}, {}, {
    body: stream,
    signal: controller.signal,
    duplex: "half",
  } as RequestInit);
  const f = fixture(),
    pending = hostedPairedSetupRoute(req, f.ports, env);
  controller.abort();
  assert.equal((await pending).status, 400);
  assert.equal(cancelled, true);
  assert.equal(f.identities, 0);
});
test("stalled body times out, releases reader and never touches identity/SQL", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    }),
    f = fixture();
  const r = await hostedPairedSetupRoute(
    request({}, {}, { body: stream, duplex: "half" } as RequestInit),
    f.ports,
    env,
  );
  assert.equal(r.status, 408);
  assert.equal(cancelled, true);
  assert.equal(f.identities, 0);
  assert.equal(stream.locked, false);
});
test("abort while identity resolves cannot start the SQL operation", async () => {
  const f = fixture(),
    controller = new AbortController();
  f.ports.identity = async () => {
    controller.abort();
    return identity();
  };
  assert.equal(
    (
      await hostedPairedSetupRoute(
        request(
          {},
          {},
          {
            signal: controller.signal,
            body: JSON.stringify({ action: "OPTIONS" }),
          },
        ),
        f.ports,
        env,
      )
    ).status,
    400,
  );
  assert.equal(f.queries.length, 0);
});

test("missing or denied SQL original-session guard cannot claim setup completion", async () => {
  const f = fixture(null);
  const r = await hostedPairedSetupRoute(request(command()), f.ports, env);
  assert.equal(r.status, 503);
  assert.match(
    f.queries[0].sql,
    /^select case when kxra_paired_admission\.hosted_setup_session_current\(\) then /,
  );
  assert.equal(f.queries.length, 1);
});
