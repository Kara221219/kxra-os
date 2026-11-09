import { test, type TestContext } from "node:test";
import dns from "node:dns/promises";
import https from "node:https";
import { EventEmitter } from "node:events";
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
  type Provider,
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

// All adapter cases below use synthetic envelopes and a stub transport. The
// socket-boundary cases replace DNS and HTTPS entirely, never contacting a host.
const customerKey = "SYNTHETIC_CUSTOMER_KEY_BOUNDARY_ONLY";
function providerFixture(t: TestContext) {
  for (const name of [
    "KXRA_AI_ENABLED",
    "KXRA_MODEL_VAULT_KEY",
    "KXRA_MODEL_ENDPOINTS",
  ]) {
    const before = process.env[name];
    t.after(() => {
      if (before === undefined) delete process.env[name];
      else process.env[name] = before;
    });
  }
  process.env.KXRA_AI_ENABLED = "true";
  process.env.KXRA_MODEL_VAULT_KEY = crypto.randomBytes(32).toString("hex");
  process.env.KXRA_MODEL_ENDPOINTS = JSON.stringify({
    synthetic: "https://synthetic.invalid/v1/chat/completions",
  });
  return (provider: Provider): Connection => ({
    id: "c",
    org_id: "o",
    provider,
    model: "synthetic-model",
    endpoint_id: "synthetic",
    encrypted_key: sealKey(customerKey, "o:c"),
  });
}
function chat(
  content: unknown = "Visible draft",
  message: Record<string, unknown> = {},
  finish_reason = "stop",
) {
  return { choices: [{ finish_reason, message: { content, ...message } }] };
}
function gemini(
  parts: unknown = [{ text: "Visible draft" }],
  finishReason = "STOP",
) {
  return { candidates: [{ finishReason, content: { role: "model", parts } }] };
}
function claude(
  content: unknown = [{ type: "text", text: "Visible draft" }],
  stop_reason = "end_turn",
) {
  return { stop_reason, content };
}

test("final draft excludes recognized thought/reasoning content while preserving ordinary metadata", async (t) => {
  const connection = providerFixture(t);
  const reasoning = "REASONING_SENTINEL " + customerKey;
  const cases: [Provider, unknown, string][] = [
    [
      "GOOGLE",
      {
        ...gemini([
          { text: reasoning, thought: true, thoughtSignature: "opaque" },
          { text: "Visible", thought: false },
          {
            text: "draft",
            thoughtSignature: "final-signature",
            partMetadata: { custom: "opaque", additional: { future: true } },
            speechMetadata: {
              speaker: "Narrator",
              style: "neutral",
              futureMetadata: true,
            },
          },
        ]),
        modelVersion: "synthetic",
        responseId: "id",
        promptFeedback: {},
        usageMetadata: {
          promptTokenCount: 3,
          candidatesTokenCount: 2,
          thoughtsTokenCount: 7,
        },
      },
      "Visible\ndraft",
    ],
    [
      "ANTHROPIC",
      {
        ...claude([
          { type: "thinking", thinking: reasoning, signature: "opaque" },
          { type: "redacted_thinking", data: "opaque-redacted" },
          {
            type: "text",
            text: "Visible",
            citations: [{ type: "char_location", document_index: 0 }],
          },
          { type: "text", text: "draft" },
        ]),
        id: "id",
        type: "message",
        role: "assistant",
        model: "synthetic",
        stop_sequence: null,
        usage: {
          input_tokens: 3,
          output_tokens: 2,
          cache_read_input_tokens: 7,
        },
      },
      "Visible\ndraft",
    ],
    ...(["OPENAI", "OPENROUTER", "COMPATIBLE"] as const).map(
      (provider): [Provider, unknown, string] => [
        provider,
        {
          ...chat("Visible draft", {
            role: "assistant",
            refusal: null,
            tool_calls: [],
            function_call: null,
            audio: null,
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  url: "https://example.invalid",
                  title: "Source",
                },
              },
            ],
            reasoning,
            reasoning_content: reasoning,
            reasoning_details: [
              {
                type: "reasoning.text",
                text: reasoning,
                signature: null,
                id: null,
                format: "openrouter",
                index: 0,
              },
              { type: "reasoning.summary", summary: reasoning },
              { type: "reasoning.encrypted", data: "opaque" },
            ],
          }),
          id: "id",
          object: "chat.completion",
          model: "synthetic",
          created: 0,
          system_fingerprint: "opaque",
          usage: {
            prompt_tokens: 3,
            completion_tokens: 2,
            completion_tokens_details: { reasoning_tokens: 7 },
          },
        },
        "Visible draft",
      ],
    ),
  ];
  for (const [provider, envelope, output] of cases) {
    const result = await generate(
      connection(provider),
      "system",
      "context",
      async () => envelope,
    );
    assert.deepEqual(result, { output, input_tokens: 3, output_tokens: 2 });
    assert.ok(!JSON.stringify(result).includes("REASONING_SENTINEL"));
    assert.ok(!JSON.stringify(result).includes(customerKey));
  }
});

