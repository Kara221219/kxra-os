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
  type Connection,
} from "../packages/workspace/provider";
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
test("model adapters send bounded protocol requests and fail closed on refusals and truncation", async () => {
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
