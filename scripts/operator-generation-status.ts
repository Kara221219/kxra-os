const statuses = new Set([
  "queued",
  "in_progress",
  "completed",
  "failed",
  "nsfw",
  "moderated",
  "canceled",
  "cancelled",
]);

export function operatorRequestId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)
  )
    throw Error("REQUEST_ID_INVALID_REQUIRES_REVIEW");
  return value;
}

// Only the provider job identifier leaves the private ledger. Never accept a
// saved URL, path segment, query string or credential destination from it.
export async function pollOperatorStatus(
  savedRequestId: unknown,
  credentials: string,
  transport: typeof fetch = fetch,
) {
  const requestId = operatorRequestId(savedRequestId);
  if (!credentials) throw Error("CREDENTIAL_REQUIRED");
  const signal = AbortSignal.timeout(30_000);
  function cancelBody(response: Response) {
    // An uncooperative stream cancellation must not extend the deadline.
    void response.body?.cancel().catch(() => {});
  }
  function beforeDeadline<T>(
    start: () => Promise<T>,
    late?: (value: T) => void,
  ): Promise<T> {
    if (signal.aborted) return Promise.reject(Error("STATUS_RESPONSE_TIMEOUT"));
    return new Promise((resolve, reject) => {
      const stop = () => reject(Error("STATUS_RESPONSE_TIMEOUT"));
      signal.addEventListener("abort", stop, { once: true });
      let work: Promise<T>;
      try {
        work = start();
      } catch (error) {
        signal.removeEventListener("abort", stop);
        reject(error);
        return;
      }
      work.then(
        (value) => {
          signal.removeEventListener("abort", stop);
          if (signal.aborted) {
            late?.(value);
            reject(Error("STATUS_RESPONSE_TIMEOUT"));
          } else resolve(value);
        },
        (error) => {
          signal.removeEventListener("abort", stop);
          reject(error);
        },
      );
    });
  }
  const response = await beforeDeadline(
    () =>
      transport(`https://api.higgsfield.ai/requests/${requestId}/status`, {
        headers: { Authorization: `Key ${credentials}` },
        redirect: "error",
        signal,
      }),
    cancelBody,
  );
  if (!response.ok || response.redirected || !response.body) {
    cancelBody(response);
    throw Error("STATUS_RESPONSE_INVALID");
  }
  const maximumBytes = 65_536;
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximumBytes)) {
    cancelBody(response);
    throw Error("STATUS_RESPONSE_TOO_LARGE");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0,
    reads = 0,
    emptyReads = 0,
    complete = false;
  try {
    for (;;) {
      // Status metadata is at most64KiB,64 cumulative empty reads and4096
      // total reads including EOF. Extremely fragmented valid responses fail
      // closed rather than allocating unbounded per-chunk metadata.
      if (++reads > 4096) throw Error("STATUS_RESPONSE_READ_LIMIT");
      const { done, value } = await beforeDeadline(() => reader.read());
      if (done) {
        complete = true;
        break;
      }
      if (value.byteLength === 0) {
        if (++emptyReads > 64) throw Error("STATUS_RESPONSE_READ_LIMIT");
        continue;
      }
      size += value.byteLength;
      if (size > maximumBytes) {
        throw Error("STATUS_RESPONSE_TOO_LARGE");
      }
      chunks.push(Buffer.from(value));
      // Allow the timer to fire even when each read resolves synchronously.
      if (reads % 128 === 0)
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  let result;
  try {
    result = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } catch {
    // JSON parser messages can contain fragments of a provider response.
    throw Error("STATUS_RESPONSE_INVALID");
  }
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    typeof result.status !== "string" ||
    !statuses.has(result.status.toLowerCase()) ||
    (result.request_id !== undefined && result.request_id !== requestId) ||
    (result.video !== undefined &&
      result.video !== null &&
      (typeof result.video !== "object" ||
        typeof result.video.url !== "string" ||
        result.video.url.length > 8192))
  )
    throw Error("STATUS_RESPONSE_INVALID");
  return {
    status: result.status.toLowerCase() as string,
    videoUrl: result.video?.url as string | undefined,
  };
}