test("Google rejects thought-only, malformed flags and mixed or unsupported content payloads", async (t) => {
  const connection = providerFixture(t)("GOOGLE");
  const cases: unknown[] = [
    gemini([{ text: "Thought only", thought: true }]),
    gemini([{ text: "Thought", thought: true }, { text: "  " }]),
    ...["true", "false", 0, 1, null, {}].map((thought) =>
      gemini([{ text: "draft", thought }]),
    ),
    gemini([{ text: "draft", thoughtSignature: 42 }]),
    gemini([{ text: "draft", partMetadata: [] }]),
    gemini([{ text: "draft", speechMetadata: { speaker: 42 } }]),
    gemini([{ thoughtSignature: "opaque" }]),
    gemini([{ text: 42 }]),
    gemini([{}]),
    gemini([]),
    gemini(null),
    ...[
      "functionCall",
      "functionResponse",
      "toolCall",
      "toolResponse",
      "executableCode",
      "codeExecutionResult",
      "inlineData",
      "fileData",
      "videoMetadata",
      "unknownContent",
    ].flatMap((field) => [
      gemini([{ text: "Visible draft", [field]: { secret: customerKey } }]),
      gemini([{ text: "Visible draft" }, { [field]: { secret: customerKey } }]),
      gemini([
        { text: "Thought", thought: true, [field]: {} },
        { text: "Visible draft" },
      ]),
    ]),
    {
      candidates: [
        {
          finishReason: "STOP",
          content: { role: "user", parts: [{ text: "draft" }] },
        },
      ],
    },
    {
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: "draft" }], functionCall: {} },
        },
      ],
    },
    { candidates: [...gemini().candidates, ...gemini().candidates] },
  ];
  for (const envelope of cases) {
    let calls = 0;
    await assert.rejects(
      generate(connection, "system", "context", async () => {
        calls++;
        return envelope;
      }),
      /^Error: PROVIDER_INVALID_RESPONSE$/,
    );
    assert.equal(calls, 1);
  }
});

test("Anthropic rejects reasoning-only and all tool, executable or malformed content combinations", async (t) => {
  const connection = providerFixture(t)("ANTHROPIC");
  const text = { type: "text", text: "Visible draft" };
  const cases: unknown[] = [
    claude([
      { type: "thinking", thinking: "Reasoning only", signature: "opaque" },
    ]),
    claude([{ type: "redacted_thinking", data: "opaque" }]),
    claude([{ type: "thinking", thinking: "Reasoning", signature: 1 }, text]),
    claude([{ type: "thinking", thinking: "Reasoning" }, text]),
    claude([{ type: "redacted_thinking", data: 1 }, text]),
    claude([{ type: "text", text: null }]),
    claude([{ type: "text" }]),
    claude([{ ...text, citations: "invalid" }]),
    claude([]),
    claude(null),
    ...[
      "tool_use",
      "server_tool_use",
      "web_search_tool_result",
      "code_execution_tool_result",
      "refusal",
      "image",
      "unknown",
    ].flatMap((type) => [
      claude([
        text,
        { type, id: "action", name: "execute", input: { secret: customerKey } },
      ]),
      claude([{ type, text: "Looks like a draft" }]),
    ]),
    ...["tool_use", "input", "functionCall", "executableCode"].map((field) =>
      claude([{ ...text, [field]: {} }]),
    ),
    claude([
      {
        type: "thinking",
        thinking: "Reasoning",
        signature: "opaque",
        tool_use: {},
      },
      text,
    ]),
  ];
  for (const envelope of cases)
    await assert.rejects(
      generate(connection, "system", "context", async () => envelope),
      /^Error: PROVIDER_INVALID_RESPONSE$/,
    );
});

