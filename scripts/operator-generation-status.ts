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
  const response = await transport(
    `https://api.higgsfield.ai/requests/${requestId}/status`,
    {
      headers: { Authorization: `Key ${credentials}` },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok || response.redirected || !response.body) {
    await response.body?.cancel();
    throw Error("STATUS_RESPONSE_INVALID");
  }
  const maximumBytes = 65_536;
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximumBytes)) {
    await response.body.cancel();
    throw Error("STATUS_RESPONSE_TOO_LARGE");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw Error("STATUS_RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
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
