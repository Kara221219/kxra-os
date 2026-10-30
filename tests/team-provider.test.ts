import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  sealKey,
  openKey,
  endpoint,
  publicIpv4,
  generate,
  resolveProviderAddress,
  secureTransport,
  connectionInput,
  type Connection,
} from "../packages/workspace/provider";
test("new real connections require customer-cost acknowledgement and reject header control bytes", () => {
  const value = {
    name: "Customer account",
    provider: "OPENAI",
    model: "chosen-model",
    key: "SYNTHETIC_CUSTOMER_KEY",
  };
  assert.throws(() => connectionInput.parse(value));
  assert.equal(
    connectionInput.parse({ ...value, customer_billed_acknowledged: true })
      .customer_billed_acknowledged,
    true,
  );
  assert.throws(() =>
    connectionInput.parse({
      ...value,
      key: "synthetic\r\ninjected",
      customer_billed_acknowledged: true,
    }),
  );
  assert.equal(
    connectionInput.parse({
      name: "Fixture",
      provider: "FIXTURE",
      model: "fixture-draft",
      key: "local-fixture",
    }).provider,
    "FIXTURE",
  );
});

test("provider boundary rejects key echoes and replaces raw errors without a platform-key fallback", async (t) => {
  const oldFlag = process.env.KXRA_AI_ENABLED;
  const oldVault = process.env.KXRA_MODEL_VAULT_KEY;
  t.after(() => {
    if (oldFlag === undefined) delete process.env.KXRA_AI_ENABLED;
    else process.env.KXRA_AI_ENABLED = oldFlag;
    if (oldVault === undefined) delete process.env.KXRA_MODEL_VAULT_KEY;
    else process.env.KXRA_MODEL_VAULT_KEY = oldVault;
  });
  process.env.KXRA_AI_ENABLED = "true";
  process.env.KXRA_MODEL_VAULT_KEY = crypto.randomBytes(32).toString("hex");
  const key = "SYNTHETIC_CUSTOMER_KEY_DO_NOT_RETURN";
  const c: Connection = {
    id: "c",
    org_id: "o",
    provider: "OPENAI",
    model: "chosen-model",
    endpoint_id: "",
    encrypted_key: sealKey(key, "o:c"),
  };
  await assert.rejects(
    generate(c, "system", "context", async () => ({
      choices: [{ finish_reason: "stop", message: { content: key } }],
    })),
    /^Error: PROVIDER_INVALID_RESPONSE$/,
  );
  await assert.rejects(
    generate(c, "system", "context", async () => {
      throw Error(`provider error with ${key}`);
    }),
    /^Error: PROVIDER_UNAVAILABLE$/,
  );
  let calls = 0;
  await assert.rejects(
    generate({ ...c, org_id: "foreign" }, "system", "context", async () => {
      calls++;
      return {};
    }),
    /^Error: PROVIDER_UNAVAILABLE$/,
  );
  assert.equal(calls, 0);
  delete process.env.KXRA_MODEL_VAULT_KEY;
});
test("provider DNS lookup has a deadline, pins a public address and rejects mixed private answers", async () => {
  assert.equal(
    await resolveProviderAddress("example.test", async () => [
      { address: "8.8.8.8" },
    ]),
    "8.8.8.8",
  );
  await assert.rejects(
    resolveProviderAddress("example.test", () => new Promise(() => {}), 20),
    /PROVIDER_TIMEOUT/,
  );
  await assert.rejects(
    resolveProviderAddress("example.test", async () => [
      { address: "8.8.8.8" },
      { address: "127.0.0.1" },
    ]),
    /ENDPOINT_REJECTED/,
  );
  await assert.rejects(
    resolveProviderAddress("example.test", async () => {
      throw Error("DNS internal details");
    }),
    /^Error: PROVIDER_UNAVAILABLE$/,
  );
});
test("workspace model vault binds ciphertext to its tenant and connection", () => {
  process.env.KXRA_MODEL_VAULT_KEY = crypto.randomBytes(32).toString("hex");
  const sealed = sealKey("synthetic-test-key", "tenant:connection");
  assert.equal(openKey(sealed, "tenant:connection"), "synthetic-test-key");
  assert.throws(() => openKey(sealed, "other:connection"));
  assert.ok(!sealed.includes("synthetic-test-key"));
  delete process.env.KXRA_MODEL_VAULT_KEY;
  assert.throws(() => sealKey("test", "scope"), /VAULT_NOT_CONFIGURED/);
});
test("compatible endpoints reject SSRF destinations and unsafe URLs", () => {
  for (const ip of [
    "127.0.0.1",
    "10.2.3.4",
    "169.254.169.254",
    "192.168.2.1",
    "172.20.0.1",
    "100.64.1.1",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "224.0.0.1",
  ])
    assert.equal(publicIpv4(ip), false, ip);
  assert.equal(publicIpv4("8.8.8.8"), true);
  for (const url of [
    "http://example.com",
    "https://127.0.0.1/",
    "https://user:secret@example.com",
    "https://example.com:444",
    "https://example.com?q=secret",
  ]) {
    process.env.KXRA_MODEL_ENDPOINTS = JSON.stringify({ test: url });
    assert.throws(() =>
      endpoint({ provider: "COMPATIBLE", model: "x", endpoint_id: "test" }),
    );
  }
  delete process.env.KXRA_MODEL_ENDPOINTS;
});
test("model adapters send bounded protocol requests and fail closed on refusals and truncation", async (t) => {
  const previous = process.env.KXRA_AI_ENABLED;
  t.after(() => {
    if (previous === undefined) delete process.env.KXRA_AI_ENABLED;
    else process.env.KXRA_AI_ENABLED = previous;
  });
  process.env.KXRA_AI_ENABLED = "true";
  process.env.KXRA_MODEL_VAULT_KEY = crypto.randomBytes(32).toString("hex");
  for (const provider of [
    "OPENAI",
    "ANTHROPIC",
    "GOOGLE",
    "OPENROUTER",
  ] as const) {
    const c: Connection = {
      id: "c",
      org_id: "o",
      provider,
      model: "test-model",
      endpoint_id: "",
      encrypted_key: sealKey("synthetic-key", "o:c"),
    };
    let called = false;
    const result = await generate(
      c,
      "system policy",
      "authorised context",
      async (url, headers, body) => {
        called = true;
        assert.equal(url.protocol, "https:");
        assert.ok(JSON.stringify(body).includes("authorised context"));
        assert.ok(JSON.stringify(body).includes("1200"));
        assert.ok(
          Object.values(headers).some((v) => v.includes("synthetic-key")),
        );
        if (provider === "ANTHROPIC")
          return {
            stop_reason: "end_turn",
            content: [{ type: "text", text: "draft" }],
            usage: { input_tokens: 4, output_tokens: 2 },
          };
        if (provider === "GOOGLE")
          return {
            candidates: [
              { finishReason: "STOP", content: { parts: [{ text: "draft" }] } },
            ],
            usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 },
          };
        return {
          choices: [{ finish_reason: "stop", message: { content: "draft" } }],
          usage: { prompt_tokens: 4, completion_tokens: 2 },
        };
      },
    );
    assert.ok(called);
    assert.deepEqual(result, {
      output: "draft",
      input_tokens: 4,
      output_tokens: 2,
    });
    await assert.rejects(
      generate(c, "system", "context", async () => ({
        choices: [{ finish_reason: "length", message: { content: "partial" } }],
      })),
    );
  }
  delete process.env.KXRA_MODEL_VAULT_KEY;
});

test("external providers require exact server enablement before vault, endpoint or transport work", async (t) => {
  const previous = process.env.KXRA_AI_ENABLED;
  t.after(() => {
    if (previous === undefined) delete process.env.KXRA_AI_ENABLED;
    else process.env.KXRA_AI_ENABLED = previous;
  });
  let touched = false;
  const connection = new Proxy(
    { localFixture: true } as unknown as Connection,
    {
      get() {
        touched = true;
        throw Error("connection must not be read while disabled");
      },
    },
  );
  for (const flag of [undefined, "false", "0", "TRUE", " true", "true ", ""]) {
    if (flag === undefined) delete process.env.KXRA_AI_ENABLED;
    else process.env.KXRA_AI_ENABLED = flag;
    await assert.rejects(
      generate(connection, "system", "context", async () => {
        touched = true;
        throw Error("transport must not be called while disabled");
      }),
      /^Error: PROVIDER_DISABLED$/,
    );
    await assert.rejects(
      secureTransport(new URL("https://127.0.0.1/"), {}, {}),
      /^Error: PROVIDER_DISABLED$/,
    );
    assert.equal(touched, false);
  }
});