test("chat protocols reject non-final content and unexpected actions instead of dropping them", async (t) => {
  const connection = providerFixture(t);
  for (const provider of ["OPENAI", "OPENROUTER", "COMPATIBLE"] as const) {
    const cases: unknown[] = [
      chat(null, { reasoning: "Reasoning only" }),
      chat("", {
        reasoning_details: [{ type: "reasoning.text", text: "Reasoning only" }],
      }),
      chat([{ type: "text", text: "Visible draft" }]),
      chat({ text: "Visible draft" }),
      chat(42),
      chat("draft", { role: "tool" }),
      chat("draft", { refusal: 1 }),
      chat("draft", { reasoning: {} }),
      chat("draft", { reasoning_content: 42 }),
      chat("draft", { reasoning_details: {} }),
      chat("draft", {
        images: [{ image_url: { url: "data:image/png;base64,not-an-image" } }],
      }),
      chat("draft", { model: 42 }),
      chat("draft", { name: {} }),
      ...[
        {
          type: "reasoning.server_tool_call",
          tool_name: "execute",
          arguments: {},
          result: "done",
          tool_call_id: "synthetic",
        },
        { type: "reasoning.unknown", text: "Not a supported summary" },
        { type: "reasoning.text", text: "reasoning", tool_name: "execute" },
        { type: "reasoning.summary", summary: "reasoning", arguments: {} },
        { type: "reasoning.encrypted", data: "opaque", result: "done" },
        { type: "reasoning.text", text: {}, index: 1 },
        { type: "reasoning.text", text: "reasoning", index: 1.5 },
        { type: "reasoning.text", text: "reasoning", id: 1 },
        { type: "reasoning.summary" },
        { type: "reasoning.encrypted", data: 1 },
      ].map((detail) => chat("draft", { reasoning_details: [detail] })),
      ...[
        {
          tool_calls: [
            {
              id: "tool",
              type: "function",
              function: { name: "execute", arguments: customerKey },
            },
          ],
        },
        {
          tool_calls: [
            { type: "custom", custom: { name: "execute", input: customerKey } },
          ],
        },
        { tool_calls: {} },
        { function_call: { name: "execute", arguments: customerKey } },
        { audio: { data: "audio" } },
        { functionCall: {} },
        { executableCode: {} },
        { unknownContent: {} },
      ].map((extra) => chat("Visible draft", extra)),
      { choices: [...chat().choices, ...chat().choices] },
    ];
    for (const envelope of cases)
      await assert.rejects(
        generate(
          connection(provider),
          "system",
          "context",
          async () => envelope,
        ),
        /^Error: PROVIDER_INVALID_RESPONSE$/,
      );
    assert.deepEqual(
      await generate(connection(provider), "system", "context", async () =>
        chat("Visible draft", {
          tool_calls: null,
          images: null,
          reasoning_details: [null],
        }),
      ),
      { output: "Visible draft", input_tokens: 0, output_tokens: 0 },
    );
    for (const reason of [
      "length",
      "content_filter",
      "tool_calls",
      "function_call",
      "unknown",
    ])
      await assert.rejects(
        generate(connection(provider), "system", "context", async () =>
          chat("partial", {}, reason),
        ),
        /^Error: PROVIDER_INCOMPLETE$/,
      );
    await assert.rejects(
      generate(connection(provider), "system", "context", async () =>
        chat("draft", { refusal: "refused" }),
      ),
      /^Error: PROVIDER_INCOMPLETE$/,
    );
    await assert.rejects(
      generate(connection(provider), "system", "context", async () => ({
        choices: [],
      })),
      /^Error: PROVIDER_INCOMPLETE$/,
    );
  }
});

