import test from "node:test";
import assert from "node:assert/strict";
import { pollOperatorStatus } from "../scripts/operator-generation-status";

const requestId = "synthetic_job-123";
const credential = "SYNTHETIC_ONLY_CREDENTIAL";
function jsonBytes(size: number) {
  const base = JSON.stringify({ status: "queued", padding: "" });
  return Buffer.from(
    JSON.stringify({
      status: "queued",
      padding: "x".repeat(size - base.length),
    }),
  );
}
function response(body: ReadableStream<Uint8Array> | Uint8Array) {
  return new Response(
    body instanceof Uint8Array ? new Uint8Array(body) : body,
    {
      headers: { "content-type": "application/json" },
    },
  );
}

test("status accepts the64KiB byte boundary and4096 reads including EOF", async () => {
  assert.deepEqual(
    await pollOperatorStatus(requestId, credential, async () =>
      response(jsonBytes(65_536)),
    ),
    { status: "queued", videoUrl: undefined },
  );
  const bytes = jsonBytes(4095);
  let offset = 0;
  const valid = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset < bytes.length)
        controller.enqueue(bytes.subarray(offset, ++offset));
      else controller.close();
    },
  });
  assert.deepEqual(
    await pollOperatorStatus(requestId, credential, async () =>
      response(valid),
    ),
    { status: "queued", videoUrl: undefined },
  );
  let pulls = 0,
    cancelled = false;
  const flood = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      controller.enqueue(new Uint8Array([32]));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    pollOperatorStatus(requestId, credential, async () => response(flood)),
    /STATUS_RESPONSE_READ_LIMIT/,
  );
  assert.ok(pulls <= 4098);
  assert.equal(cancelled, true);
});

test("status accepts64 empty chunks and rejects cumulative empty floods", async () => {
  let part = 0;
  const valid = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (++part <= 64) controller.enqueue(new Uint8Array());
      else {
        controller.enqueue(jsonBytes(100));
        controller.close();
      }
    },
  });
  assert.equal(
    (
      await pollOperatorStatus(requestId, credential, async () =>
        response(valid),
      )
    ).status,
    "queued",
  );
  let pulls = 0,
    cancelled = false;
  const flood = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      controller.enqueue(new Uint8Array([32]));
      controller.enqueue(new Uint8Array());
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    pollOperatorStatus(requestId, credential, async () => response(flood)),
    /STATUS_RESPONSE_READ_LIMIT/,
  );
  assert.ok(pulls <= 66);
  assert.equal(cancelled, true);
});

test("status preserves emitted views when the source reuses a larger backing buffer", async () => {
  const bytes = jsonBytes(1200),
    backing = Buffer.alloc(4096);
  let part = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (part < 2) {
          bytes.copy(backing, 0, part * 600, ++part * 600);
          controller.enqueue(backing.subarray(0, 600));
        } else controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  assert.deepEqual(
    await pollOperatorStatus(requestId, credential, async () => response(body)),
    { status: "queued", videoUrl: undefined },
  );
});

test("status stops a stalled read without awaiting an uncooperative cancellation", async (t) => {
  const abort = new AbortController();
  t.mock.method(AbortSignal, "timeout", (duration: number) => {
    assert.equal(duration, 30_000);
    return abort.signal;
  });
  let cancelled = false;
  const never = () => new Promise<never>(() => {});
  const body = new ReadableStream<Uint8Array>(
    {
      pull() {
        abort.abort();
        return never();
      },
      cancel() {
        cancelled = true;
        return never();
      },
    },
    { highWaterMark: 0 },
  );
  await assert.rejects(
    pollOperatorStatus(requestId, credential, async () => response(body)),
    /STATUS_RESPONSE_TIMEOUT/,
  );
  assert.equal(cancelled, true);
});

test("status stops before an expired start and cancels a response returned after abort", async (t) => {
  let abort = new AbortController();
  t.mock.method(AbortSignal, "timeout", (duration: number) => {
    assert.equal(duration, 30_000);
    return abort.signal;
  });
  abort.abort();
  let calls = 0;
  await assert.rejects(
    pollOperatorStatus(requestId, credential, async () => {
      calls++;
      return response(jsonBytes(100));
    }),
    /STATUS_RESPONSE_TIMEOUT/,
  );
  assert.equal(calls, 0);
  abort = new AbortController();
  let resolveLate!: (response: Response) => void;
  const pending = pollOperatorStatus(
    requestId,
    credential,
    async () =>
      new Promise<Response>((resolve) => {
        resolveLate = resolve;
      }),
  );
  abort.abort();
  await assert.rejects(pending, /STATUS_RESPONSE_TIMEOUT/);
  let cancelled = false;
  resolveLate(
    response(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      }),
    ),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
});

test("status yields so an abort timer can interrupt synchronous tiny-chunk flooding", async (t) => {
  const abort = new AbortController();
  t.mock.method(AbortSignal, "timeout", (duration: number) => {
    assert.equal(duration, 30_000);
    return abort.signal;
  });
  let pulls = 0,
    cancelled = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  t.after(() => clearTimeout(timer));
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (++pulls === 128) timer = setTimeout(() => abort.abort(), 0);
      controller.enqueue(new Uint8Array([32]));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    pollOperatorStatus(requestId, credential, async () => response(body)),
    /STATUS_RESPONSE_TIMEOUT/,
  );
  assert.ok(pulls >= 128 && pulls < 4096);
  assert.equal(cancelled, true);
});
