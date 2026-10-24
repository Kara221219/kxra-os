import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseAuthTransport } from "../packages/integrations/supabase-auth-transport";

const project = "jlebgsxcvhvpueuibekd";
const endpoint = `https://${project}.supabase.co/auth/v1/signup`;
const never = () => new Promise<Response>(() => {});

test("normal Auth request preserves method, headers, body and response without retry", async () => {
  let calls = 0;
  const transport = createSupabaseAuthTransport({
    project,
    fetch: async (input, init) => {
      calls++;
      const request = new Request(input, init);
      assert.equal(request.url, endpoint);
      assert.equal(request.method, "POST");
      assert.equal(request.redirect, "error");
      assert.equal(request.headers.get("apikey"), "synthetic-public-key");
      assert.equal(await request.text(), '{"synthetic":true}');
      return new Response('{"ok":true}', {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const result = await transport(endpoint, {
    method: "POST",
    headers: { apikey: "synthetic-public-key" },
    body: '{"synthetic":true}',
  });
  assert.equal(result.status, 201);
  assert.equal(result.headers.get("content-type"), "application/json");
  assert.deepEqual(await result.json(), { ok: true });
  assert.equal(calls, 1);
});

test("foreign, misleading, non-HTTPS and encoded endpoints never reach fetch", async () => {
  let calls = 0;
  const transport = createSupabaseAuthTransport({
    project,
    fetch: async () => {
      calls++;
      return new Response();
    },
  });
  for (const url of [
    "https://lhbgeucifxxcdoyrnesf.supabase.co/auth/v1/signup",
    `https://${project}.supabase.co.evil.test/auth/v1/signup`,
    `http://${project}.supabase.co/auth/v1/signup`,
    `https://user:password@${project}.supabase.co/auth/v1/signup`,
    `https://${project}.supabase.co/rest/v1/users`,
    `https://${project}.supabase.co/auth/v10/signup`,
    `${endpoint}#fragment`,
    `https://${project}.supabase.co/auth/v1/%2frest`,
  ])
    await assert.rejects(
      transport(url, { headers: { authorization: "synthetic" } }),
      /ENDPOINT_REJECTED/,
    );
  assert.equal(calls, 0);
});

test("already aborted original signal prevents invocation", async () => {
  let calls = 0;
  const original = new AbortController();
  original.abort();
  const transport = createSupabaseAuthTransport({
    project,
    fetch: async () => {
      calls++;
      return new Response();
    },
  });
  await assert.rejects(transport(endpoint, { signal: original.signal }), {
    name: "AbortError",
  });
  assert.equal(calls, 0);
});

test("original Request signal aborts an in-flight transport even when injected fetch ignores it", async () => {
  const original = new AbortController();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let signal: AbortSignal | undefined;
  const transport = createSupabaseAuthTransport({
    project,
    fetch: async (input, init) => {
      signal = init?.signal ?? undefined;
      started();
      return never();
    },
  });
  const pending = transport(new Request(endpoint, { signal: original.signal }));
  await ready;
  original.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(signal?.aborted, true);
});

test("deadline bounds a hung fetch and aborts its signal without retry", async () => {
  let calls = 0;
  let signal: AbortSignal | undefined;
  const transport = createSupabaseAuthTransport({
    project,
    deadlineMs: 15,
    fetch: async (input, init) => {
      calls++;
      signal = init?.signal ?? undefined;
      return never();
    },
  });
  await assert.rejects(transport(endpoint), { name: "TimeoutError" });
  assert.equal(signal?.aborted, true);
  assert.equal(calls, 1);
});

test("deadline also bounds a response body that never completes", async () => {
  const transport = createSupabaseAuthTransport({
    project,
    deadlineMs: 15,
    fetch: async () => new Response(new ReadableStream({ start() {} })),
  });
  await assert.rejects(transport(endpoint), { name: "TimeoutError" });
});

test("rejected fetch yields a redacted stable error and no retry", async () => {
  let calls = 0;
  const transport = createSupabaseAuthTransport({
    project,
    fetch: async () => {
      calls++;
      throw Error("synthetic-secret-must-not-leak");
    },
  });
  await assert.rejects(transport(endpoint), {
    message: "AUTH_TRANSPORT_FAILED",
  });
  assert.equal(calls, 1);
});

test("invalid configuration is rejected before use", () => {
  for (const deadlineMs of [0, -1, NaN, Infinity, 1.5, 30_001])
    assert.throws(
      () => createSupabaseAuthTransport({ project, fetch: never, deadlineMs }),
      /CONFIGURATION_INVALID/,
    );
  assert.throws(
    () =>
      createSupabaseAuthTransport({
        project: "foreign" as typeof project,
        fetch: never,
      }),
    /CONFIGURATION_INVALID/,
  );
});

test("redirect responses are rejected and redirect following is disabled", async () => {
  let calls = 0;
  const transport = createSupabaseAuthTransport({
    project,
    fetch: async (input, init) => {
      calls++;
      assert.equal(init?.redirect, "error");
      const response = new Response("synthetic");
      Object.defineProperty(response, "redirected", { value: true });
      return response;
    },
  });
  await assert.rejects(transport(endpoint), {
    message: "AUTH_TRANSPORT_FAILED",
  });
  assert.equal(calls, 1);
});

test("non-success HTTP responses are preserved for SDK classification", async () => {
  const transport = createSupabaseAuthTransport({
    project,
    fetch: async () => new Response('{"error":"synthetic"}', { status: 429 }),
  });
  const response = await transport(endpoint);
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "synthetic" });
});

test("oversized declared response is cancelled without consuming its body", async () => {
  let cancelled = false;
  let reads = 0;
  const transport = createSupabaseAuthTransport({
    project,
    fetch: async () =>
      new Response(
        new ReadableStream<Uint8Array>(
          {
            pull(controller) {
              reads++;
              controller.enqueue(new Uint8Array([1]));
            },
            cancel() {
              cancelled = true;
            },
          },
          { highWaterMark: 0 },
        ),
        { headers: { "content-length": String(1024 * 1024 + 1) } },
      ),
  });
  await assert.rejects(transport(endpoint), {
    message: "AUTH_TRANSPORT_FAILED",
  });
  assert.equal(cancelled, true);
  assert.equal(reads, 0);
});

test("chunked response over limit is cancelled despite an understated content-length", async () => {
  let cancelled = false;
  let reads = 0;
  const transport = createSupabaseAuthTransport({
    project,
    fetch: async () =>
      new Response(
        new ReadableStream<Uint8Array>(
          {
            pull(controller) {
              reads++;
              controller.enqueue(new Uint8Array(512 * 1024));
            },
            cancel() {
              cancelled = true;
            },
          },
          { highWaterMark: 0 },
        ),
        { headers: { "content-length": "1" } },
      ),
  });
  await assert.rejects(transport(endpoint), {
    message: "AUTH_TRANSPORT_FAILED",
  });
  assert.equal(cancelled, true);
  assert.equal(reads, 3);
});

test("response at exact 1MiB boundary is permitted", async () => {
  let chunks = 0;
  const transport = createSupabaseAuthTransport({
    project,
    fetch: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (chunks++ < 2)
              controller.enqueue(new Uint8Array(512 * 1024).fill(65));
            else controller.close();
          },
        }),
        { headers: { "content-length": String(1024 * 1024) } },
      ),
  });
  const response = await transport(endpoint);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(bytes.length, 1024 * 1024);
  assert.equal(bytes[0], 65);
  assert.equal(bytes[bytes.length - 1], 65);
});

test("deadline cancels a hung reader without waiting for its cancellation promise", async () => {
  let cancelled = false;
  const transport = createSupabaseAuthTransport({
    project,
    deadlineMs: 15,
    fetch: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancelled = true;
            return new Promise<void>(() => {});
          },
        }),
      ),
  });
  await assert.rejects(transport(endpoint), { name: "TimeoutError" });
  assert.equal(cancelled, true);
});

test("caller abort during body reading cancels the response stream", async () => {
  let cancelled = false;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const caller = new AbortController();
  const transport = createSupabaseAuthTransport({
    project,
    fetch: async () =>
      new Response(
        new ReadableStream<Uint8Array>(
          {
            pull() {
              started();
              return new Promise<void>(() => {});
            },
            cancel() {
              cancelled = true;
            },
          },
          { highWaterMark: 0 },
        ),
      ),
  });
  const pending = transport(endpoint, { signal: caller.signal });
  await ready;
  caller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(cancelled, true);
});