test("all protocols retain bounded nonempty final text, sanitized errors and existing usage defaults", async (t) => {
  const connection = providerFixture(t);
  for (const provider of [
    "OPENAI",
    "ANTHROPIC",
    "GOOGLE",
    "OPENROUTER",
    "COMPATIBLE",
  ] as const) {
    const envelope = (text: string) =>
      provider === "ANTHROPIC"
        ? claude([{ type: "text", text }])
        : provider === "GOOGLE"
          ? gemini([{ text }])
          : chat(text);
    for (const text of ["", " \n\t", "x".repeat(12001), `Echo: ${customerKey}`])
      await assert.rejects(
        generate(connection(provider), "system", "context", async () =>
          envelope(text),
        ),
        /^Error: PROVIDER_INVALID_RESPONSE$/,
      );
    for (const raw of [null, {}, [], "not-json", { content: customerKey }])
      await assert.rejects(
        generate(connection(provider), "system", "context", async () => raw),
        /^Error: PROVIDER_INVALID_RESPONSE$/,
      );
    const result = await generate(
      connection(provider),
      "system",
      "context",
      async () => envelope("x".repeat(12000)),
    );
    assert.equal(result.output.length, 12000);
    // Unknown-token semantics are deliberately unchanged in this slice.
    assert.equal(result.input_tokens, 0);
    assert.equal(result.output_tokens, 0);
    for (const failure of [
      Error(customerKey),
      customerKey,
      { message: customerKey },
    ])
      await assert.rejects(
        generate(connection(provider), "system", "context", async () => {
          throw failure;
        }),
        /^Error: PROVIDER_UNAVAILABLE$/,
      );
  }
  for (const reason of ["MAX_TOKENS", "SAFETY", "RECITATION", "OTHER"])
    await assert.rejects(
      generate(connection("GOOGLE"), "system", "context", async () =>
        gemini([{ text: "partial" }], reason),
      ),
      /^Error: PROVIDER_INCOMPLETE$/,
    );
  await assert.rejects(
    generate(connection("GOOGLE"), "system", "context", async () => ({
      candidates: [],
    })),
    /^Error: PROVIDER_INCOMPLETE$/,
  );
  for (const reason of [
    "max_tokens",
    "tool_use",
    "pause_turn",
    "refusal",
    "stop_sequence",
  ])
    await assert.rejects(
      generate(connection("ANTHROPIC"), "system", "context", async () =>
        claude([{ type: "text", text: "partial" }], reason),
      ),
      /^Error: PROVIDER_INCOMPLETE$/,
    );
});

test("feature withdrawal during initial admission stops before credential access and transport", async (t) => {
  const c = providerFixture(t)("OPENAI");
  let credentials = 0,
    calls = 0,
    admissions = 0;
  Object.defineProperty(c, "encrypted_key", {
    get() {
      credentials++;
      throw Error("must not decrypt");
    },
  });
  const result = generate(
    c,
    "system",
    "context",
    async () => {
      calls++;
      return chat();
    },
    async () => {
      admissions++;
      await Promise.resolve();
      process.env.KXRA_AI_ENABLED = "false";
    },
  );
  await assert.rejects(result, /^Error: PROVIDER_DISABLED$/);
  assert.deepEqual(
    { credentials, calls, admissions },
    { credentials: 0, calls: 0, admissions: 1 },
  );
});

test("feature withdrawal after a custom transport suppresses response parsing and output without retry", async (t) => {
  const connection = providerFixture(t);
  let calls = 0,
    reads = 0;
  const response = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") return undefined;
        reads++;
        throw Error(customerKey);
      },
    },
  );
  await assert.rejects(
    generate(connection("GOOGLE"), "system", "context", async () => {
      calls++;
      await Promise.resolve();
      delete process.env.KXRA_AI_ENABLED;
      return response;
    }),
    /^Error: PROVIDER_DISABLED$/,
  );
  assert.deepEqual({ calls, reads }, { calls: 1, reads: 0 });
});

test("secure transport rechecks enablement after each awaited admission and DNS before sockets", async (t) => {
  providerFixture(t);
  for (const stage of ["admission", "dns", "pre-dispatch"] as const) {
    process.env.KXRA_AI_ENABLED = "true";
    let admissions = 0,
      lookups = 0,
      sockets = 0;
    const lookup = t.mock.method(dns, "lookup", async () => {
      lookups++;
      await Promise.resolve();
      if (stage === "dns") process.env.KXRA_AI_ENABLED = "false";
      return [{ address: "93.184.216.34", family: 4 }];
    });
    const request = t.mock.method(https, "request", () => {
      sockets++;
      throw Error("no provider socket permitted");
    });
    await assert.rejects(
      secureTransport(
        new URL("https://synthetic.invalid"),
        {},
        {},
        async () => {
          admissions++;
          await Promise.resolve();
          if (
            (stage === "admission" && admissions === 1) ||
            (stage === "pre-dispatch" && admissions === 2)
          )
            process.env.KXRA_AI_ENABLED = "false";
        },
      ),
      /^Error: PROVIDER_DISABLED$/,
    );
    assert.equal(sockets, 0);
    assert.equal(lookups, stage === "admission" ? 0 : 1);
    assert.equal(admissions, stage === "pre-dispatch" ? 2 : 1);
    lookup.mock.restore();
    request.mock.restore();
  }
});

