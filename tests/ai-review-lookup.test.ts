import assert from "node:assert/strict";
import test from "node:test";
import { readAiReview } from "../apps/os/lib/ai-review-lookup";

for (const phase of ["headers", "body"] as const) {
  test(`stalled ${phase} times out even when abort is ignored`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let transport: AbortSignal | undefined;
    t.mock.method(globalThis, "fetch", (_url: unknown, init: RequestInit) => {
      transport = init.signal!;
      return phase === "headers"
        ? new Promise(() => {})
        : Promise.resolve({ ok: true, json: () => new Promise(() => {}) });
    });
    const control = new AbortController();
    const result = readAiReview(control.signal);
    const rejected = assert.rejects(result, /REVIEW_LOOKUP_TIMEOUT/);
    await Promise.resolve();
    t.mock.timers.tick(15_000);
    await rejected;
    assert.equal(transport?.aborted, true);
    assert.equal(control.signal.aborted, false);
  });
}

test("cancel settles promptly; already-cancelled read never fetches", async (t) => {
  let transport: AbortSignal | undefined;
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    (_url: unknown, init: RequestInit) => {
      transport = init.signal!;
      return new Promise(() => {});
    },
  );
  const control = new AbortController();
  const result = readAiReview(control.signal);
  const rejected = assert.rejects(result, /REVIEW_LOOKUP_CANCELLED/);
  control.abort();
  await rejected;
  assert.equal(transport?.aborted, true);
  await assert.rejects(readAiReview(control.signal), /REVIEW_LOOKUP_CANCELLED/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("late response cannot replace timeout; fresh retry preserves request contract", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let finish!: (value: Response) => void;
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const result = readAiReview(new AbortController().signal);
  const rejected = assert.rejects(result, /REVIEW_LOOKUP_TIMEOUT/);
  t.mock.timers.tick(15_000);
  await rejected;
  finish(Response.json({ admission: null }));
  await assert.rejects(result, /REVIEW_LOOKUP_TIMEOUT/);
  let args: Parameters<typeof globalThis.fetch> | undefined;
  fetch.mock.mockImplementation(
    async (...input: Parameters<typeof globalThis.fetch>) => {
      args = input;
      return Response.json({ admission: null });
    },
  );
  assert.equal(await readAiReview(new AbortController().signal, "a&b"), null);
  assert.equal(args?.[0], "/api/ai-connection-admission?id=a%26b");
  assert.equal(args?.[1]?.cache, "no-store");
});

for (const [label, response] of [
  ["access denied", () => new Response(null, { status: 403 })],
  [
    "extra fields",
    () => Response.json({ admission: null, secret: "DO_NOT_SHOW" }),
  ],
  ["invalid status", () => Response.json({ admission: { state: "ELIGIBLE" } })],
  ["invalid JSON", () => new Response("not-json")],
] as const) {
  test(`${label} fails closed`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => response());
    await assert.rejects(readAiReview(new AbortController().signal));
  });
}

test("successful read clears deadline and cancellation listener", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let transport: AbortSignal | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      transport = init.signal!;
      return Response.json({ admission: null });
    },
  );
  const control = new AbortController();
  await readAiReview(control.signal);
  t.mock.timers.tick(15_000);
  control.abort();
  assert.equal(transport?.aborted, false);
});