test("mock HTTPS preserves DNS pinning, one dispatch, bounded parsing and late output withdrawal", async (t) => {
  providerFixture(t);
  for (const scenario of [
    "success",
    "withdrawal",
    "invalid-json",
    "oversize",
    "rate-limit",
    "rejected",
    "response-error",
    "request-error",
  ] as const) {
    process.env.KXRA_AI_ENABLED = "true";
    let lookups = 0,
      sockets = 0,
      writes = 0,
      admissions = 0;
    const lookup = t.mock.method(dns, "lookup", async () => {
      lookups++;
      return [{ address: "93.184.216.34", family: 4 }];
    });
    const request = t.mock.method(
      https,
      "request",
      (
        url: URL,
        options: {
          method: string;
          headers: Record<string, string>;
          lookup: (
            host: string,
            options: object,
            callback: (error: unknown, address: string, family: number) => void,
          ) => void;
        },
        callback: (
          response: EventEmitter & {
            statusCode: number;
            resume(): void;
            destroy(): void;
          },
        ) => void,
      ) => {
        sockets++;
        assert.equal(url.href, "https://synthetic.invalid/v1");
        assert.equal(options.method, "POST");
        assert.equal(options.headers["content-type"], "application/json");
        options.lookup(
          "synthetic.invalid",
          {},
          (error: unknown, address: string, family: number) => {
            assert.equal(error, null);
            assert.equal(address, "93.184.216.34");
            assert.equal(family, 4);
          },
        );
        const req = Object.assign(new EventEmitter(), {
          destroy() {
            req.emit("close");
          },
          end(body: string) {
            writes++;
            assert.equal(body, '{"synthetic":true}');
            queueMicrotask(() => {
              if (scenario === "request-error") {
                req.emit("error", Error(customerKey));
                req.emit("close");
                return;
              }
              const response = Object.assign(new EventEmitter(), {
                statusCode:
                  scenario === "rate-limit"
                    ? 429
                    : scenario === "rejected"
                      ? 403
                      : 200,
                resume() {},
                destroy() {},
              });
              callback(response);
              if (scenario === "withdrawal")
                process.env.KXRA_AI_ENABLED = "false";
              if (scenario === "response-error")
                response.emit("error", Error(customerKey));
              else {
                response.emit(
                  "data",
                  Buffer.from(
                    scenario === "invalid-json"
                      ? "invalid-json"
                      : scenario === "oversize"
                        ? "x".repeat(262145)
                        : '{"visible":"draft"}',
                  ),
                );
                response.emit("end");
              }
              req.emit("close");
            });
          },
        });
        return req;
      },
    );
    const result = secureTransport(
      new URL("https://synthetic.invalid/v1"),
      {},
      { synthetic: true },
      async () => {
        admissions++;
      },
    );
    if (scenario === "success")
      assert.deepEqual(await result, { visible: "draft" });
    else {
      const code = {
        withdrawal: "PROVIDER_DISABLED",
        "invalid-json": "PROVIDER_INVALID_RESPONSE",
        oversize: "PROVIDER_RESPONSE_TOO_LARGE",
        "rate-limit": "PROVIDER_RATE_LIMIT",
        rejected: "PROVIDER_REJECTED",
        "response-error": "PROVIDER_UNAVAILABLE",
        "request-error": "PROVIDER_UNAVAILABLE",
      }[scenario];
      await assert.rejects(result, new RegExp(`^Error: ${code}$`));
    }
    assert.deepEqual(
      { lookups, sockets, writes, admissions },
      { lookups: 1, sockets: 1, writes: 1, admissions: 2 },
    );
    lookup.mock.restore();
    request.mock.restore();
  }
});

test("mock HTTPS timeout remains bounded and sanitized without a second dispatch", async (t) => {
  providerFixture(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let sockets = 0,
    writes = 0,
    destroys = 0;
  let dispatched!: () => void;
  const ready = new Promise<void>((resolve) => {
    dispatched = resolve;
  });
  t.mock.method(dns, "lookup", async () => [
    { address: "93.184.216.34", family: 4 },
  ]);
  t.mock.method(https, "request", () => {
    sockets++;
    const request = Object.assign(new EventEmitter(), {
      end() {
        writes++;
        dispatched();
      },
      destroy() {
        destroys++;
        request.emit("close");
      },
    });
    return request;
  });
  const result = secureTransport(
    new URL("https://synthetic.invalid"),
    {},
    {},
    async () => {},
  );
  const rejected = assert.rejects(result, /^Error: PROVIDER_TIMEOUT$/);
  await ready;
  t.mock.timers.tick(25000);
  await rejected;
  assert.deepEqual(
    { sockets, writes, destroys },
    { sockets: 1, writes: 1, destroys: 1 },
  );
});
